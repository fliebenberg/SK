import { APP_TEST_ORG_ID, APP_TEST_ORG_NAME } from '@sk/shared';
import { query } from '../db';
import pool from '../db';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { starterAgeGroupId } from './setup/ageGroupSeed';

/**
 * Tournaments Phase 3 — the exit criterion, as a runnable check.
 *
 * Builds a two-stage division end to end over the real managers and the real database: a division,
 * four entrants, a pool stage, its six fixtures played, and a knockout **generated before the pool
 * finishes** so that its slots are genuine placeholders. Then it asserts that progression put the
 * right teams in the right semi-finals and that `events.cached_standings` moved.
 *
 * If progression works headlessly here, every screen after this is presentation — which is the
 * whole reason this phase has a script rather than a screenshot.
 *
 * Plain assertions, no interactive output, cleanup in a `finally`, so it can graduate into an
 * integration test without being rewritten. `server/` deliberately has no test harness yet
 * (decided at this phase, per the plan): standing up a disposable database, fixture setup and the
 * "never in production" guard is test *infrastructure*, a piece of work in its own right, and this
 * one script does not yet justify it.
 *
 * Run: `npx ts-node src/scripts/phase3-progression.ts`
 */

let checks = 0;

function assert(condition: any, message: string): void {
  checks++;
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function assertEqual(actual: any, expected: any, message: string): void {
  checks++;
  if (actual !== expected) {
    throw new Error(`ASSERTION FAILED: ${message}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
}

/** Everything this run created, newest first, so cleanup satisfies the foreign keys. */
const created = { eventId: '', teamIds: [] as string[], visitorOrgId: '' };

async function main() {
  const stamp = Date.now();

  // ---------------------------------------------------------------------------------------
  // Setup. `app-test-org` is reused rather than re-created (test-org-reuse); the visiting org
  // is created because the organisation roll-up is only worth asserting with two of them, and
  // it is deleted again below.
  // ---------------------------------------------------------------------------------------
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, $2, 'ATO', true, true) ON CONFLICT (id) DO NOTHING`,
    [APP_TEST_ORG_ID, APP_TEST_ORG_NAME]
  );

  created.visitorOrgId = `test-org-p3-${stamp}`;
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, 'Phase 3 Visiting School', 'P3V', true, true)`,
    [created.visitorOrgId]
  );

  const sportRes = await query(`SELECT id FROM sports ORDER BY id LIMIT 1`);
  assert(sportRes.rows.length > 0, 'the database has at least one sport to play');
  const sportId: string = sportRes.rows[0].id;

  // Two teams per org, so the roll-up has two rows to weight and compare.
  const teamOrgs = [APP_TEST_ORG_ID, APP_TEST_ORG_ID, created.visitorOrgId, created.visitorOrgId];
  for (let i = 0; i < 4; i++) {
    const teamId = `team-p3-${stamp}-${i + 1}`;
    await query(
      `INSERT INTO teams (id, name, age_group_id, sport_id, org_id, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [teamId, `P3 Team ${i + 1}`, starterAgeGroupId(sportId, 'U14'), sportId, teamOrgs[i]]
    );
    created.teamIds.push(teamId);
  }

  const event = await eventManager.addEvent({
    name: `Phase 3 Progression ${stamp}`,
    type: 'Tournament',
    format: 'PoolsKnockout',
    startDate: new Date().toISOString(),
    orgId: APP_TEST_ORG_ID,
    sportIds: [sportId],
    participatingOrgIds: [created.visitorOrgId],
    settings: {},
    status: 'Scheduled',
  } as any);
  created.eventId = event.id;

  // ---------------------------------------------------------------------------------------
  // 1. A division with two stages. `weighting` is 1.5 so the roll-up assertion below actually
  //    tests D18 rather than passing whatever the default happens to be.
  // ---------------------------------------------------------------------------------------
  const division = await tournamentManager.addDivision({
    eventId: event.id,
    name: 'U14 Pool & Knockout',
    sportId,
    ageGroupId: starterAgeGroupId(sportId, 'U14'),
    weighting: 1.5,
  });
  assertEqual(division.weighting, 1.5, 'weighting round-trips as a number, not a NUMERIC string');

  const poolStage = await tournamentManager.addStage({
    divisionId: division.id,
    name: 'Pool',
    format: 'RoundRobin',
    sequence: 1,
  });
  const knockoutStage = await tournamentManager.addStage({
    divisionId: division.id,
    name: 'Knockout',
    format: 'Knockout',
    sequence: 2,
    settings: {
      bracketSize: 4,
      entrantSource: [{ fromStage: poolStage.id, positions: [1, 2, 3, 4] }],
    },
  });
  assertEqual(poolStage.status, 'Pending', 'a stage with no entrants is Pending');

  // ---------------------------------------------------------------------------------------
  // 2. Four entrants, then the pool's roster.
  // ---------------------------------------------------------------------------------------
  const roster = await tournamentManager.setDivisionEntrants(
    division.id,
    created.teamIds.map((teamId, i) => ({ teamId, seed: i + 1 }))
  );
  assertEqual(roster.entrants.length, 4, 'four entrants were registered');
  assertEqual(
    roster.entrants.filter(e => e.orgId === APP_TEST_ORG_ID).length,
    2,
    'org_id is denormalised from the team, which is what the roll-up groups by'
  );
  assert(
    roster.entrants.every(e => !!e.name),
    'an entrant carries its resolved name, so a roster renders from the broadcast alone'
  );

  /** Entrant id by team id, for asserting who ended up where. */
  const entrantOf = new Map<string, string>();
  roster.entrants.forEach(e => entrantOf.set(e.teamId!, e.id));
  const e1 = entrantOf.get(created.teamIds[0])!;
  const e2 = entrantOf.get(created.teamIds[1])!;
  const e3 = entrantOf.get(created.teamIds[2])!;
  const e4 = entrantOf.get(created.teamIds[3])!;

  await tournamentManager.setStageEntrants(
    poolStage.id,
    roster.entrants.map((e, i) => ({ entrantId: e.id, seed: i + 1, sortOrder: i }))
  );
  assertEqual(
    (await tournamentManager.getStage(poolStage.id))!.status,
    'Ready',
    'a stage with entrants and no fixtures is Ready, which is what generation acts on'
  );

  // ---------------------------------------------------------------------------------------
  // 3. Generate both stages. The knockout is generated **first-round-placeholders and all**,
  //    before a single pool fixture has been played — which is the case the whole placeholder
  //    model exists for, and the one this script is really testing.
  // ---------------------------------------------------------------------------------------
  const poolGeneration = await tournamentManager.generateStageFixtures(poolStage.id, 'create');
  assertEqual(poolGeneration.created, 6, 'a round robin of four is six fixtures');

  let refused = false;
  try {
    await tournamentManager.generateStageFixtures(poolStage.id, 'create');
  } catch {
    refused = true;
  }
  assert(refused, 'generating over an existing draw is refused rather than topping it up (D9)');

  const knockoutGeneration = await tournamentManager.generateStageFixtures(knockoutStage.id, 'create');
  assertEqual(knockoutGeneration.created, 3, 'a bracket of four is two semi-finals and a final');

  const knockoutBefore = await tournamentManager.getStageGames(knockoutStage.id);
  const placeholderSides = knockoutBefore.flatMap(g => g.participants).filter(p => !!p.sourceRule);
  assertEqual(placeholderSides.length, 6, 'every knockout slot starts as a rule, not a team');
  assert(
    knockoutBefore.flatMap(g => g.participants).every(p => !p.teamId),
    'no knockout slot names a team before the pool has been played'
  );

  const semiFinals = knockoutBefore.filter(g => (g as any).participants.some((p: any) => p.sourceStageId === poolStage.id));
  assertEqual(semiFinals.length, 2, 'the two semi-finals draw from the pool stage');
  const finalBefore = knockoutBefore.find(g => g.participants.every((p: any) => !!p.sourceGameId));
  assert(finalBefore, 'the final draws from the two semi-finals rather than from the pool');

  // ---------------------------------------------------------------------------------------
  // 4. Play the pool. Chosen so the four entrants finish 9 / 6 / 3 / 0 points — every rank
  //    separated on points alone, so the assertions below are about progression rather than
  //    about which tiebreak factor fired.
  // ---------------------------------------------------------------------------------------
  const winners = new Map<string, string>([
    [pair(e1, e4), e1], [pair(e2, e3), e2],
    [pair(e1, e3), e1], [pair(e2, e4), e2],
    [pair(e1, e2), e1], [pair(e3, e4), e3],
  ]);

  const poolGames = await tournamentManager.getStageGames(poolStage.id);
  assertEqual(poolGames.length, 6, 'six pool fixtures to play');

  for (const game of poolGames) {
    const [sideA, sideB] = game.participants;
    const winner = winners.get(pair(sideA.entrantId!, sideB.entrantId!));
    assert(winner, `every generated pairing is one of the six expected ones (${sideA.entrantId} v ${sideB.entrantId})`);
    const scores: Record<string, number> = {
      [sideA.id]: sideA.entrantId === winner ? 20 : 5,
      [sideB.id]: sideB.entrantId === winner ? 20 : 5,
    };
    // The ordinary scoring path: the score lands in `live_state`, then the fixture finishes —
    // and finishing is what routes through the choke point.
    await eventManager.updateGame(game.id, { liveState: { scores } } as any);
    await eventManager.updateGameStatus(game.id, 'Finished');
  }

  // ---------------------------------------------------------------------------------------
  // 5. The pool's table, and the event roll-up.
  // ---------------------------------------------------------------------------------------
  const finishedPool = (await tournamentManager.getStage(poolStage.id))!;
  assertEqual(finishedPool.status, 'Complete', 'a stage whose every fixture has a result is Complete');

  const table = finishedPool.cachedStandings || [];
  assertEqual(table.length, 4, 'the pool table has a row per entrant');
  const rankOf = new Map(table.map(row => [row.entrantId, row.rank]));
  assertEqual(rankOf.get(e1), 1, 'the entrant that won all three is first');
  assertEqual(rankOf.get(e2), 2, 'two wins is second');
  assertEqual(rankOf.get(e3), 3, 'one win is third');
  assertEqual(rankOf.get(e4), 4, 'no wins is fourth');
  assertEqual(table.find(r => r.entrantId === e1)!.points, 9, 'three wins at the 3/1/0 default is 9 points');

  const eventRow = await query(`SELECT cached_standings as "cachedStandings" FROM events WHERE id = $1`, [event.id]);
  const rollUp: any[] = eventRow.rows[0].cachedStandings || [];
  assertEqual(rollUp.length, 2, 'the roll-up has a row per organisation with an entrant');
  const host = rollUp.find(r => r.orgId === APP_TEST_ORG_ID);
  const visitor = rollUp.find(r => r.orgId === created.visitorOrgId);
  assert(host && visitor, 'both organisations appear in the roll-up');
  // D18: the division's points are multiplied by its weighting before they are summed by org.
  // 9 + 6 = 15 raw for the host, 3 + 0 = 3 for the visitor, both at 1.5.
  assertEqual(host.points, 22.5, 'the host org rolls up 15 points at a weighting of 1.5');
  assertEqual(visitor.points, 4.5, 'the visiting org rolls up 3 points at a weighting of 1.5');

  // ---------------------------------------------------------------------------------------
  // 6. **Progression.** Nothing below was called explicitly: finishing the last pool fixture
  //    is what ran it, through the choke point and nothing else.
  // ---------------------------------------------------------------------------------------
  const knockoutEntrants = await tournamentManager.getStageEntrants(knockoutStage.id);
  assertEqual(knockoutEntrants.length, 4, 'the knockout roster was written from the pool table');
  assertEqual(knockoutEntrants[0].entrantId, e1, 'the pool winner is seeded first in the knockout');
  assertEqual(knockoutEntrants[3].entrantId, e4, 'the pool"s last is seeded last');

  const knockoutAfter = await tournamentManager.getStageGames(knockoutStage.id);
  const semis = knockoutAfter.filter(g => (g.participants as any[]).every(p => !!p.entrantId));
  assertEqual(semis.length, 2, 'both semi-finals have real entrants in them now');

  const semiPairs = semis.map(g => pair(g.participants[0].entrantId!, g.participants[1].entrantId!)).sort();
  const expectedPairs = [pair(e1, e4), pair(e2, e3)].sort();
  assertEqual(semiPairs[0], expectedPairs[0], 'the standard bracket pairs 1st with 4th');
  assertEqual(semiPairs[1], expectedPairs[1], 'and 2nd with 3rd');

  assert(
    semis.every(g => g.participants.every((p: any) => !!p.teamId)),
    'a resolved slot carries the team too, so a fixture list prints a name rather than a rule'
  );

  const finalAfter = knockoutAfter.find(g => g.id === finalBefore!.id)!;
  assert(
    finalAfter.participants.every((p: any) => !p.entrantId && !!p.sourceRule),
    'the final is still "Winner SF1 v Winner SF2" — a pool completing decides the semis, not the final'
  );

  // ---------------------------------------------------------------------------------------
  // 7. Play the semi-finals, and watch the final fill itself in. Different arrow of the choke
  //    point: `winnerOf` a single fixture, rather than a standing in a completed stage.
  // ---------------------------------------------------------------------------------------
  const semiWinners: string[] = [];
  for (const semi of semis) {
    const [sideA, sideB] = semi.participants;
    // The higher-ranked entrant wins, so the final is predictable: 1st versus 2nd.
    const winner = (rankOf.get(sideA.entrantId!) ?? 99) < (rankOf.get(sideB.entrantId!) ?? 99) ? sideA : sideB;
    semiWinners.push(winner.entrantId!);
    await eventManager.updateGame(semi.id, {
      liveState: { scores: { [sideA.id]: sideA.id === winner.id ? 30 : 12, [sideB.id]: sideB.id === winner.id ? 30 : 12 } },
    } as any);
    await eventManager.updateGameStatus(semi.id, 'Finished');
  }

  const finalPlayed = (await tournamentManager.getStageGames(knockoutStage.id)).find(g => g.id === finalBefore!.id)!;
  const finalists = finalPlayed.participants.map((p: any) => p.entrantId).filter(Boolean).sort();
  assertEqual(finalists.length, 2, 'both sides of the final resolved once their semi-finals finished');
  assertEqual(finalists.join(','), [...semiWinners].sort().join(','), 'the final is between the two semi-final winners');
  assertEqual(finalists.includes(e1) && finalists.includes(e2), true, 'which here is the pool"s first and second');

  // A manual override (D29) must survive the source fixture being re-scored, because filling a
  // slot by hand clears the rule. This is the same edit as filling a TBC slot, deliberately.
  const overrideSide = finalPlayed.participants.find((p: any) => p.entrantId === e2)!;
  await tournamentManager.resolveParticipant(overrideSide.id, { entrantId: e3, teamId: created.teamIds[2] });
  await eventManager.recalculateStandingsForGame(semis[0].id);
  await eventManager.recalculateStandingsForGame(semis[1].id);
  const afterOverride = (await tournamentManager.getStageGames(knockoutStage.id)).find(g => g.id === finalBefore!.id)!;
  assert(
    afterOverride.participants.some((p: any) => p.entrantId === e3),
    'a slot filled by hand is not overwritten the next time the choke point runs (D29)'
  );

  console.log(`PASS — ${checks} assertions.`);
}

/** Order-independent key for a pairing, so a fixture matches however its sides were generated. */
function pair(a: string, b: string): string {
  return [a, b].sort().join('|');
}

async function cleanup() {
  // Dependants before parents. Deleting the event cascades its divisions, stages, entrants and
  // fixtures, so only the rows created beside it need naming.
  if (created.eventId) await query(`DELETE FROM events WHERE id = $1`, [created.eventId]);
  if (created.teamIds.length) await query(`DELETE FROM teams WHERE id = ANY($1::text[])`, [created.teamIds]);
  if (created.visitorOrgId) await query(`DELETE FROM organizations WHERE id = $1`, [created.visitorOrgId]);
  // `app-test-org` is deliberately left behind — it is the shared fixture, not this run's.
}

main()
  .then(async () => {
    await cleanup();
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err.message || err);
    try {
      await cleanup();
    } catch (cleanupErr) {
      console.error('Cleanup also failed:', cleanupErr);
    }
    await pool.end();
    process.exit(1);
  });
