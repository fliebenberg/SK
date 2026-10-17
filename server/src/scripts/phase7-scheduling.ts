import { APP_TEST_ORG_ID, instantToZonedInputs, minuteOfDay } from '@sk/shared';
import pool, { query } from '../db';
import { setIo } from '../wss/sockets';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { schedulingManager } from '../managers/SchedulingManager';
import { lockForDraw } from './testHelpers/drawLock';

/**
 * Tournaments Phase 7 — scheduling, against a real database.
 *
 * **The phase's exit criterion, executed rather than clicked through:** auto-schedule a
 * three-sport, five-age-group festival — ninety fixtures — across two days and eight facilities;
 * confirm no team is double-booked, no facility hosts two fixtures at once, no fixture runs past its
 * day's end, and a stage's earliest start is respected. Then move one fixture into a clash and
 * confirm it warns, is not blocked, and shows among the day's clashes. For D34: `Field A1` and
 * `Field A2` share ground with `A Field` — declared once from each side — and the scheduler never
 * runs either at the same time as `A Field`, while `A1` and `A2` *do* run together.
 *
 * **The schedule is checked independently of the clash finder.** The scheduler and the Schedule
 * tab share `findClashes`, so asking `findClashes` whether the scheduler did well would be the code
 * marking its own homework. The checks in section 2 re-derive every rule from the rows themselves.
 *
 * Alongside the criterion, what Phase 7 decided (docs/tournaments-implementation-plan.md):
 *  - playing days rewrite the event's dates; a division's own days (not playing, a set end) hold;
 *  - another event's game at the venue is scheduled around;
 *  - a sport with no game length refuses to schedule, and says why;
 *  - *Schedule again* keeps a fixture placed by hand.
 *
 * It leaves the database as it found it. Run: `npx ts-node src/scripts/phase7-scheduling.ts`
 */

let checks = 0;
const failures: string[] = [];
function expect(actual: unknown, expected: unknown, what: string): void {
  checks++;
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}
async function expectThrows(fn: () => Promise<unknown>, matching: RegExp, what: string): Promise<void> {
  checks++;
  try {
    await fn();
    failures.push(`${what}: expected a refusal, but it succeeded`);
  } catch (err: any) {
    const message = String(err?.message || err);
    if (!matching.test(message)) failures.push(`${what}: refused with "${message}", not ${matching}`);
  }
}

const TZ = 'Africa/Johannesburg';
const SAT = '2026-10-17', SUN = '2026-10-18';
const created = { eventIds: [] as string[], teamIds: [] as string[], orgIds: [] as string[], siteIds: [] as string[], facilityIds: [] as string[], sportIds: [] as string[] };

async function main() {
  const stamp = Date.now();
  setIo({ to: () => ({ emit: () => undefined }), sockets: { adapter: { rooms: new Map() } } } as any);
  await query(`INSERT INTO organizations (id, name, short_name, is_claimed, is_active) VALUES ($1, 'App Test Org', 'ATO', false, true) ON CONFLICT (id) DO NOTHING`, [APP_TEST_ORG_ID]);

  // ------------------------------------------------------------------------------------------
  // Sports with known game lengths, a site with eight facilities
  // ------------------------------------------------------------------------------------------
  const MIN = 60_000;
  const sport = async (key: string, name: string, settings: object) => {
    const id = `sport-p7-${key}-${stamp}`;
    await query(`INSERT INTO sports (id, name, default_settings) VALUES ($1, $2, $3)`, [id, name, JSON.stringify(settings)]);
    created.sportIds.push(id);
    return id;
  };
  const NETBALL = await sport('nb', 'P7 Netball', { scheduledPeriods: 2, periodLengthMS: 15 * MIN, breakBetweenPeriodsMS: 5 * MIN }); // 35
  const RUGBY = await sport('rg', 'P7 Rugby', { scheduledPeriods: 2, periodLengthMS: 7 * MIN, breakBetweenPeriodsMS: 2 * MIN });    // 16
  const HOCKEY = await sport('hk', 'P7 Hockey', { scheduledPeriods: 2, periodLengthMS: 12 * MIN, breakBetweenPeriodsMS: 3 * MIN }); // 27
  const UNTIMED = await sport('ut', 'P7 Untimed', {});
  const LENGTH: Record<string, number> = { [NETBALL]: 35, [RUGBY]: 16, [HOCKEY]: 27 };

  const siteId = `site-p7-${stamp}`;
  await query(`INSERT INTO sites (id, name, org_id, timezone) VALUES ($1, 'P7 Campus', $2, $3)`, [siteId, APP_TEST_ORG_ID, TZ]);
  created.siteIds.push(siteId);
  const fac = async (key: string, name: string, sportId: string) => {
    const id = `fac-p7-${key}-${stamp}`;
    await query(`INSERT INTO facilities (id, name, site_id, primary_sport_id) VALUES ($1, $2, $3, $4)`, [id, name, siteId, sportId]);
    await query(`INSERT INTO facility_sports (facility_id, sport_id) VALUES ($1, $2)`, [id, sportId]);
    created.facilityIds.push(id);
    return id;
  };
  const C1 = await fac('c1', 'Court 1', NETBALL), C2 = await fac('c2', 'Court 2', NETBALL), C3 = await fac('c3', 'Court 3', NETBALL);
  const C4 = await fac('c4', 'Court 4', HOCKEY), ASTRO = await fac('astro', 'Astro', HOCKEY);
  const A = await fac('a', 'A Field', RUGBY), A1 = await fac('a1', 'Field A1', RUGBY), A2 = await fac('a2', 'Field A2', RUGBY);
  const NAMES: Record<string, string> = { [C1]: 'Court 1', [C2]: 'Court 2', [C3]: 'Court 3', [C4]: 'Court 4', [ASTRO]: 'Astro', [A]: 'A Field', [A1]: 'Field A1', [A2]: 'Field A2' };

  // D34, declared once from each side: A1 from A1's side, A2 from A Field's.
  await schedulingManager.setSharedGround(A1, [A]);
  await schedulingManager.setSharedGround(A, [A1, A2]);
  expect((await schedulingManager.getSharedGround(A)).sort(), [A1, A2].sort(), 'shared ground reads both ways: A Field shares with A1 and A2');
  expect(await schedulingManager.getSharedGround(A1), [A], 'and A1 with A Field, however it was declared');
  expect(await schedulingManager.getSharedGround(C1), [], 'a court shares with nothing');
  await expectThrows(() => schedulingManager.setSharedGround(A1, ['fac-not-here']), /own site/, 'ground is shared only at one site');

  // ------------------------------------------------------------------------------------------
  // The festival: 4 schools, 3 sports x 5 age groups = 15 divisions, 90 fixtures
  // ------------------------------------------------------------------------------------------
  const schools: string[] = [];
  for (const letter of ['a', 'b', 'c', 'd']) {
    const id = `org-p7-${letter}-${stamp}`;
    await query(`INSERT INTO organizations (id, name, short_name, is_claimed, is_active) VALUES ($1, $2, $3, true, true)`, [id, `P7 School ${letter}`, `P7${letter}`]);
    created.orgIds.push(id); schools.push(id);
  }
  const event = await eventManager.addEvent({
    name: `P7 Festival ${stamp}`, type: 'Tournament', format: 'Festival', startDate: '2026-10-01', siteId,
    orgId: APP_TEST_ORG_ID, sportIds: [NETBALL, RUGBY, HOCKEY], participatingOrgIds: schools, status: 'Scheduled',
  } as any);
  created.eventIds.push(event.id);
  for (const implicit of await tournamentManager.getDivisions(event.id)) await tournamentManager.deleteDivision(implicit.id);
  await tournamentManager.setEventFacilities(event.id, [C1, C2, C3, C4, ASTRO, A, A1, A2]);

  const days = await schedulingManager.setEventDays(event.id, [
    { day: SUN, dayStarts: '08:00', dayEnds: '13:00' },
    { day: SAT, dayStarts: '08:00', dayEnds: '13:00' },
  ]);
  expect(days.map(d => d.day), [SAT, SUN], 'playing days come back in date order');
  const dates = (await query(`SELECT start_date::text AS s, end_date::text AS e FROM events WHERE id = $1`, [event.id])).rows[0];
  expect([dates.s, dates.e], [SAT, SUN], "the event's dates are rewritten from its days");
  await expectThrows(() => schedulingManager.setEventDays(event.id, [{ day: SAT, dayStarts: '13:00', dayEnds: '08:00' }]), /end after it starts/, 'a day that ends before it starts is refused');
  await schedulingManager.setEventScheduling(event.id, { gapBetweenGamesMin: 5, minTeamBreakMin: 10 });

  const AGES = ['u13', 'u14', 'u15', 'u16', 'u17'];
  const divisions: Array<{ id: string; stageId: string; sportId: string; age: string }> = [];
  for (const sportId of [NETBALL, RUGBY, HOCKEY]) {
    for (const age of AGES) {
      const division = await tournamentManager.addDivision({ eventId: event.id, name: `${age} ${sportId.split('-')[2]}`, sportId, weighting: 1 } as any);
      for (const stage of await tournamentManager.getStages(division.id)) await tournamentManager.deleteStage(stage.id);
      const stage = await tournamentManager.addStage({ divisionId: division.id, name: 'Fixtures', format: 'Festival' });
      const teamIds: string[] = [];
      for (const org of schools) {
        const id = `team-p7-${schools.indexOf(org)}-${age}-${sportId.split("-")[2]}-${stamp}`.toLowerCase();
        await query(`INSERT INTO teams (id, name, sport_id, org_id, is_active) VALUES ($1, $2, $3, $4, true)`, [id, `${age}A`, sportId, org]);
        created.teamIds.push(id); teamIds.push(id);
      }
      await tournamentManager.setDivisionEntrants(division.id, teamIds.map((teamId, i) => ({ teamId, seed: i + 1 })));
      await lockForDraw(division.id);
      await tournamentManager.generateStageFixtures(stage.id, 'create');
      divisions.push({ id: division.id, stageId: stage.id, sportId, age });
    }
  }
  const total = (await query(`SELECT count(*)::int AS n FROM games WHERE event_id = $1`, [event.id])).rows[0].n;
  expect(total, 90, 'ninety fixtures, none with a time yet');

  // Rugby: the three youngest on the mini fields, the two oldest on A Field — the shared-ground
  // case. (Three on A Field does not fit: it waits for the minis on Saturday, and with a 10-minute
  // team break eighteen games overrun Sunday — correctly placed late and warned, but not this test.)
  const rugby = divisions.filter(d => d.sportId === RUGBY);
  for (const d of rugby.slice(0, 3)) await tournamentManager.setDivisionFacilities(d.id, [A1, A2]);
  for (const d of rugby.slice(3)) await tournamentManager.setDivisionFacilities(d.id, [A]);
  // Netball u17 does not play Saturday; netball u16 must finish Saturday by 10:00.
  const nb = divisions.filter(d => d.sportId === NETBALL);
  await schedulingManager.setDivisionDays(nb[4].id, [{ day: SAT, plays: false }]);
  await schedulingManager.setDivisionDays(nb[3].id, [{ day: SAT, plays: true, lastGameEnds: '10:00' }]);
  // A stage gate (D15): hockey u17 not before Sunday 09:00.
  const gateDivision = divisions.filter(d => d.sportId === HOCKEY)[4];
  await query(`UPDATE division_stages SET earliest_start = $2 WHERE id = $1`, [gateDivision.stageId, '2026-10-18T07:00:00.000Z']); // 09:00 SAST

  // Another event's game on Court 1, Saturday 08:00–08:35: the tournament must go around it.
  const league = await eventManager.addEvent({ name: `P7 League match ${stamp}`, type: 'SingleMatch', startDate: SAT, orgId: APP_TEST_ORG_ID, status: 'Scheduled' } as any);
  created.eventIds.push(league.id);
  await query(`INSERT INTO games (id, event_id, sport_id, start_time, scheduled_start_time, status, site_id, facility_id) VALUES ($1, $2, $3, $4, $4, 'Scheduled', $5, $6)`,
    [`game-p7-league-${stamp}`, league.id, NETBALL, '2026-10-17T06:00:00.000Z', siteId, C1]);

  // A sport with no game length refuses to schedule, saying why.
  const untimed = await tournamentManager.addDivision({ eventId: event.id, name: 'untimed', sportId: UNTIMED, weighting: 1 } as any);
  await expectThrows(() => schedulingManager.scheduleDivision(untimed.id), /no game length/, 'a sport with no game length refuses to schedule');
  await tournamentManager.deleteDivision(untimed.id);

  // ------------------------------------------------------------------------------------------
  // 1. Schedule all
  // ------------------------------------------------------------------------------------------
  const started = Date.now();
  let placed = 0, late = 0, unplaced = 0;
  for (const d of divisions) {
    const r = await schedulingManager.scheduleDivision(d.id);
    placed += r.placed; late += r.afterDayEnd; unplaced += r.unplaced;
  }
  const took = Date.now() - started;
  expect([placed, late, unplaced], [90, 0, 0], 'all ninety placed, none past a day end, none left over');

  // ------------------------------------------------------------------------------------------
  // 2. The schedule, checked from the rows — not by the clash finder the scheduler shares
  // ------------------------------------------------------------------------------------------
  const rows = (await query(
    `SELECT g.id, g.start_time AS t, g.facility_id AS f, g.placed_by AS "placedBy", ds.division_id AS d, d.sport_id AS s,
            ARRAY(SELECT gp.team_id FROM game_participants gp WHERE gp.game_id = g.id AND gp.team_id IS NOT NULL) AS teams
       FROM games g JOIN division_stages ds ON ds.id = g.stage_id JOIN tournament_divisions d ON d.id = ds.division_id
      WHERE g.event_id = $1`, [event.id])).rows;
  const fx = rows.map((r: any) => {
    const local = instantToZonedInputs(new Date(r.t).toISOString(), TZ)!;
    const start = minuteOfDay(local.time)!;
    return { ...r, day: local.date, start, end: start + LENGTH[r.s] };
  });
  const overlap = (p: any, q: any, pad = 0) => p.day === q.day && p.start < q.end + pad && q.start < p.end + pad;
  const pairs = (pred: (p: any, q: any) => boolean) => {
    const out: string[] = [];
    for (let i = 0; i < fx.length; i++) for (let j = i + 1; j < fx.length; j++) if (pred(fx[i], fx[j])) out.push(`${fx[i].id}/${fx[j].id}`);
    return out;
  };
  expect(fx.every((g: any) => g.placedBy === 'scheduler' && g.f), true, 'every fixture has a facility, placed by the scheduler');
  expect(pairs((p, q) => p.f === q.f && overlap(p, q)), [], 'no facility hosts two fixtures at once');
  expect(pairs((p, q) => p.f === q.f && overlap(p, q, 5)), [], 'and every facility keeps its 5 minutes between games');
  expect(pairs((p, q) => p.teams.some((t: string) => q.teams.includes(t)) && overlap(p, q)), [], 'no team is double-booked');
  expect(pairs((p, q) => p.teams.some((t: string) => q.teams.includes(t)) && overlap(p, q, 10)), [], 'every team gets its 10-minute break');
  const shared = new Set([`${A}|${A1}`, `${A1}|${A}`, `${A}|${A2}`, `${A2}|${A}`]);
  expect(pairs((p, q) => shared.has(`${p.f}|${q.f}`) && overlap(p, q)), [], 'A Field never runs with A1 or A2 (D34), whichever side declared it');
  expect(pairs((p, q) => ((p.f === A1 && q.f === A2) || (p.f === A2 && q.f === A1)) && overlap(p, q)).length > 0, true, 'but A1 and A2 do run together: shared ground is not transitive');
  expect(fx.filter((g: any) => g.start < 8 * 60 || g.end > 13 * 60).map((g: any) => `${NAMES[g.f]} ${g.day} ${g.start}-${g.end} ${divisions.find(d => d.id === g.d)?.age} ${g.s.split('-')[2]}`), [], 'no fixture before 08:00 or ending after 13:00');
  if (process.env.P7_DEBUG) for (const f of [A, A1, A2, C4, ASTRO]) for (const day of [SAT, SUN]) console.log(NAMES[f], day, fx.filter((g: any) => g.f === f && g.day === day).sort((a: any, b: any) => a.start - b.start).map((g: any) => `${g.start}-${g.end}`).join(' '));
  expect(fx.filter((g: any) => g.d === nb[4].id && g.day === SAT).length, 0, 'a division not playing Saturday has nothing on Saturday');
  expect(fx.filter((g: any) => g.d === nb[3].id && g.day === SAT && g.end > 10 * 60).length, 0, "a division's own day end holds");
  expect(fx.filter((g: any) => g.d === gateDivision.id && (g.day === SAT || g.start < 9 * 60)).length, 0, "a stage's earliest start holds (D15)");
  expect(fx.filter((g: any) => g.f === C1 && g.day === SAT && g.start < 8 * 60 + 35 + 5).length, 0, "another event's game on Court 1 is scheduled around");
  const byFacility = Object.fromEntries([...new Set(fx.map((g: any) => g.f))].map(f => [NAMES[f as string], fx.filter((g: any) => g.f === f).length]));
  expect(Object.keys(byFacility).length, 8, 'all eight facilities are used');
  expect(new Set(fx.map((g: any) => g.day)).size, 2, 'across both days');
  expect((await schedulingManager.eventClashes(event.id)).length, 0, "and the Schedule tab's clash check agrees: no clashes");

  // ------------------------------------------------------------------------------------------
  // 3. A move by hand into a clash: warned, not blocked, listed
  // ------------------------------------------------------------------------------------------
  const victim = fx.find((g: any) => g.f === C2)!;
  // A fixture whose teams are free at the victim's time, so the move clashes on the court alone.
  const teamsFreeAt = (g: any, at: any) => !fx.some((o: any) => o.id !== g.id && o.teams.some((t: string) => g.teams.includes(t))
    && o.day === at.day && o.start < at.start + LENGTH[g.s] + 10 && at.start < o.end + 10);
  const mover = fx.find((g: any) => g.f === C3 && g.d !== victim.d && g.s === victim.s && teamsFreeAt(g, victim))!;
  const moved = await schedulingManager.moveFixture(mover.id, new Date(victim.t).toISOString(), C2);
  expect(moved.clashes.map(c => c.kind), ['facility'], 'moving onto a booked court warns of exactly that clash');
  const after = (await query(`SELECT facility_id AS f, start_time AS t, placed_by AS p FROM games WHERE id = $1`, [mover.id])).rows[0];
  expect([after.f, new Date(after.t).toISOString(), after.p], [C2, new Date(victim.t).toISOString(), 'hand'], 'and is not blocked: the fixture moved, marked as placed by hand');
  expect((await schedulingManager.eventClashes(event.id)).some(c => c.kind === 'facility' && c.ids.includes(mover.id)), true, "and it is among the tournament's clashes");
  const venue = await schedulingManager.venueBookings(event.id);
  expect(venue.map(b => b.facilityId), [C1], "the venue's other bookings are offered to the Schedule tab: the league match");

  // Schedule again keeps the hand placing, and re-places the rest.
  const again = await schedulingManager.scheduleDivision(mover.d, { again: true, keepPlacedByHand: true });
  const kept = (await query(`SELECT facility_id AS f, start_time AS t FROM games WHERE id = $1`, [mover.id])).rows[0];
  expect([kept.f, new Date(kept.t).toISOString()], [C2, new Date(victim.t).toISOString()], 'Schedule again keeps a fixture placed by hand');
  expect(again.placed + 1, 6, 'and places the division\'s other five again');

  // Taking a time away.
  await schedulingManager.moveFixture(mover.id, null, null);
  const cleared = (await query(`SELECT start_time AS t, facility_id AS f, placed_by AS p, (custom_settings->>'timeTbd')::boolean AS tbd FROM games WHERE id = $1`, [mover.id])).rows[0];
  expect([cleared.t, cleared.f, cleared.p, cleared.tbd], [null, null, null, true], 'a fixture can have its time taken away');
  const refill = await schedulingManager.scheduleDivision(mover.d);
  expect(refill.placed, 1, 'and scheduling places only the fixture with no time');

  console.log(`Scheduled 90 fixtures in ${took} ms across ${JSON.stringify(byFacility)}`);
}

async function cleanup() {
  for (const id of created.eventIds) await query(`DELETE FROM events WHERE id = $1`, [id]);
  for (const id of created.teamIds) await query(`DELETE FROM teams WHERE id = $1`, [id]);
  for (const id of created.facilityIds) await query(`DELETE FROM facilities WHERE id = $1`, [id]);
  for (const id of created.siteIds) await query(`DELETE FROM sites WHERE id = $1`, [id]);
  for (const id of created.sportIds) await query(`DELETE FROM sports WHERE id = $1`, [id]);
  for (const id of created.orgIds) await query(`DELETE FROM organizations WHERE id = $1`, [id]);
}

main()
  .then(() => {
    if (failures.length) {
      console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
      process.exitCode = 1;
    } else {
      console.log(`PASS — ${checks} checks.`);
    }
  })
  .catch((err) => { console.error(err?.stack || err); process.exitCode = 1; })
  .finally(async () => {
    try { await cleanup(); } catch (err) { console.error('Cleanup failed:', err); }
    await pool.end();
  });
