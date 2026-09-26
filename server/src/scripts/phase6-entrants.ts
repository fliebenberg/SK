import { APP_TEST_ORG_ID } from '@sk/shared';
import { query } from '../db';
import pool from '../db';
import { setIo } from '../wss/sockets';
import { accessManager } from '../managers/AccessManager';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { starterAgeGroupId } from './setup/ageGroupSeed';
import { canJoinRoom } from '../wss/roomAccess';
import { canReadData } from '../wss/dataAccess';
import { publishStageFixtures } from '../wss/tournaments';
import { up as backfillStages } from './migrations/20260903_backfill_stages';

/**
 * Tournaments Phase 6 — entrants, generation and standings, against a real database.
 *
 * **This is the phase's exit criterion, executed rather than clicked through.** The criterion is:
 * build a four-school, three-sport, five-age-group `Festival` — the ninety-fixture case the batch
 * contract exists for — generate every division's fixtures, score a representative sample, and
 * confirm the organisation roll-up matches a hand-computed answer with a non-1.0 weighting on one
 * division. Time the generation: ninety fixtures should be one round trip and one render, not
 * ninety of each.
 *
 * The hand-computed answer is the part worth explaining, because it is what makes the roll-up
 * check mean something rather than compare the code to itself. Two divisions are scored in full,
 * and in **opposite** orders:
 *
 * | | Division X (weighting 1.0) | Division W (weighting 2.5) | Roll-up |
 * |---|---|---|---|
 * | School A | 9 | 0 | **9** |
 * | School B | 6 | 3 x 2.5 = 7.5 | **13.5** |
 * | School C | 3 | 6 x 2.5 = 15 | **18** |
 * | School D | 0 | 9 x 2.5 = 22.5 | **22.5** |
 *
 * Those totals are only reachable if the weighting is applied *and* applied to points alone — the
 * appearance counts sum unweighted, because weighting a fixture somebody turned up to makes no
 * sense. And the order reverses between the two tables, so a roll-up that quietly ignored the
 * weighting would produce four equal scores and be obviously wrong rather than plausibly wrong.
 *
 * Alongside the criterion, the invariants Phase 6 introduced and nothing else guards:
 *
 *  - **The roster mirrors into the stage that takes it.** `planFixtures` reads `stage_entrants`,
 *    never the roster, so without the mirror an organiser could enter ten teams, press Generate,
 *    and be told the stage is empty. This is the single check that makes the feature work at all.
 *  - **D9 — two paths and no silent top-up.** `create` refuses a stage that already has fixtures;
 *    `regenerate` refuses to destroy a result without being told to, and names the count so the
 *    dialog can state the concrete cost.
 *  - **D10 — a substitution is not a regeneration.** Swapping who an entrant is rewrites every
 *    fixture that names it and touches the draw not at all.
 *  - **D7 — a placeholder is a real entrant**, schedulable, and resolving it updates every fixture
 *    at once because they all point at one row.
 *  - **`FIX-12`** — a fixture created with a `stageId` resolves to a division, which is what makes
 *    it scoreable by a convenor and countable by the choke point.
 *  - **The Phase 6 migration** closes `PEOPLE-3`'s remaining half for rows that already existed.
 *  - **The new read boundary** — `event:{id}:entrants` is member tier, and `event_candidate_teams`
 *    is gated at the level of the entry it feeds.
 *
 * Kept rather than thrown away, for the reason Phases 3, 4 and 5 give: `server/` has no test
 * harness, and this is the only thing standing between these invariants and a silent regression.
 * It leaves the database as it found it.
 *
 * Run: `npx ts-node src/scripts/phase6-entrants.ts`
 */

let checks = 0;
const failures: string[] = [];

function expect(actual: unknown, expected: unknown, what: string): void {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

async function expectThrows(fn: () => Promise<unknown>, matching: RegExp, what: string): Promise<void> {
  checks++;
  try {
    await fn();
    failures.push(`${what}: expected a refusal, but it succeeded`);
  } catch (err: any) {
    const message = String(err?.message || err);
    if (!matching.test(message)) {
      failures.push(`${what}: refused, but with "${message}" rather than something matching ${matching}`);
    }
  }
}

/** Every broadcast the code under test publishes, captured instead of sent. */
const published: Array<{ topic: string; type: string; data: any }> = [];

const created = {
  eventIds: [] as string[],
  orgIds: [] as string[],
  teamIds: [] as string[],
};

const AGE_GROUPS = ['u13', 'u14', 'u15', 'u16', 'u17'];

async function main() {
  const stamp = Date.now();

  // A fake io, so `broadcast()` records rather than dropping with "io not set". This is how the
  // "one message for ninety fixtures" claim is checked rather than asserted.
  //
  // `sockets.adapter.rooms` is here because `broadcast()` reads it for the recipient count it
  // logs, and a stub without it used to end this script after fixture generation (`SHARED-4`).
  // `broadcast()` no longer trusts it — a diagnostic must not kill what it observes — but the map
  // is cheap and keeps the log honest: this script really does publish to an empty room, and it
  // should say 0 rather than "unknown".
  setIo({
    to: (topic: string) => ({
      emit: (_event: string, message: any) => published.push(message),
    }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() } },
  } as any);

  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, 'App Test Org', 'ATO', true, true) ON CONFLICT (id) DO NOTHING`,
    [APP_TEST_ORG_ID]
  );

  const sports = (await query(`SELECT id, name FROM sports ORDER BY id LIMIT 3`)).rows;
  if (sports.length < 3) {
    throw new Error(`Need three seeded sports for the exit criterion; found ${sports.length}. Run db:setup.`);
  }

  // ------------------------------------------------------------------------------------------
  // The four schools
  // ------------------------------------------------------------------------------------------

  const schools: Array<{ id: string; name: string; shortName: string }> = [];
  for (const letter of ['A', 'B', 'C', 'D']) {
    const id = `org-p6-${letter.toLowerCase()}-${stamp}`;
    await query(
      `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
       VALUES ($1, $2, $3, true, true)`,
      [id, `P6 School ${letter}`, `P6${letter}`]
    );
    created.orgIds.push(id);
    schools.push({ id, name: `P6 School ${letter}`, shortName: `P6${letter}` });
  }

  /**
   * A fifth school, invited and with no teams at all.
   *
   * This is the case the entry screens used to lose. Both of them built their organisation list by
   * deduplicating the candidate *teams*, so a school with nothing on the system had no row to be
   * derived from and never appeared — and the empty group under its name is the only place its
   * first team could have been created. `getEventCandidateTeams` answers the org question from
   * `organizations` for exactly this reason, so the school below must come back with no teams.
   */
  const emptySchoolId = `org-p6-e-${stamp}`;
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, 'P6 School E', 'P6E', true, true)`,
    [emptySchoolId]
  );
  created.orgIds.push(emptySchoolId);

  // ------------------------------------------------------------------------------------------
  // The tournament: three sports x five age groups = fifteen divisions
  // ------------------------------------------------------------------------------------------

  const event = await eventManager.addEvent({
    name: `P6 Festival ${stamp}`,
    type: 'Tournament',
    format: 'Festival',
    startDate: '2026-10-01',
    orgId: APP_TEST_ORG_ID,
    sportIds: sports.map((s: any) => s.id),
    participatingOrgIds: [...schools.map(s => s.id), emptySchoolId],
    status: 'Scheduled',
  } as any);
  created.eventIds.push(event.id);

  // `ADD_EVENT` creates the implicit division; this tournament then gets its real structure, so
  // that one is removed rather than left as a sixteenth nobody entered.
  await tournamentManager.createDivisionsForSports(event as any, event.sportIds || []);
  for (const implicit of await tournamentManager.getDivisions(event.id)) {
    await tournamentManager.deleteDivision(implicit.id);
  }

  /** Division W — the weighted one — is the second sport's u15, chosen arbitrarily but fixed. */
  const WEIGHTED = { sportIndex: 1, ageGroup: 'u15', weighting: 2.5 };

  const divisions: Array<{
    id: string;
    stageId: string;
    sportId: string;
    ageGroup: string;
    ageGroupId: string;
    weighting: number;
  }> = [];

  for (let sportIndex = 0; sportIndex < sports.length; sportIndex++) {
    for (const ageGroup of AGE_GROUPS) {
      const isWeighted = sportIndex === WEIGHTED.sportIndex && ageGroup === WEIGHTED.ageGroup;
      const ageGroupId = starterAgeGroupId(sports[sportIndex].id, ageGroup);
      const division = await tournamentManager.addDivision({
        eventId: event.id,
        name: `${ageGroup} ${sports[sportIndex].name}`,
        sportId: sports[sportIndex].id,
        ageGroupId,
        weighting: isWeighted ? WEIGHTED.weighting : 1.0,
      });
      const stage = await tournamentManager.addStage({
        divisionId: division.id,
        name: 'Fixtures',
        format: 'Festival',
      });
      divisions.push({
        id: division.id,
        stageId: stage.id,
        sportId: sports[sportIndex].id,
        ageGroup,
        ageGroupId,
        weighting: isWeighted ? WEIGHTED.weighting : 1.0,
      });
    }
  }

  expect(divisions.length, 15, 'three sports x five age groups is fifteen divisions');

  // One team per school per division: 4 x 15 = 60.
  const teamsByDivision = new Map<string, Array<{ id: string; orgId: string }>>();
  for (const division of divisions) {
    const teams: Array<{ id: string; orgId: string }> = [];
    for (const school of schools) {
      const id = `team-p6-${school.shortName}-${division.ageGroup}-${division.sportId}-${stamp}`.toLowerCase();
      await query(
        `INSERT INTO teams (id, name, age_group_id, sport_id, org_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [id, `${division.ageGroup}A`, division.ageGroupId, division.sportId, school.id]
      );
      created.teamIds.push(id);
      teams.push({ id, orgId: school.id });
    }
    teamsByDivision.set(division.id, teams);
  }

  // ------------------------------------------------------------------------------------------
  // 1. What the entry screens read
  // ------------------------------------------------------------------------------------------

  const candidates = await tournamentManager.getEventCandidateTeams(event.id);
  expect(
    candidates.teams.filter(team => created.teamIds.includes(team.id)).length,
    60,
    'every participating school\'s teams are offered, in one read for the whole grid'
  );
  const sampleCandidate = candidates.teams.find(team => team.id === created.teamIds[0])!;
  expect(
    [!!sampleCandidate.orgName, !!sampleCandidate.sportId, !!sampleCandidate.ageGroupId],
    [true, true, true],
    'and each carries the org and the two fields that decide which divisions it qualifies for'
  );

  // The org list comes back beside the teams, and is drawn from `organizations` rather than from
  // the teams — which is the difference the next three checks exist to hold.
  expect(
    candidates.orgs.some(org => org.id === APP_TEST_ORG_ID),
    true,
    'the host is offered as an entrant organisation, as a row like any other (2026-09-21)'
  );
  expect(
    [
      candidates.orgs.some(org => org.id === emptySchoolId),
      candidates.teams.some(team => team.orgId === emptySchoolId),
    ],
    [true, false],
    'and so is an invited school with no teams — the one whose empty group is where a team is made'
  );
  expect(
    schools.every(school =>
      candidates.orgs.some(org => org.id === school.id && org.shortName === school.shortName)
    ),
    true,
    'each carrying the short code a column heading and a team flag are rendered from'
  );

  // ------------------------------------------------------------------------------------------
  // 2. Entering them — and the mirror that makes generation possible
  // ------------------------------------------------------------------------------------------

  /**
   * The order the four schools are entered in, per division.
   *
   * Division W is entered **backwards**, which is what makes the weighted roll-up a real check:
   * the two tables rank the schools in opposite orders, so a roll-up that ignored the weighting
   * would produce four identical totals rather than a plausible-looking wrong answer.
   */
  const rosterOrder = (divisionId: string) => {
    const teams = teamsByDivision.get(divisionId)!;
    const division = divisions.find(d => d.id === divisionId)!;
    return division.weighting === WEIGHTED.weighting ? [...teams].reverse() : teams;
  };

  // Seeded explicitly, and not only so the script can predict the table: `created_at` is the
  // *transaction* clock in Postgres, so every row of one batch shares it and "the order they were
  // entered in" is not recoverable without a seed. An organiser who cares about the draw sets
  // them; this one cares because the hand-computed answer below depends on knowing who is first.
  for (const division of divisions) {
    await tournamentManager.setDivisionEntrants(
      division.id,
      rosterOrder(division.id).map((team, index) => ({ teamId: team.id, seed: index + 1 }))
    );
  }

  const allEntrants = await tournamentManager.getEventEntrants(event.id);
  expect(allEntrants.length, 60, 'the whole tournament\'s roster comes back in one read (U21)');
  expect(
    new Set(allEntrants.map(entrant => entrant.divisionId)).size,
    15,
    'covering every division, which is what the organisation axis needs');
  expect(
    allEntrants.every(entrant => !!entrant.name && !!entrant.orgId),
    true,
    'each entrant already named, so the grid resolves nothing client-side'
  );

  // The one check the whole feature rests on: `planFixtures` reads `stage_entrants`, not the
  // roster, so without the mirror pressing Generate finds an empty stage.
  const firstStageEntrants = await tournamentManager.getStageEntrants(divisions[0].stageId);
  expect(
    firstStageEntrants.length,
    4,
    'entering a roster mirrors it into the stage that simply takes it'
  );

  // Pool assignments are the organiser\'s work, and adding a fifth entrant must not discard them.
  await query(`UPDATE stage_entrants SET pool_key = 'A' WHERE stage_id = $1`, [divisions[0].stageId]);
  await tournamentManager.setDivisionEntrants(divisions[0].id, [
    ...(await tournamentManager.getEntrants(divisions[0].id)).map(entrant => ({
      id: entrant.id,
      teamId: entrant.teamId,
      seed: entrant.seed,
    })),
    { label: 'Winner of the regional qualifier', seed: 5 },
  ]);
  const afterPlaceholder = await tournamentManager.getStageEntrants(divisions[0].stageId);
  expect(afterPlaceholder.length, 5, 'a placeholder joins the stage like any other entrant (D7)');
  expect(
    afterPlaceholder.filter(entrant => entrant.poolKey === 'A').length,
    4,
    'and the pools the organiser had already drawn are left alone'
  );

  // Put the division back to four for the ninety-fixture count.
  await tournamentManager.setDivisionEntrants(
    divisions[0].id,
    rosterOrder(divisions[0].id).map((team, index) => ({ teamId: team.id, seed: index + 1 }))
  );
  await query(`UPDATE stage_entrants SET pool_key = NULL WHERE stage_id = $1`, [divisions[0].stageId]);

  // ------------------------------------------------------------------------------------------
  // 3. Generation — ninety fixtures, and how long they take
  // ------------------------------------------------------------------------------------------

  const startedAt = Date.now();
  let totalCreated = 0;
  for (const division of divisions) {
    const outcome = await tournamentManager.generateStageFixtures(division.stageId, 'create');
    totalCreated += outcome.created;
  }
  const elapsedMs = Date.now() - startedAt;

  expect(totalCreated, 90, 'four entrants in each of fifteen divisions is ninety fixtures');
  expect(
    (await query(`SELECT count(*)::int AS n FROM games WHERE event_id = $1`, [event.id])).rows[0].n,
    90,
    'and ninety rows exist to show for it'
  );
  console.log(
    `  Generated 90 fixtures across 15 divisions in ${elapsedMs}ms ` +
      `(${Math.round(elapsedMs / 15)}ms per division).`
  );
  // Deliberately generous: this is not a benchmark, it is a guard against somebody reintroducing
  // a round trip per fixture, which would be an order of magnitude slower rather than a few
  // percent.
  expect(elapsedMs < 60000, true, `generating ninety fixtures stays well inside a minute (took ${elapsedMs}ms)`);

  // Rule 3 of the batch contract, checked rather than asserted: a whole stage's fixtures leave the
  // server as **one** message, which is what `useLiveRoom`'s `upsertMany` exists to receive.
  published.length = 0;
  const oneStagesGames = await tournamentManager.getStageGames(divisions[0].stageId);
  publishStageFixtures(divisions[0].id, divisions[0].stageId, oneStagesGames);
  expect(published.length, 1, 'a stage\'s fixtures are published as one message, not one per fixture');
  expect(published[0].type, 'STAGE_FIXTURES_SYNC', 'and it is the batch message');
  expect(published[0].data.games.length, 6, 'carrying all of them');

  // D9 — no silent top-up. Generation never adds to an existing draw.
  await expectThrows(
    () => tournamentManager.generateStageFixtures(divisions[0].stageId, 'create'),
    /already has 6 fixture/,
    'generating over an existing draw is refused, and the refusal names the count'
  );

  // ------------------------------------------------------------------------------------------
  // 4. Scoring, and the hand-computed roll-up
  // ------------------------------------------------------------------------------------------

  /**
   * Score a division so the table is decidable without knowing the pairings.
   *
   * Every fixture goes to whichever side is seeded higher, 10-0. In a full round robin of four
   * that gives 3 / 2 / 1 / 0 wins down the roster, which is 9 / 6 / 3 / 0 points on the shipped
   * 3-1-0 default, and 30-0 / 20-10 / 10-20 / 0-30 for and against.
   */
  const scoreDivision = async (divisionId: string, stageId: string) => {
    // Seed order, which is what `getEntrants` returns and what the mirror carried into the stage.
    const roster = await tournamentManager.getEntrants(divisionId);
    const order = new Map(roster.map((entrant, index) => [entrant.id, index]));
    const games = await query(
      `SELECT g.id,
              (SELECT jsonb_agg(jsonb_build_object('id', gp.id, 'entrantId', gp.entrant_id) ORDER BY gp.sort_order)
                 FROM game_participants gp WHERE gp.game_id = g.id) AS participants
         FROM games g WHERE g.stage_id = $1`,
      [stageId]
    );

    for (const game of games.rows) {
      const [home, away] = game.participants;
      const homeFirst = (order.get(home.entrantId) ?? 99) < (order.get(away.entrantId) ?? 99);
      const scores = { [home.id]: homeFirst ? 10 : 0, [away.id]: homeFirst ? 0 : 10 };
      // The shape the ordinary scoring path writes — `live_state.scores`, keyed by participant.
      // `SCORE-14` is the entry that explains why reading anything else counts nothing.
      await query(
        `UPDATE games
            SET status = 'Finished',
                live_state = jsonb_set(COALESCE(live_state, '{}'::jsonb), '{scores}', $2::jsonb)
          WHERE id = $1`,
        [game.id, JSON.stringify(scores)]
      );
    }
    await tournamentManager.recalculateStageStandings(stageId);
  };

  const divisionX = divisions.find(d => d.weighting === 1)!;
  const divisionW = divisions.find(d => d.weighting === WEIGHTED.weighting)!;

  await scoreDivision(divisionX.id, divisionX.stageId);
  await scoreDivision(divisionW.id, divisionW.stageId);

  const tableX = (await tournamentManager.getStage(divisionX.stageId))!.cachedStandings || [];
  expect(
    tableX.map(row => [row.played, row.wins, row.losses, row.points, row.pointsFor, row.pointsAgainst]),
    [
      [3, 3, 0, 9, 30, 0],
      [3, 2, 1, 6, 20, 10],
      [3, 1, 2, 3, 10, 20],
      [3, 0, 3, 0, 0, 30],
    ],
    'a fully played round robin of four ranks 9 / 6 / 3 / 0 with the goal columns to match'
  );
  expect(
    tableX.map(row => row.rank),
    [1, 2, 3, 4],
    'and every entrant has a definite rank, because nothing was left level'
  );

  const rollUp = await tournamentManager.recalculateEventStandings(event.id);
  const byOrg = new Map(rollUp.map(row => [row.teamId, row]));

  // The hand-computed answer. School A tops the unweighted division and School D tops the
  // weighted one, so the roll-up is the reverse of the first table rather than a copy of it.
  const expected: Array<[string, number, number]> = [
    // [school, points, played]
    [schools[0].id, 9, 6],
    [schools[1].id, 13.5, 6],
    [schools[2].id, 18, 6],
    [schools[3].id, 22.5, 6],
  ];
  for (const [orgId, points, played] of expected) {
    const row = byOrg.get(orgId);
    const label = schools.find(s => s.id === orgId)!.shortName;
    expect(row?.points, points, `${label} rolls up to the hand-computed ${points} points`);
    expect(row?.played, played, `${label}'s appearances sum unweighted — six fixtures, not fifteen`);
  }
  expect(
    [...byOrg.values()].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).map(row => row.teamId),
    [schools[3].id, schools[2].id, schools[1].id, schools[0].id],
    'so the weighted division decides the order, which is the whole point of D18'
  );

  // ------------------------------------------------------------------------------------------
  // 5. D9's second path — regenerating over results
  // ------------------------------------------------------------------------------------------

  await expectThrows(
    () => tournamentManager.generateStageFixtures(divisionX.stageId, 'regenerate'),
    /deletes 6 fixture\(s\), 6 of which have results/,
    'regenerating over results is refused, and the refusal states the concrete cost'
  );
  const regenerated = await tournamentManager.generateStageFixtures(divisionX.stageId, 'regenerate', true);
  expect(
    [regenerated.deleted, regenerated.created],
    [6, 6],
    'and goes ahead once told the results should go'
  );
  expect(
    ((await tournamentManager.getStage(divisionX.stageId))!.cachedStandings || []).every(
      row => row.played === 0
    ),
    true,
    'the table is rebuilt without them rather than left standing'
  );

  // ------------------------------------------------------------------------------------------
  // 6. D10 — a substitution is not a regeneration
  // ------------------------------------------------------------------------------------------

  const substituteDivision = divisions[2];
  const rosterBefore = await tournamentManager.getEntrants(substituteDivision.id);
  const swapped = rosterBefore[0];
  const replacementTeamId = `team-p6-sub-${stamp}`;
  await query(
    `INSERT INTO teams (id, name, age_group_id, sport_id, org_id, is_active)
     VALUES ($1, 'Second XV', $2, $3, $4, true)`,
    [replacementTeamId, substituteDivision.ageGroupId, substituteDivision.sportId, schools[0].id]
  );
  created.teamIds.push(replacementTeamId);

  const fixturesBefore = (
    await query(`SELECT count(*)::int AS n FROM games WHERE stage_id = $1`, [substituteDivision.stageId])
  ).rows[0].n;

  await tournamentManager.setDivisionEntrants(
    substituteDivision.id,
    rosterBefore.map(entrant => ({
      id: entrant.id,
      seed: entrant.seed,
      teamId: entrant.id === swapped.id ? replacementTeamId : entrant.teamId,
    }))
  );

  expect(
    (await query(`SELECT count(*)::int AS n FROM games WHERE stage_id = $1`, [substituteDivision.stageId]))
      .rows[0].n,
    fixturesBefore,
    'substituting one entrant for another leaves the draw exactly where it was (D10)'
  );
  expect(
    (
      await query(
        `SELECT count(*)::int AS n FROM game_participants WHERE entrant_id = $1 AND team_id = $2`,
        [swapped.id, replacementTeamId]
      )
    ).rows[0].n,
    3,
    'and every fixture naming that entrant now names the new team, in one write'
  );

  // ------------------------------------------------------------------------------------------
  // 7. D7 — resolving a placeholder fills in every fixture at once
  // ------------------------------------------------------------------------------------------

  const placeholderDivision = divisions[3];
  await tournamentManager.setDivisionEntrants(placeholderDivision.id, [
    ...(await tournamentManager.getEntrants(placeholderDivision.id)).map(entrant => ({
      id: entrant.id,
      teamId: entrant.teamId,
      seed: entrant.seed,
    })),
    { label: 'TBC — awaiting confirmation', seed: 5 },
  ]);
  await tournamentManager.generateStageFixtures(placeholderDivision.stageId, 'regenerate', true);

  const placeholder = (await tournamentManager.getEntrants(placeholderDivision.id)).find(
    entrant => !entrant.teamId
  )!;
  expect(placeholder.name, 'TBC — awaiting confirmation', 'an unresolved entrant prints its label');
  const placeholderFixtures = (
    await query(`SELECT count(*)::int AS n FROM game_participants WHERE entrant_id = $1`, [placeholder.id])
  ).rows[0].n;
  expect(placeholderFixtures, 4, 'and is scheduled into the draw like anybody else (five entrants, four fixtures each)');

  const confirmedTeamId = teamsByDivision.get(placeholderDivision.id)![0].id;
  await tournamentManager.setDivisionEntrants(
    placeholderDivision.id,
    (await tournamentManager.getEntrants(placeholderDivision.id)).map(entrant => ({
      id: entrant.id,
      seed: entrant.seed,
      teamId: entrant.id === placeholder.id ? confirmedTeamId : entrant.teamId,
      label: entrant.id === placeholder.id ? undefined : entrant.label,
    }))
  );
  expect(
    (
      await query(
        `SELECT count(*)::int AS n FROM game_participants WHERE entrant_id = $1 AND team_id = $2`,
        [placeholder.id, confirmedTeamId]
      )
    ).rows[0].n,
    placeholderFixtures,
    'confirming who it is updates every fixture at once, because they all point at one row'
  );

  // ------------------------------------------------------------------------------------------
  // 8. FIX-12 — a fixture added by hand names its stage, and so its division
  // ------------------------------------------------------------------------------------------

  const handAdded = await eventManager.addGame({
    eventId: event.id,
    sportId: divisions[4].sportId,
    stageId: divisions[4].stageId,
    startTime: new Date().toISOString(),
    status: 'Scheduled',
    participants: [
      { teamId: teamsByDivision.get(divisions[4].id)![0].id },
      { teamId: teamsByDivision.get(divisions[4].id)![1].id },
    ],
  } as any);
  expect(
    await accessManager.getGameDivisionId(handAdded.id),
    divisions[4].id,
    'a hand-added fixture resolves to its division, so a convenor can read and score it (FIX-12)'
  );
  const handAddedSummary = await eventManager.getGameSummary(handAdded.id);
  expect(
    [handAddedSummary?.stageId, handAddedSummary?.divisionId],
    [divisions[4].stageId, divisions[4].id],
    'and its summary carries both, which is what the client permission check reads'
  );

  // ------------------------------------------------------------------------------------------
  // 8b. FIX-17 — a division's sport is fixed once teams are entered; its age group is not
  // ------------------------------------------------------------------------------------------

  /*
   * On a division of its own, so nothing above depends on the state these checks leave behind.
   *
   * The rule settled on 2026-09-20: entrants are the point at which the sport has been acted on,
   * because you cannot enter a team without having decided what the division plays. Age group is
   * deliberately looser — the teams that stop matching become overrides, which the entry grid
   * renders and tags, and the organiser swaps them at their leisure.
   */
  const lockSportId = sports[0].id;
  const lockDivision = await tournamentManager.addDivision({
    eventId: event.id,
    name: `P6 Lock ${stamp}`,
    sportId: lockSportId,
    ageGroupId: starterAgeGroupId(lockSportId, 'u13'),
  } as any);

  // A placeholder is an entrant with no team, so it settles nothing about the sport.
  await tournamentManager.setDivisionEntrants(lockDivision.id, [
    { label: 'Winner of the regional qualifier' },
  ]);
  const movedOnPlaceholder = await tournamentManager
    .updateDivision(lockDivision.id, { sportId: sports[1].id })
    .then(d => d?.sportId)
    .catch(() => 'refused');
  expect(
    movedOnPlaceholder,
    sports[1].id,
    'a division holding only a placeholder may still change its sport — a label contradicts none'
  );
  // Changing the sport clears the age group, so the revert restores both.
  await tournamentManager.updateDivision(lockDivision.id, {
    sportId: lockSportId,
    ageGroupId: starterAgeGroupId(lockSportId, 'u13'),
  });

  // And now a real team.
  const lockTeamId = `team-p6-lock-${stamp}`;
  await query(
    `INSERT INTO teams (id, name, age_group_id, sport_id, org_id, is_active)
     VALUES ($1, 'P6 Lock XI', $2, $3, $4, true)`,
    [lockTeamId, starterAgeGroupId(lockSportId, 'u13'), lockSportId, schools[0].id]
  );
  created.teamIds.push(lockTeamId);
  await tournamentManager.setDivisionEntrants(lockDivision.id, [{ teamId: lockTeamId }]);

  /*
   * The age group is checked *before* the sport refusal, and the order is load-bearing.
   *
   * Run the other way round, a broken refusal leaves the division on a sport whose age groups are
   * not the ones this code names, and the age-group change then dies on the composite foreign key
   * — turning a clear "the sport should have been refused" into an unrelated crash three lines
   * later. Found by disabling the refusal to check these assertions actually catch it.
   */
  const movedAge = starterAgeGroupId(lockSportId, 'u17');
  await tournamentManager.updateDivision(lockDivision.id, { ageGroupId: movedAge });
  const afterAgeChange = await tournamentManager.getEntrants(lockDivision.id);
  expect(
    [
      (await tournamentManager.getDivision(lockDivision.id))?.ageGroupId,
      afterAgeChange.length,
      afterAgeChange[0]?.teamId,
      // Carried on the entrant so the screen can count the overrides before making the change.
      afterAgeChange[0]?.teamAgeGroupId,
    ],
    [movedAge, 1, lockTeamId, starterAgeGroupId(lockSportId, 'u13')],
    'the age group changes with a team entered, leaving it in place as an override'
  );

  const refusal = await tournamentManager
    .updateDivision(lockDivision.id, { sportId: sports[1].id })
    .then(() => null)
    .catch((err: Error) => err.message);
  expect(
    [
      typeof refusal === 'string' && refusal.includes('1 team'),
      (await tournamentManager.getDivision(lockDivision.id))?.sportId,
    ],
    [true, lockSportId],
    'but the sport is refused once a team is entered, and the division keeps the one it had'
  );

  // ------------------------------------------------------------------------------------------
  // 8c. A team plays in one division of a tournament, and Move here is one write
  // ------------------------------------------------------------------------------------------

  /*
   * Divisions are sport plus age group, so the only way a team reaches two of them is an A/B
   * section split of its own sport and age — where being in both is not something that happens,
   * it is a mistake somebody is making. Enforced on the server rather than only hidden in the
   * entry grid, because two organisers on two devices would otherwise both succeed.
   */
  const moveTarget = await tournamentManager.addDivision({
    eventId: event.id,
    name: `P6 Move ${stamp}`,
    sportId: lockSportId,
    ageGroupId: starterAgeGroupId(lockSportId, 'u13'),
  } as any);

  const doubleEntry = await tournamentManager
    .setDivisionEntrants(moveTarget.id, [{ teamId: lockTeamId }])
    .then(() => null)
    .catch((err: Error) => err.message);
  expect(
    [
      typeof doubleEntry === 'string' && doubleEntry.includes(`P6 Lock ${stamp}`),
      (await tournamentManager.getEntrants(moveTarget.id)).length,
    ],
    [true, 0],
    'entering a team another division already holds is refused, naming the division that has it'
  );

  /*
   * **Move here** — the same write with the flag, and the reason it is a flag rather than a second
   * call: one transaction cannot leave the team in neither division.
   */
  const moved = await tournamentManager.setDivisionEntrants(
    moveTarget.id,
    [{ teamId: lockTeamId }],
    { takeFromOtherDivisions: true }
  );
  expect(
    [
      moved.entrants.map(e => e.teamId),
      (await tournamentManager.getEntrants(lockDivision.id)).length,
      moved.vacated.map(v => v.divisionId),
    ],
    [[lockTeamId], 0, [lockDivision.id]],
    'but Move here takes it across in one write, and reports the division it came out of'
  );

  /*
   * A placeholder moves the same way, through `removeEntrantIds` rather than the team clash.
   *
   * It has no team to clash on and its row belongs to its division — carrying the fixtures drawn
   * against it — so a move is genuinely a delete and an insert. Naming the row lets both happen in
   * one transaction, which is what stops a placeholder ending up in both divisions or in neither.
   */
  const placeholderHome = await tournamentManager.setDivisionEntrants(lockDivision.id, [
    { label: 'Winner of the regional qualifier' },
  ]);
  const placeholderId = placeholderHome.entrants[0].id;
  const placeholderMoved = await tournamentManager.setDivisionEntrants(
    moveTarget.id,
    [{ label: 'Winner of the regional qualifier' }],
    { removeEntrantIds: [placeholderId] }
  );
  expect(
    [
      placeholderMoved.entrants.map(e => e.label),
      (await tournamentManager.getEntrants(lockDivision.id)).length,
      placeholderMoved.vacated.map(v => v.divisionId),
    ],
    [['Winner of the regional qualifier'], 0, [lockDivision.id]],
    'a placeholder moves in one write too, though it has no team to clash on'
  );

  /*
   * An org-linked placeholder keeps its school — through its creation, and through every later
   * rewrite of the roster. The second is the one that bites: a roster is always sent whole (D13),
   * so a placeholder whose organisation was not carried along would lose it to any unrelated edit of
   * the same division, silently. Before 2026-09-21 it never had one to lose.
   */
  const schoolSlot = await tournamentManager.setDivisionEntrants(moveTarget.id, [
    { label: "P6 School A second team", orgId: schools[0].id },
  ]);
  const slot = schoolSlot.entrants.find(e => e.label === 'P6 School A second team')!;
  const afterRewrite = await tournamentManager.setDivisionEntrants(moveTarget.id, [
    { id: slot.id, label: slot.label, orgId: slot.orgId },
    { label: 'Winner of the regional qualifier' },
  ]);
  expect(
    [
      slot.orgId,
      afterRewrite.entrants.find(e => e.id === slot.id)?.orgId,
      afterRewrite.entrants.find(e => e.label === 'Winner of the regional qualifier')?.orgId ?? null,
    ],
    [schools[0].id, schools[0].id, null],
    'an org-linked placeholder keeps its school through a roster rewrite, and a generic one has none'
  );

  // A team carries its own organisation, and a payload cannot move it to somebody else's.
  const reattributed = await tournamentManager.setDivisionEntrants(moveTarget.id, [
    { teamId: lockTeamId, orgId: schools[1].id },
  ]);
  expect(
    reattributed.entrants.find(e => e.teamId === lockTeamId)?.orgId,
    schools[0].id,
    "and a team's organisation is its own — naming another one in the payload does not change it"
  );

  await tournamentManager.deleteDivision(moveTarget.id);
  await tournamentManager.deleteDivision(lockDivision.id);

  // ------------------------------------------------------------------------------------------
  // 8d. Hosting and competing are different things (2026-09-21)
  // ------------------------------------------------------------------------------------------

  /*
   * The host is a row in `event_organizations` like anybody else, written when the event was
   * created — which is the whole point, because it is what lets an organiser take it off. While
   * participation was implicit for the host, removing it did nothing: every reader unioned
   * `events.org_id` back in.
   */
  const withHost = await tournamentManager.getEventCandidateTeams(event.id);
  expect(
    withHost.orgs.some(org => org.id === APP_TEST_ORG_ID),
    true,
    'the host is a participating organisation from the moment the tournament is created'
  );

  await eventManager.updateEvent(event.id, {
    participatingOrgIds: [...schools.map(school => school.id), emptySchoolId],
  } as any);
  const withoutHost = await tournamentManager.getEventCandidateTeams(event.id);
  expect(
    [
      withoutHost.orgs.some(org => org.id === APP_TEST_ORG_ID),
      withoutHost.orgs.length,
      // The schools are untouched: removing one organisation removes one organisation.
      schools.every(school => withoutHost.orgs.some(org => org.id === school.id)),
    ],
    [false, withHost.orgs.length - 1, true],
    'and taking it off the list removes it — a school may run a tournament it does not play in'
  );

  // Put it back, so the event is as the rest of the script left it.
  await eventManager.updateEvent(event.id, {
    participatingOrgIds: [APP_TEST_ORG_ID, ...schools.map(school => school.id), emptySchoolId],
  } as any);

  // ------------------------------------------------------------------------------------------
  // 9. The Phase 6 migration — PEOPLE-3's remaining half
  // ------------------------------------------------------------------------------------------

  const legacy = await eventManager.addEvent({
    name: `P6 Legacy ${stamp}`,
    type: 'Tournament',
    format: 'PoolsKnockout',
    startDate: '2026-10-01',
    orgId: APP_TEST_ORG_ID,
    sportIds: [sports[0].id],
    status: 'Scheduled',
  } as any);
  created.eventIds.push(legacy.id);
  const legacyDivision = await tournamentManager.addDivision({
    eventId: legacy.id,
    name: 'Legacy division',
    sportId: sports[0].id,
  });
  const orphan = await eventManager.addGame({
    eventId: legacy.id,
    sportId: sports[0].id,
    startTime: new Date().toISOString(),
    status: 'Scheduled',
    participants: [{ teamId: created.teamIds[0] }, { teamId: created.teamIds[1] }],
  } as any);

  expect(
    (await tournamentManager.getStages(legacyDivision.id)).length,
    0,
    'the state PEOPLE-3 describes: a division created before Phase 5 has no stages'
  );
  expect(
    await accessManager.getGameDivisionId(orphan.id),
    null,
    'and its fixtures belong to no division, so no convenor can touch them'
  );

  const client = await pool.connect();
  try {
    await backfillStages(client as any);
  } finally {
    client.release();
  }

  const legacyStages = await tournamentManager.getStages(legacyDivision.id);
  expect(
    legacyStages.map(stage => [stage.name, stage.format]),
    [['Pools', 'RoundRobin'], ['Knockout', 'Knockout']],
    'the migration gives it the stages its format implies, from the same function ADD_EVENT uses'
  );
  expect(
    await accessManager.getGameDivisionId(orphan.id),
    legacyDivision.id,
    'and attaches the orphaned fixture to the first of them, closing PEOPLE-3 for existing rows'
  );

  // ------------------------------------------------------------------------------------------
  // 10. The new read boundary
  // ------------------------------------------------------------------------------------------

  expect(
    await canJoinRoom('anonymous', `event:${event.id}:entrants`),
    false,
    'the roster room is not spectator information: an entrant may be a person'
  );
  expect(
    await canJoinRoom('anonymous', `event:${event.id}`),
    true,
    'while the event itself stays public, so the split is by what is in the room'
  );

  const anonymousCandidates = await canReadData('anonymous', {
    type: 'event_candidate_teams',
    eventId: event.id,
  });
  expect(
    anonymousCandidates.allowed,
    false,
    'and browsing an org\'s teams is gated at the level of the entry it feeds'
  );
  const anonymousEntrants = await canReadData('anonymous', {
    type: 'event_entrants',
    eventId: event.id,
  });
  expect(anonymousEntrants.allowed, false, 'as is reading the roster through get_data');

  if (failures.length) {
    console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS — ${checks} entrant, generation and standings checks.`);
  }
}

async function cleanup() {
  for (const id of created.eventIds) await query(`DELETE FROM events WHERE id = $1`, [id]);
  for (const id of created.teamIds) await query(`DELETE FROM teams WHERE id = $1`, [id]);
  for (const id of created.orgIds) await query(`DELETE FROM organizations WHERE id = $1`, [id]);
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
