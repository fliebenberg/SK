import pool, { query } from '../db';
import { accessManager } from '../managers/AccessManager';
import { teamManager } from '../managers/TeamManager';
import { userManager } from '../managers/UserManager';
import { canJoinRoom, invalidateMembership } from '../wss/roomAccess';
import { canReadData } from '../wss/dataAccess';

/**
 * What a plain Member can read (`PEOPLE-8`, docs/permissions.md): what the public can. People's
 * details are for the organisation's Admin and Staff, and a team's for those with a duty on it.
 * Against the test organisations (St Aldric's, with its U16 A rugby coach), with no server.
 *
 * Run: `npx ts-node src/scripts/test-member-read-access.ts`. Everything it adds is `test-…` and removed.
 */

const SAC = 'fx-org-sac';
const SAC_STAFF_EMAIL = 'graham.hendricks@staldrics.test';
const SAC_COACH_EMAIL = 'brendan.oneill@staldrics.test';
const MEMBER = 'test-user-read-member';
const PROFILE = 'test-profile-read-member';
const MEMBERSHIP = 'test-mem-read-member';

let checks = 0;
const failures: string[] = [];
const check = (ok: boolean, what: string) => { checks++; if (!ok) failures.push(what); };

const can = async (who: string, room: string, expected: boolean) => {
  check((await canJoinRoom(who, room)) === expected, `${who} ${expected ? 'should' : 'should not'} join ${room}`);
};
const reads = async (who: string, request: any, expected: boolean) => {
  check((await canReadData(who, request)).allowed === expected, `${who} ${expected ? 'should' : 'should not'} read ${request.type}`);
};

async function cleanUp() {
  await query('DELETE FROM org_memberships WHERE id = $1', [MEMBERSHIP]);
  await query('DELETE FROM org_profiles WHERE id = $1', [PROFILE]);
  await query('DELETE FROM users WHERE id = $1', [MEMBER]);
}

async function main() {
  await cleanUp();
  await query(`INSERT INTO users (id, email, name, password_hash) VALUES ($1, 'test-read-member@example.test', 'Test Read Member', 'x')`, [MEMBER]);
  await query(`INSERT INTO org_profiles (id, org_id, name, user_id, email) VALUES ($1, $2, 'Test Read Member', $3, 'test-read-member@example.test')`, [PROFILE, SAC, MEMBER]);
  await query(`INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES ($1, $2, $3, 'role-org-member', NOW())`, [MEMBERSHIP, PROFILE, SAC]);
  invalidateMembership(MEMBER);

  const userOf = async (email: string) => (await query('SELECT id FROM users WHERE LOWER(email) = $1', [email])).rows[0]?.id;
  const SAC_STAFF = await userOf(SAC_STAFF_EMAIL);
  const SAC_COACH = await userOf(SAC_COACH_EMAIL);
  const coachesTeam = (await query(
    `SELECT tm.team_id AS id FROM team_memberships tm JOIN org_profiles p ON p.id = tm.org_profile_id
      WHERE LOWER(p.email) = $1 AND tm.role_id = 'role-coach' LIMIT 1`, [SAC_COACH_EMAIL]
  )).rows[0]?.id;
  if (!coachesTeam) throw new Error('The test organisations are not set up: St Aldric\'s coach has no team.');
  const otherTeam = (await query('SELECT id FROM teams WHERE org_id = $1 AND id <> $2 LIMIT 1', [SAC, coachesTeam])).rows[0]?.id;

  // A plain Member: nothing but the public rooms.
  for (const sub of ['members', 'guardians', 'referrals', 'invitations']) await can(MEMBER, `org:${SAC}:${sub}`, false);
  await can(MEMBER, `team:${coachesTeam}`, false);
  await can(MEMBER, `team:${coachesTeam}:members`, false);
  await can(MEMBER, `team:${coachesTeam}:guardians`, false);
  for (const sub of ['summary', 'teams', 'fixtures', 'events']) await can(MEMBER, `org:${SAC}:${sub}`, true);
  await reads(MEMBER, { type: 'org_members', orgId: SAC }, false);
  await reads(MEMBER, { type: 'org_people', orgId: SAC }, false);
  await reads(MEMBER, { type: 'org_person', orgId: SAC, membershipId: MEMBERSHIP }, false);
  await reads(MEMBER, { type: 'org_people_names', orgId: SAC }, false);
  await reads(MEMBER, { type: 'team_members', teamId: coachesTeam }, false);
  await reads(MEMBER, { type: 'profile_guardians', orgId: SAC }, false);
  await reads(MEMBER, { type: 'team_squad', teamId: coachesTeam }, true);
  check(!(await accessManager.canManageOrgPeople(MEMBER, SAC)), 'a Member should get a lean people search');

  // Staff: everything of the organisation's.
  for (const sub of ['members', 'guardians', 'referrals', 'invitations']) await can(SAC_STAFF, `org:${SAC}:${sub}`, true);
  await can(SAC_STAFF, `team:${coachesTeam}:members`, true);
  await reads(SAC_STAFF, { type: 'org_members', orgId: SAC }, true);
  check(await accessManager.canManageOrgPeople(SAC_STAFF, SAC), 'Staff should get the full people search');

  // A coach: their team's people and guardians, everyone else's names, and nothing of the rest.
  await can(SAC_COACH, `org:${SAC}:members`, false);
  await can(SAC_COACH, `org:${SAC}:guardians`, false);
  await can(SAC_COACH, `org:${SAC}:invitations`, true);
  await can(SAC_COACH, `team:${coachesTeam}:members`, true);
  await can(SAC_COACH, `team:${coachesTeam}:guardians`, true);
  if (otherTeam) await can(SAC_COACH, `team:${otherTeam}:members`, false);
  await reads(SAC_COACH, { type: 'org_people_names', orgId: SAC }, true);
  await reads(SAC_COACH, { type: 'org_people_names', orgId: 'fx-org-dkl' }, false);
  await reads(SAC_COACH, { type: 'org_members', orgId: SAC }, false);
  await reads(SAC_COACH, { type: 'org_people', orgId: SAC }, false);
  await reads(SAC_COACH, { type: 'org_person', orgId: SAC, membershipId: MEMBERSHIP }, false);

  // Signed out: none of it.
  await can('anonymous', `team:${coachesTeam}:guardians`, false);
  await reads('anonymous', { type: 'org_people_names', orgId: SAC }, false);
  await reads('anonymous', { type: 'org_people', orgId: SAC }, false);

  // The lean shapes carry no details.
  const details = ['email', 'cellphone', 'birthdate', 'nationalId', 'userId', 'personOrgId', 'image'];
  for (const row of await teamManager.getTeamMemberNames(coachesTeam) as any[]) {
    check(details.every(key => !(key in row)), `a roster by name should carry none of ${details.join(', ')}`);
  }
  for (const row of (await userManager.getOrgPeopleNames(SAC)).items as any[]) {
    check(Object.keys(row).sort().join() === 'id,image,membershipId,name', `the names list carries ${Object.keys(row).join()}`);
  }
}

main()
  .catch(error => { failures.push(`Threw: ${error.stack || error}`); })
  .finally(async () => {
    await cleanUp().catch(() => {});
    await pool.end();
    if (failures.length) {
      console.error(`${failures.length} of ${checks} checks failed:\n${failures.join('\n')}`);
      process.exit(1);
    }
    console.log(`All ${checks} checks passed.`);
    process.exit(0);
  });
