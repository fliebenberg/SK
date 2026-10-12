import { CalendarDate } from './calendarDate';
import { SportSettings } from '../models/sport/Sport';

/**
 * Tournament scheduling (Phase 7): a fixture's length, the window a division plays in each day, the
 * clashes on a day, and the greedy pass that places a division's fixtures.
 *
 * **One copy of the rules, for every caller.** The scheduler on the server, the Schedule tab's
 * warnings and the move sheet's preview all read these functions, so the app can never warn about
 * something the scheduler allowed, or the reverse. Pure functions over plain values: no database,
 * no clock, no timezone — times are **minutes from midnight at the venue**, on a calendar date, and
 * the caller turns them into instants (`zonedInputsToInstant`). That keeps the hard logic testable
 * without a database. Decisions: docs/tournaments-implementation-plan.md, Phase 7.
 */

/** Minutes from midnight, venue time. */
export type DayMinute = number;

/** `HH:MM` → minutes from midnight; null when it is not a time of day. */
export function minuteOfDay(time: string | null | undefined): DayMinute | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes from midnight → `HH:MM`. */
export function timeOfDay(minute: DayMinute): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  const two = (n: number) => (n < 10 ? '0' : '') + n;
  return `${two(Math.floor(m / 60))}:${two(m % 60)}`;
}

/**
 * How long a fixture takes, in whole minutes: periods × period length + the breaks between periods +
 * the extra-time allowance — from the sport, with a game's own number of periods where it has one.
 *
 * **Null when the sport has no game length** (no period length or no number of periods). Scheduling
 * refuses rather than guessing (agreed 2026-10-12): a guessed length produces a schedule nobody
 * asked for, and the fix — setting the sport up in the sport editor — is one the organiser can make.
 */
export function fixtureMinutes(sport: SportSettings | null | undefined, game?: { scheduledPeriods?: number } | null): number | null {
  const periods = game?.scheduledPeriods ?? sport?.scheduledPeriods;
  const periodMS = sport?.periodLengthMS;
  if (!periods || periods < 1 || !periodMS || periodMS <= 0) return null;
  const breakMS = Math.max(0, sport?.breakBetweenPeriodsMS ?? 0);
  const extraMS = Math.max(0, sport?.extraTimeAllowanceMS ?? 0);
  return Math.ceil((periods * periodMS + (periods - 1) * breakMS + extraMS) / 60_000);
}

/** A tournament's playing day: when its first games start and by when its last must end. */
export interface EventDay {
  day: CalendarDate;
  dayStarts: string;
  dayEnds: string;
}

/** Where a division differs from the tournament on one day. A day with no row plays the tournament's hours. */
export interface DivisionDay {
  day: CalendarDate;
  plays: boolean;
  /** Null: the tournament's Day starts. */
  firstGameStart?: string | null;
  /** Null: calculated — the scheduler finishes as early as it can, by the tournament's Day ends. */
  lastGameEnds?: string | null;
}

/** One day a division plays, in minutes. */
export interface DayWindow {
  day: CalendarDate;
  starts: DayMinute;
  ends: DayMinute;
  /** The division set its own end, rather than finishing by the tournament's. */
  endSet: boolean;
}

/**
 * The days a division plays, in date order, each with its window. A division day for a date the
 * tournament does not play is ignored (the database removes those, but a stale client may send one).
 */
export function dayWindows(eventDays: EventDay[], divisionDays: DivisionDay[] = []): DayWindow[] {
  const own = new Map(divisionDays.map(d => [d.day, d]));
  const out: DayWindow[] = [];
  for (const e of [...eventDays].sort((a, b) => a.day.localeCompare(b.day))) {
    const d = own.get(e.day);
    if (d && !d.plays) continue;
    const starts = minuteOfDay(d?.firstGameStart) ?? minuteOfDay(e.dayStarts);
    const setEnd = minuteOfDay(d?.lastGameEnds);
    const ends = setEnd ?? minuteOfDay(e.dayEnds);
    if (starts == null || ends == null || ends <= starts) continue;
    out.push({ day: e.day, starts, ends, endSet: setEnd != null });
  }
  return out;
}

/**
 * A fixture on a facility at a time — the scheduler's own placings, other divisions', other events'
 * at the venue. `competitors` are whatever identifies a side (entrant, else team): two bookings
 * sharing one are the same team. `gap` and `teamBreak` are its division's (0 for another event's).
 */
export interface Booking {
  id: string;
  day: CalendarDate;
  facilityId: string;
  start: DayMinute;
  minutes: number;
  competitors: string[];
  gap?: number;
  teamBreak?: number;
  /** When its day ends for it (the division's window); past this is a clash. Absent: not checked. */
  dayEnds?: DayMinute;
  /** For messages: the division's or the event's name. */
  label?: string;
}

/** Facilities that share ground (D34): each facility → those it overlaps. Symmetric, not transitive. */
export type SharedGround = Record<string, string[]>;

/** Build the two-way map from pairs stored once each. */
export function sharedGroundMap(pairs: Array<[string, string]>): SharedGround {
  const map: SharedGround = {};
  for (const [a, b] of pairs) {
    if (a === b) continue;
    if ((map[a] = map[a] || []).indexOf(b) < 0) map[a].push(b);
    if ((map[b] = map[b] || []).indexOf(a) < 0) map[b].push(a);
  }
  return map;
}

export type ClashKind = 'facility' | 'sharedGround' | 'gap' | 'teamAtOnce' | 'teamBreak' | 'afterDayEnd';

export interface Clash {
  kind: ClashKind;
  /** The bookings involved: two, or one for `afterDayEnd`. */
  ids: string[];
  day: CalendarDate;
  /** When it starts to matter: the later start of the two, or the fixture's own. */
  at: DayMinute;
  facilityIds: string[];
  /** The team, for the two team kinds. */
  competitor?: string;
  /** The minutes there are, against the minutes wanted — for `gap` and `teamBreak`. */
  minutesBetween?: number;
  minutesWanted?: number;
}

const endOf = (b: Booking) => b.start + b.minutes;
const shares = (ground: SharedGround, a: string, b: string) => (ground[a] || []).indexOf(b) >= 0;

/**
 * Every clash among the bookings. **Warnings, never refusals** (U26): the organisers often know
 * something the app does not, so nothing here stops a move — it says what the move costs.
 *
 * - `facility` — one facility, two games at once.
 * - `sharedGround` — two facilities on the same ground (D34) in use at once.
 * - `gap` — one facility, less than *Between games* between two games (the larger of their gaps).
 *   Warned because the gap was set for a reason (agreed 2026-10-12).
 * - `teamAtOnce` — one team in two games at once.
 * - `teamBreak` — one team with less than its minimum break between two games.
 * - `afterDayEnd` — a game finishing after its day ends.
 */
export function findClashes(bookings: Booking[], sharedGround: SharedGround = {}): Clash[] {
  const out: Clash[] = [];
  const byDay = new Map<CalendarDate, Booking[]>();
  for (const b of bookings) (byDay.get(b.day) ?? byDay.set(b.day, []).get(b.day)!).push(b);

  for (const [day, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const p = sorted[i], q = sorted[j];
        const overlap = q.start < endOf(p) && p.start < endOf(q);
        const between = q.start - endOf(p); // q starts no earlier than p
        const at = Math.max(p.start, q.start);
        const ids = [p.id, q.id];

        if (p.facilityId === q.facilityId) {
          const wanted = Math.max(p.gap ?? 0, q.gap ?? 0);
          if (overlap) out.push({ kind: 'facility', ids, day, at, facilityIds: [p.facilityId] });
          else if (between < wanted) out.push({ kind: 'gap', ids, day, at, facilityIds: [p.facilityId], minutesBetween: between, minutesWanted: wanted });
        } else if (overlap && shares(sharedGround, p.facilityId, q.facilityId)) {
          out.push({ kind: 'sharedGround', ids, day, at, facilityIds: [p.facilityId, q.facilityId] });
        }

        for (const c of p.competitors) {
          if (q.competitors.indexOf(c) < 0) continue;
          const wanted = Math.max(p.teamBreak ?? 0, q.teamBreak ?? 0);
          if (overlap) out.push({ kind: 'teamAtOnce', ids, day, at, facilityIds: [p.facilityId, q.facilityId], competitor: c });
          else if (between < wanted) out.push({ kind: 'teamBreak', ids, day, at, facilityIds: [p.facilityId, q.facilityId], competitor: c, minutesBetween: between, minutesWanted: wanted });
        }
      }
    }
    for (const b of sorted) {
      if (b.dayEnds != null && endOf(b) > b.dayEnds) out.push({ kind: 'afterDayEnd', ids: [b.id], day, at: b.start, facilityIds: [b.facilityId] });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.at - b.at);
}

/** A fixture still to place: who plays, in the order it should be played (round order). */
export interface PlanFixture {
  id: string;
  competitors: string[];
}

export interface PlanInput {
  fixtures: PlanFixture[];
  /** The division's playing days, in order (from `dayWindows`). */
  days: DayWindow[];
  /** The facilities it may use, in the order to try them. */
  facilityIds: string[];
  minutes: number;
  gap: number;
  teamBreak: number;
  /** Everything already on the facilities and the teams: kept placings, other divisions, other events. */
  booked: Booking[];
  sharedGround?: SharedGround;
  /** A stage gate (D15): nothing before this day and minute. */
  notBefore?: { day: CalendarDate; minute: DayMinute } | null;
  /** The step the pass moves in. Five minutes, as times are typed. */
  step?: number;
}

export interface PlanResult {
  placed: Array<{ id: string; day: CalendarDate; facilityId: string; start: DayMinute }>;
  /** Placed on the last day after its end, because nothing later had room. Warned, not refused. */
  afterDayEnd: string[];
  /** Could not be placed at all — only when there is no day, no facility, or the last day is full to midnight. */
  unplaced: string[];
}

/**
 * The greedy pass (D14): the division's fixtures in order, one day after another. At each time, each
 * of its facilities that is free takes the first waiting fixture whose teams are free and rested.
 * **No optimiser** — the organisers make it good by hand; this makes it legal.
 *
 * - A facility is free when no booking overlaps the game, none of its shared ground is in use, and
 *   *Between games* is kept either side of anything already on it.
 * - A team is free when it is in no game then and has its minimum break either side.
 * - A game must finish by the day's end. **What does not fit moves to the next playing day**; only on
 *   the **last** day is it placed after the end — reported in `afterDayEnd`, for a warning.
 */
export function planDivision(input: PlanInput): PlanResult {
  const step = input.step ?? 5;
  const ground = input.sharedGround ?? {};
  const booked = [...input.booked];
  const pending = [...input.fixtures];
  const result: PlanResult = { placed: [], afterDayEnd: [], unplaced: [] };
  if (!input.days.length || !input.facilityIds.length || input.minutes <= 0) {
    result.unplaced = pending.map(f => f.id);
    return result;
  }

  const facilityFree = (day: CalendarDate, facilityId: string, start: DayMinute) => {
    const end = start + input.minutes;
    return !booked.some(b => {
      if (b.day !== day) return false;
      if (b.facilityId === facilityId) {
        const gap = Math.max(input.gap, b.gap ?? 0);
        return start < endOf(b) + gap && b.start < end + gap;
      }
      return shares(ground, facilityId, b.facilityId) && start < endOf(b) && b.start < end;
    });
  };
  const teamsFree = (day: CalendarDate, competitors: string[], start: DayMinute) => {
    const end = start + input.minutes;
    return !booked.some(b => {
      if (b.day !== day || !b.competitors.some(c => competitors.indexOf(c) >= 0)) return false;
      const rest = Math.max(input.teamBreak, b.teamBreak ?? 0);
      return start < endOf(b) + rest && b.start < end + rest;
    });
  };
  const place = (f: PlanFixture, day: DayWindow, facilityId: string, start: DayMinute) => {
    booked.push({ id: f.id, day: day.day, facilityId, start, minutes: input.minutes, competitors: f.competitors, gap: input.gap, teamBreak: input.teamBreak, dayEnds: day.ends });
    result.placed.push({ id: f.id, day: day.day, facilityId, start });
  };

  const lastIndex = input.days.length - 1;
  input.days.forEach((day, index) => {
    if (!pending.length) return;
    if (input.notBefore && day.day < input.notBefore.day) return;
    let t = day.starts;
    if (input.notBefore && day.day === input.notBefore.day) t = Math.max(t, Math.ceil(input.notBefore.minute / step) * step);
    // The last day runs on past its end, to midnight, so nothing is left without a time.
    const latestStart = index === lastIndex ? 24 * 60 - input.minutes : day.ends - input.minutes;
    for (; t <= latestStart && pending.length; t += step) {
      for (const facilityId of input.facilityIds) {
        if (!facilityFree(day.day, facilityId, t)) continue;
        const i = pending.findIndex(f => teamsFree(day.day, f.competitors, t));
        if (i < 0) break; // no team is free at t, so no other facility can take anyone either
        const [f] = pending.splice(i, 1);
        place(f, day, facilityId, t);
        if (t + input.minutes > day.ends) result.afterDayEnd.push(f.id);
      }
    }
  });
  result.unplaced = pending.map(f => f.id);
  return result;
}
