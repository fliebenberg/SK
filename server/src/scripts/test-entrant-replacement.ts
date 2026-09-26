import { APP_TEST_ORG_ID } from '@sk/shared';
import { query } from '../db';
import pool from '../db';
import { setIo } from '../wss/sockets';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';

/**
 * Replacing and withdrawing entrants once a draw exists (2026-09-24), against a real database.
 *
 * The rule under test is **"Keep"**: a result stays with the team that played it. So an entrant
 * that has played is never deleted and never has its results re-attributed —
 *
 *  - **Replace, nothing played** — the replacement becomes the entrant; every fixture follows and
 *    the draw is untouched. This is how a placeholder is filled.
 *  - **Replace, something played** — the entrant is withdrawn and keeps its results and its table
 *    row (listed last, unranked); the replacement takes its pool place and only the unplayed
 *    fixtures.
 *  - **Remove from the roster, something played** — withdrawn rather than deleted, so its results
 *    stay in the table; its unplayed fixtures stay for the organiser to hand on.
 *  - **Swap after the fact** — a late entry takes over a withdrawn team's remaining fixtures.
 *  - **Generation never draws a withdrawn entrant**, and progression never ranks one.
 *
 * Run: `npx ts-node src/scripts/test-entrant-replacement.ts`. Leaves the database as it found it.
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
    if (!matching.test(message)) failures.push(`${what}: refused with "${message}", expected ${matching}`);
  }
}

const created = { eventIds: [] as string[], orgIds: [] as string[], teamIds: [] as string[] };

/** Participant rows of a stage's fixtures, as `{ gameId, status, entrantId, teamId }`. */
async function sides(stageId: string) {
  const res = await query(
    `SELECT g.id AS "gameId", g.status, gp.id AS "participantId", gp.entrant_id AS "entrantId",
            gp.team_id AS "teamId"
       FROM games g JOIN game_participants gp ON gp.game_id = g.id
      WHERE g.stage_id = $1 ORDER BY g.id, gp.sort_order`,
    [stageId]
  );
  return res.rows;
}

/** Finish one fixture, `winner` 10-0. The shape the scoring path writes (`live_state.scores`). */
async function finish(gameId: string, winnerEntrantId: string) {
  const participants = (
    await query(`SELECT id, entrant_id FROM game_participants WHERE game_id = $1`, [gameId])
  ).rows;
  const scores = Object.fromEntries(participants.map((p: any) => [p.id, p.entrant_id === winnerEntrantId ? 10 : 0]));
  await query(
    `UPDATE games SET status = 'Finished',
            live_state = jsonb_set(COALESCE(live_state, '{}'::jsonb), '{scores}', $2::jsonb)
      WHERE id = $1`,
    [gameId, JSON.stringify(scores)]
  );
  await tournamentManager.recalculateForGame(gameId);
}

async function main() {
  const stamp = Date.now();
  setIo({
    to: () => ({ emit: () => undefined }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() } },
  } as any);

  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, 'App Test Org', 'ATO', true, true) ON CONFLICT (id) DO NOTHING`,
    [APP_TEST_ORG_ID]
  );
  const sport = (await query(`SELECT id FROM sports ORDER BY id LIMIT 1`)).rows[0];
  if (!sport) throw new Error('Need a seeded sport. Run db:setup.');

  // Six schools, one team each: A-D are entered, E and F are the replacements.
  const teams: Record<string, string> = {};
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const orgId = `org-rep-${letter.toLowerCase()}-${stamp}`;
    await query(
      `INSERT INTO organizations (id, name, short_name, is_claimed, is_active) VALUES ($1, $2, $3, true, true)`,
      [orgId, `Rep School ${letter}`, `RP${letter}`]
    );
    created.orgIds.push(orgId);
    const teamId = `team-rep-${letter.toLowerCase()}-${stamp}`;
    await query(
      `INSERT INTO teams (id, name, sport_id, org_id, is_active) VALUES ($1, $2, $3, $4, true)`,
      [teamId, `Team ${letter}`, sport.id, orgId]
    );
    created.teamIds.push(teamId);
    teams[letter] = teamId;
  }

  const event = await eventManager.addEvent({
    name: `Replacement ${stamp}`,
    type: 'Tournament',
    format: 'RoundRobin',
    startDate: '2026-10-01',
    orgId: APP_TEST_ORG_ID,
    sportIds: [sport.id],
    participatingOrgIds: created.orgIds,
    status: 'Scheduled',
  } as any);
  created.eventIds.push(event.id);
  for (const implicit of await tournamentManager.getDivisions(event.id)) {
    await tournamentManager.deleteDivision(implicit.id);
  }

  const makeDivision = async (name: string) => {
    const division = await tournamentManager.addDivision({ eventId: event.id, name, sportId: sport.id });
    const stage = await tournamentManager.addStage({ divisionId: division.id, name: 'Pool', format: 'RoundRobin' });
    return { id: division.id, stageId: stage.id };
  };

  // ------------------------------------------------------------------------------------------
  // 1. A placeholder is filled in place
  // ------------------------------------------------------------------------------------------

  const open = await makeDivision('Open');
  await tournamentManager.setDivisionEntrants(open.id, [
    { teamId: teams.A, seed: 1 },
    { teamId: teams.B, seed: 2 },
    { label: 'Winner of the qualifier', seed: 3 },
  ]);
  await tournamentManager.generateStageFixtures(open.stageId, 'create');
  const placeholder = (await tournamentManager.getEntrants(open.id)).find(e => !e.teamId)!;
  expect(placeholder.playedCount, 0, 'an entrant that has not played carries playedCount 0');

  const filled = await tournamentManager.replaceEntrant({
    divisionId: open.id,
    entrantId: placeholder.id,
    teamId: teams.E,
  });
  expect([filled.inPlace, filled.entrantId, filled.keptResults], [true, placeholder.id, 0],
    'with nothing played the replacement becomes the entrant — same row, nothing kept aside');
  const openSides = await sides(open.stageId);
  expect(
    openSides.filter(s => s.entrantId === placeholder.id).map(s => s.teamId),
    [teams.E, teams.E],
    'and both of the placeholder\'s fixtures now name the team, without a redraw'
  );
  expect(openSides.length, 6, 'the draw is still the three fixtures it was');

  await expectThrows(
    () => tournamentManager.replaceEntrant({ divisionId: open.id, entrantId: placeholder.id, teamId: teams.A }),
    /already entered/,
    'a team already in the tournament cannot be put in a second place'
  );

  // ------------------------------------------------------------------------------------------
  // 2. A team that has played is replaced: withdrawn, results kept, the rest handed on
  // ------------------------------------------------------------------------------------------

  const pool4 = await makeDivision('Pool of four');
  // A, B and E are in Open; this division uses C, D, and two fresh teams made for it.
  const extra: Record<string, string> = {};
  for (const letter of ['G', 'H']) {
    const teamId = `team-rep-${letter.toLowerCase()}-${stamp}`;
    await query(
      `INSERT INTO teams (id, name, sport_id, org_id, is_active) VALUES ($1, $2, $3, $4, true)`,
      [teamId, `Team ${letter}`, sport.id, created.orgIds[0]]
    );
    created.teamIds.push(teamId);
    extra[letter] = teamId;
  }
  await tournamentManager.setDivisionEntrants(pool4.id, [
    { teamId: teams.C, seed: 1 },
    { teamId: teams.D, seed: 2 },
    { teamId: extra.G, seed: 3 },
    { teamId: extra.H, seed: 4 },
  ]);
  await tournamentManager.generateStageFixtures(pool4.stageId, 'create');
  expect(
    (await tournamentManager.getDivision(pool4.id))?.firstStageId,
    pool4.stageId,
    'a division carries the id of its first stage, so the checklist can find its draw (UI-21)'
  );
  const roster = await tournamentManager.getEntrants(pool4.id);
  const entrantOf = (teamId: string) => roster.find(e => e.teamId === teamId)!.id;
  const [c, d, g, h] = [entrantOf(teams.C), entrantOf(teams.D), entrantOf(extra.G), entrantOf(extra.H)];

  // C plays one fixture and wins it, against D.
  const cVsD = (await sides(pool4.stageId)).filter(s => s.entrantId === c || s.entrantId === d);
  const cdGame = cVsD.find(s => cVsD.filter(o => o.gameId === s.gameId).length === 2)!.gameId;
  await finish(cdGame, c);

  const replaced = await tournamentManager.replaceEntrant({
    divisionId: pool4.id,
    entrantId: c,
    teamId: teams.F,
  });
  expect([replaced.inPlace, replaced.keptResults, replaced.movedFixtures], [false, 1, 2],
    'a team that has played is withdrawn: one result kept, its two unplayed fixtures handed on');
  const afterReplace = await tournamentManager.getEntrants(pool4.id);
  expect(
    [afterReplace.find(e => e.id === c)?.status, afterReplace.find(e => e.id === replaced.entrantId)?.teamId],
    ['withdrawn', teams.F],
    'the old entrant is kept as withdrawn and the new one is Team F'
  );
  const poolSides = await sides(pool4.stageId);
  expect(
    poolSides.filter(s => s.gameId === cdGame).map(s => s.teamId).sort(),
    [teams.C, teams.D].sort(),
    'the played fixture still names Team C — a result is never re-attributed'
  );
  expect(
    poolSides.filter(s => s.status !== 'Finished' && s.entrantId === c).length,
    0,
    'and Team C has no fixtures left to play'
  );

  const table = (await tournamentManager.getStage(pool4.stageId))!.cachedStandings || [];
  const cRow = table.find(r => r.entrantId === c);
  expect(
    [cRow?.withdrawn, cRow?.rank, cRow?.wins, table[table.length - 1]?.entrantId],
    [true, undefined, 1, c],
    'Team C keeps its row with its win, listed last and unranked'
  );
  expect(
    table.filter(r => !r.withdrawn).map(r => r.rank).sort(),
    [1, 1, 1, 4],
    'while the teams still competing are ranked among themselves — D lost 0-10, the rest have not played'
  );

  // ------------------------------------------------------------------------------------------
  // 3. Removed from the roster after playing: withdrawn, not deleted
  // ------------------------------------------------------------------------------------------

  const dGame = poolSides.find(s => s.entrantId === d && s.gameId !== cdGame && s.status !== 'Finished')!.gameId;
  await finish(dGame, d);
  const current = await tournamentManager.getEntrants(pool4.id);
  await tournamentManager.setDivisionEntrants(
    pool4.id,
    current.filter(e => e.id !== d).map(e => ({ id: e.id, teamId: e.teamId, seed: e.seed, status: e.status }))
  );
  // What the SET_DIVISION_ENTRANTS handler does after every roster write.
  await tournamentManager.recalculateDivision(pool4.id);
  const afterRemove = await tournamentManager.getEntrants(pool4.id);
  expect(afterRemove.find(e => e.id === d)?.status, 'withdrawn',
    'taking a team that has played off the roster withdraws it rather than deleting it');
  expect(
    (await sides(pool4.stageId)).filter(s => s.entrantId === d).length,
    3,
    'so its fixtures still point at it — the played ones for the table, the rest to be handed on'
  );
  const tableAfterRemove = (await tournamentManager.getStage(pool4.stageId))!.cachedStandings || [];
  expect(
    tableAfterRemove.filter(r => r.withdrawn).map(r => r.entrantId).sort(),
    [c, d].sort(),
    'both withdrawn teams keep a row in the pool table'
  );

  // The same team can still be entered in another division — the withdrawn row is history.
  const other = await makeDivision('Other');
  await tournamentManager.setDivisionEntrants(other.id, [{ teamId: teams.D, seed: 1 }]);
  expect((await tournamentManager.getEntrants(other.id)).length, 1,
    'a withdrawn row does not count as the team being entered in the tournament');

  // ------------------------------------------------------------------------------------------
  // 4. Swap a late entry into the withdrawn team's remaining fixtures
  // ------------------------------------------------------------------------------------------

  const lateTeam = `team-rep-late-${stamp}`;
  await query(
    `INSERT INTO teams (id, name, sport_id, org_id, is_active) VALUES ($1, 'Late', $2, $3, true)`,
    [lateTeam, sport.id, created.orgIds[1]]
  );
  created.teamIds.push(lateTeam);
  const beforeLate = await tournamentManager.getEntrants(pool4.id);
  await tournamentManager.setDivisionEntrants(pool4.id, [
    ...beforeLate.map(e => ({ id: e.id, teamId: e.teamId, seed: e.seed, status: e.status })),
    { teamId: lateTeam, seed: 9 },
  ]);
  const late = (await tournamentManager.getEntrants(pool4.id)).find(e => e.teamId === lateTeam)!;

  await expectThrows(
    () => tournamentManager.replaceEntrant({ divisionId: pool4.id, entrantId: d, replacementEntrantId: g }),
    /already has fixtures/,
    'an entrant already in the draw cannot take over another team\'s fixtures'
  );
  const swapped = await tournamentManager.replaceEntrant({
    divisionId: pool4.id,
    entrantId: d,
    replacementEntrantId: late.id,
  });
  expect([swapped.entrantId, swapped.movedFixtures, swapped.keptResults], [late.id, 1, 2],
    'the late entry takes D\'s one unplayed fixture; D keeps its two results');
  expect(
    (await sides(pool4.stageId)).filter(s => s.entrantId === late.id).map(s => s.teamId),
    [lateTeam],
    'and that fixture now names the late team'
  );

  // ------------------------------------------------------------------------------------------
  // 4b. Somebody else played one match (FIX-20)
  // ------------------------------------------------------------------------------------------

  const standIn = `team-rep-standin-${stamp}`;
  await query(
    `INSERT INTO teams (id, name, sport_id, org_id, is_active) VALUES ($1, 'Stand-in', $2, $3, true)`,
    [standIn, sport.id, created.orgIds[0]]
  );
  created.teamIds.push(standIn);

  const gSide = (await sides(pool4.stageId)).find(s => s.entrantId === g && s.status !== 'Finished')!;
  await tournamentManager.changeFixtureSide(gSide.participantId, { teamId: standIn });
  await finish(gSide.gameId, g);
  const changedSide = (await sides(pool4.stageId)).find(s => s.participantId === gSide.participantId)!;
  expect([changedSide.entrantId, changedSide.teamId], [g, standIn],
    'changing who played one match changes the team on that side and keeps the entrant');
  const gRow = ((await tournamentManager.getStage(pool4.stageId))!.cachedStandings || []).find(r => r.entrantId === g);
  expect(gRow?.wins, 1, 'so the result still counts for the place in the draw');

  // Every roster save sends every entrant back; that must not undo the one-match change.
  const resend = await tournamentManager.getEntrants(pool4.id);
  await tournamentManager.setDivisionEntrants(
    pool4.id,
    resend.map(e => ({ id: e.id, teamId: e.teamId, seed: e.seed, status: e.status }))
  );
  expect(
    (await sides(pool4.stageId)).find(s => s.participantId === gSide.participantId)?.teamId,
    standIn,
    'and an unchanged roster save leaves it alone'
  );

  await expectThrows(
    () =>
      tournamentManager.setDivisionEntrants(
        pool4.id,
        resend.map(e => ({ id: e.id, teamId: e.id === g ? standIn : e.teamId, seed: e.seed, status: e.status }))
      ),
    /has results/,
    'the roster refuses to change who an entrant is once it has results — that would re-attribute them'
  );
  await expectThrows(
    () => tournamentManager.changeFixtureSide(gSide.participantId, { teamId: standIn }),
    /already down as playing/,
    'changing a side to the team already on it is refused'
  );

  // ------------------------------------------------------------------------------------------
  // 5. A redraw never draws a withdrawn entrant
  // ------------------------------------------------------------------------------------------

  await tournamentManager.generateStageFixtures(pool4.stageId, 'regenerate', true);
  const drawnIds = new Set((await sides(pool4.stageId)).map(s => s.entrantId));
  expect([drawnIds.has(c), drawnIds.has(d)], [false, false], 'regenerating leaves both withdrawn teams out');
  expect(drawnIds.size, 4, 'and draws the four still competing: G, H, F and the late entry');

  if (failures.length) {
    console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS — ${checks} replacement and withdrawal checks.`);
  }
}

async function cleanup() {
  for (const id of created.eventIds) await query(`DELETE FROM events WHERE id = $1`, [id]);
  for (const id of created.teamIds) await query(`DELETE FROM teams WHERE id = $1`, [id]);
  for (const id of created.orgIds) await query(`DELETE FROM organizations WHERE id = $1`, [id]);
}

main()
  .catch(err => {
    console.error(err.stack || err.message || err);
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
