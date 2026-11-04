import pool, { query } from '../db';
import { accessManager } from '../managers/AccessManager';
import { ApplicationError, membershipApplicationManager as apps } from '../managers/MembershipApplicationManager';
import { isEmailClash, userManager as users } from '../managers/UserManager';
import { canJoinRoom } from '../wss/roomAccess';
import { canReadData } from '../wss/dataAccess';
import { enforceOrgAction } from '../wss/orgGate';
import { SocketAction } from '@sk/shared';

/**
 * Asking to join an organisation (`MEMBER-1`): what an application needs, what approving writes, and
 * who may decide. Against a test organisation of its own, with no server.
 *
 * Run: `npx ts-node src/scripts/test-membership-applications.ts`. Everything it adds is `test-…` and removed.
 */

const ORG = 'test-org-apply';
const PARENT = 'test-user-apply-parent';
const ADULT = 'test-user-apply-adult';
const ADMIN = 'test-user-apply-admin';
const STAFF = 'test-user-apply-staff';
const MEMBER = 'test-user-apply-member';
const OTHER = 'test-user-apply-other';
const IMPORTED_PARENT = 'test-user-apply-imported';
const NEW_PARENT = 'test-user-apply-new-parent';
const SAME_NUMBER_ADULT = 'test-user-apply-same-number';
const USERS = [PARENT, ADULT, ADMIN, STAFF, MEMBER, OTHER, IMPORTED_PARENT, NEW_PARENT, SAME_NUMBER_ADULT];
const SECOND_ORG = 'test-org-apply-second';

let checks = 0;
const failures: string[] = [];
const check = (ok: boolean, what: string) => { checks++; if (!ok) failures.push(what); };
const refused = async (what: string, run: () => Promise<unknown>, includes?: string) => {
  checks++;
  try {
    await run();
    failures.push(`should be refused: ${what}`);
  } catch (error: any) {
    if (includes && !error.message.includes(includes)) failures.push(`${what}: refused with "${error.message}"`);
  }
};

async function cleanUp() {
  await query('DELETE FROM org_membership_applications WHERE org_id = $1', [ORG]);
  await query('DELETE FROM profile_guardians WHERE org_id = $1', [ORG]);
  await query('DELETE FROM org_memberships WHERE org_id = $1', [ORG]);
  await query('DELETE FROM org_profiles WHERE org_id = ANY($1)', [[ORG, SECOND_ORG]]);
  await query('DELETE FROM organizations WHERE id = ANY($1)', [[ORG, SECOND_ORG]]);
  await query('DELETE FROM users WHERE id = ANY($1)', [USERS]);
}

const person = async (id: string, role: string) => {
  await query(`INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $1, 'x')`, [id, `${id}@example.test`]);
  await query(`INSERT INTO org_profiles (id, org_id, name, email, user_id) VALUES ($1, $2, $4, $3, $4)`, [`p-${id}`, ORG, `${id}@example.test`, id]);
  await query(`INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES ($1, $2, $3, $4, NOW())`, [`m-${id}`, `p-${id}`, ORG, role]);
};

const self = { orgId: ORG, name: 'Test Adult Applicant', birthdate: '1990-03-04', applicantCellphone: '082 555 0100' };
const child = { orgId: ORG, name: 'Test Child Applicant', birthdate: '2013-03-04', applicantName: 'Test Parent', applicantCellphone: '082 555 0101', relationship: 'parent' as const };

async function main() {
  await cleanUp();
  await query(`INSERT INTO organizations (id, name, short_name, is_claimed, primary_color) VALUES ($1, 'Test Apply Org', 'TAO', true, '#FF3E00')`, [ORG]);
  await person(ADMIN, 'role-org-admin');
  await person(STAFF, 'role-org-staff');
  await person(MEMBER, 'role-org-member');
  for (const id of [PARENT, ADULT, OTHER]) {
    await query(`INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $1, 'x')`, [id, `${id}@example.test`]);
  }

  // Invite only, as every organisation starts.
  await refused('applying while invite only', () => apps.apply(ADULT, self), "doesn't take applications");
  await query(`UPDATE organizations SET membership_mode = 'apply' WHERE id = $1`, [ORG]);

  // What an application needs.
  await refused('no date of birth', () => apps.apply(ADULT, { ...self, birthdate: '' }), 'date of birth');
  await refused('a date in the future', () => apps.apply(ADULT, { ...self, birthdate: '2999-01-01' }), 'future');
  await refused('no cellphone', () => apps.apply(ADULT, { ...self, applicantCellphone: '' }), 'cellphone');
  await refused('someone too young for themselves', () => apps.apply(ADULT, { ...self, birthdate: '2015-01-01' }), 'parent or guardian');
  await refused('someone who already belongs', () => apps.apply(MEMBER, self), 'already belong');

  // Private and unclaimed organisations take none.
  await query('UPDATE organizations SET is_private = true WHERE id = $1', [ORG]);
  await refused('a private organisation', () => apps.apply(ADULT, self), 'private');
  await query('UPDATE organizations SET is_private = false, is_claimed = false WHERE id = $1', [ORG]);
  await refused('an unclaimed organisation', () => apps.apply(ADULT, self), 'Nobody runs');
  await query('UPDATE organizations SET is_claimed = true WHERE id = $1', [ORG]);

  // Applying joins nobody.
  const adultApp = await apps.apply(ADULT, self);
  check(adultApp.status === 'pending', 'an application starts waiting');
  check((await accessManager.getOrganizationRole(ADULT, ORG)) === null, 'applying grants no role');
  check((await query('SELECT 1 FROM org_profiles WHERE org_id = $1 AND name = $2', [ORG, self.name])).rows.length === 0, 'applying writes no record');
  await refused('a second one for the same person', () => apps.apply(ADULT, self), 'already an application');

  // Who sees and decides.
  check(await canJoinRoom(STAFF, `org:${ORG}:applications`), 'staff read the queue');
  check(await canJoinRoom(ADMIN, `org:${ORG}:applications`), 'admins read the queue');
  check(!(await canJoinRoom(MEMBER, `org:${ORG}:applications`)), 'a Member does not');
  check(!(await canJoinRoom(ADULT, `org:${ORG}:applications`)), 'nor does the applicant');
  check((await canReadData(ADULT, { type: 'my_org_applications', orgId: ORG })).allowed, 'the applicant reads their own');
  check((await apps.getMine(OTHER, ORG)).length === 0, 'and only their own');
  await refused('a Member deciding', () => enforceOrgAction(MEMBER, SocketAction.DECIDE_ORG_APPLICATION, { id: adultApp.id, decision: 'approve' }));
  await refused('the applicant deciding', () => enforceOrgAction(ADULT, SocketAction.DECIDE_ORG_APPLICATION, { id: adultApp.id, decision: 'approve' }));
  await enforceOrgAction(STAFF, SocketAction.DECIDE_ORG_APPLICATION, { id: adultApp.id, decision: 'approve' });
  await refused('staff changing the mode', () => enforceOrgAction(STAFF, SocketAction.SET_ORG_MEMBERSHIP_MODE, { orgId: ORG, mode: 'invite' }));
  await enforceOrgAction(ADMIN, SocketAction.SET_ORG_MEMBERSHIP_MODE, { orgId: ORG, mode: 'apply' });
  await refused("withdrawing someone else's", () => apps.withdraw(adultApp.id, OTHER));

  // Approving yourself: a record linked to your account, and a plain Member.
  const approved = await apps.approve(adultApp.id, STAFF);
  check(approved.status === 'approved' && !!approved.orgProfileId, 'approved, with the record it made');
  check((await accessManager.getOrganizationRole(ADULT, ORG)) === 'role-org-member', 'they are a plain Member');
  await refused('deciding it twice', () => apps.approve(adultApp.id, STAFF), 'already been decided');

  // A child: their membership, and the parent as guardian with none of their own.
  const childApp = await apps.apply(PARENT, child);
  const queue = await apps.getPending(ORG);
  check(queue.length === 1 && queue[0].possibleMatches?.length === 0, 'nobody like them is on record yet');
  const approvedChild = await apps.approve(childApp.id, ADMIN);
  const childId = approvedChild.orgProfileId!;
  const childRole = await query(`SELECT role_id FROM org_memberships WHERE org_profile_id = $1`, [childId]);
  check(childRole.rows[0]?.role_id === 'role-org-member', 'the child is a plain Member');
  const links = await query(`SELECT g.user_id, g.name, pg.relationship, pg.is_primary FROM profile_guardians pg JOIN org_profiles g ON g.id = pg.guardian_profile_id WHERE pg.player_profile_id = $1`, [childId]);
  check(links.rows[0]?.user_id === PARENT && links.rows[0]?.relationship === 'parent' && links.rows[0]?.is_primary === true, 'the parent is their primary guardian');
  check((await accessManager.getOrganizationRole(PARENT, ORG)) === null, 'and holds no membership');

  // A second child with a similar name is asked about, and linking uses that record.
  const sibling = await apps.apply(PARENT, { ...child, name: 'Test Child Applikant' });
  const asked = await apps.getPending(ORG);
  check(asked[0].possibleMatches?.some(m => m.id === childId) === true, 'a similar name on record is offered');
  await refused("a record from another organisation", () => apps.approve(sibling.id, ADMIN, 'p-does-not-exist'), 'not on this organisation');
  const linked = await apps.approve(sibling.id, ADMIN, childId);
  check(linked.orgProfileId === childId, 'approving against a record uses it, not a copy');
  check((await query('SELECT 1 FROM profile_guardians WHERE player_profile_id = $1', [childId])).rows.length === 1, 'and does not record the guardian twice');
  check(asked[0].possibleGuardianMatches?.length === 0, 'a parent whose own record is known is not asked about');

  // A parent on record by name and number alone, as an import leaves them (`MEMBER-7`). The number was
  // saved as typed, and the name they apply under is nothing like it.
  for (const id of [IMPORTED_PARENT, NEW_PARENT, SAME_NUMBER_ADULT]) {
    await query(`INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $1, 'x')`, [id, `${id}@example.test`]);
  }
  await query(`INSERT INTO org_profiles (id, org_id, name, cellphone) VALUES ('p-on-record', $1, 'Mrs T Imported', '082 555 0202')`, [ORG]);
  await query(`INSERT INTO org_profiles (id, org_id, name, cellphone, user_id) VALUES ('p-taken', $1, 'Someone With An Account', '+27825550202', $2)`, [ORG, OTHER]);
  await query(`INSERT INTO org_profiles (id, org_id, name) VALUES ('p-same-name', $1, 'Thandi Parent')`, [ORG]);
  const recordCount = async () => Number((await query('SELECT count(*) FROM org_profiles WHERE org_id = $1', [ORG])).rows[0].count);

  const parentApp = await apps.apply(IMPORTED_PARENT, { ...child, name: 'Test Imported Child', applicantName: 'Thandi Parent', applicantCellphone: '+27 82 555 0202' });
  const parentRow = (await apps.getPending(ORG)).find(a => a.id === parentApp.id)!;
  const offered = parentRow.possibleGuardianMatches || [];
  check(offered[0]?.id === 'p-on-record' && offered[0]?.sameCellphone === true, 'the same number comes first, however each was typed');
  check(offered.some(m => m.id === 'p-same-name' && !m.sameCellphone), 'a similar name is offered too, not marked as the same number');
  check(!offered.some(m => m.id === 'p-taken'), "another account's record is not offered, whatever its number");
  check(!parentRow.possibleMatches?.some(m => m.id === 'p-on-record'), "the parent's number says nothing about the child");
  check(!('cellphone' in (offered[0] as object)), "the match carries no one's number");

  await refused("another account's record as the parent", () => apps.approve(parentApp.id, ADMIN, null, 'p-taken'), 'another account');
  await refused('a record from elsewhere as the parent', () => apps.approve(parentApp.id, ADMIN, null, 'p-does-not-exist'), 'not on this organisation');
  await refused('the same record as child and parent', () => apps.approve(parentApp.id, ADMIN, 'p-on-record', 'p-on-record'), 'their own guardian');
  check((await apps.getApplication(parentApp.id))?.status === 'pending', 'a refused approval changes nothing');
  check((await query(`SELECT user_id FROM org_profiles WHERE id = 'p-on-record'`)).rows[0].user_id === null, 'and links nobody');

  const before = await recordCount();
  const approvedParent = await apps.approve(parentApp.id, ADMIN, null, 'p-on-record');
  check(await recordCount() === before + 1, "approving makes the child's record, and no second one for the parent");
  const onRecord = (await query(`SELECT user_id, email, cellphone, name FROM org_profiles WHERE id = 'p-on-record'`)).rows[0];
  check(onRecord.user_id === IMPORTED_PARENT && onRecord.email === `${IMPORTED_PARENT}@example.test`, 'their record gains the account and address it lacked');
  check(onRecord.cellphone === '082 555 0202' && onRecord.name === 'Mrs T Imported', 'and keeps what it already said');
  const parentLink = await query('SELECT guardian_profile_id FROM profile_guardians WHERE player_profile_id = $1', [approvedParent.orgProfileId]);
  check(parentLink.rows[0]?.guardian_profile_id === 'p-on-record', 'and they are the guardian');
  check((await accessManager.getOrganizationRole(IMPORTED_PARENT, ORG)) === null, 'holding no membership');

  // "Someone new": a number may be shared, and the new record keeps it.
  const newParentApp = await apps.apply(NEW_PARENT, { ...child, name: 'Test New Parent Child', applicantName: 'Test Other Parent', applicantCellphone: '082 555 0202' });
  const approvedNew = await apps.approve(newParentApp.id, ADMIN);
  const newLink = await query(
    `SELECT g.id, g.cellphone FROM profile_guardians pg JOIN org_profiles g ON g.id = pg.guardian_profile_id WHERE pg.player_profile_id = $1`,
    [approvedNew.orgProfileId]
  );
  check(newLink.rows[0]?.id !== 'p-on-record' && newLink.rows[0]?.cellphone === '+27825550202', 'someone new keeps the number they gave');

  // Someone applying for themselves, with a number somebody here has.
  await query(`INSERT INTO org_profiles (id, org_id, name, cellphone) VALUES ('p-no-account', $1, 'Nobody Linked Yet', '082 555 0202')`, [ORG]);
  const sameNumberApp = await apps.apply(SAME_NUMBER_ADULT, { ...self, name: 'Test Quite Different', applicantCellphone: '082 555 0202' });
  const sameNumberRow = (await apps.getPending(ORG)).find(a => a.id === sameNumberApp.id)!;
  check(sameNumberRow.possibleMatches?.some(m => m.id === 'p-no-account' && m.sameCellphone) === true, 'someone applying for themselves is asked about the same number');
  check(!sameNumberRow.possibleMatches?.some(m => m.id === 'p-taken'), "but never about another account's record");
  const approvedSame = await apps.approve(sameNumberApp.id, ADMIN);
  check((await query('SELECT cellphone FROM org_profiles WHERE id = $1', [approvedSame.orgProfileId])).rows[0].cellphone === '+27825550202', 'and as someone new they keep it');

  // A number may be shared: it is only pointed out. An address may not (`MEMBER-7`).
  const holders = await users.getCellphoneHolders(ORG, '+27825550202');
  check(holders.includes('Mrs T Imported') && holders.includes('Someone With An Account'), 'everyone with a number is found, however it was typed');
  check(!(await users.getCellphoneHolders(ORG, '082 555 0202', 'p-on-record')).includes('Mrs T Imported'), 'leaving out the person being edited');
  check((await users.getCellphoneHolders(ORG, 'not a number')).length === 0, 'and an unreadable number finds nobody');
  check((await canReadData(STAFF, { type: 'cellphone_on_record', orgId: ORG })).allowed, 'staff may ask who has a number');
  check(!(await canReadData(MEMBER, { type: 'cellphone_on_record', orgId: ORG })).allowed, 'a Member may not');
  check(!!(await users.addOrgProfile({ orgId: ORG, name: 'Test Shares A Phone', cellphone: '082 555 0202' } as any)), 'a new person may share a number');

  const taken = `${IMPORTED_PARENT}@example.test`;
  await refused('a new person with an address on record', () => users.addOrgProfile({ orgId: ORG, name: 'Test Same Address', email: ` ${taken.toUpperCase()} ` } as any), 'already in use');
  await refused('someone else edited to an address on record', () => users.updateOrgProfile('p-same-name', { email: taken }), 'already in use');
  check(!!(await users.updateOrgProfile('p-on-record', { email: taken.toUpperCase() })), 'someone keeps their own address, whatever its case');
  await query(`INSERT INTO organizations (id, name, short_name, primary_color) VALUES ($1, 'Test Apply Second', 'TAS', '#FF3E00')`, [SECOND_ORG]);
  check(!!(await users.addOrgProfile({ orgId: SECOND_ORG, name: 'Mrs T Imported', email: taken } as any)), 'the same person may use it at another organisation');
  // The database holds to it by itself, for two saves at once that both got past the check.
  const clash = await query(`INSERT INTO org_profiles (id, org_id, name, email) VALUES ('p-clash', $1, 'Test Clash', $2)`, [ORG, ` ${taken.toUpperCase()} `]).catch(error => error);
  check(isEmailClash(clash), 'the database refuses a second record with an address, whatever its case or spaces');
  const blanks = await query(`INSERT INTO org_profiles (id, org_id, name, email) VALUES ('p-blank-a', $1, 'Test Blank A', ''), ('p-blank-b', $1, 'Test Blank B', '  ')`, [ORG]).catch(error => error);
  check(blanks.rowCount === 2, 'a blank address is no address');

  // Declining: told when they may ask again, and held to it.
  const declined = await apps.apply(OTHER, { ...self, name: 'Test Declined' });
  await apps.decline(declined.id, ADMIN);
  check((await accessManager.getOrganizationRole(OTHER, ORG)) === null, 'declining grants nothing');
  const mine = await apps.getMine(OTHER, ORG);
  check(mine[0]?.status === 'declined' && !!mine[0]?.reapplyFrom, 'the applicant sees it, and when they may apply again');
  await refused('applying again straight away', () => apps.apply(OTHER, { ...self, name: 'Test Declined' }), 'apply again from');
  check((await apps.apply(OTHER, { ...self, name: 'Test Someone Else' })).status === 'pending', 'someone else is a different application');

  check(new ApplicationError('x') instanceof Error, 'refusals are errors the client sees');
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
