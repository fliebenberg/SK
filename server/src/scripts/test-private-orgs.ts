import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { SocketAction } from '@sk/shared';
import pool, { query } from '../db';
import { eventManager } from '../managers/EventManager';
import { organizationManager } from '../managers/OrganizationManager';
import { hasExternalHistory } from '../managers/privateOrgs';

/**
 * Private organisations (`ORG-14`, docs/org-profile.md §5.3), end to end over a real socket against
 * the test organisations (Doringkloof as the outsider's org, St Aldric's admin as the stranger).
 *
 *  - Who may make an org private: an admin of it, only once it has an admin, and never once it has
 *    shared a game with another organisation.
 *  - What a private org hides from a stranger and a signed-out visitor: the directory, the search,
 *    Home, the single-org read and its public rooms — while its members see all of it.
 *  - A former member keeps the game they played in, and nothing else.
 *  - A private org plays only among itself: a game, an organisation added to an event, or an event
 *    listing it beside another is refused and rolled back.
 *  - Going private pushes a stranger already in its rooms out at once; going public lets them back.
 *
 * Needs a server on the same database: `PORT=3099 npx ts-node src/index.ts`, then
 * `SOCKET_URL=http://localhost:3099 npx ts-node src/scripts/test-private-orgs.ts`. Everything it adds
 * is `test-…` and removed at the end.
 */

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3099';
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';

const DKL = 'fx-org-dkl';
const DKL_TEAM = 'fx-team-dkl-rugby-1stxv';
const STRANGER = 'fx-user-catherine-whitfield'; // St Aldric's admin, nothing to do with the test org

const ORG = 'test-org-private';
const ORG_NAME = 'Zebrafish Private Social Test';
const ORG_HISTORY = 'test-org-private-history'; // claimed, has played Doringkloof
const ORG_UNCLAIMED = 'test-org-private-unclaimed';
const ADMIN = 'test-user-private-admin';
const MEMBER = 'test-user-private-member';
const FORMER = 'test-user-private-former';
const TEAM_A = 'test-team-private-a';
const TEAM_B = 'test-team-private-b';
const TEAM_HISTORY = 'test-team-private-history';
const SITE = 'test-site-private';
const EVENT = 'test-ev-private';
const GAME = 'test-game-private';
const EVENT_HISTORY = 'test-ev-private-history';
const EVENT_DKL = 'test-ev-private-dkl';

let checks = 0;
const failures: string[] = [];
function expect(actual: unknown, expected: unknown, what: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

function connect(userId: string | null): Promise<Socket> {
  const auth = userId ? { token: jwt.sign({ id: userId }, JWT_SECRET) } : {};
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, { transports: ['websocket'], reconnection: false, auth });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function send(socket: Socket, type: SocketAction, payload: any): Promise<any> {
  return new Promise((resolve) => socket.emit('action', { type, payload }, resolve));
}

function read(socket: Socket, request: any): Promise<any> {
  return new Promise((resolve) => socket.emit('get_data', request, resolve));
}

const refused = (reply: any) => !Array.isArray(reply) && reply?.status === 'error';

function join(socket: Socket, room: string, stay = false): Promise<'joined' | 'denied' | 'silent'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socket.off('update', onUpdate); resolve('silent'); }, 4000);
    const onUpdate = (message: any) => {
      if (message?.topic !== room) return;
      clearTimeout(timer);
      socket.off('update', onUpdate);
      if (!stay) socket.emit('leave_room', room);
      resolve(message.type === 'ROOM_ACCESS_DENIED' ? 'denied' : 'joined');
    };
    socket.on('update', onUpdate);
    socket.emit('join_room', room);
  });
}

function nextMessage(socket: Socket, room: string, type: string): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socket.off('update', onUpdate); resolve(null); }, 4000);
    const onUpdate = (message: any) => {
      if (message?.topic !== room || message?.type !== type) return;
      clearTimeout(timer);
      socket.off('update', onUpdate);
      resolve(message.data ?? true);
    };
    socket.on('update', onUpdate);
  });
}

async function refusedWith(fn: () => Promise<unknown>): Promise<string | null> {
  try { await fn(); return null; } catch (err: any) { return err?.message || String(err); }
}

async function setup() {
  await query(`INSERT INTO users (id, name, email) VALUES
    ($1, 'Admin (test)', 'admin@private.test'), ($2, 'Member (test)', 'member@private.test'), ($3, 'Former (test)', 'former@private.test')`,
    [ADMIN, MEMBER, FORMER]);
  await query(`INSERT INTO organizations (id, name, short_name, is_claimed) VALUES
    ($1, $2, 'ZPS', true), ($3, 'Private History Test', 'PHT', true), ($4, 'Private Unclaimed Test', 'PUT', false)`,
    [ORG, ORG_NAME, ORG_HISTORY, ORG_UNCLAIMED]);
  for (const [user, role, ended] of [[ADMIN, 'role-org-admin', false], [MEMBER, 'role-org-member', false], [FORMER, 'role-org-member', true]] as const) {
    await query(`INSERT INTO org_profiles (id, org_id, user_id, name) VALUES ($1, $2, $3, $3)`, [`${user}-prof`, ORG, user]);
    await query(
      `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date, end_date)
       VALUES ($1, $2, $3, $4, NOW() - INTERVAL '30 days', ${ended ? `NOW() - INTERVAL '1 day'` : 'NULL'})`,
      [`${user}-om`, `${user}-prof`, ORG, role]
    );
  }
  // The history org's admin is the same test admin, so the gate lets the attempt through to the rule.
  await query(`INSERT INTO org_profiles (id, org_id, user_id, name) VALUES ('test-prof-private-history-admin', $1, $2, 'Admin')`, [ORG_HISTORY, ADMIN]);
  await query(`INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
               VALUES ('test-om-private-history-admin', 'test-prof-private-history-admin', $1, 'role-org-admin', NOW())`, [ORG_HISTORY]);

  await query(`INSERT INTO teams (id, org_id, name, sport_id, is_active) VALUES
    ($1, $4, 'Zebrafish A', 'rugby', true), ($2, $4, 'Zebrafish B', 'rugby', true), ($3, $5, 'History XV', 'rugby', true)`,
    [TEAM_A, TEAM_B, TEAM_HISTORY, ORG, ORG_HISTORY]);
  await query(`INSERT INTO sites (id, org_id, name) VALUES ($1, $2, 'Zebrafish Field')`, [SITE, ORG]);

  // An internal game, with the former member on Zebrafish A's team sheet.
  await query(`INSERT INTO events (id, name, type, org_id) VALUES ($1, 'Club night', 'SingleMatch', $2)`, [EVENT, ORG]);
  await query(`INSERT INTO event_organizations (event_id, org_id) VALUES ($1, $2)`, [EVENT, ORG]);
  await query(`INSERT INTO games (id, event_id, sport_id, status, site_id) VALUES ($1, $2, 'rugby', 'Scheduled', $3)`, [GAME, EVENT, SITE]);
  await query(`INSERT INTO game_participants (id, game_id, team_id, sort_order) VALUES ($1 || '-h', $1, $2, 0), ($1 || '-a', $1, $3, 1)`, [GAME, TEAM_A, TEAM_B]);
  await query(`INSERT INTO game_rosters (id, game_participant_id, org_profile_id) VALUES ('test-gr-private', $1, $2)`, [`${GAME}-h`, `${FORMER}-prof`]);

  // The history org has played Doringkloof.
  await query(`INSERT INTO events (id, name, type, org_id) VALUES ($1, 'Friendly', 'SingleMatch', $2)`, [EVENT_HISTORY, ORG_HISTORY]);
  await query(`INSERT INTO games (id, event_id, sport_id, status) VALUES ('test-game-private-history', $1, 'rugby', 'Finished')`, [EVENT_HISTORY]);
  await query(`INSERT INTO game_participants (id, game_id, team_id, sort_order) VALUES
    ('test-gp-private-history-h', 'test-game-private-history', $1, 0), ('test-gp-private-history-a', 'test-game-private-history', $2, 1)`,
    [TEAM_HISTORY, DKL_TEAM]);
}

async function cleanup() {
  await query(`DELETE FROM game_rosters WHERE id = 'test-gr-private'`);
  await query(`DELETE FROM game_participants WHERE game_id LIKE 'test-game-private%'`);
  await query(`DELETE FROM games WHERE event_id LIKE 'test-ev-private%' OR id LIKE 'test-game-private%'`);
  await query(`DELETE FROM event_organizations WHERE event_id LIKE 'test-ev-private%'`);
  await query(`DELETE FROM event_sports WHERE event_id LIKE 'test-ev-private%'`);
  await query(`DELETE FROM events WHERE id LIKE 'test-ev-private%'`);
  await query(`DELETE FROM sites WHERE id = $1`, [SITE]);
  await query(`DELETE FROM teams WHERE id LIKE 'test-team-private%'`);
  await query(`DELETE FROM org_memberships WHERE org_id LIKE 'test-org-private%'`);
  await query(`DELETE FROM org_profiles WHERE org_id LIKE 'test-org-private%'`);
  await query(`DELETE FROM organizations WHERE id LIKE 'test-org-private%'`);
  await query(`DELETE FROM users WHERE id LIKE 'test-user-private%'`);
}

async function main() {
  await cleanup();
  await setup();
  organizationManager.invalidateCache();

  const [admin, member, former, stranger, visitor] = await Promise.all([
    connect(ADMIN), connect(MEMBER), connect(FORMER), connect(STRANGER), connect(null),
  ]);

  try {
    // --- Who may make it private ---------------------------------------------------------------
    expect(refused(await send(member, SocketAction.SET_ORG_PRIVATE, { orgId: ORG, isPrivate: true })), true, 'a plain member cannot make it private');
    expect(await hasExternalHistory(ORG), false, 'an org that has played only itself has no history');
    expect(await hasExternalHistory(ORG_HISTORY), true, 'an org that has played Doringkloof has a history');
    const historyReply = await send(admin, SocketAction.SET_ORG_PRIVATE, { orgId: ORG_HISTORY, isPrivate: true });
    expect(refused(historyReply) && /played other organisations/.test(historyReply.message), true, 'an org with a history cannot go private');
    expect(!!(await refusedWith(() => organizationManager.setPrivate(ORG_UNCLAIMED, true))), true, 'an unclaimed org cannot go private');

    // A stranger already in its summary room, to see them pushed out.
    expect(await join(stranger, `org:${ORG}:summary`, true), 'joined', 'a stranger may hold a public org\'s summary room');
    const revoked = nextMessage(stranger, `org:${ORG}:summary`, 'ROOM_ACCESS_REVOKED');
    const made = await send(admin, SocketAction.SET_ORG_PRIVATE, { orgId: ORG, isPrivate: true });
    expect(made?.status, 'ok', 'the admin makes it private');
    expect(made?.data?.isPrivate, true, 'the reply is the private org');
    expect(!!(await revoked), true, 'the stranger already in its room is pushed out');

    // --- What it hides ---------------------------------------------------------------------------
    const names = (reply: any) => (reply?.items || reply || []).map((o: any) => o.id);
    expect(names(await read(stranger, { type: 'organizations', search: 'Zebrafish' })).includes(ORG), false, 'the directory hides it from a stranger');
    expect(names(await read(visitor, { type: 'organizations', search: 'Zebrafish' })).includes(ORG), false, 'the directory hides it from a visitor');
    // The public Teams list (`UI-33`), and how it pages on the server.
    expect(names(await read(stranger, { type: 'team_directory', search: 'Zebrafish' })).includes(TEAM_A), false, 'the Teams list hides its teams from a stranger');
    expect(names(await read(visitor, { type: 'team_directory', search: 'Zebrafish' })).includes(TEAM_A), false, 'the Teams list hides its teams from a visitor');
    expect(names(await read(former, { type: 'team_directory', search: 'Zebrafish' })).includes(TEAM_A), false, 'the Teams list hides its teams from a former member');
    expect(names(await read(member, { type: 'team_directory', search: 'Zebrafish' })).includes(TEAM_A), true, 'the Teams list shows its teams to a member');
    expect(names(await read(member, { type: 'team_directory', search: 'Zebrafish rugby' })).length, 2, 'every word searched for has to match, across team and sport');
    expect(names(await read(member, { type: 'team_directory', search: 'Zebrafish netball' })).length, 0, 'a word that matches nothing finds nothing');
    const secondPage = await read(member, { type: 'team_directory', search: 'Zebrafish', page: 2, limit: 1 });
    expect([secondPage.items?.length, secondPage.total, secondPage.page], [1, 2, 2], 'the Teams list answers one page, and the total');
    expect((await read(member, { type: 'team_directory', search: 'Zebrafish', limit: 1000 })).limit, 100, 'a page is at most 100 teams');
    expect((await read(member, { type: 'team_directory', mine: true })).total, 0, 'My Teams is only teams they are on');
    expect((await read(visitor, { type: 'team_directory', mine: true })).total, 0, 'a visitor has no My Teams');
    // What the fixtures and events rooms no longer carry (`LIST-1`, `LIST-2`) is held to the same level.
    const beforeSoon = '2100-01-01';
    expect(Array.isArray((await read(stranger, { type: 'org_past_games', orgId: ORG, before: beforeSoon }))?.items), false, 'past games are closed to a stranger');
    expect(Array.isArray((await read(visitor, { type: 'org_past_events', orgId: ORG, before: beforeSoon }))?.items), false, 'past events are closed to a visitor');
    expect(Array.isArray((await read(member, { type: 'org_past_games', orgId: ORG, before: beforeSoon })).items), true, 'past games are open to a member');
    expect(Array.isArray((await read(member, { type: 'org_past_events', orgId: ORG, before: beforeSoon })).items), true, 'past events are open to a member');
    // The public Organisations list, and how it pages on the server.
    expect(names(await read(stranger, { type: 'org_directory', search: 'Zebrafish' })).includes(ORG), false, 'the Organisations list hides it from a stranger');
    expect(names(await read(visitor, { type: 'org_directory', search: 'Zebrafish' })).includes(ORG), false, 'the Organisations list hides it from a visitor');
    expect(names(await read(former, { type: 'org_directory', search: 'Zebrafish' })).includes(ORG), false, 'the Organisations list hides it from a former member');
    expect(names(await read(member, { type: 'org_directory', search: 'Zebrafish' })).includes(ORG), true, 'the Organisations list shows it to a member');
    expect(names(await read(member, { type: 'org_directory', mine: true })).includes(ORG), true, 'My Organisations has it for a member');
    expect(names(await read(stranger, { type: 'org_directory', mine: true })).includes(ORG), false, 'My Organisations does not have it for a stranger');
    expect(names(await read(former, { type: 'org_directory', mine: true })).includes(ORG), false, 'My Organisations does not have it for a former member');
    expect((await read(visitor, { type: 'org_directory', mine: true })).total, 0, 'a visitor has no My Organisations');
    expect(names(await read(member, { type: 'org_directory', search: 'Zebrafish zzznothing' })).length, 0, 'every word searched for has to match');
    expect((await read(member, { type: 'org_directory', limit: 1000 })).limit, 100, 'a page is at most 100 organisations');
    const onePerPage = await read(member, { type: 'org_directory', page: 2, limit: 1 });
    expect([onePerPage.items?.length, onePerPage.page], [1, 2], 'the Organisations list answers the page asked for');
    expect(names(await read(member, { type: 'organizations', search: 'Zebrafish' })).includes(ORG), true, 'the directory shows it to a member');
    expect(names(await read(former, { type: 'organizations', search: 'Zebrafish' })).includes(ORG), false, 'the directory hides it from a former member');
    expect(names(await read(stranger, { type: 'search_similar_orgs', name: ORG_NAME })).includes(ORG), false, 'the similar-name search hides it');
    expect(names(await read(stranger, { type: 'possible_duplicate_orgs', name: ORG_NAME })).includes(ORG), false, 'the duplicate check does not give it away');
    expect(names(await read(member, { type: 'possible_duplicate_orgs', name: ORG_NAME })).includes(ORG), true, 'the duplicate check shows it to a member');

    const strangerHome = await read(stranger, { type: 'home_search', query: 'Zebrafish' });
    expect([strangerHome.organizations.length, strangerHome.teams.length, strangerHome.sites.length], [0, 0, 0], 'Home search hides it, its teams and its site from a stranger');
    const memberHome = await read(member, { type: 'home_search', query: 'Zebrafish' });
    expect(memberHome.organizations.some((o: any) => o.id === ORG), true, 'Home search shows it to a member');
    const nearby = await read(visitor, { type: 'home_nearby' });
    expect(nearby.organizations.some((o: any) => o.id === ORG), false, 'Home nearby leaves it out for a visitor');

    expect(refused(await read(stranger, { type: 'organization', id: ORG })), true, 'a stranger cannot read it');
    expect((await read(member, { type: 'organization', id: ORG }))?.id, ORG, 'a member reads it');
    expect(refused(await read(stranger, { type: 'teams', orgId: ORG })), true, 'a stranger cannot read its teams');

    for (const room of [`org:${ORG}:summary`, `org:${ORG}:teams`, `org:${ORG}:fixtures`, `site:${SITE}`, `event:${EVENT}`, `game:${GAME}:summary`]) {
      expect(await join(stranger, room), 'denied', `a stranger is refused ${room}`);
      expect(await join(visitor, room), 'denied', `a visitor is refused ${room}`);
      expect(await join(member, room), 'joined', `a member joins ${room}`);
    }
    expect(await join(former, `game:${GAME}:summary`), 'joined', 'a former member keeps the game they played in');
    expect(await join(former, `org:${ORG}:summary`), 'denied', 'but not the org itself');
    expect(await join(former, `event:${EVENT}`), 'joined', 'a former member reads the event record their game needs');
    expect(await join(former, `site:${SITE}`), 'joined', 'and the venue they played at');
    expect(await join(former, `event:${EVENT}:fixtures`), 'denied', "but not the event's other fixtures");
    expect(await join(former, `org:${ORG}:teams`), 'denied', 'nor its teams');
    expect(await join(stranger, `event:${EVENT}`), 'denied', 'a stranger still cannot read the event record');
    const summary = await new Promise<any>((resolve) => {
      const room = `game:${GAME}:summary`;
      const timer = setTimeout(() => resolve(null), 4000);
      former.on('update', function onUpdate(message: any) {
        if (message?.topic !== room) return;
        clearTimeout(timer); former.off('update', onUpdate); former.emit('leave_room', room); resolve(message.data);
      });
      former.emit('join_room', room);
    });
    expect((summary?.participants || []).map((p: any) => [p.orgName, p.orgIsPrivate]), [[ORG_NAME, true], [ORG_NAME, true]],
      'the game names the org to a former member, marked private so the page does not link to it');
    expect(memberHome.organizations.find((o: any) => o.id === ORG)?.isPrivate, true, 'Home marks it private for a member');

    // --- It plays only among itself ---------------------------------------------------------------
    const mixedGame = await refusedWith(() => eventManager.addGame({
      eventId: EVENT, sportId: 'rugby', participants: [{ teamId: TEAM_A }, { teamId: DKL_TEAM }],
    } as any));
    expect(!!mixedGame && /private organisation/.test(mixedGame), true, 'a game against another org is refused');
    expect((await query(`SELECT COUNT(*)::int AS n FROM games WHERE event_id = $1`, [EVENT])).rows[0].n, 1, 'and rolled back');
    expect(!!(await refusedWith(() => eventManager.addEventOrgs(EVENT, [DKL], true))), true, 'another org cannot be added to its event');
    const dklEvent = await refusedWith(() => eventManager.addEvent({
      id: EVENT_DKL, name: 'Invites a private org', type: 'Tournament', orgId: DKL, participatingOrgIds: [ORG],
    } as any));
    expect(!!dklEvent, true, 'another org cannot list it in its event');
    expect((await query(`SELECT COUNT(*)::int AS n FROM events WHERE id = $1`, [EVENT_DKL])).rows[0].n, 0, 'and nothing is left behind');
    const ownGame = await eventManager.addGame({
      eventId: EVENT, sportId: 'rugby', participants: [{ teamId: TEAM_A }, { teamId: TEAM_B }],
    } as any);
    expect(!!ownGame?.id, true, 'a game between its own teams is fine');

    // --- Public again ------------------------------------------------------------------------------
    const unmade = await send(admin, SocketAction.SET_ORG_PRIVATE, { orgId: ORG, isPrivate: false });
    expect(unmade?.data?.isPrivate, false, 'the admin makes it public again');
    expect(await join(stranger, `org:${ORG}:summary`), 'joined', 'a stranger may join again');
    expect(names(await read(stranger, { type: 'organizations', search: 'Zebrafish' })).includes(ORG), true, 'and finds it in the directory');
  } finally {
    for (const s of [admin, member, former, stranger, visitor]) s.disconnect();
    await cleanup();
    await pool.end();
  }

  if (failures.length) {
    console.error(`\n${failures.length} of ${checks} checks failed:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`\nAll ${checks} checks passed.`);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
