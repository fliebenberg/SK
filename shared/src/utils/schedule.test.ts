import { describe, expect, it } from 'vitest';
import { Booking, dayWindows, findClashes, fixtureMinutes, minuteOfDay, planDivision, PlanFixture, sharedGroundMap, timeOfDay } from './schedule';

const MIN = 60_000;
const at = (t: string) => minuteOfDay(t)!;
const booking = (id: string, facilityId: string, start: string, minutes: number, competitors: string[] = [], extra: Partial<Booking> = {}): Booking =>
  ({ id, day: '2026-10-17', facilityId, start: at(start), minutes, competitors, ...extra });
/** A round robin's pairings, in round order (circle method). */
const roundRobin = (teams: string[]): PlanFixture[] => {
  const t = [...teams];
  const out: PlanFixture[] = [];
  for (let r = 0; r < t.length - 1; r++) {
    for (let i = 0; i < t.length / 2; i++) out.push({ id: `r${r + 1}-${i}`, competitors: [t[i], t[t.length - 1 - i]] });
    t.splice(1, 0, t.pop()!);
  }
  return out;
};

describe('fixtureMinutes', () => {
  it('adds the periods, the breaks between them and the extra-time allowance', () => {
    // Netball: four 15-minute quarters, three 3-minute breaks, 5 minutes allowed over.
    expect(fixtureMinutes({ scheduledPeriods: 4, periodLengthMS: 15 * MIN, breakBetweenPeriodsMS: 3 * MIN, extraTimeAllowanceMS: 5 * MIN })).toBe(74);
  });
  it('works with no break and no allowance', () => {
    expect(fixtureMinutes({ scheduledPeriods: 2, periodLengthMS: 20 * MIN })).toBe(40);
  });
  it("uses a game's own number of periods where it has one", () => {
    expect(fixtureMinutes({ scheduledPeriods: 2, periodLengthMS: 20 * MIN, breakBetweenPeriodsMS: 5 * MIN }, { scheduledPeriods: 1 })).toBe(20);
  });
  it('is null when the sport has no game length, so scheduling refuses rather than guesses', () => {
    expect(fixtureMinutes({})).toBeNull();
    expect(fixtureMinutes({ scheduledPeriods: 2 })).toBeNull();
    expect(fixtureMinutes(null)).toBeNull();
  });
  it('rounds part minutes up', () => {
    expect(fixtureMinutes({ scheduledPeriods: 2, periodLengthMS: 10.5 * MIN })).toBe(21);
  });
});

describe('minuteOfDay / timeOfDay', () => {
  it('converts both ways', () => {
    expect(minuteOfDay('08:05')).toBe(485);
    expect(timeOfDay(485)).toBe('08:05');
    expect(minuteOfDay('8:05')).toBeNull();
    expect(minuteOfDay(null)).toBeNull();
  });
});

describe('dayWindows', () => {
  const days = [
    { day: '2026-10-24', dayStarts: '08:00', dayEnds: '13:00' },
    { day: '2026-10-17', dayStarts: '08:00', dayEnds: '13:00' },
    { day: '2026-10-31', dayStarts: '09:00', dayEnds: '13:00' },
  ];
  it("gives every tournament day, in date order, when the division follows the tournament", () => {
    expect(dayWindows(days).map(d => [d.day, d.starts, d.ends, d.endSet])).toEqual([
      ['2026-10-17', 480, 780, false], ['2026-10-24', 480, 780, false], ['2026-10-31', 540, 780, false],
    ]);
  });
  it("drops a day the division does not play, and applies its own start and set end", () => {
    const w = dayWindows(days, [
      { day: '2026-10-24', plays: false },
      { day: '2026-10-17', plays: true, firstGameStart: '07:30', lastGameEnds: '11:00' },
    ]);
    expect(w.map(d => [d.day, d.starts, d.ends, d.endSet])).toEqual([['2026-10-17', 450, 660, true], ['2026-10-31', 540, 780, false]]);
  });
  it('ignores a division day the tournament does not play', () => {
    expect(dayWindows(days, [{ day: '2026-11-07', plays: true }])).toHaveLength(3);
  });
});

describe('findClashes', () => {
  it('finds a facility booked twice', () => {
    const c = findClashes([booking('a', 'c3', '09:00', 35), booking('b', 'c3', '09:20', 35)]);
    expect(c.map(x => x.kind)).toEqual(['facility']);
    expect(c[0].at).toBe(at('09:20'));
  });
  it('finds too little time between games on one facility, using the larger gap', () => {
    const c = findClashes([booking('a', 'c3', '09:00', 35, [], { gap: 5 }), booking('b', 'c3', '09:37', 35, [], { gap: 10 })]);
    expect(c).toMatchObject([{ kind: 'gap', minutesBetween: 2, minutesWanted: 10 }]);
  });
  it('keeps quiet when the gap is kept', () => {
    expect(findClashes([booking('a', 'c3', '09:00', 35, [], { gap: 5 }), booking('b', 'c3', '09:40', 35, [], { gap: 5 })])).toEqual([]);
  });
  describe('shared ground (D34)', () => {
    const ground = sharedGroundMap([['af', 'a1'], ['af', 'a2']]);
    it('finds a game on A Field while A1 is in use — whichever side the pair was declared on', () => {
      expect(findClashes([booking('big', 'af', '09:00', 30), booking('mini', 'a1', '09:10', 20)], ground).map(x => x.kind)).toEqual(['sharedGround']);
      expect(findClashes([booking('mini', 'a1', '09:00', 20), booking('big', 'af', '09:10', 30)], sharedGroundMap([['a1', 'af']])).map(x => x.kind)).toEqual(['sharedGround']);
    });
    it('is not transitive: A1 and A2 can run at the same time', () => {
      expect(findClashes([booking('x', 'a1', '09:00', 20), booking('y', 'a2', '09:00', 20)], ground)).toEqual([]);
    });
  });
  it('finds a team in two games at once', () => {
    const c = findClashes([booking('a', 'c1', '09:00', 35, ['vp']), booking('b', 'c2', '09:20', 35, ['vp'])]);
    expect(c).toMatchObject([{ kind: 'teamAtOnce', competitor: 'vp' }]);
  });
  it('finds a team break below the minimum, and none when the minimum is 0', () => {
    const p = booking('a', 'c1', '09:00', 35, ['vp'], { teamBreak: 15 });
    const q = booking('b', 'c2', '09:40', 35, ['vp'], { teamBreak: 15 });
    expect(findClashes([p, q])).toMatchObject([{ kind: 'teamBreak', minutesBetween: 5, minutesWanted: 15 }]);
    expect(findClashes([{ ...p, teamBreak: 0 }, { ...q, teamBreak: 0 }])).toEqual([]);
  });
  it('finds a game ending after its day ends', () => {
    expect(findClashes([booking('a', 'c1', '12:40', 35, [], { dayEnds: at('13:00') })])).toMatchObject([{ kind: 'afterDayEnd', ids: ['a'] }]);
  });
  it('never mixes days', () => {
    expect(findClashes([booking('a', 'c1', '09:00', 35), { ...booking('b', 'c1', '09:00', 35), day: '2026-10-18' }])).toEqual([]);
  });
});

describe('planDivision', () => {
  const sat = { day: '2026-10-17', starts: at('08:00'), ends: at('13:00'), endSet: false };
  const sun = { day: '2026-10-18', starts: at('08:00'), ends: at('13:00'), endSet: false };
  const base = { minutes: 35, gap: 5, teamBreak: 0, booked: [] as Booking[] };
  /** Every placing as a booking, so the result can be checked with the clash finder itself. */
  const asBookings = (r: ReturnType<typeof planDivision>, fixtures: PlanFixture[], minutes: number, extra: Partial<Booking> = {}) =>
    r.placed.map(p => ({ id: p.id, day: p.day, facilityId: p.facilityId, start: p.start, minutes, competitors: fixtures.find(f => f.id === p.id)!.competitors, ...extra }));

  it('places a round robin with no team double-booked and no facility used twice', () => {
    const fixtures = roundRobin(['a', 'b', 'c', 'd', 'e', 'f']);
    const r = planDivision({ ...base, fixtures, days: [sat], facilityIds: ['c1', 'c2', 'c3'] });
    expect(r.placed).toHaveLength(15);
    expect(r.unplaced).toEqual([]);
    expect(findClashes(asBookings(r, fixtures, 35, { gap: 5 }))).toEqual([]);
  });

  it('keeps Between games on each facility', () => {
    const fixtures = roundRobin(['a', 'b', 'c', 'd']);
    const r = planDivision({ ...base, gap: 10, fixtures, days: [sat], facilityIds: ['c1'] });
    const starts = r.placed.map(p => p.start).sort((x, y) => x - y);
    starts.slice(1).forEach((s, i) => expect(s - starts[i]).toBeGreaterThanOrEqual(45));
  });

  it("respects the minimum team break", () => {
    const fixtures = roundRobin(['a', 'b', 'c', 'd']);
    const r = planDivision({ ...base, teamBreak: 30, fixtures, days: [sat], facilityIds: ['c1', 'c2'] });
    expect(findClashes(asBookings(r, fixtures, 35, { teamBreak: 30 }))).toEqual([]);
  });

  it('goes around games already booked by other divisions and other events', () => {
    const fixtures = roundRobin(['a', 'b', 'c', 'd']);
    const booked = [booking('league', 'c1', '08:00', 60), booking('u12', 'c2', '08:00', 35)];
    const r = planDivision({ ...base, fixtures, days: [sat], facilityIds: ['c1', 'c2'], booked });
    const all = [...booked, ...asBookings(r, fixtures, 35)];
    expect(findClashes(all).filter(c => c.kind === 'facility')).toEqual([]);
    expect(r.placed.every(p => p.start >= at('08:40'))).toBe(true);
  });

  it('will not use A Field while A1 is in use, in either direction, but runs A1 and A2 together (D34)', () => {
    const ground = sharedGroundMap([['a1', 'af'], ['af', 'a2']]);
    const onA = planDivision({ ...base, fixtures: [{ id: 'big', competitors: ['x', 'y'] }], days: [sat], facilityIds: ['af'], sharedGround: ground, booked: [booking('mini', 'a1', '08:00', 60)] });
    expect(onA.placed[0].start).toBeGreaterThanOrEqual(at('09:00'));
    const onA1 = planDivision({ ...base, fixtures: [{ id: 'mini', competitors: ['x', 'y'] }], days: [sat], facilityIds: ['a1'], sharedGround: ground, booked: [booking('big', 'af', '08:00', 60)] });
    expect(onA1.placed[0].start).toBeGreaterThanOrEqual(at('09:00'));
    const pair = planDivision({ ...base, fixtures: [{ id: 'p', competitors: ['a', 'b'] }, { id: 'q', competitors: ['c', 'd'] }], days: [sat], facilityIds: ['a1', 'a2'], sharedGround: ground });
    expect(pair.placed.map(p => p.start)).toEqual([at('08:00'), at('08:00')]);
  });

  it('finishes every game by the day end on any day but the last, moving the rest to the next day', () => {
    const fixtures = roundRobin(['a', 'b', 'c', 'd', 'e', 'f']);
    const short = { ...sat, ends: at('10:00') };
    const r = planDivision({ ...base, fixtures, days: [short, sun], facilityIds: ['c1', 'c2'] });
    expect(r.placed.filter(p => p.day === sat.day).every(p => p.start + 35 <= at('10:00'))).toBe(true);
    expect(r.placed.some(p => p.day === sun.day)).toBe(true);
    expect(r.afterDayEnd).toEqual([]);
  });

  it('places what is left after the end of the last day, and says so', () => {
    const fixtures = roundRobin(['a', 'b', 'c', 'd', 'e', 'f']);
    const r = planDivision({ ...base, fixtures, days: [{ ...sat, ends: at('10:00') }], facilityIds: ['c1'] });
    expect(r.placed).toHaveLength(15);
    expect(r.afterDayEnd.length).toBeGreaterThan(0);
    r.afterDayEnd.forEach(id => expect(r.placed.find(p => p.id === id)!.start + 35).toBeGreaterThan(at('10:00')));
  });

  it("does not start before a stage's earliest start (D15)", () => {
    const fixtures = roundRobin(['a', 'b', 'c', 'd']);
    const r = planDivision({ ...base, fixtures, days: [sat, sun], facilityIds: ['c1', 'c2'], notBefore: { day: sat.day, minute: at('11:02') } });
    expect(r.placed.every(p => p.day > sat.day || p.start >= at('11:05'))).toBe(true);
  });

  it('places nothing, and says so, with no day or no facility', () => {
    const fixtures = roundRobin(['a', 'b']);
    expect(planDivision({ ...base, fixtures, days: [], facilityIds: ['c1'] }).unplaced).toEqual(['r1-0']);
    expect(planDivision({ ...base, fixtures, days: [sat], facilityIds: [] }).unplaced).toEqual(['r1-0']);
  });
});
