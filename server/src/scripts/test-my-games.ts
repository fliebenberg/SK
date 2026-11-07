import { MY_GAMES_LIMIT } from '@sk/shared';
import pool, { query } from '../db';
import { homeManager } from '../managers/HomeManager';
import { chooseMyGames, MyGameCandidate } from '../managers/myGames';
import { fixtureIds } from './setup/fixtures/testOrgs';

/**
 * Home's *My games* (`UI-42`, docs/home.md §5): which games it lists, and why.
 *
 *  - The rules, on their own (`chooseMyGames`): the most relevant reason first, at most six, at most
 *    one result and one upcoming game a team, a live game on top of those, a game listed once.
 *  - Each reason against the test organisations, through the real query: an organisation's Admin
 *    gets its teams' games and its Staff do not; an organiser, a sport organiser and a division
 *    convenor get the games they run, and only those.
 *
 * Needs the test organisations as loaded (`npm run db:test-orgs`). The appointments and games it adds
 * are `test-…` and removed at the end, so the database is left as it was found.
 *
 * Run: `npx ts-node src/scripts/test-my-games.ts`
 */

let checks = 0;
const failures: string[] = [];

function expect(actual: unknown, expected: unknown, what: string): void {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

// --- The rules ---------------------------------------------------------------------------------

const DAY = 86400;
const NOW = 1000 * DAY;
const c = (gameId: string, teamId: string, tier: MyGameCandidate['tier'], status: MyGameCandidate['status'], days: number): MyGameCandidate =>
  ({ gameId, teamId, tier, status, at: NOW + days * DAY });

function rules() {
  expect(chooseMyGames([
    c('r1', 'X', 1, 'Finished', -1), c('r2', 'X', 1, 'Finished', -2), c('r3', 'X', 1, 'Finished', -3),
    c('u1', 'X', 1, 'Scheduled', 2), c('u2', 'X', 1, 'Scheduled', 3),
    c('l1', 'X', 1, 'Live', 0),
  ], NOW), ['l1', 'r1', 'u1'], 'a team gives one result and one upcoming game, the closest to now, and a live game on top');

  expect(chooseMyGames([
    c('org', 'O', 3, 'Live', 0), c('run', 'R', 2, 'Scheduled', 1), c('own', 'X', 1, 'Scheduled', 20),
  ], NOW), ['own', 'run', 'org'], 'reasons fill in order, and being live or soon does not jump a reason');

  const many = Array.from({ length: MY_GAMES_LIMIT + 2 }, (_, i) => c(`own${i}`, `T${i}`, 1, 'Scheduled', i + 1));
  expect(chooseMyGames([...many, c('org', 'O', 3, 'Live', 0)], NOW), many.slice(0, MY_GAMES_LIMIT).map(g => g.gameId),
    `at most ${MY_GAMES_LIMIT}, kept for the most relevant reason`);

  expect(chooseMyGames([c('derby', 'X', 1, 'Scheduled', 1), c('derby', 'O', 3, 'Scheduled', 1)], NOW), ['derby'],
    'a game with two of their teams is listed once');

  expect(chooseMyGames([
    c('xo', 'X', 1, 'Scheduled', 1), c('xo', 'O', null, 'Scheduled', 1), c('oz', 'O', 3, 'Scheduled', 2),
  ], NOW), ['xo'], "a listed game uses up the opposition's turn too");

  expect(chooseMyGames([
    c('a', 'X', 1, 'Scheduled', 1), c('a', 'Y', null, 'Scheduled', 1),
    c('b', 'W', 1, 'Scheduled', 2), c('b', 'Y', null, 'Scheduled', 2),
  ], NOW), ['a', 'b'], 'an opponent nobody follows does not stop two of their teams playing it');

  expect(chooseMyGames([c('z', 'Y', null, 'Live', 0)], NOW), [], 'a game with no reason is never listed');
}

// --- Each reason, against the test organisations ----------------------------------------------

const JOHAN = 'fx-user-johan-van-der-merwe';     // Doringkloof's Admin, on no rugby team
const GRAHAM = 'fx-user-graham-hendricks';       // St Aldric's Staff, on no team
const GRAHAM_PROFILE = fixtureIds.profile('sac', 'Graham Hendricks');
const PRIYA = 'fx-user-priya-naidoo';            // Riverbend's Staff, convenes Saturday's Netball U14

const R6 = fixtureIds.game('dkl', 'u16a-r6');    // Doringkloof v St Aldric's, next week
const R7 = fixtureIds.game('dkl', 'u16a-r7');    // Riverbend v Doringkloof, in two weeks
const R8 = fixtureIds.game('dkl', 'u16a-r8');    // Doringkloof v Kwaggafontein, in three weeks

const CONVENED = 'test-my-games-convened';       // in Priya's division, tomorrow
const OTHER_DIVISION = 'test-my-games-other';    // in the next division, tomorrow
const TOO_FAR = 'test-my-games-too-far';         // in Priya's division, past the month
const ADDED = [CONVENED, OTHER_DIVISION, TOO_FAR];

const mine = async (userId: string) => (await homeManager.getMine(userId)).games.map(g => g.id);

async function addGame(id: string, divisionKey: string, days: number, teams: [string, string]) {
  const at = new Date(Date.now() + days * DAY * 1000);
  await query(`INSERT INTO games (id, event_id, sport_id, status, scheduled_start_time, stage_id)
               VALUES ($1, $2, 'netball', 'Scheduled', $3, $4)`,
    [id, fixtureIds.tournament('saturday'), at, fixtureIds.stage('saturday', divisionKey)]);
  for (const [i, team] of teams.entries()) {
    await query(`INSERT INTO game_participants (id, game_id, team_id, sort_order) VALUES ($1, $2, $3, $4)`,
      [`${id}-${i}`, id, team, i]);
  }
}

async function reasons() {
  const fixtures = await query(`SELECT id, event_id AS "eventId" FROM games WHERE id = ANY($1)`, [[R6, R7, R8]]);
  if (fixtures.rows.length !== 3) throw new Error('The test organisations are not loaded: run `npm run db:test-orgs` first.');
  const eventOf = (gameId: string) => fixtures.rows.find((r: any) => r.id === gameId).eventId;

  // An Admin gets their organisation's teams' games; Staff of an organisation do not.
  expect((await mine(JOHAN)).includes(R6), true, "an Admin gets their organisation's team's next game");
  expect(await mine(GRAHAM), [], 'Staff get nothing for their organisation alone');

  // An organiser gets their event's games, and a sport organiser their sport's. One at a time: the
  // three rounds are all Doringkloof U16 A's, which lists only one upcoming game.
  await query(`INSERT INTO event_organizers (event_id, org_profile_id) VALUES ($1, $2)`, [eventOf(R7), GRAHAM_PROFILE]);
  expect(await mine(GRAHAM), [R7], 'an organiser gets the games of the event they run');
  await query(`DELETE FROM event_organizers WHERE org_profile_id = $1`, [GRAHAM_PROFILE]);

  await query(`INSERT INTO event_sport_organizers (event_id, sport_id, org_profile_id) VALUES ($1, 'rugby', $2)`, [eventOf(R8), GRAHAM_PROFILE]);
  await query(`INSERT INTO event_sport_organizers (event_id, sport_id, org_profile_id) VALUES ($1, 'netball', $2)`, [eventOf(R6), GRAHAM_PROFILE]);
  expect(await mine(GRAHAM), [R8], "a sport organiser gets their sport's games, and not another sport's");
  await query(`DELETE FROM event_sport_organizers WHERE org_profile_id = $1`, [GRAHAM_PROFILE]);

  // A convenor gets their division's games in the coming month, and no other division's.
  await addGame(CONVENED, 'netball-u14', 1, [fixtureIds.team('dkl', 'netball-u14a'), fixtureIds.team('sac', 'netball-u14a')]);
  await addGame(OTHER_DIVISION, 'netball-u16', 1, [fixtureIds.team('dkl', 'netball-u16a'), fixtureIds.team('sac', 'netball-u16a')]);
  await addGame(TOO_FAR, 'netball-u14', 40, [fixtureIds.team('rbh', 'netball-u14a'), fixtureIds.team('ksc', 'netball-u14')]);
  const convened = await mine(PRIYA);
  expect(convened.includes(CONVENED), true, "a convenor gets their division's next game");
  expect(convened.includes(OTHER_DIVISION), false, "a convenor does not get another division's games");
  expect(convened.includes(TOO_FAR), false, 'nothing past the coming month is listed');
}

async function main() {
  rules();
  await reasons();
}

async function cleanup() {
  await query(`DELETE FROM game_participants WHERE game_id = ANY($1)`, [ADDED]);
  await query(`DELETE FROM games WHERE id = ANY($1)`, [ADDED]);
  await query(`DELETE FROM event_organizers WHERE org_profile_id = $1`, [GRAHAM_PROFILE]);
  await query(`DELETE FROM event_sport_organizers WHERE org_profile_id = $1`, [GRAHAM_PROFILE]);
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
    console.log(`PASS — ${checks} My games checks.`);
  });
