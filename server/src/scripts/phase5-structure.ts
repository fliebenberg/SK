import { APP_TEST_ORG_ID, stagePlanForFormat } from '@sk/shared';
import { query } from '../db';
import pool from '../db';
import { accessManager } from '../managers/AccessManager';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { starterAgeGroupId } from './setup/ageGroupSeed';

/**
 * Tournaments Phase 5 — the structure a tournament is created with, and what a screen can read.
 *
 * Phase 5's exit criterion is written as things to look at ("confirm the word 'Division' never
 * appears"), and most of it now *is* looked at — by the Vitest suite in `shared/`, where the
 * collapse rule, the role set and the type resolution live as pure functions with tests. What that
 * suite cannot reach is the half that only exists once a row is written: whether creating a
 * tournament actually produces one division with the right stages, and whether the payloads the
 * screens were rebuilt on carry the fields they were rebuilt to use.
 *
 * That is what this asserts, against a real database:
 *
 *  - **U16 / D11** — a tournament is created with exactly one division, and that division with the
 *    stages its format implies. Checked for all four formats, because `PoolsKnockout` is the only
 *    one that is genuinely two, and a rule with one interesting case is a rule worth checking on
 *    all of them.
 *  - **The naming that only becomes visible later** — the implicit division is named after the
 *    sport when there is one, because the moment a second division is added, that name appears on
 *    screen having never been seen before.
 *  - **`FIX-2`** — an event carries its participating organisations *named*, so the screen that
 *    used to read every organisation in the system reads nothing at all.
 *  - **The fields the permission check needs** — a fixture summary names its stage and its
 *    division, or a convenor's controls are hidden from them client-side.
 *  - **`my_event_grants`** — one read, both scopes, division grants carrying their event id.
 *
 * Kept rather than thrown away, for the reason Phases 3 and 4 give: `server/` has no test harness,
 * and this is the only thing standing between "a tournament is created with its structure" and a
 * silent regression. It leaves the database as it found it.
 *
 * Run: `npx ts-node src/scripts/phase5-structure.ts`
 */

let checks = 0;
const failures: string[] = [];

function expect(actual: unknown, expected: unknown, what: string): void {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

const created = {
  eventIds: [] as string[],
  teamIds: [] as string[],
  guestOrgId: '',
  userIds: [] as string[],
  profileIds: [] as string[],
  membershipIds: [] as string[],
};

async function main() {
  const stamp = Date.now();

  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, 'App Test Org', 'ATO', true, true) ON CONFLICT (id) DO NOTHING`,
    [APP_TEST_ORG_ID]
  );

  created.guestOrgId = `org-p5-guest-${stamp}`;
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, 'P5 Visiting School', 'P5V', true, true)`,
    [created.guestOrgId]
  );

  const sportId = (await query(`SELECT id, name FROM sports ORDER BY id LIMIT 1`)).rows[0];
  if (!sportId) throw new Error('No sports seeded — run db:setup first.');

  // ------------------------------------------------------------------------------------------
  // 1. A tournament is created with its structure (U16, D11)
  // ------------------------------------------------------------------------------------------

  async function makeTournament(
    format: 'Festival' | 'RoundRobin' | 'Knockout' | 'PoolsKnockout',
    opts: { sportIds?: string[]; participatingOrgIds?: string[] } = {}
  ) {
    const event = await eventManager.addEvent({
      name: `P5 ${format} ${stamp}`,
      type: 'Tournament',
      format,
      startDate: new Date().toISOString(),
      orgId: APP_TEST_ORG_ID,
      sportIds: opts.sportIds,
      participatingOrgIds: opts.participatingOrgIds,
      status: 'Scheduled',
    } as any);
    created.eventIds.push(event.id);
    // The socket handler composes these two, so the script does the same rather than reaching
    // past the code under test.
    await tournamentManager.createDivisionsForSports(event as any, opts.sportIds || []);
    return event;
  }

  for (const format of ['Festival', 'RoundRobin', 'Knockout', 'PoolsKnockout'] as const) {
    const event = await makeTournament(format, { sportIds: [sportId.id] });
    const divisions = await tournamentManager.getDivisions(event.id);

    expect(divisions.length, 1, `${format}: created with exactly one division`);
    expect(
      divisions[0].name,
      sportId.name,
      `${format}: the division is named after the tournament's only sport`
    );
    expect(divisions[0].sportId, sportId.id, `${format}: the sport is carried onto the division`);

    const stages = await tournamentManager.getStages(divisions[0].id);
    const plan = stagePlanForFormat(format);
    expect(
      stages.map(s => [s.name, s.format, s.sequence]),
      plan.map(s => [s.name, s.format, s.sequence]),
      `${format}: the stages match the plan for the format`
    );
    // D11 stated as its own assertion, because it is the invariant the rest depends on.
    expect(stages.length > 0, true, `${format}: the division has at least one stage`);
  }

  // U52: divisions follow sports. No sport, no division; several sports, one division each.
  const noSport = await makeTournament('Festival', { sportIds: [] });
  expect(
    (await tournamentManager.getDivisions(noSport.id)).length,
    0,
    'a tournament with no sport chosen has no division yet'
  );
  const allSports = await query(`SELECT id FROM sports ORDER BY id LIMIT 2`);
  if (allSports.rows.length === 2) {
    const twoSportIds = allSports.rows.map((row: any) => row.id);
    const multiSport = await makeTournament('Festival', { sportIds: twoSportIds });
    const multiDivisions = await tournamentManager.getDivisions(multiSport.id);
    expect(
      multiDivisions.map(d => d.sportId).sort(),
      [...twoSportIds].sort(),
      'a tournament with two sports starts with one division for each'
    );
  }

  // ------------------------------------------------------------------------------------------
  // 2. A single match gets no division at all
  // ------------------------------------------------------------------------------------------

  const singleMatch = await eventManager.addEvent({
    name: `P5 Single ${stamp}`,
    type: 'SingleMatch',
    startDate: new Date().toISOString(),
    orgId: APP_TEST_ORG_ID,
    status: 'Scheduled',
  } as any);
  created.eventIds.push(singleMatch.id);
  expect(
    (await tournamentManager.getDivisions(singleMatch.id)).length,
    0,
    'a single match is created with no division'
  );

  // ------------------------------------------------------------------------------------------
  // 3. Adding a second division leaves the first exactly as it was (U15's announcement is honest)
  // ------------------------------------------------------------------------------------------

  const host = await makeTournament('Festival', {
    sportIds: [sportId.id],
    participatingOrgIds: [created.guestOrgId],
  });
  const firstDivision = (await tournamentManager.getDivisions(host.id))[0];
  const second = await tournamentManager.addDivision({ eventId: host.id, name: 'Division B' });
  await tournamentManager.addStage({ divisionId: second.id, name: 'Fixtures', format: 'Festival' });

  const bothDivisions = await tournamentManager.getDivisions(host.id);
  expect(bothDivisions.length, 2, 'the second division is added beside the first');
  expect(
    bothDivisions[0].id,
    firstDivision.id,
    'and the first still sorts first, so the screen does not reorder under the organiser'
  );
  expect(
    bothDivisions[0].name,
    firstDivision.name,
    'the name the announcement promises to show is the name that is still there'
  );

  // ------------------------------------------------------------------------------------------
  // 4. `FIX-2` — the event carries its participating organisations, named
  // ------------------------------------------------------------------------------------------

  const reread: any = await eventManager.getEvent(host.id);
  expect(reread.participatingOrgIds, [created.guestOrgId], 'the event carries its participating org ids');
  expect(
    (reread.participatingOrgs || []).map((o: any) => [o.id, o.name, o.shortName]),
    [[created.guestOrgId, 'P5 Visiting School', 'P5V']],
    'and carries their names, so the screen needs no organisations read at all'
  );
  expect(reread.format, 'Festival', 'the format round-trips back to the client');

  // ------------------------------------------------------------------------------------------
  // 5. A fixture summary names its stage and its division
  // ------------------------------------------------------------------------------------------

  const teamId = `team-p5-${stamp}`;
  await query(
    `INSERT INTO teams (id, org_id, name, sport_id, age_group_id) VALUES ($1, $2, 'P5 Team', $3, $4)`,
    [teamId, APP_TEST_ORG_ID, sportId.id, starterAgeGroupId(sportId.id, 'Open')]
  );
  created.teamIds.push(teamId);

  const hostStage = (await tournamentManager.getStages(firstDivision.id))[0];
  const game = await eventManager.addGame({
    eventId: host.id,
    sportId: sportId.id,
    stageId: hostStage.id,
    status: 'Scheduled',
    participants: [{ teamId }],
  } as any);

  const summary: any = await eventManager.getGameSummary(game.id);
  expect(summary.stageId, hostStage.id, 'a fixture summary names its stage');
  expect(
    summary.divisionId,
    firstDivision.id,
    'and its division, so a convenor is not shown a read-only fixture they may score'
  );
  // The same fact the server's own gate resolves, from the same row — one answer, not two.
  expect(
    await accessManager.getGameDivisionId(game.id),
    firstDivision.id,
    'and it agrees with the division the permission gate resolves'
  );

  const divisionGames = await tournamentManager.getDivisionGames(firstDivision.id);
  expect(divisionGames.length, 1, "the division's fixture list finds it");

  // ------------------------------------------------------------------------------------------
  // 6. `my_event_grants` — one read, both scopes, the event id on every division grant
  // ------------------------------------------------------------------------------------------

  const userId = `user-p5-${stamp}`;
  const profileId = `prof-p5-${stamp}`;
  await query(`INSERT INTO users (id, name, email, global_role) VALUES ($1, 'P5 Convenor', $2, 'user')`, [
    userId,
    `p5-convenor-${stamp}@example.test`,
  ]);
  created.userIds.push(userId);
  await query(`INSERT INTO org_profiles (id, org_id, user_id, name, email) VALUES ($1, $2, $3, $4, $5)`, [
    profileId,
    APP_TEST_ORG_ID,
    userId,
    'P5 Convenor',
    `p5-convenor-${stamp}@example.test`,
  ]);
  created.profileIds.push(profileId);

  /*
   * Asserted over the reply's own keys rather than against a literal shape.
   *
   * The literal version broke the moment `event_sport_organizers` added a third scope (`SHARED-6`):
   * the code was right and this check was stale, which is the least useful way for a check to
   * fail. What it is actually about is that an ungranted user gets a well-formed empty answer
   * instead of `null` — a claim about emptiness, not about how many scopes exist — so it is
   * written that way and a fourth scope will not disturb it. The three that do exist are still
   * required by name, because losing one is a different bug and should still be caught.
   */
  const emptyGrants = await accessManager.getMyGrants(userId);
  expect(
    [
      // Checked first and guarded below, because `nothing` is the failure this check is named for
      // and it must be *reported* — `Object.values(null)` would end the run instead.
      !!emptyGrants,
      !!emptyGrants && Object.values(emptyGrants).every(s => Array.isArray(s) && s.length === 0),
      !!emptyGrants && ['eventIds', 'sports', 'divisions'].every(s => s in emptyGrants),
    ],
    [true, true, true],
    'somebody with no grants gets an empty answer rather than nothing'
  );

  await query(
    `INSERT INTO division_organizers (division_id, org_profile_id) VALUES ($1, $2)`,
    [second.id, profileId]
  );
  const divisionOnly = await accessManager.getMyGrants(userId);
  expect(divisionOnly.eventIds, [], 'a division grant is not an event grant');
  expect(
    divisionOnly.divisions,
    [{ divisionId: second.id, eventId: host.id }],
    'and it carries the event it belongs to, so a list needs no second query'
  );

  await query(`INSERT INTO event_organizers (event_id, org_profile_id) VALUES ($1, $2)`, [
    host.id,
    profileId,
  ]);
  const both = await accessManager.getMyGrants(userId);
  expect(both.eventIds, [host.id], 'and an event grant comes back on the same read');

  // The authoritative single-event answer still agrees with it, which is the point: the list
  // derives, the screen asks, and neither invents a second rulebook.
  const capabilities = await accessManager.getEventCapabilities(userId, host.id);
  expect(capabilities.canEditEvent, true, 'the appointed organiser may edit the event');
  expect(
    capabilities.convenesDivisionIds,
    [second.id],
    'and the divisions they convene are named, even though the event grant already covers them'
  );

  if (failures.length) {
    console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS — ${checks} structure checks.`);
  }
}

async function cleanup() {
  for (const id of created.eventIds) await query(`DELETE FROM events WHERE id = $1`, [id]);
  for (const id of created.teamIds) await query(`DELETE FROM teams WHERE id = $1`, [id]);
  for (const id of created.membershipIds) await query(`DELETE FROM org_memberships WHERE id = $1`, [id]);
  for (const id of created.profileIds) await query(`DELETE FROM org_profiles WHERE id = $1`, [id]);
  for (const id of created.userIds) {
    await query(`DELETE FROM user_emails WHERE user_id = $1`, [id]);
    await query(`DELETE FROM users WHERE id = $1`, [id]);
  }
  if (created.guestOrgId) await query(`DELETE FROM organizations WHERE id = $1`, [created.guestOrgId]);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
    await pool.end();
  });
