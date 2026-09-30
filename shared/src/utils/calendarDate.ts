/**
 * The parts of date handling both the server and the app need, and that read no timezone, locale or
 * clock. The policy — three kinds of "when" and why — is the
 * [date-formatting skill](file:///c:/Fred/Coding/SK/.agent/skills/date-formatting/SKILL.md).
 * Everything viewer-dependent (formatting, "today", converting an instant to a form field) lives in
 * `expo-app/utils/dates.ts`, not here.
 */

/**
 * A day on the calendar, with no time of day: `YYYY-MM-DD`. A birthday, the days an event runs, a
 * season's start and end. Stored as a Postgres `DATE` and the same day for every viewer.
 *
 * **Never pass one to `new Date(...)`** — `new Date('2026-09-19')` is midnight UTC, which is the
 * 18th anywhere west of Greenwich.
 */
export type CalendarDate = string;

/**
 * A moment: a full ISO timestamp with `Z`. A kick-off, when an invite was sent. Stored as
 * `TIMESTAMPTZ` and shown in each viewer's own timezone.
 */
export type Instant = string;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The year, month (1–12) and day of a calendar date, or `null` if it is not a real one.
 *
 * Checked by building it in UTC and reading the parts back: `2026-02-30` is date-shaped but rolls
 * over to 2 March, and a value that means another day must not pass as this one.
 */
export function calendarDateParts(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string') return null;
  const match = CALENDAR_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return [year, month, day];
}

/**
 * Is this a complete, real `YYYY-MM-DD`? A `<DatePicker>` is free text on native, so its value
 * passes through every prefix of a date (`2026`, `2026-0`, `2026-09-1`) on the way to one; this is
 * how a form tells "not finished typing" from a date. The server uses it to refuse anything else
 * before Postgres guesses what `01/02/2010` means.
 */
export function isCalendarDate(value: unknown): value is CalendarDate {
  return calendarDateParts(value) !== null;
}

/** `YYYY-MM-DD` from its parts, zero-padded. Month is 1–12. */
export function toCalendarDate(year: number, month: number, day: number): CalendarDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** `padStart` is ES2017, past this package's target library. */
function pad(value: number, width: number): string {
  let text = String(value);
  while (text.length < width) text = `0${text}`;
  return text;
}

/**
 * Shift a calendar date by whole days. Done in UTC, where there is no daylight saving to trip
 * over; a calendar date has no timezone, so any fixed one gives the same answer. `null` for a value
 * that is not a complete date, so a half-typed one cannot silently become a real one.
 */
export function addCalendarDays(value: CalendarDate, days: number): CalendarDate | null {
  const parts = calendarDateParts(value);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return toCalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * A request's calendar-date fields, checked before they reach the database: each named field that
 * is present must be a real `YYYY-MM-DD`, or `null` / absent to leave or clear it. Throws a message
 * a person can read, which the action reply carries back to the screen.
 */
export function assertCalendarDates(data: Record<string, unknown> | null | undefined, fields: Record<string, string>): void {
  if (!data) return;
  for (const field of Object.keys(fields)) {
    const label = fields[field];
    const value = data[field];
    if (value === undefined || value === null) continue;
    if (!isCalendarDate(value)) {
      throw new Error(`${label} must be a date in the form YYYY-MM-DD.`);
    }
  }
}

/**
 * A spreadsheet's date cell, which Excel stores as a count of days, as a calendar date.
 *
 * Counted in UTC from 30 December 1899, the epoch that makes Excel's serials come out right — it
 * treats 1900 as a leap year, so every serial from 61 (1 March 1900) on is one day further along
 * than a true count from 1 January. Serials before that are refused rather than corrected: nobody
 * we record was born in the first two months of 1900. A fraction (a time of day) is dropped.
 * Workbooks saved on the 1904 date system (old Mac Excel) would read four years early; none of
 * ours are, and the template is not.
 */
export function calendarDateFromSpreadsheetSerial(serial: number): CalendarDate | null {
  if (typeof serial !== 'number' || !isFinite(serial) || serial < 61) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return toCalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}
