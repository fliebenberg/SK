---
description: Standards for handling dates and times — display through the repo's own formatter, store in UTC, and never slice an ISO string.
---

# Date and Time Handling Standards

Times are entered in local time, stored in UTC, and displayed back in local time. Three rules make
that work, and the first one is where every bug has actually come from.

## 1. Displaying dates and times

**NEVER** render a raw ISO string from the database (`2026-09-19`, `2024-02-01T07:00:00.000Z`).

**NEVER** pull a date or time out with string manipulation — `.split('T')[0]`,
`.split('T')[1].substring(0, 5)`. It ignores the timezone offset, so it shows the raw **UTC**
value rather than the viewer's local time, and it puts an ISO value in front of a person.

**ALWAYS** format through [`expo-app/utils/dates.ts`](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts).
Parse to a `Date`, format off the object.

```tsx
import { formatDateRange, dateCountdown, formatFixtureWhen } from '../../utils/dates';

// A calendar date or range — an event, a league season.
formatDateRange(event.startDate, event.endDate);              // "Sat 19 Sep 2026" / "19–21 Sep 2026"
formatDateRange(season.startDate, season.endDate, { compact: true }); // no weekday, for list rows
dateCountdown(event.startDate, event.endDate);                // "in 6 days" / "happening now"

// A fixture's kick-off — an instant, which may be TBD.
formatFixtureWhen(game.scheduledStartTime, { timeTbd: game.timeTbd });
```

### Two shapes of "when", and they are not the same job

- A **calendar date** (event, season) has no time of day. Nobody's tournament starts at 00:00.
- A **fixture's kick-off** is an instant and the time of day is the point.

Keep them apart. A kick-off formatted as a calendar date loses the time; a calendar date formatted
as an instant invents one and invites a timezone bug.

### Need something the file does not do yet?

**Add it to `utils/dates.ts`.** Do not write a formatter inline in a screen. That is not a style
preference — it is the whole reason this rule exists. Before U49 the app had four renderings of
the same idea, two of them one tap apart and disagreeing: the events list card read
`19 Sep 2026 – 21 Sep 2026` while the event screen behind it read `2026-09-19`, the leagues screen
showed a season as `2026-09-19 to 2026-12-15`, and three screens each carried a byte-identical copy
of a kick-off formatter.

### Do not import `date-fns`

It is **not** a dependency of `expo-app`. It is a dependency of
[`client/`](file:///c:/Fred/Coding/SK/client/), which is deprecated and must not be modified — an
earlier version of this skill mandated `date-fns` because it was written while `client/` was the
app, and that made the rule unfollowable for every screen written since. Adding the package is a
decision, not a detail: raise it rather than doing it in passing.

### Where the formatter lives, and when it should move

`expo-app/utils/dates.ts`, **not** `shared/`. The general rule is in
[architecture.md](file:///c:/Fred/Coding/SK/okf/architecture.md): `shared/` is for code genuinely
used by *both* the server and the app, and nothing viewer-dependent may live there. Dates fail that
test twice over — the server renders no dates for humans, and these functions are viewer-dependent
by nature — `formatFixtureWhen` reads the viewer's locale and
timezone, and `dateCountdown` reads "now". In `shared/` the server could import them and format a
kick-off in the *server's* timezone, which is wrong for every user not sitting in it.

Move it to `shared/src/utils/` only when the server genuinely has to render a date for a person —
a notification body, an email, a printable fixture list — and then only the deterministic calendar
parts, with the locale-dependent ones passed an explicit timezone rather than reading the ambient
one. The precedent to copy in that case is
[`fixtureSide.ts`](file:///c:/Fred/Coding/SK/shared/src/utils/fixtureSide.ts), which is shared
precisely because the server and print paths must say what the screen says.

## 2. Calendar dates are stored at noon UTC

Event and season `startDate` / `endDate` are calendar dates, and the screens that write them store
`` `${date}T12:00:00.000Z` `` **deliberately**. Midday is far enough from either midnight that no
offset from UTC-11 to UTC+11 can drag the timestamp onto the neighbouring day, so "the 19th" reads
as the 19th in Johannesburg, Auckland and Vancouver alike.

Anything that writes one of these dates must keep the convention. Anything that reads one may use
local getters, which is what `parseCalendarDate` does. Beware legacy rows written at **midnight**
UTC — those are off by one west of Greenwich, and no formatter can recover the intent.

## 3. Handling "TBD" or empty times

**NEVER** send an empty string `""` to the backend for a Date/Timestamp field. It causes
`invalid input syntax` database errors.

**ALWAYS** send `undefined` (new records) or `null` (updates) to omit or clear the value.

```tsx
startTime: formData.isTbd ? undefined : constructIsoString(formData.startTime)
// or, for an update that must clear it
startTime: formData.isTbd ? (null as any) : constructIsoString(formData.startTime)
```

## 4. Constructing ISO strings for saving

Build `YYYY-MM-DDTHH:mm:00`. JS `Date` parsing treats a string with no `Z` suffix as local time,
which is usually what is intended before sending to a backend that normalises it.

Seeding a date **input** from a stored value is the one place `.split('T')[0]` is correct — a date
picker's value is a `YYYY-MM-DD` string, not something shown to a user as prose. Keep it to that.
