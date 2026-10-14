import { query } from '../db';
import pool from '../db';
import { setIo } from '../wss/sockets';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { starterAgeGroupId } from './setup/ageGroupSeed';

/**
 * Head to Head (`H2H-1`) against a real database: the server half of a two-organisation event.
 *
 *  - **Divisions come from the host's teams.** Adding a sport gives a division for every age group
 *    the organising organisation has teams in for it (agreed 2026-10-13).
 *  - **Two organisations, no more.** Adding a third is refused; one that declined frees the place.
 *  - **Automatic pairing** enters both sides' teams of the division's age group and pairs them in
 *    name order, A v A, B v B; a team left over is entered with no game. The other side's teams
 *    start invited. *Pair all* leaves a division that already has games alone.
 *  - **Setting the pairing** keeps a game whose two sides are unchanged, adds new pairs (a team may
 *    play twice) and deletes dropped ones — refused once that game has started, as is pairing again.
 *  - **No format to choose** for a Head to Head's division.
 *
 * Leaves the database as it found it. Run: `npx ts-node src/scripts/test-head-to-head.ts`
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
    if (!matching.test(message)) failures.push(`${what}: refused, but with "${message}" rather than something matching ${matching}`);
  }
}

const created = { eventIds: [] as string[], orgIds: [] as string[], teamIds: [] as string[] };

async function main() {
  const stamp = Date.now();
  setIo({ to: () => ({ emit: () => {} }), sockets: { adapter: { rooms: new Map() } } } as any);

  const sport = (await query(`SELECT id, name FROM sports ORDER BY id LIMIT 1`)).rows[0];
  if (!sport) throw new Error('Need a seeded sport. Run db:setup.');

  const org = async (key: string, name: string) => {
    const id = `org-h2h-${key}-${stamp}`;
    await query(
      `INSERT INTO organizations (id, name, short_name, is_claimed, is_active) VALUES ($1, $2, $3, true, true)`,
      [id, name, `H2${key.toUpperCase()}`]
    );
    created.orgIds.push(id);
    return id;
  };
  const host = await org('h', 'H2H Host');
  const guest = await org('g', 'H2H Guest');
  const third = await org('t', 'H2H Third');

  const team = async (orgId: string, ageGroup: string, name: string) => {
    const id = `team-h2h-${orgId.slice(8, 9)}-${name.toLowerCase()}-${stamp}`;
    await query(
      `INSERT INTO teams (id, name, age_group_id, sport_id, org_id, is_active) VALUES ($1, $2, $3, $4, $5, true)`,
      [id, name, starterAgeGroupId(sport.id, ageGroup), sport.id, orgId]
    );
    created.teamIds.push(id);
    return id;
  };
  // Inserted out of order, so name order is the pairing's doing.
  const hostU13C = await team(host, 'U13', 'U13C');
  const hostU13A = await team(host, 'U13', 'U13A');
  const hostU13B = await team(host, 'U13', 'U13B');
  await team(host, 'U14', 'U14A');
  const guestU13B = await team(guest, 'U13', 'U13B');
  const guestU13A = await team(guest, 'U13', 'U13A');
  await team(guest, 'U14', 'U14B');
  await team(guest, 'U14', 'U14A');
  // The guest's U15 has no host division to play in.
  await team(guest, 'U15', 'U15A');

  // ------------------------------------------------------------------------------------------
  // 1. Created with the guest; divisions from the host's age groups
  // ------------------------------------------------------------------------------------------
  let event = await eventManager.addEvent({
    name: `H2H ${stamp}`, type: 'Tournament', format: 'Dual', startDate: '2026-10-24', orgId: host, sportIds: [sport.id], status: 'Scheduled',
  } as any);
  created.eventIds.push(event.id);
  await tournamentManager.createDivisionsForSports(event as any, [sport.id]);
  const divisions = await tournamentManager.getDivisions(event.id);
  expect(divisions.map(d => [d.name, d.ageGroupId]), [['U13', starterAgeGroupId(sport.id, 'U13')], ['U14', starterAgeGroupId(sport.id, 'U14')]],
    'a sport gives a division for each age group the host has teams in');
  expect((await tournamentManager.getStages(divisions[0].id)).map(s => [s.name, s.format]), [['Games', 'Festival']],
    'each with one stage of games set by hand');
  const [u13, u14] = divisions;

  await expectThrows(() => tournamentManager.pairDualDivisions(event.id), /Choose the organisation/, 'pairing waits for the other organisation');

  event = await eventManager.addEventOrgs(event.id, [guest], false);
  expect(event.participatingOrgs?.find(o => o.id === guest)?.invitation, 'not_invited', 'the guest is added, not yet invited');
  await expectThrows(() => eventManager.addEventOrgs(event.id, [third], false), /two organisations/, 'a third organisation is refused');

  // ------------------------------------------------------------------------------------------
  // 2. Automatic pairing
  // ------------------------------------------------------------------------------------------
  const paired = await tournamentManager.pairDualDivisions(event.id);
  expect(paired.divisions.map(d => [d.games, d.unpaired]), [[2, 1], [1, 1]], 'U13: two games and a team left over; U14: one game and one left over');

  const sides = async (divisionId: string) => {
    const entrants = await tournamentManager.getEntrants(divisionId);
    const games = await tournamentManager.getDivisionGames(divisionId);
    return {
      entrants,
      games,
      pairs: games.map(g => g.participants.map(p => `${p.orgId === host ? 'H' : 'G'}:${p.name}`).join(' v ')).sort(),
    };
  };
  let u13Now = await sides(u13.id);
  expect(u13Now.pairs, ['H:U13A v G:U13A', 'H:U13B v G:U13B'], 'teams are paired in name order, the host first');
  expect(u13Now.entrants.filter(e => e.orgId === guest).map(e => e.status), ['invited', 'invited'], "the other side's teams start invited");
  expect(u13Now.entrants.filter(e => e.orgId === host).map(e => e.status), ['accepted', 'accepted', 'accepted'], "the host's start accepted");
  expect(u13Now.entrants.some(e => e.teamId === hostU13C), true, 'the team left over is entered, with no game');
  expect((await sides(u14.id)).pairs, ['H:U14A v G:U14A'], 'U14 pairs A with A');

  const again = await tournamentManager.pairDualDivisions(event.id);
  expect([again.divisions.length, again.skipped.length], [0, 2], 'pairing all again leaves divisions with games alone');
  expect(!!(await tournamentManager.getDivision(u14.id))?.settings?.pairedAt, true, 'and a paired division is marked so');
  // A division paired once stays the organiser's even with no games left: Pair all must not enter
  // again a team they left out.
  await query(`DELETE FROM games WHERE stage_id IN (SELECT id FROM division_stages WHERE division_id = $1)`, [u14.id]);
  await query(`DELETE FROM division_entrants WHERE division_id = $1`, [u14.id]);
  const afterLeftOut = await tournamentManager.pairDualDivisions(event.id);
  expect(afterLeftOut.skipped.includes(u14.id), true, 'Pair all leaves a paired division whose teams were all left out alone');

  // ------------------------------------------------------------------------------------------
  // 3. Setting the pairing by hand
  // ------------------------------------------------------------------------------------------
  const entrantOf = (teamId: string) => u13Now.entrants.find(e => e.teamId === teamId)!.id;
  const keptIds = u13Now.games.map(g => g.id).sort();
  const set = await tournamentManager.setDualPairing(u13.id, [
    { entrantIds: [entrantOf(hostU13A), entrantOf(guestU13A)] },
    { entrantIds: [entrantOf(hostU13B), entrantOf(guestU13B)] },
    { entrantIds: [entrantOf(hostU13C), entrantOf(guestU13B)] },
  ]);
  expect([set.addedGameIds.length, set.deletedGameIds.length], [1, 0], 'giving the team left over a game adds one and changes nothing else');
  u13Now = await sides(u13.id);
  expect(u13Now.games.filter(g => keptIds.includes(g.id)).length, 2, 'the unchanged games keep their ids, and with them any time and court');
  expect(u13Now.pairs.includes('H:U13C v G:U13B'), true, 'a team may play twice');

  await expectThrows(
    () => tournamentManager.setDualPairing(u13.id, [{ entrantIds: [entrantOf(hostU13A), entrantOf(hostU13B)] }]),
    /one of your teams against one of theirs/,
    'a game between two of the same side is refused'
  );

  const swapped = await tournamentManager.setDualPairing(u13.id, [
    { entrantIds: [entrantOf(hostU13A), entrantOf(guestU13B)] },
    { entrantIds: [entrantOf(hostU13B), entrantOf(guestU13A)] },
  ]);
  expect([swapped.addedGameIds.length, swapped.deletedGameIds.length], [2, 3], 'swapping opponents replaces the games whose sides changed');

  // ------------------------------------------------------------------------------------------
  // 4. Once a game has started
  // ------------------------------------------------------------------------------------------
  const live = (await tournamentManager.getDivisionGames(u13.id))[0];
  await query(`UPDATE games SET status = 'Live' WHERE id = $1`, [live.id]);
  await expectThrows(() => tournamentManager.setDualPairing(u13.id, []), /has started/, 'a started game is not removed by re-pairing');
  await expectThrows(() => tournamentManager.pairDualDivisions(event.id, [u13.id], true), /have started/, 'nor paired again');
  await expectThrows(() => tournamentManager.setDivisionFormat(u14.id, 'RoundRobin'), /no format/, 'a Head to Head division has no format to choose');

  // ------------------------------------------------------------------------------------------
  // 5. A declined guest frees the place
  // ------------------------------------------------------------------------------------------
  await query(`UPDATE event_organizations SET invitation = 'declined' WHERE event_id = $1 AND org_id = $2`, [event.id, guest]);
  event = await eventManager.addEventOrgs(event.id, [third], false);
  expect(event.participatingOrgs?.some(o => o.id === third), true, 'once the guest declined, another organisation can be asked');

  if (failures.length) {
    console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS — ${checks} Head to Head checks.`);
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
