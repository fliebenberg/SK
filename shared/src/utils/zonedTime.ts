import { CalendarDate, Instant, calendarDateParts, toCalendarDate } from './calendarDate';

/**
 * Converting between an instant and the date and time a person types **at a venue** (`DATE-2`). A
 * kick-off is typed in the venue's time and shown in each viewer's own, per the
 * [date-formatting skill](file:///c:/Fred/Coding/SK/.agent/skills/date-formatting/SKILL.md).
 *
 * Here and not in `expo-app/utils/dates.ts` because nothing below reads the device: the timezone is
 * a parameter, so the answer is the same on every machine and the tests can pin it. The app wraps
 * these in `dates.ts`, which is where screens get them from.
 *
 * Built on `Intl.DateTimeFormat`'s `timeZone` option alone — no timezone library. Only `format()`
 * is used, and only its digits are read: `formatToParts` and `hourCycle` are newer than some
 * engines the app runs on, and the separators `format()` puts between the numbers vary by engine.
 */

/** An IANA timezone name, e.g. `Africa/Johannesburg`. */
export type TimeZone = string;

/**
 * The timezone of an organisation that predates organisation timezones, and the one the migration
 * gave them all: every organisation then was South African.
 */
export const DEFAULT_TIME_ZONE: TimeZone = 'Africa/Johannesburg';

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** One formatter per timezone: building them is the slow part, and a form converts on every render. */
function formatterFor(timeZone: TimeZone): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Is this a timezone name the engine knows? Unknown names make `Intl` throw. */
export function isTimeZone(value: unknown): value is TimeZone {
  if (typeof value !== 'string' || !value) return false;
  try {
    formatterFor(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The wall-clock year, month (1–12), day, hour and minute of a moment in a timezone.
 *
 * `en-US` writes `MM/DD/YYYY, HH:mm`; the digits are taken in that order and everything between
 * them ignored. An engine that writes midnight as `24` under `hour12: false` is read as `0`.
 */
function wallClock(ms: number, timeZone: TimeZone): [number, number, number, number, number] | null {
  const digits = formatterFor(timeZone).format(new Date(ms)).match(/\d+/g);
  if (!digits || digits.length < 5) return null;
  const [month, day, year, hour, minute] = digits.map(Number);
  return [year, month, day, hour === 24 ? 0 : hour, minute];
}

/** How far a timezone's clock is ahead of UTC at a moment, in milliseconds. */
function offsetAt(ms: number, timeZone: TimeZone): number | null {
  const clock = wallClock(ms, timeZone);
  if (!clock) return null;
  const asIfUtc = Date.UTC(clock[0], clock[1] - 1, clock[2], clock[3], clock[4]);
  // The formatter drops seconds, so compare against the moment rounded down to its minute.
  return asIfUtc - (ms - (((ms % 60000) + 60000) % 60000));
}

let supported: boolean | null = null;

/**
 * Does this engine really convert between timezones? Checked once, against a zone whose offset is
 * not a whole number of hours (India, UTC+5:30), so an engine that ignores `timeZone` and answers in
 * the device's zone — or in UTC — cannot pass by accident.
 */
export function canConvertTimeZones(): boolean {
  if (supported === null) {
    try {
      const clock = wallClock(Date.UTC(2026, 0, 1, 0, 0), 'Asia/Kolkata');
      supported = !!clock && clock.join() === [2026, 1, 1, 5, 30].join();
    } catch {
      supported = false;
    }
  }
  return supported;
}

/**
 * A stored instant as the date and time a person at the venue would read on a clock there: the
 * fields a form is filled with. `null` for a missing or unreadable instant or an unknown timezone.
 */
export function instantToZonedInputs(
  iso: Instant | null | undefined,
  timeZone: TimeZone,
): { date: CalendarDate; time: string } | null {
  if (!iso || !isTimeZone(timeZone)) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const clock = wallClock(ms, timeZone);
  if (!clock) return null;
  return { date: toCalendarDate(clock[0], clock[1], clock[2]), time: `${pad2(clock[3])}:${pad2(clock[4])}` };
}

/**
 * The instant a person means by a date and a time on the venue's clock — or, with no time (`null`),
 * **noon** there that day: the stored form of a kick-off whose time is not set, which the caller
 * marks `timeTbd`.
 *
 * `null` when the date is not complete, the time is not `HH:mm`, or the timezone is unknown, so a
 * half-typed field is never saved as a real kick-off.
 *
 * The offset is looked up twice: once at the typed time read as UTC, which can sit on the other
 * side of a daylight-saving change from the real answer, and again at the answer that gives. A time
 * that does not exist on the venue's clock (the hour skipped when clocks go forward) comes out an
 * hour to one side of it, and one that happens twice (the hour repeated when they go back) as one
 * of the two — which side depends on the zone. Both are real moments, and the form reads back what
 * was stored. Southern Africa has no daylight saving, so neither arises there.
 */
export function zonedInputsToInstant(date: CalendarDate, time: string | null, timeZone: TimeZone): Instant | null {
  const parts = calendarDateParts(date);
  if (!parts || !isTimeZone(timeZone)) return null;
  let hours = 12;
  let minutes = 0;
  if (time !== null) {
    const match = TIME_OF_DAY.exec(time);
    if (!match) return null;
    hours = Number(match[1]);
    minutes = Number(match[2]);
  }
  const asIfUtc = Date.UTC(parts[0], parts[1] - 1, parts[2], hours, minutes);
  const firstOffset = offsetAt(asIfUtc, timeZone);
  if (firstOffset === null) return null;
  let ms = asIfUtc - firstOffset;
  const secondOffset = offsetAt(ms, timeZone);
  if (secondOffset === null) return null;
  if (secondOffset !== firstOffset) ms = asIfUtc - secondOffset;
  return new Date(ms).toISOString();
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
