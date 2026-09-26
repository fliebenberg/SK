---
description: The date and time policy — the three kinds of "when", how each is stored, sent, entered and shown, and why. Read before adding, storing, sending, comparing or displaying any date or time.
---

# Dates and Times

Two requirements drive everything here:

1. **Nothing drifts.** A value saved and loaded any number of times, from any timezone, stays the
   value that was entered.
2. **What a person sees makes sense where they are.** A kick-off shows in the viewer's own clock.
   A birthday is the same day for everybody.

Both have been broken before, the same way: something that was one kind of "when" was handled as
another. `DATE-1` (archived) records the incidents — a birthdate that moved back a day on every
save, and a kick-off that moved back two hours on every save. **So before touching a date, decide
which kind it is.**

## The three kinds

| Kind | Examples | Column | On the wire | Shown |
|---|---|---|---|---|
| **Instant** | a kick-off, when an invite was sent, when a report was filed | `TIMESTAMPTZ` | ISO with `Z` — `2026-09-19T12:30:00.000Z` | in the **viewer's** timezone |
| **Calendar date** | a birthday, the days an event runs, a season's start and end | `DATE` | `YYYY-MM-DD` — `2026-09-19` | the same day for everyone |
| **Instant, time not set** | a fixture whose kick-off is TBD | `TIMESTAMPTZ` at **12:00 organiser time**, plus `timeTbd` | ISO with `Z` | the date, then `TBD` |

**Which kind is it?** Ask: *would two people in different timezones disagree on what time it is?*

- A kick-off is one moment. At 14:30 in Johannesburg it is 13:30 in London, and both of them should
  see their own clock. **Instant.**
- A birthday, or "the tournament is on Saturday the 19th", is not a moment — it starts at
  a different moment in every timezone, and it is still the 19th everywhere. There is no time of day
  to convert, so nothing can move it. **Calendar date.**
- If you are about to invent a time of day to store something (midnight, noon), it is almost
  certainly a calendar date. The one exception is the third kind below.

### Instants

- Stored `TIMESTAMPTZ`. Written with `NOW()` when it is "now" on the server.
- Travel as full ISO strings with `Z`. The `Instant` type in `@sk/shared` names them.
- **Entered in the organiser's local time, shown in the viewer's.** "Organiser's local time" is
  currently the timezone of the device doing the entering — there is no venue or organisation
  timezone yet (`DATE-2`). Every conversion between an instant and a date/time a person typed goes
  through two functions in `utils/dates.ts`, `instantToLocalInputs` and `localInputsToInstant`, so
  that when a venue timezone arrives it is a change in one place.
- **Never fill a form field by cutting up the ISO string.** `iso.split('T')[1].substring(0, 5)` is
  the **UTC** time. Shown in a time field in Johannesburg, a 14:30 kick-off reads 12:30; saved, it
  becomes 12:30 local — two hours earlier, and two more on every save. Use `instantToLocalInputs`.

### Calendar dates

- Stored `DATE`. The server's `pg` driver is told to leave `DATE` as the plain string it is
  ([db.ts](file:///c:/Fred/Coding/SK/server/src/db.ts)); without that it builds a JS `Date` at the
  *server's* midnight, which reaches the app as the previous day in UTC.
- Travel as `YYYY-MM-DD`. The `CalendarDate` type in `@sk/shared` names them.
- **Never pass one through `new Date(...)`** to show or compare it. `new Date('2026-09-19')` is
  **midnight UTC**, which is the 18th anywhere west of Greenwich. Format it from its own year, month
  and day (`formatCalendarDate`, `formatDateRange`); compare two of them as strings — a zero-padded
  `YYYY-MM-DD` sorts chronologically.
- **"Today" is the viewer's today** in the app (`todayCalendarDate()`), and the database's
  `CURRENT_DATE` on the server. The two can disagree around midnight when the viewer is in another
  timezone; nothing that matters depends on that hour.
- The server refuses a calendar date that is not a real `YYYY-MM-DD` (`isCalendarDate` in
  `@sk/shared`). Postgres would otherwise guess what `01/02/2010` means.
- Entered with `<DatePicker>`, never a free `TextInput`.

### Instant, time not set

A fixture can have a day before it has a kick-off. It is still an instant — it will have a time —
so it is stored as one: **12:00 on that day in the organiser's time**, with the `timeTbd` flag set.
Noon is as far from either midnight as a time can be, so the day survives being shown to a viewer
up to twelve hours away; when the organiser knows the real time they set it. Shown as the date and
`TBD` (`formatFixtureWhen(iso, { timeTbd: true })`). `localInputsToInstant(date, null)` builds it.

## Where the code lives

- **[`expo-app/utils/dates.ts`](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts)** — everything
  the app does with a date: formatting, "today", and converting between instants and form fields.
  Screens do not format, parse or build dates themselves. **Anything it does not do yet is added to
  it**, not written inline in a screen: before this rule the app had four renderings of the same
  idea, two of them one tap apart and disagreeing.
- **[`shared/src/utils/calendarDate.ts`](file:///c:/Fred/Coding/SK/shared/src/utils/calendarDate.ts)**
  — the deterministic calendar-date parts both sides need: the types, validation, adding days. Only
  code that reads no timezone, locale or clock goes there (see
  [architecture.md](file:///c:/Fred/Coding/SK/okf/architecture.md) — nothing viewer-dependent in
  `shared/`). The formatters stay in the app: the server renders no dates for people. If it ever
  must (an email, a printable fixture list), the formatter moves with an explicit timezone
  parameter, never the ambient one.
- **`date-fns` is not used.** It is not a dependency of `expo-app`; adding it is a decision to raise,
  not a detail (`UI-12`).

## Enforced by `npm run check:dates`

Run from `expo-app/` before committing client changes. It fails on any of these outside
`utils/dates.ts`:

- `.split('T')`, or slicing a `toISOString()` result
- `toLocaleDateString` / `toLocaleTimeString`
- `getFullYear` / `getMonth` / `getDate` / `getHours` / `getMinutes` — building a date by hand
- a template string passed to `new Date(...)` — building an instant by hand

A line that genuinely needs one of these (a clock reading for a log, say) says why with a
`// dates-ok: <reason>` comment on that line. If you find yourself writing that for a date a person
reads, add a function to `utils/dates.ts` instead.

## Smaller rules

- **An empty date is `null` (update) or `undefined` (new record), never `""`.** An empty string is
  `invalid input syntax` in Postgres.
- **Kick-off formatting has two separators** (`@` and `·`) pending a design call (`UI-13`); pass
  `separator` rather than formatting a kick-off yourself.
- **Server comparisons** use `NOW()` for instants (`end_date > NOW()`) and `CURRENT_DATE` for
  calendar dates (`start_date >= CURRENT_DATE`). Never compare a `DATE` with `NOW()` or a
  `TIMESTAMPTZ` with `CURRENT_DATE` without saying which day boundary you mean.
