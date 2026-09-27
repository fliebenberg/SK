import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { SocketAction } from '@sk/shared';
import pool, { query } from '../db';

/**
 * Claiming an organisation by nomination (`ORG-10`, docs/nomination-process.md §2–§3), end to end
 * over a real socket, against an organisation this script makes and removes.
 *
 *  - A claim makes the claimant admin but leaves `creator_id` with whoever created the org.
 *  - It voids every other pending nomination: their links no longer claim, and `claim_info` reports
 *    `voided` with the administrators' names to contact.
 *  - An org with an administrator cannot be nominated for.
 *
 * Needs a server running against the same database, **with mail going to Ethereal rather than a
 * real SMTP host**: `SMTP_HOST= PORT=3099 npx ts-node src/index.ts`, then
 * `SOCKET_URL=http://localhost:3099 npx ts-node src/scripts/test-claim-voiding.ts`.
 */

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3099';
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';

const ORG = `test-org-voiding-${Date.now()}`;
/** Created the org, and is not a member of it. */
const CREATOR = 'fx-user-annelie-botha';
/** Nominates two contacts. */
const NOMINATOR = 'fx-user-brendan-o-neill';
/** Opens the first link and claims. */
const CLAIMANT = 'fx-user-catherine-whitfield';

let checks = 0;
const failures: string[] = [];
function expect(actual: unknown, expected: unknown, what: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

function connect(userId: string): Promise<Socket> {
  const token = jwt.sign({ id: userId }, JWT_SECRET);
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, { transports: ['websocket'], reconnection: false, auth: { token } });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function send(socket: Socket, type: SocketAction, payload: any): Promise<any> {
  return new Promise((resolve) => socket.emit('action', { type, payload }, resolve));
}

function claimInfo(socket: Socket, token: string): Promise<any> {
  return new Promise((resolve) => socket.emit('get_data', { type: 'claim_info', token }, resolve));
}

const nominate = (socket: Socket, email: string) =>
  send(socket, SocketAction.REFER_ORG_CONTACT, { orgId: ORG, contactEmails: [email] });

async function referral(email: string): Promise<{ id: string; token: string; status: string }> {
  return (await query(
    `SELECT id, claim_token AS token, status FROM org_claim_referrals WHERE org_id = $1 AND referred_email = $2`,
    [ORG, email]
  )).rows[0];
}

async function cleanup() {
  await query(`DELETE FROM org_claim_referral_nominators WHERE referral_id IN (SELECT id FROM org_claim_referrals WHERE org_id = $1)`, [ORG]);
  await query(`DELETE FROM org_claim_referrals WHERE org_id = $1`, [ORG]);
  await query(`DELETE FROM org_memberships WHERE org_id = $1`, [ORG]);
  await query(`DELETE FROM org_profiles WHERE org_id = $1`, [ORG]);
  await query(`DELETE FROM organizations WHERE id = $1`, [ORG]);
}

async function main() {
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, creator_id) VALUES ($1, 'Voiding Test School', 'VTS', false, $2)`,
    [ORG, CREATOR]
  );
  const nominator = await connect(NOMINATOR);
  const claimant = await connect(CLAIMANT);

  try {
    const first = `voiding-a-${Date.now()}@example.com`;
    const second = `voiding-b-${Date.now()}@example.com`;
    let r = await nominate(nominator, first);
    expect(r.status, 'ok', 'first contact nominated');
    r = await nominate(nominator, second);
    expect(r.status, 'ok', 'second contact nominated');
    const a = await referral(first);
    const b = await referral(second);

    // --- The first link is claimed. ------------------------------------------------------------
    r = await send(claimant, SocketAction.CLAIM_ORG_VIA_TOKEN, { token: a.token, userId: CLAIMANT });
    expect(r.status, 'ok', 'claim succeeds');
    const org = (await query(`SELECT is_claimed AS "isClaimed", creator_id AS "creatorId" FROM organizations WHERE id = $1`, [ORG])).rows[0];
    expect([org.isClaimed, org.creatorId], [true, CREATOR], 'org claimed, creator unchanged');
    expect((await referral(first)).status, 'claimed', 'claimed nomination is claimed');
    expect((await referral(second)).status, 'voided', 'the other pending nomination is voided');

    // --- The second link no longer works, and says whom to contact. ----------------------------
    const info = await claimInfo(nominator, b.token);
    expect([info?.status, Array.isArray(info?.adminNames) && info.adminNames.length], ['voided', 1], 'claim_info reports voided with the admin');
    r = await send(nominator, SocketAction.CLAIM_ORG_VIA_TOKEN, { token: b.token, userId: NOMINATOR });
    expect(r.status, 'error', 'voided link cannot claim');
    const admins = (await query(
      `SELECT COUNT(*)::int AS n FROM org_memberships WHERE org_id = $1 AND role_id = 'role-org-admin'`, [ORG]
    )).rows[0].n;
    expect(admins, 1, 'still one admin');

    // --- Nobody can be nominated for an org with an administrator. -----------------------------
    r = await nominate(nominator, `voiding-c-${Date.now()}@example.com`);
    expect([r.status, /already has an administrator/.test(r.message)], ['error', true], 'nominating a claimed org refused');
  } finally {
    nominator.close();
    claimant.close();
    await cleanup();
  }

  console.log(`test-claim-voiding: ${checks - failures.length}/${checks} checks passed`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  await pool.end();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
