# Fixtures & Events

The events section is being redesigned to the read-first rules in
[okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md) (*Read-first record pages*), after
People ([people.md](file:///c:/Fred/Coding/SK/docs/people.md)), Teams ([teams.md](file:///c:/Fred/Coding/SK/docs/teams.md))
and Sites ([sites.md](file:///c:/Fred/Coding/SK/docs/sites.md)). It is done in stages, agreed 2026-10-04:

1. **The list** — `/admin/[orgId]/events`. **Built 2026-10-04**, below.
2. **The tournament page** — `/admin/[orgId]/events/[eventId]`, with Basic info as cards and dialogs (`UI-11`).
3. **One game page** in place of `games/[gameId]/view` and `edit` (`FIX-21`).
4. Later, if wanted: divisions, entrants and the other setup steps.

**A single match has no event page.** The match *is* the event: its name, date and venue are the
game's, and a page for it would say the same things twice and add a tap. Its row opens the game; the
event page is for tournaments. Until stage 3 lands, a game opens its edit screen for someone who may
edit it and its view screen otherwise, as before, and their view switcher reaches Pick team and Score.

## 1. What changed on the list

The list had Events and Games **tabs**, a row of role chips (Hosting / Convening / Attending) on every
card and as a filter, and eye, pencil, people and trophy buttons on each card. A single match's card
named the teams in Orbitron with no crests. Creating a tournament was a hand-built modal; a delete
confirmation sat in the screen with nothing able to open it.

Now a row opens its page and has no buttons; Pick team and Score are on the game. Tournament creation
is an `EditDialog`. The dead delete confirmation is gone — deleting belongs on the event and game
pages, in their ⋯ menus, as on Teams and Sites.

## 2. The rows

[events/index.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/index.tsx), with the
pieces in [EventBits.tsx](file:///c:/Fred/Coding/SK/expo-app/components/events/EventBits.tsx).

- **A match reads like a fixture.** Both teams, each with its **crest** — the organisation's logo, or a
  shield in its colour when it has none (most), the same mark as the Teams list without the short-name
  band, which is unreadable this small. A side nobody is playing yet (a knockout slot) has a dashed
  crest and its rule, "Pool A winner".
  - **Wide**: full names — our own team by its name ("U16 A"), another organisation's as "Test
    Riverbend High School U16 A" — then the sport, a Where column (site, field), and the time, the
    score with "Full time", "No score", Cancelled, or Live with the score and period.
  - **Phone**: one scoreboard line in **short codes** — `DKL U16A 09:00 SAC U16 A` — home on the left,
    the time or score in the middle, away on the right, and where and the sport underneath. Short
    codes because two school names do not fit on a phone line; a team with no short name uses its
    name.
- **A tournament reads like an event**: a trophy mark, the name, the format and sports, where, and
  how many games — "4 live" and "Day 2 of 3" while it is on, "Finished" once it is past. An editor of
  the hosting organisation sees **No fixtures yet** on one with no games, as a nudge; anybody else
  sees "Fixtures to come".
- **The date tile** is the team and site pages' — weekday, day, month — and a range reads "18–19".
- **Only roles that say something unusual are tagged**: **Away** (another organisation runs it — our
  teams are visiting) and **Convening** (you run a sport or a division of it). Hosting is the normal
  case on your own organisation's list and is not tagged.
- **Cancelled** events stay in place, struck through and tagged.
- An event whose type the app does not recognise is an error row, not a guess (`FIX-1` / U39).
- Kick-offs are written `19 Sep 2026 · 14:30` everywhere in the app (`UI-13`).

## 3. Sections

- **Events, Upcoming**: **On now** (a match being played, or a tournament whose days include today),
  **This week** (today and the six days after), **Later in October** (the rest of this month), then by
  month, with the year when it is not this year's. Soonest first.
- **Events, Past**: by month, most recent first. An event moves to Past only after its last day
  (`FIX-22`).
- **All games**: one section per day — "Today · Sat 4 Oct", "Tomorrow · …" — since a fixtures list is
  read by day. Each row adds what it belongs to: the tournament's name, or **Single match**.

The section helpers are in [utils/dates.ts](file:///c:/Fred/Coding/SK/expo-app/utils/dates.ts)
(`upcomingSection`, `monthSection`, `dayHeading`, `calendarRangeTile`, `instantTile`, `eventDayOfRange`).

## 4. The toolbar, and Mine

- **Search** covers the event's name, both teams (full names and short codes), the site and field, and
  the sport. While it holds a term the box wears the same orange tint as an active filter, because it
  is narrowing the list the same way.
- **Mine / All** is on the page, not behind Filters, so it is plain there are two ways to look: what
  matters to you, or everything the organisation has on. **Mine** is the games of the teams you play
  in, coach or manage, **your children's teams** (as a guardian — `Dependant.teams`), and the events
  you run or convene (the grants room). A small line under the toolbar says what Mine covers, built
  from what applies: "Showing your teams", "Showing your children's teams and what you run".
- **Events / All games** and **Upcoming / Past** are switches beside it. On a phone Mine / All takes
  Upcoming / Past's place, which moves into Filters; the upcoming list ends with **Past events and
  results**, and Past shows as a chip while it is on.
- **Remembered on this device**: Mine / All and Events / All games. Until someone chooses, Admin and
  Staff see All and everyone else Mine.
- **Filters** — one button, a panel (centred on a wide screen, a bottom sheet on a phone) whose
  choices apply as they are made; its button only closes it, saying how many are left ("Show 3
  events"). **Sport** with counts, only when the list has more than one; **Kind** (matches or
  tournaments) in the Events view; **Role** — Hosting, Convening, Away. Several roles widen rather
  than narrow.
- **Every filter that is on is a chip right under the line that sets it**, with ✕ and Clear all, and
  on the same line a count — "5/11 events" — which drops whole to the next line when there is no room.
  The count also shows while searching.
- **New event** (Admin and Staff, as the server's `manage-org` gate) opens a choice of Match — the
  existing new-match screen — or Tournament, a name and a first day in a dialog, after which the new
  tournament's page opens (U45).

Orange marks two things only: actions, and a filter that is narrowing the list. A switch always has
one option chosen, so it is not tinted (`UI-26`).

## 5. Data and live updates

Two rooms, as before: `org:{id}:events` and `org:{id}:fixtures`. Venues come from `org:{id}:sites` and
`org:{id}:facilities` ([useOrgSites](file:///c:/Fred/Coding/SK/expo-app/hooks/useOrgSites.ts)), so a game
at another organisation's site shows no venue — those are not this organisation's rooms.

**Crests come with the game summary.** Each `GameSummaryParticipant` carries the team's short name and
its organisation's name, logo, logo position and colour (`teamShortName`, `orgName`, `orgLogo`,
`orgLogoConfig`, `orgPrimaryColor`), joined in the one query that builds every summary
(`GAME_SUMMARY_COLUMNS` in [EventManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/EventManager.ts)).
The other side is usually another organisation, whose record the viewer does not hold, and a logo is
a stored file name, so this costs a few bytes a side. A team or organisation edit does not yet
republish the summaries that name it (`LIVE-22`), so an open list shows the old name or logo until it
is reopened.

## 6. Not settled here

- Who-played and team changes on a tournament fixture (`FIX-21`) — stage 3.
- Double-booking checks (`FIX-23`).
- The selected-option look of the switches (`UI-26`).
