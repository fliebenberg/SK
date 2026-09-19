import { APP_TEST_ORG_ID, APP_TEST_ORG_NAME, teamQualifies } from '@sk/shared';
import pool, { query } from '../db';
import { ageGroupManager } from '../managers/AgeGroupManager';
import { sportManager } from '../managers/SportManager';
import { teamManager } from '../managers/TeamManager';
import { STARTER_AGE_GROUPS, starterAgeGroupId } from './setup/ageGroupSeed';

/**
 * Sport age groups — the per-sport list, and the rules the schema and `AgeGroupManager` enforce.
 *
 *  - A new sport starts with the starter official list, in order.
 *  - "Other…" never duplicates: a name matching an entry, ignoring case and spacing, returns it.
 *  - The composite foreign key refuses an age group of another sport, and a team that changes
 *    sport without naming a new age group loses its old one instead of failing.
 *  - An entry in use cannot be deleted; merging moves its holders and removes it, after which the
 *    team qualifies for divisions of the entry it was merged into.
 *  - Promote, rename and reorder.
 *
 * Works on two throwaway sports and the App Test Org, and leaves the database as it found it.
 *
 * Run: `npx ts-node src/scripts/test-age-groups.ts`
 */

let checks = 0;
const failures: string[] = [];

function expect(actual: unknown, expected: unknown, what: string): void {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

async function expectRefusal(run: () => Promise<unknown>, what: string): Promise<void> {
  checks++;
  try {
    await run();
    failures.push(`${what}: expected a refusal, but it succeeded`);
  } catch {
    // refused, as it should be
  }
}

const stamp = Date.now();
const sportA = `test-ag-a-${stamp}`;
const sportB = `test-ag-b-${stamp}`;
const teamIds: string[] = [];

async function main() {
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, $2, 'ATO', true, true) ON CONFLICT (id) DO NOTHING`,
    [APP_TEST_ORG_ID, APP_TEST_ORG_NAME]
  );
  for (const [id, name] of [[sportA, 'Age Group Test A'], [sportB, 'Age Group Test B']]) {
    await sportManager.createSport({ id, name, facilityTerm: 'Field', periodTerm: 'Half', defaultSettings: {} });
  }

  // 1. The starter list
  const listA = (await ageGroupManager.getBySport([sportA]))[sportA];
  expect(listA.map(g => g.name), STARTER_AGE_GROUPS, 'a new sport starts with the starter list, in order');
  expect(listA.every(g => g.isOfficial), true, 'and every starter entry is official');
  const sports = await sportManager.getSports();
  expect(
    sports.find(s => s.id === sportA)?.ageGroups?.length,
    STARTER_AGE_GROUPS.length,
    'the sports list carries each sport\'s age groups for the pickers'
  );

  // 2. "Other…" never duplicates
  const u13 = starterAgeGroupId(sportA, 'U13');
  expect((await ageGroupManager.addCustom(sportA, ' u13 ', undefined, APP_TEST_ORG_ID)).id, u13,
    'typing an official name in any case picks the official entry');
  const under13 = await ageGroupManager.addCustom(sportA, 'Under  13', undefined, APP_TEST_ORG_ID);
  expect([under13.name, under13.isOfficial], ['Under 13', false], 'a new name becomes a custom entry, spacing tidied');
  expect((await ageGroupManager.addCustom(sportA, 'UNDER 13')).id, under13.id, 'and a second add of it returns the first');
  await expectRefusal(() => ageGroupManager.addCustom(sportA, '   '), 'a blank name is refused');

  // 3. The foreign key
  const team = await teamManager.addTeam({ id: `team-ag-${stamp}`, name: 'AG Test', orgId: APP_TEST_ORG_ID, sportId: sportA, ageGroupId: under13.id } as any);
  teamIds.push(team.id);
  expect([team.ageGroupId, team.ageGroup], [under13.id, 'Under 13'], 'a team reads back its age group id and name');
  await expectRefusal(
    () => teamManager.updateTeam(team.id, { ageGroupId: starterAgeGroupId(sportB, 'U13') }),
    'an age group of another sport is refused by the database'
  );
  const moved = await teamManager.addTeam({ id: `team-ag2-${stamp}`, name: 'AG Mover', orgId: APP_TEST_ORG_ID, sportId: sportA, ageGroupId: u13 } as any);
  teamIds.push(moved.id);
  const afterMove = await teamManager.updateTeam(moved.id, { sportId: sportB });
  expect([afterMove?.sportId, afterMove?.ageGroupId ?? null], [sportB, null], 'changing sport without a new age group clears it');

  // 4. Delete and merge
  await expectRefusal(() => ageGroupManager.delete(under13.id), 'an age group in use cannot be deleted');
  const division = { sportId: sportA, ageGroupId: u13 };
  expect(teamQualifies(team, division), false, 'before the merge, the "Under 13" team does not qualify for a U13 division');
  await expectRefusal(() => ageGroupManager.merge(under13.id, starterAgeGroupId(sportB, 'U13')), 'merging across sports is refused');
  expect(await ageGroupManager.merge(under13.id, u13), { moved: 1 }, 'a merge reports how many holders it moved');
  const merged = await teamManager.getTeam(team.id);
  expect([merged?.ageGroupId, merged?.ageGroup], [u13, 'U13'], 'the team now holds U13');
  expect(teamQualifies(merged!, division), true, 'and qualifies for the U13 division');
  expect(await ageGroupManager.getAgeGroup(under13.id), undefined, 'and the custom entry is gone');

  // 5. Promote, rename, reorder
  const girls = await ageGroupManager.addCustom(sportA, 'U13 Girls');
  const promoted = await ageGroupManager.update(girls.id, { isOfficial: true });
  expect([promoted?.isOfficial, promoted?.sortOrder], [true, STARTER_AGE_GROUPS.length], 'promoting appends to the official list');
  await expectRefusal(() => ageGroupManager.update(girls.id, { name: 'u14' }), 'a rename cannot take another entry\'s name');
  expect((await ageGroupManager.update(girls.id, { name: 'U13 Girls A' }))?.name, 'U13 Girls A', 'a rename to a free name works');
  const official = (await ageGroupManager.getBySport([sportA]))[sportA].filter(g => g.isOfficial);
  const reversed = official.map(g => g.id).reverse();
  await ageGroupManager.reorder(sportA, reversed);
  expect((await ageGroupManager.getBySport([sportA]))[sportA].filter(g => g.isOfficial).map(g => g.id), reversed, 'reorder sets the official order');
  const admin = await ageGroupManager.getAdminList(sportA);
  expect(admin.find(g => g.id === u13)?.teamCount, 1, 'the admin list counts the teams holding each entry');
  await expectRefusal(() => ageGroupManager.addOfficial(sportA, 'u13'), 'adding an official name that is already official is refused');
}

async function cleanup() {
  if (teamIds.length) await query(`DELETE FROM teams WHERE id = ANY($1)`, [teamIds]);
  await query(`DELETE FROM sports WHERE id = ANY($1)`, [[sportA, sportB]]);
}

main()
  .catch(err => failures.push(`threw: ${err?.message || err}`))
  .finally(async () => {
    await cleanup().catch(err => console.error('cleanup failed:', err));
    await pool.end();
    if (failures.length) {
      console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`PASS — ${checks} age group checks.`);
  });
