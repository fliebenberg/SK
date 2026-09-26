/**
 * Everything the app does with a date or a time: saying *when* something is in words a person
 * reads, working out "today", and converting between a stored instant and the date and time fields
 * a person types into. Screens do none of this themselves.
 *
 * **The policy is the [date-formatting skill](file:///c:/Fred/Coding/SK/.agent/skills/date-formatting/SKILL.md)
 * — read it first.** In short, there are three kinds of "when", and every bug so far came from
 * handling one as another (DATE-1):
 *
 * - An **instant** (`Instant`, ISO with `Z`) — a kick-off, when an invite was sent. Shown in the
 *   viewer's timezone. Typed in the organiser's, and converted only by {@link instantToLocalInputs}
 *   and {@link localInputsToInstant}.
 * - A **calendar date** (`CalendarDate`, `YYYY-MM-DD`) — a birthday, the days an event runs, a
 *   season. The same day for everyone, so it is formatted from its own year, month and day and
 *   **never passed to `new Date(...)`**, which would read it as midnight UTC.
 * - An **instant whose time is not set** — a TBD kick-off: noon organiser time plus `timeTbd`.
 *
 * **Anything this file does not do yet belongs in it**, not inline in a screen — that is how the
 * app once had four renderings of the same idea, two of them one tap apart and disagreeing.
 * `npm run check:dates` fails on date handling written anywhere else.
 *
 * **It lives in `expo-app/utils/`, not `shared/`, deliberately.** These functions read the viewer's
 * locale, timezone and "now", and the server renders no dates for people; in `shared/` the server
 * could import them and format a kick-off in the *server's* timezone. The deterministic parts both
 * sides need — the types, validation, adding days — are in `@sk/shared`'s `calendarDate.ts` and
 * re-exported here, so a screen has one place to import from.
 */
import {
  addCalendarDays,
  calendarDateParts,
  isCalendarDate,
  toCalendarDate,
  type CalendarDate,
  type Instant,
} from '@sk/shared';

export { addCalendarDays, isCalendarDate, type CalendarDate, type Instant };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------------------------------------
 * Calendar dates
 * --------------------------------------------------------------------------------------------- */

/**
 * A calendar date as a local-midnight `Date`, for arithmetic on the viewer's calendar. `null` for
 * anything that is not a real `YYYY-MM-DD` — including a timestamp, which is an instant and whose
 * day depends on where it is read.
 */
export function parseCalendarDate(value?: CalendarDate | null): Date | null {
  const parts = calendarDateParts(value);
  return parts ? new Date(parts[0], parts[1] - 1, parts[2]) : null;
}

/** The calendar date a `Date` falls on in the viewer's timezone. */
export function calendarDateOf(date: Date): CalendarDate {
  return toCalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Today, on the viewer's calendar. */
export function todayCalendarDate(): CalendarDate {
  return calendarDateOf(new Date());
}

/**
 * The `Date` a native date picker should open on for this value: its day at local noon (midday,
 * so no daylight-saving shift can move it), or today when the field is empty or half-typed.
 */
export function calendarDateForPicker(value?: CalendarDate | null): Date {
  const date = parseCalendarDate(value) ?? new Date();
  date.setHours(12, 0, 0, 0);
  return date;
}

/**
 * Is a date range before, during or after today? Both ends inclusive; an open end means the range
 * is a single day. `null` when the start is not a date.
 */
export function calendarRangeStatus(
  start?: CalendarDate | null,
  end?: CalendarDate | null,
  today: CalendarDate = todayCalendarDate()
): 'before' | 'during' | 'after' | null {
  if (!isCalendarDate(start)) return null;
  const last = isCalendarDate(end) && end > start ? end : start;
  if (today < start) return 'before';
  if (today > last) return 'after';
  return 'during';
}

/**
 * One calendar date — "6 Feb 2010", or with `weekday` "Fri 6 Feb 2010". A birthday has no use for
 * its weekday; a day somebody has to keep free does. `null` when it is not a date.
 */
export function formatCalendarDate(value?: CalendarDate | null, options?: { weekday?: boolean }): string | null {
  const date = parseCalendarDate(value);
  if (!date) return null;
  const weekday = options?.weekday ? `${DAYS[date.getDay()]} ` : '';
  return `${weekday}${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * The date, or the range, as it should be read aloud.
 *
 * One day carries its weekday — "Sat 19 Sep 2026" — because a single-day event is a date somebody
 * has to keep free, and the weekday is half of how they hold it. A range drops the weekdays, which
 * would make it four words longer for no gain, and collapses whatever the two ends share: same
 * month gives `19–21 Sep 2026`, same year `28 Sep – 2 Oct 2026`. Repeating the month and year on
 * both ends of a three-day range is how the events list used to read, and it is noise.
 *
 * `compact` drops the weekday from the single-day form, for a list card that already has a lot on
 * its top line.
 */
export function formatDateRange(
  start?: CalendarDate | null,
  end?: CalendarDate | null,
  options?: { compact?: boolean }
): string | null {
  const first = parseCalendarDate(start);
  if (!first) return null;
  const last = parseCalendarDate(end);

  const day = (date: Date) => date.getDate();
  const month = (date: Date) => MONTHS[date.getMonth()];
  const year = (date: Date) => date.getFullYear();

  if (!last || last.getTime() <= first.getTime()) {
    return formatCalendarDate(start, { weekday: !options?.compact });
  }
  if (year(last) !== year(first)) {
    return `${day(first)} ${month(first)} ${year(first)} – ${day(last)} ${month(last)} ${year(last)}`;
  }
  if (last.getMonth() !== first.getMonth()) {
    return `${day(first)} ${month(first)} – ${day(last)} ${month(last)} ${year(first)}`;
  }
  return `${day(first)}–${day(last)} ${month(first)} ${year(first)}`;
}

/**
 * How far off it is — the half of "when" that a date alone never answers.
 *
 * Something that has started and not finished reads `happening now` rather than a count, because
 * at that point how many days ago it began is not what anybody wants to know. Distances round to
 * the unit somebody would say out loud: days inside a fortnight, then weeks, then months — an
 * organiser opening next season's tournament wants "in 7 months", not "in 214 days".
 *
 * `null` when there is no start date, which is the only case the caller has to render around.
 */
export function dateCountdown(start?: CalendarDate | null, end?: CalendarDate | null): string | null {
  const first = parseCalendarDate(start);
  if (!first) return null;
  const parsedEnd = parseCalendarDate(end);
  const last = parsedEnd && parsedEnd.getTime() > first.getTime() ? parsedEnd : first;

  const today = parseCalendarDate(todayCalendarDate())!;
  const daysToStart = Math.round((first.getTime() - today.getTime()) / MS_PER_DAY);
  const daysSinceEnd = Math.round((today.getTime() - last.getTime()) / MS_PER_DAY);

  if (daysToStart > 0) {
    if (daysToStart === 1) return 'tomorrow';
    if (daysToStart < 14) return `in ${daysToStart} days`;
    if (daysToStart < 60) return `in ${Math.round(daysToStart / 7)} weeks`;
    return `in ${Math.round(daysToStart / 30)} months`;
  }
  if (daysSinceEnd <= 0) return 'happening now';
  if (daysSinceEnd === 1) return 'finished yesterday';
  if (daysSinceEnd < 14) return `finished ${daysSinceEnd} days ago`;
  return 'finished';
}

/* ------------------------------------------------------------------------------------------------
 * Instants
 * --------------------------------------------------------------------------------------------- */

function parseInstant(iso?: Instant | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A stored instant as the date and time fields a person edits, **in their local time**.
 *
 * The one way to fill a form from an instant. Cutting the ISO string instead —
 * `iso.split('T')[1].substring(0, 5)` — gives the **UTC** time: a 14:30 kick-off in Johannesburg
 * showed as 12:30, and saving the form stored 12:30 local, two hours earlier, and two more on every
 * save (DATE-1).
 *
 * "Local" is the device's timezone, which stands in for the organiser's until venues carry one
 * (`DATE-2`); that change belongs here and in {@link localInputsToInstant}, and nowhere else.
 */
export function instantToLocalInputs(iso?: Instant | null): { date: CalendarDate; time: string } | null {
  const date = parseInstant(iso);
  if (!date) return null;
  return { date: calendarDateOf(date), time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}` };
}

/**
 * The instant a person means by a date and a time typed in their local time — or, with no time
 * (`null`), **noon** that day: the stored form of a kick-off whose time is not set yet, which the
 * caller marks `timeTbd`. Noon is as far from either midnight as a time can be, so the day survives
 * being shown to a viewer up to twelve hours away.
 *
 * `null` when the date is not complete or the time is not `HH:mm`, so a half-typed field is never
 * saved as a real kick-off.
 */
export function localInputsToInstant(date: CalendarDate, time: string | null): Instant | null {
  const parts = calendarDateParts(date);
  if (!parts) return null;
  let hours = 12;
  let minutes = 0;
  if (time !== null) {
    const match = TIME_OF_DAY.exec(time);
    if (!match) return null;
    hours = Number(match[1]);
    minutes = Number(match[2]);
  }
  return new Date(parts[0], parts[1] - 1, parts[2], hours, minutes).toISOString();
}

/**
 * Where an instant falls against the viewer's calendar, as a sortable number — or a calendar date's
 * local midnight, for a list that mixes the two (a fixture with no kick-off yet sorts by its
 * event's day). `NaN` when it is neither.
 */
export function whenMs(value?: Instant | CalendarDate | null): number {
  if (!value) return NaN;
  const calendar = parseCalendarDate(value);
  if (calendar) return calendar.getTime();
  return parseInstant(value)?.getTime() ?? NaN;
}

/** Local midnight at the start of the viewer's today, for comparing against {@link whenMs}. */
export function startOfTodayMs(): number {
  return parseCalendarDate(todayCalendarDate())!.getTime();
}

/**
 * A fixture's kick-off: the day it is on, and the time it starts, or that the time is not settled.
 *
 * A **different** job from {@link formatDateRange} and deliberately kept apart from it. This one is
 * an instant rather than a calendar date, so the time of day is the point, and it is rendered
 * through `toLocaleDateString` / `toLocaleTimeString` — a kick-off is read by a parent deciding
 * when to leave the house, and their locale's own ordering is the right one for that.
 *
 * `timeTbd` lives in two places on a game depending on its age (`timeTbd` on the summary,
 * `customSettings.timeTbd` on the record), which is why this takes the flag rather than the game:
 * the three screens that used to hold a copy of this each reached for a different one.
 *
 * `separator` is the one thing the copies genuinely disagreed on — the league screens read
 * `19/09/2026 @ 14:30` and the events list reads `19 Sep 2026 · 14:30`. Both are kept until
 * somebody decides which the app says (`UI-13`); unifying them silently would be a visual change
 * on five screens smuggled in under a refactor.
 */
export function formatFixtureWhen(
  iso?: Instant | null,
  options?: { timeTbd?: boolean; separator?: string }
): string {
  const date = parseInstant(iso);
  if (!date) return 'Date TBD';

  const separator = options?.separator ?? '@';
  const dateLabel = date.toLocaleDateString();
  if (options?.timeTbd) return `${dateLabel} ${separator} TBD`;
  return `${dateLabel} ${separator} ${formatKickoffTime(iso)}`;
}

/** The time of day an instant falls at for the viewer — "14:30". Empty when it is not one. */
export function formatKickoffTime(iso?: Instant | null): string {
  const date = parseInstant(iso);
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** The day an instant falls on for the viewer — "24 Sep 2026". Empty when it is not one. */
export function formatInstantDate(iso?: Instant | null): string {
  const date = parseInstant(iso);
  if (!date) return '';
  return formatCalendarDate(calendarDateOf(date)) ?? '';
}

/**
 * A moment something happened — "24 Sep 2026, 14:02" — for a record like "invited on". An instant,
 * so it carries the time, in the viewer's timezone.
 */
export function formatInstant(iso?: Instant | null): string {
  const date = parseInstant(iso);
  if (!date) return '';
  return `${formatInstantDate(iso)}, ${formatKickoffTime(iso)}`;
}
