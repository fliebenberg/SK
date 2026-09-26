import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { SocketAction } from '@sk/shared';
import pool, { query } from '../db';
import { accessManager } from '../managers/AccessManager';

/**
 * Guardians and minors' member privileges (`MEMBER-3`, Phase 1 of
 * docs/guardians-implementation-plan.md), end to end over a real socket against the test
 * organisations (Doringkloof).
 *
 *  - Guardian links: who may add, change and end them; one primary per player; the refusals
 *    (self, cross-org, a shared email, a duplicate); the live broadcast; a guardian's dependants.
 *  - A guardian holds no membership, so reads nothing org-wide.
 *  - A minor who signs up with their profile's email is linked but, while restricted, reads nothing
 *    org-wide — yet still coaches and scores what they were appointed to (the team-duty grant).
 *  - The rule: the org switch first, then the minor's own setting; the org's minor age moves it.
 *  - Who may set the minor's own setting: a guardian, or an Admin only while there is none.
 *
 * Needs a server on the same database: `PORT=3099 npx ts-node src/index.ts`, then
 * `SOCKET_URL=http://localhost:3099 npx ts-node src/scripts/test-guardians.ts`. Everything it adds is
 * `test-…` and removed at the end; every fixture row it changes is put back.
 */

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3099';
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';

const DKL = 'fx-org-dkl';
const ADMIN = 'fx-user-johan-van-der-merwe';
const STAFF = 'fx-user-annelie-botha';
const MEMBER = 'fx-user-francois-marais'; // a plain Member, born 2008-01-01
const STRANGER = 'fx-user-catherine-whitfield'; // St Aldric's admin

const ANIKA = 'fx-prof-dkl-anika-kotze'; // U14 netball player, born 2012
const MIA = 'fx-prof-dkl-mia-strydom'; // U14 netball player, no guardian
const SAC_PROFILE = 'fx-prof-sac-catherine-whitfield';
const TEAM_OWN = 'fx-team-dkl-netball-u14a'; // Anika plays here
const TEAM_COACHED = 'fx-team-dkl-netball-u16a'; // Anika is made its coach
const TEAM_OTHER = 'fx-team-dkl-rugby-u16a';

const MINOR_USER = 'test-user-guardians-anika';
const MINOR_EMAIL = 'test-anika@guardians.test';
const PARENT = 'test-prof-guardians-parent';
const PARENT_USER = 'test-user-guardians-parent';
const PARENT_EMAIL = 'test-parent@guardians.test';
const PARENT_2 = 'test-prof-guardians-parent-2';
const EVENT = 'test-ev-guardians';
const GAME_SCORED = 'test-game-guardians-scored'; // rugby teams, Anika appointed scorer
const GAME_COACHED = 'test-game-guardians-coached'; // includes the team Anika coaches
const GAME_OTHER = 'test-game-guardians-other'; // nothing to do with Anika

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

function read(socket: Socket, request: any): Promise<any> {
  return new Promise((resolve) => socket.emit('get_data', request, resolve));
}

const refused = (reply: any) => !Array.isArray(reply) && reply?.status === 'error';

/**
 * `joined` or `denied` — what the server said when this socket asked for the room. Leaves it again
 * unless `stay`, so the next check starts from outside.
 */
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

/** The next message of `type` on `room`, which this socket must already have joined. */
function nextMessage(socket: Socket, room: string, type: string): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socket.off('update', onUpdate); resolve(null); }, 4000);
    const onUpdate = (message: any) => {
      if (message?.topic !== room || message?.type !== type) return;
      clearTimeout(timer);
      socket.off('update', onUpdate);
      resolve(message.data);
    };
    socket.on('update', onUpdate);
  });
}

async function memberships(socket: Socket, userId: string) {
  return read(socket, { type: 'user_memberships', id: userId });
}

async function setup() {
  await query(`INSERT INTO users (id, name, email) VALUES ($1, 'Anika (test)', $2), ($3, 'Parent (test)', $4)`,
    [MINOR_USER, MINOR_EMAIL, PARENT_USER, PARENT_EMAIL]);
  await query(`UPDATE org_profiles SET email = $2 WHERE id = $1`, [ANIKA, MINOR_EMAIL]);
  await query(
    `INSERT INTO org_profiles (id, org_id, name, email) VALUES ($1, $2, 'Karin Kotzé', $3), ($4, $2, 'Kobus Kotzé', $5)`,
    [PARENT, DKL, PARENT_EMAIL, PARENT_2, MINOR_EMAIL]
  );
  await query(
    `INSERT INTO team_memberships (id, org_profile_id, team_id, role_id, start_date)
     VALUES ('test-tm-guardians-coach', $1, $2, 'role-coach', NOW())`,
    [ANIKA, TEAM_COACHED]
  );
  await query(`INSERT INTO events (id, name, type, org_id) VALUES ($1, 'Guardians test', 'SingleMatch', $2)`, [EVENT, DKL]);
  const games: [string, string, string][] = [
    [GAME_SCORED, TEAM_OTHER, 'fx-team-dkl-rugby-1stxv'],
    [GAME_COACHED, TEAM_COACHED, 'fx-team-dkl-netball-u14a'],
    [GAME_OTHER, TEAM_OTHER, 'fx-team-dkl-rugby-1stxv'],
  ];
  for (const [game, home, away] of games) {
    await query(`INSERT INTO games (id, event_id, sport_id, status) VALUES ($1, $2, 'rugby', 'scheduled')`, [game, EVENT]);
    await query(
      `INSERT INTO game_participants (id, game_id, team_id, sort_order) VALUES ($1 || '-h', $1, $2, 0), ($1 || '-a', $1, $3, 1)`,
      [game, home, away]
    );
  }
  await query(`INSERT INTO game_officials (id, game_id, org_profile_id, role) VALUES ('test-go-guardians', $1, $2, 'SCORER')`, [GAME_SCORED, ANIKA]);
}

async function teardown(original: { settings: any; anika: any; mia: any }) {
  await query(`DELETE FROM profile_guardians WHERE player_profile_id = ANY($1) OR guardian_profile_id = ANY($2)`,
    [[ANIKA, MIA], [PARENT, PARENT_2]]);
  await query(`DELETE FROM events WHERE id = $1`, [EVENT]); // games, participants and officials cascade
  await query(`DELETE FROM game_participants WHERE game_id LIKE 'test-game-guardians-%'`);
  await query(`DELETE FROM team_memberships WHERE id = 'test-tm-guardians-coach'`);
  await query(`UPDATE org_profiles SET own_account_set_by = NULL WHERE own_account_set_by = ANY($1)`, [[PARENT, PARENT_2]]);
  await query(`DELETE FROM org_profiles WHERE id = ANY($1)`, [[PARENT, PARENT_2]]);
  await query(`DELETE FROM users WHERE id = ANY($1)`, [[MINOR_USER, PARENT_USER]]);
  await query(`UPDATE organizations SET settings = $2 WHERE id = $1`, [DKL, original.settings]);
  for (const row of [original.anika, original.mia]) {
    await query(
      `UPDATE org_profiles SET email = $2, own_account_allowed = $3, own_account_set_at = $4, own_account_set_by = $5 WHERE id = $1`,
      [row.id, row.email, row.own_account_allowed, row.own_account_set_at, row.own_account_set_by]
    );
  }
}

async function main() {
  const org = (await query(`SELECT settings FROM organizations WHERE id = $1`, [DKL])).rows[0];
  if (!org) throw new Error('The test organisations are not loaded — run `npm run db:test-orgs`.');
  const profiles = (await query(
    `SELECT id, email, own_account_allowed, own_account_set_at, own_account_set_by FROM org_profiles WHERE id = ANY($1)`,
    [[ANIKA, MIA]]
  )).rows;
  const original = { settings: org.settings, anika: profiles.find((p: any) => p.id === ANIKA), mia: profiles.find((p: any) => p.id === MIA) };

  // Start clean, whatever an interrupted run left behind.
  await teardown(original);
  // Minors off, with the default age: the state a new organisation is in.
  await query(`UPDATE organizations SET settings = COALESCE(settings, '{}'::jsonb) - 'minors' WHERE id = $1`, [DKL]);
  await setup();

  const admin = await connect(ADMIN);
  const staff = await connect(STAFF);
  const member = await connect(MEMBER);
  const stranger = await connect(STRANGER);
  const minor = await connect(MINOR_USER);
  const parent = await connect(PARENT_USER);
  const sockets = [admin, staff, member, stranger, minor, parent];

  try {
    // --- Recording guardians -----------------------------------------------------------------
    const addParent = { playerProfileId: ANIKA, guardianProfileId: PARENT, relationship: 'parent' };
    expect((await send(stranger, SocketAction.ADD_PROFILE_GUARDIAN, addParent))?.status, 'error', 'another org’s admin cannot record a guardian');
    expect((await send(member, SocketAction.ADD_PROFILE_GUARDIAN, addParent))?.status, 'error', 'a plain member cannot record a guardian');

    expect(await join(admin, `org:${DKL}:guardians`, true), 'joined', 'the admin can watch the org’s guardians');
    const broadcastSeen = nextMessage(admin, `org:${DKL}:guardians`, 'PROFILE_GUARDIANS_UPDATED');
    const added = await send(staff, SocketAction.ADD_PROFILE_GUARDIAN, addParent);
    expect(added?.status, 'ok', 'staff can record a guardian');
    expect(added?.data?.isPrimary, true, 'the first guardian is the primary one');
    const pushed = await broadcastSeen;
    expect([pushed?.playerProfileId, pushed?.guardians?.length], [ANIKA, 1], 'the guardians room hears the player’s whole guardian list');
    admin.emit('leave_room', `org:${DKL}:guardians`);
    const firstLink = added?.data?.id;

    expect((await send(admin, SocketAction.ADD_PROFILE_GUARDIAN, addParent))?.status, 'error', 'the same guardian cannot be recorded twice');
    expect((await send(admin, SocketAction.ADD_PROFILE_GUARDIAN, { playerProfileId: ANIKA, guardianProfileId: ANIKA }))?.status, 'error', 'nobody is their own guardian');
    expect((await send(admin, SocketAction.ADD_PROFILE_GUARDIAN, { playerProfileId: ANIKA, guardianProfileId: SAC_PROFILE }))?.status, 'error', 'a guardian from another organisation is refused');
    expect((await send(admin, SocketAction.ADD_PROFILE_GUARDIAN, { playerProfileId: ANIKA, guardianProfileId: PARENT_2 }))?.status, 'error', 'a guardian sharing the child’s email is refused');

    await query(`UPDATE org_profiles SET email = 'test-parent-2@guardians.test' WHERE id = $1`, [PARENT_2]);
    const second = await send(admin, SocketAction.ADD_PROFILE_GUARDIAN, { playerProfileId: ANIKA, guardianProfileId: PARENT_2, isPrimary: true });
    expect(second?.status, 'ok', 'a second guardian can be recorded as the primary one');
    const primaries = (await query(`SELECT count(*)::int AS n FROM profile_guardians WHERE player_profile_id = $1 AND is_primary AND end_date IS NULL`, [ANIKA])).rows[0].n;
    expect(primaries, 1, 'which leaves exactly one primary');

    expect(await join(staff, `org:${DKL}:guardians`, true), 'joined', 'staff can watch the org’s guardians');
    const renamedSeen = nextMessage(staff, `org:${DKL}:guardians`, 'PROFILE_GUARDIANS_UPDATED');
    expect((await send(admin, SocketAction.UPDATE_ORG_PROFILE, { id: PARENT, data: { name: 'Karin Kotzé-Smit' } }))?.status, 'ok', 'a guardian’s own details can be edited');
    const renamed = await renamedSeen;
    expect(renamed?.guardians?.find((g: any) => g.guardianProfileId === PARENT)?.guardianName, 'Karin Kotzé-Smit', 'and every list they appear in is republished');
    staff.emit('leave_room', `org:${DKL}:guardians`);
    expect((await send(admin, SocketAction.UPDATE_ORG_PROFILE, { id: PARENT, data: { email: MINOR_EMAIL } }))?.status, 'error', 'a guardian cannot be given the child’s email afterwards');
    expect((await send(admin, SocketAction.UPDATE_ORG_PROFILE, { id: ANIKA, data: { email: PARENT_EMAIL } }))?.status, 'error', 'nor the child the guardian’s');

    const changed = await send(admin, SocketAction.UPDATE_PROFILE_GUARDIAN, { id: firstLink, relationship: 'grandparent' });
    expect(changed?.data?.relationship, 'grandparent', 'the relationship can be changed');
    expect((await send(stranger, SocketAction.UPDATE_PROFILE_GUARDIAN, { id: firstLink, relationship: 'other' }))?.status, 'error', 'but not by another org');

    const listed = await read(admin, { type: 'profile_guardians', orgId: DKL, playerProfileId: ANIKA });
    expect(Array.isArray(listed) ? listed.map((l: any) => l.guardianProfileId) : listed, [PARENT_2, PARENT], 'the guardians are read primary first');
    expect(refused(await read(stranger, { type: 'profile_guardians', orgId: DKL, playerProfileId: ANIKA })), true, 'another org cannot read them');

    const ended = await send(admin, SocketAction.END_PROFILE_GUARDIAN, { id: second?.data?.id });
    expect(Boolean(ended?.data?.endDate), true, 'a link can be ended, keeping the row');
    const promoted = (await query(`SELECT is_primary FROM profile_guardians WHERE id = $1`, [firstLink])).rows[0]?.is_primary;
    expect(promoted, true, 'ending the primary hands primary to the one left');
    expect((await send(admin, SocketAction.END_PROFILE_GUARDIAN, { id: second?.data?.id }))?.status, 'error', 'an ended link cannot be ended again');

    // --- A guardian holds no membership ------------------------------------------------------
    const parentView = await memberships(parent, PARENT_USER);
    expect(parentView?.orgs?.length, 0, 'the guardian belongs to no organisation');
    expect(parentView?.dependants?.map((d: any) => [d.playerProfileId, d.restrictedReason]), [[ANIKA, 'org-off']], 'but sees their child, restricted while the org has minors off');
    expect(parentView?.dependants?.[0]?.teams?.map((t: any) => t.teamId).sort(), [TEAM_OWN, TEAM_COACHED].sort(), 'with the child’s teams');
    expect(await join(parent, `org:${DKL}:members`), 'denied', 'the guardian cannot read the member list');
    expect(await join(parent, `team:${TEAM_OWN}:members`), 'denied', 'or the child’s roster');
    expect(await join(parent, `org:${DKL}:guardians`), 'denied', 'or the org’s guardians');
    expect(await join(stranger, `org:${DKL}:guardians`), 'denied', 'and nor can another org');
    expect(refused(await read(parent, { type: 'org_members', orgId: DKL })), true, 'or query the members');

    // --- A restricted minor: linked, but no member privileges --------------------------------
    const minorView = await memberships(minor, MINOR_USER);
    expect(minorView?.orgs?.map((o: any) => [o.orgId, o.restrictedReason]), [[DKL, 'org-off']], 'the minor is linked and sees the org as theirs, restricted');
    expect(await join(minor, `org:${DKL}:members`), 'denied', 'a restricted minor cannot read the member list');
    expect(await join(minor, `team:${TEAM_OWN}:members`), 'denied', 'or their own team’s roster, as a player');
    expect(await join(minor, `team:${TEAM_OTHER}:members`), 'denied', 'or any other roster');
    expect(await join(minor, `team:${TEAM_COACHED}:members`), 'joined', 'but can read the roster of the team they coach');
    expect(await join(minor, `game:${GAME_COACHED}`), 'joined', 'and that team’s games');
    expect(await join(minor, `game:${GAME_SCORED}`), 'joined', 'and the game they were appointed to score');
    expect(await join(minor, `game:${GAME_OTHER}`), 'denied', 'and no other game');
    expect(await accessManager.canScoreGame(MINOR_USER, GAME_SCORED), true, 'the appointed scorer can score, though restricted');
    expect(await accessManager.canScoreGame(MINOR_USER, GAME_COACHED), true, 'a coach can score their team’s game, though restricted');
    expect(await accessManager.canScoreGame(MINOR_USER, GAME_OTHER), false, 'but nothing else');
    expect(await accessManager.getOrganizationRole(MINOR_USER, DKL), null, 'and holds no org role for any privilege check');

    // --- Who sets the minor's own value ------------------------------------------------------
    const setMinor = (socket: Socket, player: string, allowed: boolean | null) =>
      send(socket, SocketAction.SET_MINOR_ACCOUNT_ACCESS, { playerProfileId: player, allowed });
    expect((await setMinor(staff, ANIKA, false))?.status, 'error', 'staff cannot set a minor’s access');
    expect((await setMinor(admin, ANIKA, false))?.status, 'error', 'an admin cannot, once the minor has a guardian');
    const byParent = await setMinor(parent, ANIKA, false);
    expect(byParent?.status, 'ok', 'the guardian can');
    expect(byParent?.data?.ownAccountSetBy, PARENT, 'and is recorded as the one who set it');
    expect((await setMinor(admin, MIA, false))?.status, 'ok', 'an admin can for a minor with no guardian');
    expect((await setMinor(staff, MIA, null))?.status, 'error', 'staff still cannot');
    expect((await setMinor(parent, MIA, true))?.status, 'error', 'nor can someone else’s guardian');

    // --- The organisation's switch comes first -----------------------------------------------
    const setOrg = (socket: Socket, accountsAllowed: boolean, minorAge: number) =>
      send(socket, SocketAction.SET_ORG_MINORS_SETTINGS, { orgId: DKL, accountsAllowed, minorAge });
    expect((await setOrg(staff, true, 18))?.status, 'error', 'staff cannot change the minors setting');
    expect((await setOrg(admin, true, 30))?.status, 'error', 'a minor age outside 1–21 is refused');
    expect((await setOrg(admin, true, 18))?.status, 'ok', 'an admin can switch minors on');

    expect((await memberships(minor, MINOR_USER))?.orgs?.[0]?.restrictedReason, 'minor-off', 'the guardian’s no still holds once the org allows minors');
    expect(await join(minor, `org:${DKL}:members`), 'denied', 'so the minor still cannot read the member list');

    expect((await setMinor(parent, ANIKA, null))?.status, 'ok', 'the guardian can clear their no');
    expect((await memberships(minor, MINOR_USER))?.orgs?.[0]?.restrictedReason, null, 'and the minor has full access by default');
    expect(await join(minor, `org:${DKL}:members`), 'joined', 'at once, without reconnecting');
    expect(await accessManager.getOrganizationRole(MINOR_USER, DKL), 'role-org-member', 'with their org role back');

    expect((await setMinor(parent, ANIKA, false))?.status, 'ok', 'a guardian can switch it off again');
    expect(await join(minor, `org:${DKL}:members`), 'denied', 'which takes effect at once');

    // --- The minor age moves the line --------------------------------------------------------
    expect((await setOrg(admin, false, 18))?.status, 'ok', 'minors switched back off');
    expect(await join(member, `org:${DKL}:members`), 'joined', 'an 18-year-old is an adult at the default age');
    expect((await setOrg(admin, false, 19))?.status, 'ok', 'the minor age can be raised');
    expect((await memberships(member, MEMBER))?.orgs?.[0]?.restrictedReason, 'org-off', 'which makes the 18-year-old a restricted minor');
    expect(await join(member, `org:${DKL}:members`), 'denied', 'at once');
    expect((await setOrg(admin, false, 18))?.status, 'ok', 'and lowered again');
    expect(await join(member, `org:${DKL}:members`), 'joined', 'which restores them');

    // --- Ending the last link ----------------------------------------------------------------
    expect((await send(admin, SocketAction.END_PROFILE_GUARDIAN, { id: firstLink }))?.status, 'ok', 'the last link can be ended');
    expect((await memberships(parent, PARENT_USER))?.dependants?.length, 0, 'and the child leaves the guardian’s view');
    expect((await setMinor(admin, ANIKA, null))?.status, 'ok', 'with no guardian left, an admin may set the minor’s value again');
  } finally {
    sockets.forEach(s => s.disconnect());
    await teardown(original);
    await pool.end();
  }

  if (failures.length) {
    console.error(`test-guardians: ${failures.length} of ${checks} checks failed`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`test-guardians: all ${checks} checks passed`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
