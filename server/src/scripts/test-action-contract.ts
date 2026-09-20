import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { APP_TEST_ORG_ID, APP_TEST_ORG_NAME, SocketAction } from '@sk/shared';
import pool, { query } from '../db';
import { eventManager } from '../managers/EventManager';

/**
 * The action contract, end to end over a real socket — the parts that only exist in the running
 * server's action handler, which no manager-level script can reach (SYNC-1 to SYNC-4).
 *
 *  - SYNC-1: an action that changed nothing is refused, not answered `ok` with `data: null`; a
 *    refused undo arrives as an error, not as `ok` carrying `success: false`.
 *  - SYNC-2: a client's failure report reaches `logs/failures-*.jsonl`, under the socket's own user,
 *    and a server refusal is recorded there too.
 *  - SYNC-3: a repeated `requestId` is answered from the first attempt and writes nothing twice; a
 *    refused attempt is not remembered, so it can be retried.
 *  - SYNC-4: a status change carries its log entry, which the server writes only when the change
 *    applies.
 *
 * Needs a server running against the same database: start one on a spare port —
 * `PORT=3099 npx ts-node src/index.ts` — then run `SOCKET_URL=http://localhost:3099 npx ts-node
 * src/scripts/test-action-contract.ts`. Signs in as the seeded app admin. Leaves the database as it
 * found it; the failures log keeps its lines, which is what it is for.
 */

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3099';
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';

let checks = 0;
const failures: string[] = [];
function expect(actual: unknown, expected: unknown, what: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

const stamp = Date.now();
const created = { teamIds: [] as string[], eventId: '' };

function connect(userId: string): Promise<Socket> {
  const token = jwt.sign({ id: userId }, JWT_SECRET);
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, { transports: ['websocket'], reconnection: false, auth: { token } });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function send(socket: Socket, type: SocketAction, payload: any, requestId?: string): Promise<any> {
  return new Promise((resolve) => socket.emit('action', { type, payload, requestId }, resolve));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const admin = (await query(`SELECT id FROM users WHERE global_role = 'admin' LIMIT 1`)).rows[0];
  if (!admin) throw new Error('No admin user to sign in as — run the seed.');
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, $2, 'ATO', true, true) ON CONFLICT (id) DO NOTHING`,
    [APP_TEST_ORG_ID, APP_TEST_ORG_NAME]
  );
  const sportId = (await query(`SELECT id FROM sports ORDER BY id LIMIT 1`)).rows[0].id;
  const socket = await connect(admin.id);

  // --- SYNC-1 ---------------------------------------------------------------------------------
  const missing = await send(socket, SocketAction.UPDATE_TEAM, { id: `team-missing-${stamp}`, data: { name: 'x' } });
  expect(missing?.status, 'error', 'updating a team that does not exist is refused, not answered ok');

  // --- SYNC-3 ---------------------------------------------------------------------------------
  const teamPayload = { id: `team-contract-${stamp}`, name: 'Contract Test', orgId: APP_TEST_ORG_ID, sportId, isActive: true };
  created.teamIds.push(teamPayload.id);
  const requestId = `contract-${stamp}`;
  const first = await send(socket, SocketAction.ADD_TEAM, teamPayload, requestId);
  const second = await send(socket, SocketAction.ADD_TEAM, teamPayload, requestId);
  expect([first?.status, first?.data?.id], ['ok', teamPayload.id], 'a keyed create succeeds');
  expect([second?.status, second?.data?.id, second?.replayed], ['ok', teamPayload.id, true], 'a repeated key is answered from the first attempt');
  const rows = (await query(`SELECT count(*)::int AS n FROM teams WHERE name = 'Contract Test' AND org_id = $1`, [APP_TEST_ORG_ID])).rows[0].n;
  expect(rows, 1, 'and nothing was written twice');

  const refusedKey = `contract-refused-${stamp}`;
  const refusedOnce = await send(socket, SocketAction.UPDATE_TEAM, { id: `team-missing-${stamp}`, data: {} }, refusedKey);
  const refusedTwice = await send(socket, SocketAction.UPDATE_TEAM, { id: `team-missing-${stamp}`, data: {} }, refusedKey);
  expect([refusedOnce?.status, refusedTwice?.status, refusedTwice?.replayed], ['error', 'error', undefined], 'a refusal is not remembered — the retry runs again');

  // --- SYNC-4 and the rest of SYNC-1 ----------------------------------------------------------
  const event = await eventManager.addEvent({
    name: `Contract ${stamp}`, type: 'SingleMatch', startDate: new Date().toISOString(),
    orgId: APP_TEST_ORG_ID, sportIds: [sportId], status: 'Scheduled', settings: {},
  } as any);
  created.eventId = event.id;
  const game = await eventManager.addGame({ eventId: event.id, sportId, participants: [] } as any);

  const started = await send(socket, SocketAction.UPDATE_GAME_STATUS, {
    id: game.id, status: 'Live', log: { subType: 'GAME_STARTED', eventData: { status: 'Live', elapsedMS: 0 } },
  });
  expect(started?.status, 'ok', 'starting a game with its log entry succeeds');
  const logged = (await query(`SELECT type, sub_type FROM game_events WHERE game_id = $1`, [game.id])).rows;
  expect(logged, [{ type: 'STATUS', sub_type: 'GAME_STARTED' }], 'the server wrote the log entry the change carried');

  const refusedStart = await send(socket, SocketAction.UPDATE_GAME_STATUS, {
    id: `game-missing-${stamp}`, status: 'Live', log: { subType: 'GAME_STARTED', eventData: {} },
  });
  expect(refusedStart?.status, 'error', 'a status change that applies to nothing is refused');
  const strayLog = (await query(`SELECT count(*)::int AS n FROM game_events WHERE game_id = $1`, [`game-missing-${stamp}`])).rows[0].n;
  expect(strayLog, 0, 'and writes no log entry — the log cannot say what did not happen');

  const undo = await send(socket, SocketAction.UNDO_GAME_EVENT, { gameId: game.id, eventId: `evt-missing-${stamp}`, initiatorId: undefined });
  expect(undo?.status, 'error', 'a refused undo is an error, not ok carrying success: false');

  // --- SYNC-2 ---------------------------------------------------------------------------------
  const marker = `contract-no-answer-${stamp}`;
  socket.emit('client_failures', [
    { kind: 'no-answer', actionType: 'ADD_TEAM', message: marker, requestId: marker, platform: 'test', occurredAt: new Date().toISOString() },
    { kind: 'not-a-kind', message: 'ignored' },
  ]);
  await sleep(1500);
  const logDir = path.join(process.cwd(), 'logs');
  const lines = fs.readdirSync(logDir)
    .filter((f) => f.startsWith('failures-') && f.endsWith('.jsonl'))
    .flatMap((f) => fs.readFileSync(path.join(logDir, f), 'utf8').split('\n').filter(Boolean))
    .map((l) => JSON.parse(l));
  const reported = lines.find((l) => l.message === marker);
  expect([reported?.source, reported?.kind, reported?.userId], ['client', 'no-answer', admin.id], "a client's report is logged under the socket's own user");
  expect(lines.some((l) => l.message === 'ignored'), false, 'and a malformed report is dropped');
  expect(
    lines.some((l) => l.source === 'server' && l.actionType === 'UPDATE_TEAM' && l.requestId === refusedKey),
    true,
    'a server refusal is in the same log, with its request id'
  );

  socket.close();
}

async function cleanup() {
  if (created.eventId) {
    await query(`DELETE FROM game_events WHERE game_id IN (SELECT id FROM games WHERE event_id = $1)`, [created.eventId]);
    await query(`DELETE FROM game_participants WHERE game_id IN (SELECT id FROM games WHERE event_id = $1)`, [created.eventId]);
    await query(`DELETE FROM games WHERE event_id = $1`, [created.eventId]);
    await query(`DELETE FROM events WHERE id = $1`, [created.eventId]);
  }
  if (created.teamIds.length) await query(`DELETE FROM teams WHERE id = ANY($1)`, [created.teamIds]);
}

main()
  .catch((err) => failures.push(`threw: ${err?.message || err}`))
  .finally(async () => {
    await cleanup().catch((err) => console.error('cleanup failed:', err));
    await pool.end();
    if (failures.length) {
      console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`PASS — ${checks} action contract checks.`);
    process.exit(0);
  });
