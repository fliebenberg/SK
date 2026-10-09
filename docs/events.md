# Fixtures & Events

The events section is being redesigned to the read-first rules in
[okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md) (*Read-first record pages*), after
People ([people.md](file:///c:/Fred/Coding/SK/docs/people.md)), Teams ([teams.md](file:///c:/Fred/Coding/SK/docs/teams.md))
and Sites ([sites.md](file:///c:/Fred/Coding/SK/docs/sites.md)). It is done in stages, agreed 2026-10-04:

1. **The list** — `/admin/[orgId]/events`. **Built 2026-10-04**, below.
2. **The tournament page** — `/admin/[orgId]/events/[eventId]`. **Built 2026-10-04**: its first tab, below (§7).
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
  - **A name that does not fit steps down, never just cut** (2026-10-04): another school's team goes
    "Test Riverbend High School U16 A" → "RBH U16 A" (school code) → "RBH U16A" (and team code) →
    "U16A" (team code alone), and only then is cut short; our own team goes "U16 A" → "U16A". On a
    wide row the two names share the line and the one printing the wider name steps first, so a
    short name is not shortened for a long one; a phone row starts at the codes, each side in its
    own half. The versions are measured, not guessed (`FixtureLine`, `FixtureSideFitted`). The Where
    column is narrow (160px) so the room goes to the names.
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
- **Remembered on this device**: Mine / All, Events / All games, and the filters (per organisation).
  Until someone chooses, Admin and Staff see All and everyone else Mine. The search term and
  Upcoming / Past are not remembered.
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

Orange marks two things only: actions, and a filter (or a search term) that is narrowing the list. A
switch always has one option chosen, so its chosen option is raised and in ink, never orange
(`UI-26`, [design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md)).

## 5. Data and live updates

Two rooms, as before: `org:{id}:events` and `org:{id}:fixtures`. Venues come from `org:{id}:sites` and
`org:{id}:facilities` ([useOrgSites](file:///c:/Fred/Coding/SK/expo-app/hooks/useOrgSites.ts)), so a game
at another organisation's site shows no venue — those are not this organisation's rooms.

**Crests come with the game summary.** Each `GameSummaryParticipant` carries the team's short name and
its organisation's name, logo, logo position and colour (`teamShortName`, `orgName`, `orgLogo`,
`orgLogoConfig`, `orgPrimaryColor`), joined in the one query that builds every summary
(`GAME_SUMMARY_COLUMNS` in [EventManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/EventManager.ts)).
The other side is usually another organisation, whose record the viewer does not hold, and a logo is
a stored file name, so this costs a few bytes a side. A team or organisation edit does not
republish the summaries that name it, so an open list shows the old name or logo until it is
reopened — accepted 2026-10-04 (`LIVE-22`), since they change rarely.

## 6. Not settled here

- Who-played and team changes on a tournament fixture (`FIX-21`) — stage 3.
- Double-booking checks (`FIX-23`).

## 7. The tournament page (stage 2)

[events/[eventId].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/%5BeventId%5D.tsx), with the
first tab in [TournamentHome.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentHome.tsx),
its pieces in [TournamentBits.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentBits.tsx) and its
dialogs in [TournamentDialogs.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentDialogs.tsx).
Agreed on the mockup [tournament-read-first.html](file:///c:/Fred/Coding/SK/mockups/tournament-read-first.html), after three
layouts were compared (option A chosen) and three for Sports & divisions (one sport at a time chosen).

**Three tabs: the first, Schedule, Standings.** The first tab is **Setting up** for an organiser while
the tournament is being set up, and **Overview** once it is — and for everyone else. Its key is still
`setup`, so `?tab=setup` from a division or entrants screen lands on it, and it is the default tab in
every phase. Schedule and Standings are unchanged (division work, stage 4).

**Setting up is the setup itself** — separated from the tournament in time, not on the same page.
Five numbered cards in the order the work is done, each saying in its heading where it stands and
holding what it is about, read-first, with Edit. There is no checklist repeating the cards; it
replaced the U48 checklist, whose rows each opened a step screen (closes `UI-11`).

| Step | Holds | Edited in |
|---|---|---|
| 1 Where | The base site and the facilities it uses, as chips | *Where* dialog (site + `FacilityPicker`) |
| 2 Sports & divisions | One sport at a time (below) | *Sports* dialog; a division's own page |
| 3 Organisations & teams | Warnings, who is not invited yet, then each organisation with its invitation and teams (below) | *Add organisations*, and each organisation's own dialog |
| 4 Rules & scoring | The points; *Confirm* while the default is unconfirmed | *Rules & scoring* dialog |
| 5 Fixtures | Each division and whether it is drawn | Each division's schedule screen |

- **Each step is in one of three states**, shown alike on its segment of the progress bar, its number
  and its pill: **Done** (green, a tick), **In progress** (amber — teams entered with gaps, scoring on
  the unconfirmed default, some divisions drawn) and **Not started** (grey). A dismissible step can
  be marked **Not needed** (`settings.dismissedSetupSteps`), which counts as done. There is no
  *Next* marker (dropped 2026-10-05): the steps are numbered, and the first unfinished one starts
  open. Nothing is faded: a waiting step says so in words (design_system.md).
- **Steps fold.** Finished and waiting steps start as one line with their summary ("Where · Main
  Campus · 5 facilities"); the next step starts open. Any heading opens or closes its step; *Open
  all / Close all*. What is open is remembered on the device per tournament.
- **The name and dates are the banner's**, edited in *Edit tournament*; a tournament has its first
  day from the moment it is created, so there is no setup step for them. Step 1 is the venue only.
- Steps 2 and 4 carry their explanation as text while field help is on (the Sports & divisions one:
  "Choose the sports being played, then the divisions within each. A division is a group of teams
  that compete against each other — usually an age group, e.g. Rugby U16. …").

**Sports & divisions, one sport at a time.** The sports are one line that scrolls sideways and never
wraps — arrows on a wide screen when the sports do not fit, a swipe on a phone — with **All N ▾**
fixed at its end, a list to jump straight to a sport. Under it, only the chosen sport: its name,
divisions and teams, and its divisions as tiles (name, format from its stages, who can play, teams,
and where it has got to) — a single division too, beside the ＋ Add a … division tile. ＋ Add a …
division creates one with an automatic name and opens its page, as the Sports & Divisions screen did;
the sport's ⋯ links to that screen for its organisers, and removes a sport that has no divisions.

**Organisations & teams** (`FIX-26`, agreed 2026-10-05 on `mockups/organisations-teams.html`, option
C of three; built in [OrganisationDialogs.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/OrganisationDialogs.tsx)).
Say *organisations*, never *schools*: clubs take part too.

- **Adding is not inviting.** An organisation is **added** — so the organiser can enter its teams and
  build the tournament — and **invited** when the organiser is ready; until then it cannot see the
  tournament at all (`FIX-29`, okf/database.md). Each has a status, shown as a badge: *Not invited
  yet* (the warning colour), *Invited*, *Accepted*, *Declined*. Inviting only grants visibility for
  now; telling the organisation is the communication work.
- **The step**: a **⚠ N warnings** badge that opens one warning a line, each linking to its fix (a
  division with fewer than two teams, an organisation with no teams, one that has not answered, one
  that declined); a box for those **not invited yet** — "2 not invited yet" and *Invite all 2* on one
  line, "They can't see this tournament until invited" under it; then one row per organisation —
  crest, name, badge, and what it has entered on **one line** that steps down until it fits: every
  sport with its divisions → each sport with its count → "x sports · y teams". Places belonging to
  nobody (*Winner of the regional qualifier*) are listed under *Still to be named*. The action is
  **＋ Add organisation**, in the heading on a wide screen and on the warnings' line on a phone.
- **Add organisations**: a search with ticks, *Register* for one not found, and two buttons — *Add*
  is the main one until any invitation has gone out, *Add and invite* after. *Taken part before* was
  dropped for now.
- **An organisation's page** (tap its row; `events/[eventId]/organisations/[participantOrgId]`) —
  a page, not a dialog (2026-10-08): a link to send to whoever enters an organisation's teams, and
  room for a big club in a big tournament. Option B of two, agreed on the mockup:
  - **The banner**: crest, name, and the status as a full-size badge; the tournament and how much it
    has entered.
  - **The response** has a small card of its own — beside the banner on a wide screen, under it on a
    phone. While there is no answer: *✓ Accepted* / *✕ Declined*, with "Invited Mon 6 Oct by … · they
    can respond, or you can set their response." Once answered, the buttons go and it says who and
    when — "Accepted by Pieter Joubert (Laerskool Waterkloof) · Tue 7 Oct", "… by you", or "Set to
    Accepted by …" when an organiser recorded it — with *Change response* and *Remove from the
    tournament*. Not invited yet: *Invite*. The answer and *Invite* write at once. Who invited and
    who answered are names, so they are read by `get_data` `event_org_history` (organisers only),
    never carried on the event, which goes to a public room.
  - **The teams**: every division, grouped by sport, with its teams as tick chips; **＋ on every
    division** for another of its teams (playing up), a new team (only where this user may create
    one — an unclaimed organisation, or one they run), or a place to be filled later; *＋ Add
    player* in an individual sport; *All divisions / Entered*. Changes collect in the save bar, which
    writes the divisions that changed; unticking a team that has played withdraws it and says so.
  - *Remove from the tournament* confirms, and is refused once any of its teams has played. The ⋯
    menu holds *Nominate a contact* when nobody manages the organisation.
- **Answering and withdrawing** (`FIX-30`, agreed 2026-10-07/08). Statuses: *Not invited yet*,
  *Invited*, *Accepted*, *Declined*, *Withdrawal pending*, *Withdrawn*.
  - **The organisation answers once.** Its members see the invitation in their workspace (an
    *Answer needed* tag in the events list, from the members' room `org:{id}:invitations`, and a box at the top of that list — "1 invitation to answer" — naming each and opening it) and on
    the tournament page ("Valley Prep has invited you", *Accept* / *Decline*, the same card as on its
    page); an admin answers — not staff (`FIX-31`). *Decline* asks first. After that only the organisers
    change it: "To change this, contact Valley Prep."
  - **Declining**, or a confirmed withdrawal, takes its teams out; it stays listed — at the bottom,
    badged — as the record, and is not a warning. The organisers' only action then is *Change
    response*.
  - **Withdrawing**: an organisation that accepted asks, with a reason ("Since your organisation has
    already accepted, Valley Prep will be informed and needs to confirm your withdrawal…"); while
    *Withdrawal pending* nothing changes and it can cancel; the organisers see who asked, when and
    why, and *Confirm withdrawal* or *Keep them in*. A pending withdrawal is a step 3 warning. A
    reason longer than about 120 characters moves the response card under the banner.
  - **Who sees it**: its public lists show the tournament only once it has accepted; its members see
    an invitation, a decline or a withdrawal in the workspace; one that declined or withdrew keeps
    only the public view. The rules are `server/src/managers/eventVisibility.ts`.
  - The organisation's page is open to its own members once it is invited; its teams are read-only
    for them until teams answer for themselves (`FIX-31`).
- **Done** when every organisation has accepted and has at least one entry, none that declined is
  left, and every playing division has two or more entrants — a place to be named counts.
- Entering **by division**, and Replace / Withdraw / Remove, belong to the division page (`FIX-27`);
  a convenor enters teams there.

**The Overview** — once set up, and for anyone who cannot edit: the banner (on the day, "Day 2 of 2 ·
5 live"), **Live now** while games are being played, Sports & divisions (each tile saying where the
division has got to), Organisations, Where with the map, Rules & scoring, and Organisers for an
organiser when there are any. Invitation badges are an organiser's; anyone else sees who is taking
part, without declined organisations. A guest organisation sees its own first. These outside views are accepted for
now and are to be designed properly (`FIX-24`, `FIX-25`).

**The ⋯ menu**: Organisers (appointed in a dialog — most tournaments have none, so no empty card),
Cancel, and Delete, which is disabled with the reason once results are recorded.

**Gone**: the Basic Info and Rules & scoring step screens (`setup/basics`, `setup/scoring`) and the
checklist component. The Sports & Divisions and Fixtures step screens remain, reachable from the
cards, until the drill-down work (`FIX-26`–`FIX-28`) decides their place. The event-level `format` is
no longer shown anywhere on the page: every tournament is created a Festival and the formats live on
each division's stages.

