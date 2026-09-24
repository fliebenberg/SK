/**
 * Saying *when* something is, in words a person reads rather than the string the column stores.
 *
 * The one home for it. Before this existed the app had four renderings of the same idea — the
 * event header printed `startDate.split('T')[0]`, the events list built a range out of
 * `toLocaleDateString` inline, the leagues screen printed a season's dates as raw ISO, and three
 * screens each carried their own copy of a fixture's kick-off formatter. Two of those sat one tap
 * apart and disagreed: the list card read `19 Sep 2026 – 21 Sep 2026` and the detail header behind
 * it read `2026-09-19`.
 *
 * **Two shapes of "when", and they are not the same job.**
 * - A **calendar date** or a range of them — an event, a league season. It has no time of day;
 *   nobody's tournament starts at 00:00. {@link formatDateRange} and {@link dateCountdown}.
 * - A **fixture's kick-off** — an instant, which may be marked TBD. {@link formatFixtureWhen}.
 *
 * **Calendar dates are stored at noon UTC, and that is load-bearing.** The basics step writes
 * `` `${date}T12:00:00.000Z` `` deliberately: midday is far enough from either midnight that no
 * offset from UTC-11 to UTC+11 can drag the timestamp onto the neighbouring day, which is what
 * makes "the 19th" still read as the 19th in Johannesburg, Auckland and Vancouver alike. So a
 * plain `new Date(iso)` read through the local getters is correct here, and anything that *writes*
 * one of these dates must keep the convention.
 *
 * Parsing goes through `new Date` and formatting comes off the `Date` object — never
 * `.split('T')` — which is the rule the
 * [date-formatting skill](file:///c:/Fred/Coding/SK/.agent/skills/date-formatting/SKILL.md)
 * exists to enforce; the skill points back here, and **anything this file does not do yet belongs
 * in this file** rather than inline in a screen, which is how the four renderings happened.
 *
 * **It lives in `expo-app/utils/`, not `shared/`, deliberately.** These functions are
 * viewer-dependent by nature — `formatFixtureWhen` reads the viewer's locale and timezone,
 * `dateCountdown` reads "now" — and the server renders no dates for humans. In `shared/` the
 * server could import them and format a kick-off in the *server's* timezone, which is wrong for
 * every user not sitting in it. It moves only when the server genuinely must render a date for a
 * person, and then only the deterministic calendar parts, taking an explicit timezone. `UI-12`
 * records that reasoning and why `date-fns` is not used here.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local midnight on the calendar date an ISO timestamp falls on, or `null` if it is not one. */
export function parseCalendarDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * Is this picker value a complete calendar date?
 *
 * A `<DatePicker>` is a free-text field on native, so its value passes through every prefix of a
 * date on the way to one — `2026`, `2026-0`, `2026-09-1`. Anything validating or arithmetic-ing a
 * picker value has to know the difference between "not finished typing" and "wrong".
 */
export function isCompleteDateString(value?: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  /* `new Date('2026-02-30T12:00:00')` is a valid Date — it rolls over to 2 March. Reading the
     components back is what separates a date from a date-shaped string that means another day. */
  return (
    parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day
  );
}

/**
 * Shift a `YYYY-MM-DD` picker value by whole days, staying on the local calendar.
 *
 * Built at midday for the same reason everything else here is (see the file comment): a date
 * constructed at midnight and shifted can land on the wrong side of a DST boundary. `null` for a
 * value that is not a complete date, so a caller cannot silently turn a half-typed one into a real
 * one.
 *
 * Note for anything comparing two of these: a zero-padded `YYYY-MM-DD` sorts chronologically as a
 * plain string, so `end <= start` is a correct comparison once {@link isCompleteDateString} has
 * vouched for both — no parsing needed.
 */
export function addDaysToDateString(value: string, days: number): string | null {
  if (!isCompleteDateString(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  startIso?: string | null,
  endIso?: string | null,
  options?: { compact?: boolean }
): string | null {
  const start = parseCalendarDate(startIso);
  if (!start) return null;
  const end = parseCalendarDate(endIso);

  const day = (date: Date) => date.getDate();
  const month = (date: Date) => MONTHS[date.getMonth()];
  const year = (date: Date) => date.getFullYear();

  if (!end || end.getTime() <= start.getTime()) {
    const weekday = options?.compact ? '' : `${DAYS[start.getDay()]} `;
    return `${weekday}${day(start)} ${month(start)} ${year(start)}`;
  }
  if (year(end) !== year(start)) {
    return `${day(start)} ${month(start)} ${year(start)} – ${day(end)} ${month(end)} ${year(end)}`;
  }
  if (end.getMonth() !== start.getMonth()) {
    return `${day(start)} ${month(start)} – ${day(end)} ${month(end)} ${year(start)}`;
  }
  return `${day(start)}–${day(end)} ${month(start)} ${year(start)}`;
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
export function dateCountdown(startIso?: string | null, endIso?: string | null): string | null {
  const start = parseCalendarDate(startIso);
  if (!start) return null;
  const parsedEnd = parseCalendarDate(endIso);
  const end = parsedEnd && parsedEnd.getTime() > start.getTime() ? parsedEnd : start;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const daysToStart = Math.round((start.getTime() - today.getTime()) / MS_PER_DAY);
  const daysSinceEnd = Math.round((today.getTime() - end.getTime()) / MS_PER_DAY);

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
  iso?: string | null,
  options?: { timeTbd?: boolean; separator?: string }
): string {
  if (!iso) return 'Date TBD';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Date TBD';

  const separator = options?.separator ?? '@';
  const dateLabel = date.toLocaleDateString();
  if (options?.timeTbd) return `${dateLabel} ${separator} TBD`;
  return `${dateLabel} ${separator} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/**
 * A moment something happened — "24 Sep 2026, 14:02" — for a record like "invited on". An instant,
 * so it carries the time, in the viewer's timezone.
 */
export function formatInstant(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${time}`;
}

/**
 * Is a person with this birthdate younger than `years` on `today`? An unknown or unreadable
 * birthdate is `false`: the caller is asking whether we *know* they are.
 *
 * A birthdate is a `DATE` column that `pg` hands over as the server's local midnight, so it is
 * read through {@link parseCalendarDate} like every other calendar date here — right while viewer
 * and server share a timezone, a day out otherwise (`DATE-1`).
 */
export function isYoungerThan(birthdate: string | null | undefined, years: number, today: Date = new Date()): boolean {
  const born = parseCalendarDate(birthdate);
  if (!born) return false;
  const comesOfAge = new Date(born.getFullYear() + years, born.getMonth(), born.getDate());
  return today < comesOfAge;
}
