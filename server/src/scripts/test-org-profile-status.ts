import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { SocketAction } from '@sk/shared';
import pool, { query } from '../db';
import { accessManager } from '../managers/AccessManager';
import { guardianManager } from '../managers/GuardianManager';

/**
 * An org profile being active or inactive, and finding guardians (docs/people.md §2a and §9,
 * `PEOPLE-9`), end to end over a real socket against the test organisations (Doringkloof).
 *
 * Needs a server on the same database: `PORT=3099 npx ts-node src/index.ts`, then
 * `SOCKET_URL=http://localhost:3099 npx ts-node src/scripts/test-org-profile-status.ts`. Everything
 * it adds is `test-…` and removed at the end.
 */

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3099';
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';

const DKL = 'fx-org-dkl';
const OTHER_ORG = 'fx-org-sac';
const ADMIN = 'fx-user-johan-van-der-merwe';
const STAFF = 'fx-user-annelie-botha';
const MEMBER = 'fx-user-francois-marais';
const TEAM = 'fx-team-dkl-netball-u14a';

const P = 'test-ops';
const PARENT_USER = `${P}-user-parent`;
const PARENT_EMAIL = `${P}-parent@status.test`;
const PARENT = `${P}-prof-parent`;
const PARENT_ELSEWHERE = `${P}-prof-parent-sac`;
const CHILD = `${P}-prof-child`;
const CHILD_2 = `${P}-prof-child-2`;
const CHILD_MEMBERSHIP = `${P}-mem-child`;
const CHILD_2_MEMBERSHIP = `${P}-mem-child-2`;
const STAFF_PARENT = `${P}-prof-staff-parent`;
const STAFF_PARENT_MEMBERSHIP = `${P}-mem-staff-parent`;

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
const send = (socket: Socket, type: SocketAction, payload: any): Promise<any> =>
  new Promise((resolve) => socket.emit('action', { type, payload }, resolve));
const read = (socket: Socket, request: any): Promise<any> =>
  new Promise((resolve) => socket.emit('get_data', request, resolve));

const isInactive = async (id: string) =>
  (await query('SELECT inactive_at IS NOT NULL AS inactive FROM org_profiles WHERE id = $1', [id])).rows[0]?.inactive;
const profile = async (id: string) =>
  (await query('SELECT email, identifier, inactive_at FROM org_profiles WHERE id = $1', [id])).rows[0];
const ids = (page: any) => (page.items || []).map((row: any) => row.id);

async function cleanup() {
  const like = `${P}%`;
  await query('DELETE FROM profile_guardians WHERE guardian_profile_id LIKE $1 OR player_profile_id LIKE $1', [like]);
  await query('DELETE FROM team_memberships WHERE org_profile_id LIKE $1', [like]);
  await query('DELETE FROM org_memberships WHERE org_profile_id LIKE $1', [like]);
  await query('DELETE FROM org_profiles WHERE id LIKE $1', [like]);
  await query('DELETE FROM users WHERE id LIKE $1', [like]);
}

async function setup() {
  await cleanup();
  await query('INSERT INTO users (id, name, email) VALUES ($1, $2, $3)', [PARENT_USER, 'Ops Parent', PARENT_EMAIL]);
  await query(
    `INSERT INTO org_profiles (id, org_id, name, email, user_id, identifier) VALUES
       ($1, $4, 'Opsparent Testperson', $3, $2, ${"'OPS-1'"}),
       ($5, $6, 'Opsparent Elsewhere', $3, $2, NULL),
       ($7, $4, 'Opschild Testperson', NULL, NULL, NULL),
       ($8, $4, 'Opschildtwo Testperson', NULL, NULL, NULL),
       ($9, $4, 'Opsstaff Testperson', NULL, NULL, NULL)`,
    [PARENT, PARENT_USER, PARENT_EMAIL, DKL, PARENT_ELSEWHERE, OTHER_ORG, CHILD, CHILD_2, STAFF_PARENT]
  );
  await query(
    `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES
       ($1, $2, $7, 'role-org-member', NOW()), ($3, $4, $7, 'role-org-member', NOW()), ($5, $6, $7, 'role-org-staff', NOW())`,
    [CHILD_MEMBERSHIP, CHILD, CHILD_2_MEMBERSHIP, CHILD_2, STAFF_PARENT_MEMBERSHIP, STAFF_PARENT, DKL]
  );
  await guardianManager.addGuardian({ id: `${P}-link-1`, playerProfileId: CHILD, guardianProfileId: PARENT, relationship: 'parent' });
}

async function run() {
  const admin = await connect(ADMIN);
  const staff = await connect(STAFF);
  const member = await connect(MEMBER);
  try {
    await setup();

    // --- Finding guardians ------------------------------------------------------------------------
    const guardians = await read(staff, { type: 'org_people', orgId: DKL, view: 'guardians', search: 'Opsparent' });
    expect(ids(guardians), [PARENT], 'the Guardians view lists someone with no membership');
    expect(guardians.items[0].childNames, ['Opschild Testperson'], '…with who they answer for');
    expect(guardians.items[0].membershipId, null, '…and no membership');
    expect(guardians.guardianCount > 0, true, 'and the count for the filter comes with the page');
    expect(ids(await read(staff, { type: 'org_people', orgId: DKL, view: 'guardians', search: 'Opschild' })), [PARENT], 'found by a child’s name');

    const search = await read(staff, { type: 'org_people', orgId: DKL, withGuardians: true, search: 'Opsparent' });
    expect(ids(search), [PARENT], 'a search under All finds a guardian too');
    expect(ids(await read(staff, { type: 'org_people', orgId: DKL, search: 'Opsparent' })), [], 'but a team picker’s search finds members only');
    expect(ids(await read(staff, { type: 'org_people', orgId: DKL, withGuardians: true, roleId: 'role-org-member', search: 'Opsparent' })), [], 'and a role filter means that role');
    const everyone = await read(staff, { type: 'org_people', orgId: DKL, withGuardians: true, limit: 100 });
    const allTotal = Object.values<number>(everyone.roleCounts).reduce((sum, n) => sum + n, 0);
    expect(everyone.total, allTotal, 'with no search, All is the members and nobody else');

    const page = await read(staff, { type: 'org_guardian', orgId: DKL, profileId: PARENT });
    expect(page?.children?.map((c: any) => [c.id, c.membershipId]), [[CHILD, CHILD_MEMBERSHIP]], 'the guardian’s page names their children, to open');
    const refused = await read(member, { type: 'org_guardian', orgId: DKL, profileId: PARENT });
    expect(refused?.id, undefined, 'a plain Member cannot read a guardian’s page');
    expect((await read(member, { type: 'org_people', orgId: DKL, view: 'guardians' }))?.items, undefined, 'or the Guardians view');

    // --- Last child delinked: inactive, and the org profile only ---------------------------------
    await send(staff, SocketAction.END_PROFILE_GUARDIAN, { id: `${P}-link-1` });
    expect(await isInactive(PARENT), true, 'a guardian’s last link ending makes their org profile inactive');
    expect(await isInactive(PARENT_ELSEWHERE), false, 'their org profile elsewhere is untouched');
    expect((await query('SELECT 1 FROM users WHERE id = $1', [PARENT_USER])).rowCount, 1, 'as is their user account');
    expect((await profile(PARENT)).email, PARENT_EMAIL, 'the details stay on record');
    expect(await accessManager.ownsOrgProfile(PARENT_USER, PARENT), false, 'an inactive profile gives its account no standing');
    expect(await accessManager.ownsOrgProfile(PARENT_USER, PARENT_ELSEWHERE), true, 'the other one still does');
    expect((await read(staff, { type: 'org_guardian', orgId: DKL, profileId: PARENT }))?.id, undefined, 'they no longer have a guardian’s page');
    expect(ids(await read(staff, { type: 'org_people', orgId: DKL, view: 'guardians', search: 'Opsparent' })), [], 'or a place in the Guardians view');

    // Pickers: only the add forms, and only when they ask.
    const picked = await read(staff, { type: 'search_people', orgId: DKL, query: 'Opsparent Testperson' });
    expect(picked.some((p: any) => p.id === PARENT), false, 'an ordinary picker does not offer them');
    const offered = await read(staff, { type: 'search_people', orgId: DKL, query: 'Opsparent Testperson', includeInactive: true });
    expect(offered.find((p: any) => p.id === PARENT)?.inactiveAt != null, true, 'the add forms do, marked as having left');
    const former = await read(staff, { type: 'former_person', orgId: DKL, email: PARENT_EMAIL.toUpperCase() });
    expect(former?.id, PARENT, 'the email asks “is this them?”');
    expect((await read(staff, { type: 'former_person', orgId: DKL, identifier: 'OPS-1' }))?.id, PARENT, 'and so does the org ID');
    expect((await read(member, { type: 'former_person', orgId: DKL, email: PARENT_EMAIL }))?.id, undefined, 'never to a plain Member');

    // --- The email and org ID are free, within this organisation ---------------------------------
    const newcomer = `${P}-prof-newcomer`;
    let r = await send(admin, SocketAction.ADD_ORG_PROFILE, { id: newcomer, orgId: DKL, name: 'Opsnew Testperson', email: PARENT_EMAIL, identifier: 'OPS-1' });
    expect(r.status, 'ok', 'someone else may now have that email and org ID');
    r = await send(admin, SocketAction.ADD_ORG_PROFILE, { id: `${P}-prof-clash`, orgId: DKL, name: 'Opsclash Testperson', email: PARENT_EMAIL.toUpperCase() });
    expect(r.status, 'error', 'but only one active person at a time');
    expect((await read(staff, { type: 'former_person', orgId: DKL, email: 'nobody@status.test' }))?.id, undefined, 'and nobody is asked about for an unknown email');

    // --- Coming back ------------------------------------------------------------------------------
    r = await send(staff, SocketAction.ADD_PROFILE_GUARDIAN, { id: `${P}-link-2`, playerProfileId: CHILD_2, guardianProfileId: PARENT, relationship: 'parent' });
    expect(r.status, 'ok', 'a former guardian can be linked again');
    expect(await isInactive(PARENT), false, 'which brings their org profile back');
    expect(await profile(PARENT).then(p => [p.email, p.identifier]), [null, null], 'without what someone else now holds');
    expect((await profile(newcomer)).email, PARENT_EMAIL, 'and the other person keeps it');

    await query('DELETE FROM org_profiles WHERE id = $1', [newcomer]);
    await query('UPDATE org_profiles SET email = $2, identifier = $3 WHERE id = $1', [PARENT, PARENT_EMAIL, 'OPS-1']);

    // --- Removing a guardian from the organisation ------------------------------------------------
    await query(`INSERT INTO team_memberships (id, org_profile_id, team_id, role_id, start_date) VALUES ($1, $2, $3, 'role-coach', NOW())`, [`${P}-tm-parent`, PARENT, TEAM]);
    r = await send(staff, SocketAction.DELETE_ORG_PROFILE, { id: PARENT });
    expect(r.status, 'error', 'removal is refused while they have another part here');
    expect(/a role on /.test(r.message), true, 'and says which');
    expect(await isInactive(PARENT), false, 'and changes nothing');
    await query('DELETE FROM team_memberships WHERE id = $1', [`${P}-tm-parent`]);

    r = await send(member, SocketAction.DELETE_ORG_PROFILE, { id: PARENT });
    expect(r.status, 'error', 'a plain Member cannot remove anyone');
    r = await send(staff, SocketAction.DELETE_ORG_PROFILE, { id: PARENT });
    expect(r.status, 'ok', 'staff can remove a guardian who has no other part');
    expect(await isInactive(PARENT), true, 'their org profile is inactive');
    expect((await query('SELECT end_date IS NOT NULL AS ended FROM profile_guardians WHERE id = $1', [`${P}-link-2`])).rows[0]?.ended, true, 'the link ended, and kept');
    expect((await query('SELECT 1 FROM org_profiles WHERE id = $1', [PARENT])).rowCount, 1, 'the record is kept');

    // --- Removing a member ------------------------------------------------------------------------
    await query(`INSERT INTO team_memberships (id, org_profile_id, team_id, role_id, start_date) VALUES ($1, $2, $3, 'role-player', NOW())`, [`${P}-tm-child`, CHILD, TEAM]);
    await guardianManager.addGuardian({ id: `${P}-link-3`, playerProfileId: CHILD, guardianProfileId: PARENT, relationship: 'parent' });
    await guardianManager.addGuardian({ id: `${P}-link-4`, playerProfileId: CHILD, guardianProfileId: STAFF_PARENT, relationship: 'parent' });
    await guardianManager.addGuardian({ id: `${P}-link-5`, playerProfileId: CHILD_2, guardianProfileId: PARENT, relationship: 'parent' });
    expect(await isInactive(PARENT), false, 'linking brought them back');

    r = await send(admin, SocketAction.REMOVE_ORG_MEMBER, { id: CHILD_MEMBERSHIP });
    expect(r.status, 'ok', 'a member can be removed');
    expect(await isInactive(CHILD), true, 'with no part left, their org profile is inactive');
    expect((await query('SELECT end_date IS NOT NULL AS ended FROM team_memberships WHERE id = $1', [`${P}-tm-child`])).rows[0]?.ended, true, 'they are off every team, as the message promises');
    expect((await query('SELECT end_date IS NOT NULL AS ended FROM profile_guardians WHERE id = $1', [`${P}-link-3`])).rows[0]?.ended, true, 'their guardian links end');
    expect(await isInactive(PARENT), false, 'a guardian with another child stays');
    expect(await isInactive(STAFF_PARENT), false, 'as does a guardian who is a member');

    await query('UPDATE profile_guardians SET end_date = NOW() WHERE id = $1', [`${P}-link-5`]);
    await query('UPDATE org_memberships SET end_date = NULL WHERE id = $1', [CHILD_2_MEMBERSHIP]);
    await guardianManager.addGuardian({ id: `${P}-link-6`, playerProfileId: CHILD_2, guardianProfileId: PARENT, relationship: 'parent' });
    r = await send(admin, SocketAction.REMOVE_ORG_MEMBER, { id: CHILD_2_MEMBERSHIP });
    expect(r.status, 'ok', 'removing their last child');
    expect(await isInactive(PARENT), true, 'takes a guardian with nothing else out with them');

    // A staff parent who is removed as staff, and is still somebody's guardian, stays as a guardian.
    await query('UPDATE org_memberships SET end_date = NULL WHERE id = $1', [CHILD_2_MEMBERSHIP]);
    await query('UPDATE org_profiles SET inactive_at = NULL WHERE id = $1', [CHILD_2]);
    await guardianManager.addGuardian({ id: `${P}-link-7`, playerProfileId: CHILD_2, guardianProfileId: STAFF_PARENT, relationship: 'parent' });
    r = await send(admin, SocketAction.REMOVE_ORG_MEMBER, { id: STAFF_PARENT_MEMBERSHIP });
    expect(r.status, 'ok', 'a parent who was also staff can be removed as staff');
    expect(await isInactive(STAFF_PARENT), false, 'and stays on as a guardian');
    expect(ids(await read(staff, { type: 'org_people', orgId: DKL, view: 'guardians', search: 'Opsstaff' })), [STAFF_PARENT], 'in the Guardians view');

    // --- A member coming back ---------------------------------------------------------------------
    r = await send(admin, SocketAction.ADD_ORG_MEMBER, { orgProfileId: CHILD, orgId: DKL, roleId: 'role-org-member' });
    expect(r.status, 'ok', 'someone who left can be added again');
    expect(await isInactive(CHILD), false, 'on the same org profile');

    // --- An import: by what identifies them, shown in the preview before anything changes ---------
    await query('UPDATE org_profiles SET inactive_at = NOW(), identifier = $2 WHERE id = $1', [PARENT, 'OPS-1']);
    const row = { rowNumber: 1, name: 'Opsparent Testperson', email: PARENT_EMAIL };
    const preview = await send(admin, SocketAction.IMPORT_ORG_PEOPLE, { orgId: DKL, rows: [row], mode: 'preview' });
    const previewed = preview.data?.rows?.[0] ?? preview.rows?.[0];
    expect(previewed?.profileId, PARENT, 'an import row with their email matches someone who left');
    expect(previewed?.warnings?.some((w: string) => /left this organisation/.test(w)), true, 'and the preview says it brings them back');
    expect(await isInactive(PARENT), true, 'a preview changes nothing');
    const applied = await send(admin, SocketAction.IMPORT_ORG_PEOPLE, { orgId: DKL, rows: [row], mode: 'apply', idempotencyKey: `${P}-${Date.now()}` });
    expect(applied.status, 'ok', 'the import applies');
    expect(await isInactive(PARENT), false, 'and brings them back');
  } finally {
    admin.close();
    staff.close();
    member.close();
    await cleanup();
  }

  console.log(`${checks - failures.length} of ${checks} checks passed.`);
  if (failures.length) {
    for (const failure of failures) console.error(`  FAILED  ${failure}`);
    process.exitCode = 1;
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
