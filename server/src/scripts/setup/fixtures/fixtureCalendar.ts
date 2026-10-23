/**
 * The fixture calendar. Every event and game in the test data is dated from one Saturday, the
 * **anchor**: the last Saturday before today, in South African time. So whenever the data is loaded
 * it has the same shape — a league over the past weeks, tournaments played on the last three
 * Saturdays, games on the next three, festivals five to seven weeks out — instead of sliding into the
 * past one day at a time.
 *
 * The anchor stays the same from Sunday to Saturday, and is always at least a day ago: a day in
 * week 0 or earlier has been played, a day in week 1 or later is still to come, and nothing in the
 * data falls on today.
 *
 * `FIXTURE_ANCHOR=YYYY-MM-DD` (a Saturday) pins it, to load or check the data exactly as on another
 * week. The e2e global setup pins it for the whole run, so the reset and the tests agree even across
 * midnight on a Saturday.
 *
 * Dates the data does not need to move — when accounts were created, when memberships started,
 * birthdays — stay fixed in `testOrgs.ts`; they only need to stay before the anchor's weeks.
 *
 * This file imports nothing, so the e2e tests can import it as well as the loader.
 */

/** Where the test organisations are, and so whose today the anchor counts from. */
export const FIXTURE_TIME_ZONE = 'Africa/Johannesburg';

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A `YYYY-MM-DD` as a UTC-midnight `Date`: plain calendar arithmetic, with no timezone in it. */
function utcDay(day: string): Date {
    const m = CALENDAR_DATE.exec(day);
    const date = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
        throw new Error(`Not a calendar date: ${day}`);
    }
    return date;
}

/** A calendar date plus a number of days. */
export function addFixtureDays(day: string, days: number): string {
    return new Date(utcDay(day).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Today in South Africa, as `YYYY-MM-DD`. */
export function fixtureToday(now: Date = new Date()): string {
    // en-CA writes dates as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: FIXTURE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The last Saturday before `today` — a week ago when today is a Saturday. */
export function anchorFor(today: string): string {
    const weekday = utcDay(today).getUTCDay(); // Sunday 0 … Saturday 6
    return addFixtureDays(today, -(((weekday + 1) % 7) || 7));
}

function resolveAnchor(): string {
    const pinned = process.env.FIXTURE_ANCHOR;
    if (!pinned) return anchorFor(fixtureToday());
    if (utcDay(pinned).getUTCDay() !== 6) throw new Error(`FIXTURE_ANCHOR must be a Saturday: ${pinned}`);
    return pinned;
}

/** The Saturday this load of the data is dated from. */
export const FIXTURE_ANCHOR = resolveAnchor();

/**
 * The Saturday `week` weeks from the anchor — negative before it — plus `day` days (1 for the
 * Sunday after it). Week 0 is the anchor itself, already played; week 1 is the coming Saturday.
 */
export function fixtureDay(week: number, day = 0): string {
    return addFixtureDays(FIXTURE_ANCHOR, week * 7 + day);
}
