import {
  Booking, Clash, DayWindow, Event, GameSummary, Sport, TournamentDivision, dayWindows, findClashes, fixtureMinutes,
  minuteOfDay, sharedGroundMap,
} from '@sk/shared';
import { instantToVenueInputs, type TimeZone } from '../../utils/dates';

/**
 * The app's side of scheduling (Phase 7): the tournament's fixtures as the bookings `@sk/shared`'s
 * clash check reads — the same check the server's scheduler uses, so a warning here is exactly what
 * the scheduler avoids. Times become venue clock minutes on a calendar date; a fixture with no time
 * or no facility is not a booking.
 */

/** A game the clocks know nothing about: two 40-minute halves, as the server assumes for another event's. */
const UNTIMED_GAME_MINUTES = 80;

/** A fixture with no time or no facility yet — what the tray holds and what keeps Fixtures from done. */
export const isUnscheduled = (g: GameSummary) => g.status !== 'Cancelled' && (!g.startTime || !!g.timeTbd || !g.facilityId);

export interface ScheduleModel {
  bookings: Booking[];
  /** A fixture's length in minutes, from its division's sport (null: the sport has no game length). */
  minutesOf: (g: GameSummary) => number | null;
  windowsOf: (divisionId?: string | null) => DayWindow[];
  /** The fixture's day and start at the venue, when it has a time. */
  placeOf: (g: GameSummary) => { day: string; start: number } | null;
}

export function scheduleModel({ event, divisions, games, sports, timeZone }: {
  event: Event;
  divisions: TournamentDivision[];
  games: GameSummary[];
  sports: Sport[];
  timeZone: TimeZone;
}): ScheduleModel {
  const divisionOf = new Map(divisions.map(d => [d.id, d]));
  const sportOf = new Map(sports.map(s => [s.id, s]));
  const windows = new Map<string, DayWindow[]>();
  const windowsOf = (divisionId?: string | null) => {
    const key = divisionId || '';
    if (!windows.has(key)) windows.set(key, dayWindows(event.days || [], divisionOf.get(key)?.days || []));
    return windows.get(key)!;
  };
  const minutesOf = (g: GameSummary) => {
    const division = g.divisionId ? divisionOf.get(g.divisionId) : undefined;
    const sport = sportOf.get(division?.sportId || g.sportId || '');
    return fixtureMinutes(sport?.defaultSettings as any);
  };
  const placeOf = (g: GameSummary) => {
    if (!g.startTime || g.timeTbd) return null;
    const local = instantToVenueInputs(g.startTime, timeZone);
    const start = local ? minuteOfDay(local.time) : null;
    return local && start != null ? { day: local.date, start } : null;
  };
  const bookings: Booking[] = [];
  for (const g of games) {
    if (g.status === 'Cancelled' || !g.facilityId) continue;
    const at = placeOf(g);
    if (!at) continue;
    const division = g.divisionId ? divisionOf.get(g.divisionId) : undefined;
    bookings.push({
      id: g.id,
      day: at.day,
      facilityId: g.facilityId,
      start: at.start,
      minutes: minutesOf(g) ?? UNTIMED_GAME_MINUTES,
      competitors: (g.participants || []).map(p => p.teamId || (p as any).orgProfileId || p.entrantId).filter(Boolean) as string[],
      gap: division?.gapBetweenGamesMin ?? event.gapBetweenGamesMin ?? 5,
      teamBreak: division?.minTeamBreakMin ?? event.minTeamBreakMin ?? 0,
      dayEnds: windowsOf(g.divisionId).find(w => w.day === at.day)?.ends,
      label: division?.name,
    });
  }
  return { bookings, minutesOf, windowsOf, placeOf };
}

/** Every clash in the tournament, with other events' bookings at its facilities and its shared ground. */
export function scheduleClashes(model: ScheduleModel, extra: { bookings?: Booking[]; sharedGround?: Array<[string, string]> } = {}): Clash[] {
  return findClashes([...model.bookings, ...(extra.bookings || [])], sharedGroundMap(extra.sharedGround || []));
}

/** How many of each division's fixtures run past their day's end — the warning a division's state carries. */
export function afterDayEndByDivision(model: ScheduleModel, games: GameSummary[]): Map<string, number> {
  const divisionOfGame = new Map(games.map(g => [g.id, g.divisionId || '']));
  const out = new Map<string, number>();
  for (const c of findClashes(model.bookings)) {
    if (c.kind !== 'afterDayEnd') continue;
    const d = divisionOfGame.get(c.ids[0]);
    if (d) out.set(d, (out.get(d) || 0) + 1);
  }
  return out;
}
