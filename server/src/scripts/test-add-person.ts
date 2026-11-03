import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { SocketAction } from '@sk/shared';
import pool, { query } from '../db';
import { fixtureIds } from './setup/fixtures/testOrgs';

/**
 * Adding a person never changes someone already on record (`PEOPLE-7`), end to end over a real socket
 * against the test organisations (St Aldric's).
 *
 *  - An org ID someone else holds is refused, on an add and on an edit, and the holder is untouched.
 *    Admin and Staff are told who holds it; a coach only that it is in use.
 *  - `userId` on `ADD_ORG_PROFILE` is ignored: only the claim flow links an account.
 *  - `ADD_ORG_MEMBER` on someone already a member is refused and leaves their role, unless it says
 *    `keepExisting` (a team's "new person"), which succeeds and still leaves it. A repeated request
 *    is answered from the first, not refused.
 *
 * Needs a server on the same database: `PORT=3099 npx ts-node src/index.ts`, then
 * `SOCKET_URL=http://localhost:3099 npx ts-node src/scripts/test-add-person.ts`. Everything it makes
 * carries the `test-ap-` prefix and is removed at the end.
 */

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3099';
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';

const P = 'test-ap-';
const RUN = `${P}${Date.now()}`;
const ORG_ID = 'AP-TEST-1';
const SAC = fixtureIds.org('sac');
const SAC_TEAM = fixtureIds.team('sac', 'rugby-u16a');
const ADMIN = fixtureIds.user('Catherine Whitfield');
const STAFF = fixtureIds.user('Graham Hendricks');

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

function send(socket: Socket, type: SocketAction, payload: any, requestId?: string): Promise<any> {
  return new Promise((resolve) => socket.emit('action', { type, payload, requestId }, resolve));
}

/** A signed-in person in St Aldric's, with the org role given. */
async function person(slug: string, roleId: string, identifier?: string) {
  const userId = `${P}user-${slug}`;
  const profileId = `${P}prof-${slug}`;
  await query(`INSERT INTO users (id, name, email, global_role) VALUES ($1, $2, $3, 'user')`, [userId, `AP ${slug}`, `${userId}@example.test`]);
  await query(`INSERT INTO org_profiles (id, org_id, user_id, name, email, identifier) VALUES ($1, $2, $3, $4, $5, $6)`,
    [profileId, SAC, userId, `AP ${slug}`, `${userId}@example.test`, identifier ?? null]);
  await query(`INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES ($1, $2, $3, $4, NOW())`,
    [`${P}om-${slug}`, profileId, SAC, roleId]);
  return { userId, profileId };
}

const holderRow = async (id: string) => (await query(
  `SELECT op.user_id, op.name, op.email, om.role_id FROM org_profiles op JOIN org_memberships om ON om.org_profile_id = op.id WHERE op.id = $1`, [id]
)).rows[0];

async function cleanup() {
  await query(`DELETE FROM team_memberships WHERE org_profile_id LIKE $1`, [`${P}%`]);
  await query(`DELETE FROM org_memberships WHERE org_profile_id LIKE $1`, [`${P}%`]);
  await query(`DELETE FROM org_profiles WHERE id LIKE $1`, [`${P}%`]);
  await query(`DELETE FROM notifications WHERE user_id LIKE $1`, [`${P}%`]);
  await query(`DELETE FROM users WHERE id LIKE $1`, [`${P}%`]);
}

async function main() {
  await cleanup();
  const sockets: Socket[] = [];
  try {
    const holder = await person('holder', 'role-org-staff', ORG_ID);
    const other = await person('other', 'role-org-member');
    const coach = await person('coach', 'role-org-member');
    await query(`INSERT INTO team_memberships (id, org_profile_id, team_id, role_id, start_date) VALUES ($1, $2, $3, 'role-coach', NOW())`,
      [`${P}tm-coach`, coach.profileId, SAC_TEAM]);
    const before = await holderRow(holder.profileId);

    const [admin, staff, coachSocket] = await Promise.all([ADMIN, STAFF, coach.userId].map(connect));
    sockets.push(admin, staff, coachSocket);

    // --- An org ID someone else holds -------------------------------------------------------------
    const colliding = { id: `${P}prof-new`, orgId: SAC, name: 'AP Somebody Else', email: 'ap.else@example.test', identifier: ORG_ID };
    const byAdmin = await send(admin, SocketAction.ADD_ORG_PROFILE, colliding);
    expect(byAdmin?.status, 'error', 'an add with an org ID in use is refused');
    expect(byAdmin?.message, `Org ID ${ORG_ID} already belongs to AP holder. Search for them by name to add them.`, 'and an admin is told who holds it');
    expect((await send(staff, SocketAction.ADD_ORG_PROFILE, colliding))?.message?.includes('AP holder'), true, 'staff are told too');
    expect((await send(coachSocket, SocketAction.ADD_ORG_PROFILE, colliding))?.message, `Org ID ${ORG_ID} is already in use.`, 'a coach is told only that it is in use');
    expect(await holderRow(holder.profileId), before, 'the holder keeps their account link, name, email and role');
    expect((await query('SELECT 1 FROM org_profiles WHERE id = $1', [colliding.id])).rows.length, 0, 'and no record was made');

    const edit = await send(admin, SocketAction.UPDATE_ORG_PROFILE, { id: other.profileId, data: { identifier: ORG_ID } });
    expect(edit?.message, `Org ID ${ORG_ID} already belongs to AP holder.`, 'an edit to an org ID in use is refused the same way');
    const keepsOwn = await send(admin, SocketAction.UPDATE_ORG_PROFILE, { id: holder.profileId, data: { name: 'AP holder', identifier: ORG_ID } });
    expect(keepsOwn?.status, 'ok', 'saving someone with their own org ID is fine');

    // --- `userId` on an add -----------------------------------------------------------------------
    const linked = await send(staff, SocketAction.ADD_ORG_PROFILE, { id: `${P}prof-linked`, orgId: SAC, name: 'AP Linked', userId: other.userId });
    expect(linked?.status, 'ok', 'an add naming an account still adds the person');
    expect((await query('SELECT user_id FROM org_profiles WHERE id = $1', [`${P}prof-linked`])).rows[0]?.user_id, null, 'without linking the account');

    // --- Someone already a member -----------------------------------------------------------------
    const asMember = { orgProfileId: holder.profileId, orgId: SAC, roleId: 'role-org-member' };
    const refused = await send(admin, SocketAction.ADD_ORG_MEMBER, asMember);
    expect(refused?.status, 'error', 'adding someone already a member is refused');
    expect(refused?.message, 'AP holder is already a member of this organisation.', 'and says so');
    expect((await send(coachSocket, SocketAction.ADD_ORG_MEMBER, asMember))?.status, 'error', 'a coach is refused too');
    const kept = await send(coachSocket, SocketAction.ADD_ORG_MEMBER, { ...asMember, keepExisting: true });
    expect(kept?.status, 'ok', 'keepExisting succeeds for someone already a member');
    expect(kept?.data?.roleId, 'role-org-staff', 'and answers with the role they hold');
    expect((await holderRow(holder.profileId)).role_id, 'role-org-staff', 'whose role did not change');

    // --- Someone new ------------------------------------------------------------------------------
    const joining = { orgProfileId: `${P}prof-linked`, orgId: SAC, roleId: 'role-org-member' };
    const joined = await send(admin, SocketAction.ADD_ORG_MEMBER, joining, `${RUN}-join`);
    expect(joined?.status, 'ok', 'someone not yet a member joins');
    const replay = await send(admin, SocketAction.ADD_ORG_MEMBER, joining, `${RUN}-join`);
    expect(replay?.status, 'ok', 'a repeated request is answered from the first, not refused');
    expect((await send(admin, SocketAction.ADD_ORG_MEMBER, joining))?.status, 'error', 'a new request for them is refused');
    const placed = await send(admin, SocketAction.ADD_ORG_MEMBER, { orgProfileId: other.profileId, orgId: SAC, roleId: 'role-org-staff', keepExisting: true });
    expect(placed?.data?.roleId, 'role-org-member', 'keepExisting ignores the role asked for');
  } finally {
    sockets.forEach(s => s.disconnect());
    await cleanup();
    await pool.end();
  }

  if (failures.length) {
    console.error(`test-add-person: ${failures.length} of ${checks} checks failed`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`test-add-person: all ${checks} checks passed`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
