# Fixtures & Events

The events section is being redesigned to the read-first rules in
[okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md) (*Read-first record pages*), after
People ([people.md](file:///c:/Fred/Coding/SK/docs/people.md)), Teams ([teams.md](file:///c:/Fred/Coding/SK/docs/teams.md))
and Sites ([sites.md](file:///c:/Fred/Coding/SK/docs/sites.md)). It is done in stages, agreed 2026-10-04:

1. **The list** — `/admin/[orgId]/events`. **Built 2026-10-04**, below.
2. **The tournament page** — `/admin/[orgId]/events/[eventId]`. **Built 2026-10-04**: its first tab, below (§7).
3. **One game page** in place of `games/[gameId]/view` and `edit` (`FIX-21`). **Built 2026-10-15**, below (§9).
4. **Schedule and Standings** — the tournament page's other two tabs (agreed 2026-10-13 as the next
   step for the proof of concept). The Schedule was rebuilt in tournament Phase 7 and made the place
   to change and add fixtures on 2026-10-16 (design rule 32), and is treated as done, so this stage
   was **Standings**. **Built 2026-10-17**, below (§10). The divisions, entrants and setup steps this
   line once named were done as `FIX-26` to `FIX-31`.

**A Head to Head** (`H2H-1`, 2026-10-13) is the second entry in *New event*, between Match and
Tournament: a tournament between two organisations, on the tournament page with its own cards. Its
decisions are in [tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md) §14.

**A single match has no event page.** The match *is* the event: its name, date and venue are the
game's, and a page for it would say the same things twice and add a tap. Its row opens the game; the
event page is for tournaments. A game opens its page (§9) whoever is looking; what they may do there is
the page's to show. An address for a single match's event page forwards to its game.

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
  Until someone chooses, Admin and Staff see All and everyone else Mine. Mine / All is the same
  choice as the tournament page's *Mine / My organisation / All* (2026-10-17): here My organisation
  shows as All, and tapping All saves All for Admin and Staff and My organisation for anyone else. The search term and
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


## 7. The tournament page (stage 2, redone as cards 2026-10-09)

[events/[eventId].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/%5BeventId%5D.tsx), with the
first tab in [TournamentHome.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentHome.tsx),
its pieces in [TournamentBits.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentBits.tsx), the two
big sections (shared with their full pages) in
[TournamentSections.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentSections.tsx), and its dialogs in
[TournamentDialogs.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentDialogs.tsx).
Stage 2 was agreed on [tournament-read-first.html](file:///c:/Fred/Coding/SK/mockups/tournament-read-first.html) as a
*Setting up* tab of five numbered, folding step cards. On 2026-10-09 the user preferred the division
page's card layout (`FIX-27`) and the page was redone on
[tournament-cards.html](file:///c:/Fred/Coding/SK/mockups/tournament-cards.html): the decisions below.

**Three tabs: Overview, Schedule, Standings.** The first tab is the **Overview** in every phase and
for everyone — there is no separate *Setting up* tab: while the tournament is being set up, the same
cards carry their status. Its key is still `setup`, so `?tab=setup` from a division or entrants screen
lands on it. The Schedule tab is tournament Phase 7's; the Standings tab is stage 4's (§10).

**One page of cards, read first**, as the division page is: a **banner** (name, dates, venue,
sports; Edit), **one strip** for what the tournament needs next, then the cards — two columns on a
wide screen, three once the page is 1200px wide (`LAYOUT.threeColumnsMinWidth`; 2026-10-11), one on
a phone (left column, then right). With three, each big section gets a column of its own —
Sports & divisions, then Organisations & teams, then the small cards — read in the same order.

| Card | Holds | Edited in | Full page |
|---|---|---|---|
| Where | The base site and the facilities it uses, as chips; the map once set up | *Where* dialog (site + `FacilityPicker`) | — |
| Sports & divisions | One sport at a time (below) | *Sports* dialog; a division's own page | `…/sports` |
| Organisations & teams | Warnings, who is not invited yet, then each organisation with its invitation and teams (below) | *Add organisations*; each organisation's page | `…/organisations` |
| Rules & scoring | The scoring system — the points, or *No points* for wins / draws / losses; *Confirm* while the default is unconfirmed | *Rules & scoring* dialog | — |
| Fixtures | While setting up, the divisions still to draw first, then the drawn; once set up, each division; on the day, what is next up | Each division's page | The Schedule tab |

- **While setting up** (an organiser, until every section is finished) each card's heading carries
  its status — **Done** (green), **In progress** (amber — scoring on the unconfirmed default, some
  divisions drawn, organisations still to answer), **Not started** (grey) — and the banner a
  progress bar, "Setting up · 2 of 5 done", with **one segment per card, labelled on a wide screen,
  each a way to its card**. **No section can be marked *Not needed*** (2026-10-10; U17's
  `settings.dismissedSetupSteps` is gone, and events that still carry it are ignored): every
  tournament has teams and fixtures, and a section that may be switched off says so with an option of
  its own — a *None* scoring option is the to-do `SCORE-18`. Nothing is
  faded: a waiting card says so in words (design_system.md).
- **The order stays put while setting up** (2026-10-09: cards moving as they are finished would
  confuse a page that already has a lot on it): Sports & divisions and Organisations & teams on the
  left, Where, When, Rules & scoring, Fixtures and Organisers on the right. **On the day** — any day of the
  tournament, or while a game is live — it rearranges: **Live now** leads, then Sports & divisions
  and Fixtures; Where, Organisations and Rules to the side. For anyone who cannot edit: Sports &
  divisions and Fixtures, then Where, who is taking part, and Rules.
- **On a phone, while setting up, a finished card folds** to its heading and its summary ("Main
  Campus · 5 facilities"); any heading opens or closes its card, remembered on the device per
  tournament. A wide screen does not fold.
- **The strip** names the first unfinished section's most important task, in the order the work is
  done (Where, When, Sports & divisions, Organisations & teams, Rules & scoring, Fixtures), with the one
  button that does it — "2 organisations are not invited yet … *Invite all 2*", and "N more things to
  sort out" linking to the rest. Once set up, a green "Set up and ready." until the first day.
- **Once set up** the statuses and the progress bar go — every card is done, so they would be
  noise — and the Where card gains its map. That is the Overview everyone else sees.
- **Section headings** are larger than the card's contents and on their own line; on a phone the
  status and actions take a second line, on a wider screen they share the title's line when they
  fit and drop under it when they do not, and long action labels shorten first in a narrow card
  ("＋ Add organisation" → "＋ Add"). The rule is design_system.md's *Section headings*.
- **Full pages.** Sports & divisions and Organisations & teams have a heading link — **See all ›**
  (**All ›** on a phone), a link rather than an expand icon, since tapping the heading folds a card
  on a phone — to a page of their own, `events/[eventId]/sports` and `events/[eventId]/organisations`,
  which **show the same things the same way, with more room** (agreed 2026-10-09). Fixtures'
  *Schedule ›* opens the Schedule tab. Where and Rules & scoring are short, and have none.
- **The name is the banner's**, edited in *Edit tournament*, and so are the dates **until the
  tournament has playing days** (Phase 7, 2026-10-11). From then on the dates are the first and last
  playing day — "28 Nov – 5 Dec 2026" whether that is eight days or two — and *Edit tournament* shows
  them read-only, pointing to **When**. Where is the venue only.
- **When** (Phase 7) is its own section and setup step, after Where: each playing day with its hours,
  *Day starts* and *Day ends* — by when the last game must end. Days need not follow each other. Its
  dialog ticks days on a calendar (*Repeat weekly…* ticks a run of them) and has a row per day, with
  a copy button on the first day's row that copies its times to every day. Removing a day that has
  fixtures warns that they stay where they are.
- **Fixtures** ends with the **scheduling gaps** — *Between games* on a facility and the *Minimum team
  break* (0 reads "No minimum team break") — with their own Edit: how the scheduler spaces games, so
  they sit with the fixtures, not under When. **Fixtures is done only once every division is drawn
  and scheduled**: a fixture with no time or no facility keeps it *In progress*, and the strip says
  how many have no time.
- **Running the scheduler** (Phase 7). A division's tile and page say where it stands: *Draw made ·
  not scheduled*, *N fixtures without a time*, *N after the day ends* (placed past its last day's
  end, for want of room) or *Scheduled*. Fixtures offers **Schedule all** while any drawn division has
  fixtures with no time — the divisions listed in an order the organisers change with ▲ ▼, since
  **earlier gets first pick of shared facilities**; divisions with no draw are listed as not
  included — and the result is a line per division. A division's page offers, under its scheduling
  gaps in the Fixtures card, **Schedule** (once drawn; before that a line says fixtures are scheduled
  once the draw is made), then **Schedule again**, which keeps fixtures placed by hand unless unticked; both say what
  they will use first — facilities, days, each game's length, the gaps — with *Change these*. **Make
  the draw** has *Schedule them straight away*, ticked, or unticked with the reason when the
  division cannot be scheduled yet (no playing days, no game length for its sport). Scheduling only
  ever places fixtures with no time.
- **The Schedule tab** (Phase 7; U23–U26, D16, D34). **Wide: a time × facility grid** for one day —
  facilities under their venue, the day's window plain and the time outside it shaded, *Day starts*
  and *Day ends* marked, each fixture coloured by its division and named with its schools' short codes. Fixtures that overlap
  on one facility sit **side by side** (2026-10-16): that column takes the grid's spare width, up
  to about 150px for each, and only where there is not room are they stacked, each set in from
  the one beneath so it stays reachable. **Narrow: a
  list** for the day by start time, each fixture with its division and facility (named with its venue
  when more than one is in play). **Three dropdowns** filter it — Day, Division (grouped by sport, each
  with its colour) and Facility (grouped by venue); a division narrows the grid to its own facilities, any its fixtures were
  moved onto and any sharing ground with them, and the clashes and the tray with it. With a division
  chosen, the Facility dropdown can also show more: *All <sport> facilities* (every tournament
  facility its sport can use), or one at a time under *Also show* (chosen again to hide), beside its
  own — to see where else its games could fit. With a division chosen, **Schedule** (or **Schedule
  again**, once it has times) sits at the right of the toolbar, apart from the filters: the division page's dialog, to plan straight
  into hours just dragged. **Moving**: drag a
  fixture on the web — its top edge lands where it is dropped, snapped to five minutes, with a dashed
  preview of the times and any clash — or tap it for the **move sheet** (day, facility — its division's
  own first, *Other…* for the rest — and start, with *Remove time and court*). A move that clashes is made
  and says so, with **Undo**. What a change did is said in the app's toast (2026-10-16), naming the
  fixture — *Moved: DKL U16A v RBH U16 A — Field A1, Sat 28 Nov 09:40*, or *Time and court removed:
  … is under Without a time, to place later* — as a warning when it caused a clash, with **Undo**
  while it shows; it fades after eight seconds. The fixture is outlined for a few seconds, or until
  *Undo*, so the outline never lingers as if it were a warning. **Clashes** are the shared check the scheduler uses, over the
  tournament's fixtures and other events' at its facilities: a facility booked twice, shared ground,
  too little time between games, a team in two games at once, a short team break, past the day's end
  — beside the grid, or behind the ⚠ count on a phone; the count, or *No clashes*, is on the
  *Scheduled* heading line. **Without a time** lists what is left to
  place, by division (folded on a phone); a fixture dragged onto it loses its time. **The day's hours** are dragged on the web: the *Day
  starts* and *Day ends* lines change that day's hours for the tournament, or — with a division
  chosen — become its *First game start* and *Last game ends* and change them for the division alone
  (a start dragged back to the tournament's follows it again). Fixtures stay where they are; any now
  outside the hours show as clashes. It says what changed, with **Undo**. **Adding a fixture**
  (2026-10-16, design rule 32): on the web, an empty space on the grid shows a dashed *＋ time* under
  the pointer, and a click opens **Add a fixture** there — the division (the one chosen, else the
  first that plays on that facility), its stage when there are several, two of **its teams in
  play**, and the day, facility and start, with the clash check. **＋ Add a fixture**, at the right
  of the toolbar, opens the same sheet *Not yet* placed, on any screen; it then waits under *Without a time*.
  The sides are the division's entrants, as the draw's are, so the fixture counts for the same
  teams; it is added (`ADD_GAME`) and then placed (`MOVE_FIXTURE`), and says so with **Undo**, which
  deletes it. Not on a Head to Head, whose games are made by pairing. **Opened on a division**:
  `?tab=schedule&division=<id>` chooses that division, on the first day it has fixtures. **A result entered
  offline** (U20) — *Record result* with no connection, or no answer — is kept on the device and sent
  when the connection is back; the match's page shows it *waiting to send*, and the offline banner
  counts them. If somebody changed the result meanwhile it is not sent over theirs: the match shows
  *Your result was not sent*, with why and *Discard*. Offline, the
  schedule reads and moving says it needs a connection.
- Sports & divisions carries its explanation as text while field help is on ("Choose the sports
  being played, then the divisions within each. A division is a group of teams that compete against
  each other — usually an age group, e.g. Rugby U16. …").

**Sports & divisions, one sport at a time.** The sports are a **carousel** of chips: one line that
scrolls sideways and never wraps, **with no scrollbar** — ‹ › appear only when there are more sports
than fit, each gone at its end, and a swipe works too. Under it, only the chosen sport: its name,
divisions and teams, and its divisions as tiles (name, format from its stages, who can play, teams,
and where it has got to) — a single division too, beside the ＋ Add a … division tile. **＋ Add a
sport is the card's heading action**, never a chip, and the *All N ▾* list is gone (2026-10-09): the
arrows and the full page cover jumping to a sport. A sport's chip has an amber dot while one of its
divisions needs more teams or has changed since its draw, a red one while one of its games is live.
＋ Add a … division asks the age group, name and format first (`FIX-27`); the sport's ⋯ opens
**Sport organisers** in a dialog, and while setting up removes a sport that has no divisions — the
⋯ stays after setup for the organisers (`FIX-28`). **A sport's organiser** who does not run the
tournament gets the same for their own sports only — the ⋯ (without *Remove sport*) and, while
setting up, ＋ Add a … division — and never chooses or removes sports, which shape the tournament. **The full page** shows every sport at once, each exactly as the card shows its chosen
one, with the chips pinned at the top, jumping to a sport.

**Organisations & teams** (`FIX-26`, agreed 2026-10-05 on `mockups/organisations-teams.html`, option
C of three; built in [OrganisationDialogs.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/OrganisationDialogs.tsx)).
Say *organisations*, never *schools*: clubs take part too.

- **Adding is not inviting.** An organisation is **added** — so the organiser can enter its teams and
  build the tournament — and **invited** when the organiser is ready; until then it cannot see the
  tournament at all (`FIX-29`, okf/database.md). Each has a status, shown as a badge: *Not invited
  yet* (the warning colour), *Invited*, *Accepted*, *Declined*. Inviting only grants visibility for
  now; telling the organisation is the communication work.
- **The card**: the warnings, one a line, each linking to its fix — an organisation with no teams,
  one that has not answered, one asking to withdraw — with **⚠ N** on the heading; the card lists the
  first three and "N more warnings ›" to the full page. **A division with fewer than two teams is not
  one of them** (2026-10-09): it is the division's, shown on its tile (*Needs more teams*), as an
  amber dot on its sport's chip, and under Fixtures' *Still to draw*. Then a box for those **not
  invited yet** — "2 not invited yet" and *Invite all 2* on one
  line, "They can't see this tournament until invited" under it; then one row per organisation —
  crest, name, badge, and what it has entered on **one line** that steps down until it fits: every
  sport with its divisions → each sport with its count → "x sports · y teams". Places belonging to
  nobody (*Winner of the regional qualifier*) are listed under *Still to be named*. The action is
  **＋ Add organisation**, on the heading. **The full page** lists every warning, shows each
  organisation's entries in full rather than cut to one line, and filters by *Needs attention* and
  by sport — a sport's filter also trims each row to that sport's entries.
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
    change it: "To change this, contact Valley Prep." The card sits beside the tournament's banner
    and stays once answered: *Taking part* with *Withdraw from the tournament* after accepting
    (2026-10-17). In *Taking part* the organisation's own row opens its page; the other
    organisations' pages are the organisers' only.
  - **Declining**, or a confirmed withdrawal, takes its teams out; it stays listed — at the bottom,
    badged — as the record, and is not a warning. The organisers' only action then is *Change
    response*.
  - **Withdrawing**: an organisation that accepted asks, with a reason ("Since your organisation has
    already accepted, Valley Prep will be informed and needs to confirm your withdrawal…"); while
    *Withdrawal pending* nothing changes and it can cancel; the organisers see who asked, when and
    why, and *Confirm withdrawal* or *Keep them in*. A pending withdrawal is one of the Organisations & teams warnings. A
    reason longer than about 120 characters moves the response card under the banner.
  - **Who sees it**: its public lists show the tournament only once it has accepted; its members see
    an invitation, a decline or a withdrawal in the workspace; one that declined or withdrew keeps
    only the public view. The rules are `server/src/managers/eventVisibility.ts`.
  - The organisation's page is open to its own members once it is invited. **They answer for its
    teams on cards** (`FIX-31`, built 2026-10-10; `mockups/team-invitations.html`): each sport, then
    each division with its name on the left and its teams on the right, each team a card — its name
    (the link to the team), its answer, who gave it and when, and buttons that say what they do:
    *✓ Accept* / *✕ Decline* while invited; the other answer once answered (confirmed first);
    *Withdraw* once locked (a reason, for the organisers to confirm); *Cancel request*. Its admins
    for any team, a coach for the teams they coach — with **Mine / All** for a coach, the events
    list's one choice (design_spec, *Mine / My organisation / All*). *＋ Add a team* sits under a division's name where it allows adding and is
    open (`FIX-33`); *＋ Ask to enter late* under a locked one with no team of ours. A strip,
    *Outstanding responses N · Show ›*, and the filter *All · Outstanding · Declined* narrow to
    what needs answering. **Accept** offers *Accept for all invited teams* (on), over its teams as
    chips with ✓ / ✕ where already answered; **Decline** says every team is declined too and that
    only the organisers can change it after. What holds for every team is said once, in the ⓘ by
    the decision (design rule 28). The organisers' chips show each team's answer and list its
    requests under their division. [OrganisationTeamCards.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/OrganisationTeamCards.tsx).
- **Done** when every organisation still in it has accepted and has at least one entry, and none is
  asking to withdraw. Since 2026-10-09 it no longer waits for every division to have two entrants:
  that keeps **Fixtures** from being done instead, as such a division cannot be drawn.
- Entering **by division**, and Replace / Withdraw / Remove, belong to the division page (`FIX-27`);
  a convenor enters teams there.

**Once set up, and for anyone who cannot edit**: the banner (on the day, "Day 2 of 2 · 5 live"),
**Live now** while games are being played, Sports & divisions (each tile saying where the division
has got to), Fixtures, Organisations, Where with the map, Rules & scoring, and Organisers for an
organiser when there are any. Invitation badges are an organiser's; anyone else sees who is taking
part, without declined organisations. A guest organisation sees its own first. The guest organisation's view was redone with `FIX-24`
(below); the public's is designed in §11 (`FIX-25`).

**The ⋯ menu**: Organisers (appointed in a dialog — most tournaments have none, so no empty card),
Cancel, and Delete, which is disabled with the reason once results are recorded.

**Gone**: the Basic Info and Rules & scoring step screens (`setup/basics`, `setup/scoring`), the
checklist component, and (2026-10-09) the *Setting up* tab with its numbered, folding step cards.  With
`FIX-28` (2026-10-09) the last step screens went too — Sports & Divisions (`setup/playing`),
Fixtures (`setup/fixtures`) and the old entrants screen — with their footer and step chain
(`setupSteps.ts`, `useSetupStepScreen`). *Not needed* went on 2026-10-10. The event-level `format` is
no longer shown anywhere on the page: every tournament is created a Festival and the formats live on
each division's stages.


**Teams' answers on the tournament page (`FIX-31`, `FIX-33`, built 2026-10-10).**
- *Organisations & teams* ends with **Organisations can add their own teams** and its toggle — the
  tournament's setting, off by default; a division can choose differently. Each organisation's row
  says how its teams stand — *2 teams to answer*, *1 request to answer* in the warning colour, *1
  declined* plainly — and each is one of the section's warnings.
- *Fixtures*, while setting up, splits the divisions still to draw into **Entries open** — each with
  what still waits, or *ready to lock* — and **Locked, to draw**; **🔒 Lock all…** on the open group
  locks every division that can be and names why the rest stay open (`LOCK_EVENT_DIVISIONS`).
- **Someone outside the organisers with a team in it, or whose organisation has one** — a coach,
  an admin of a guest organisation — sees the whole page, with **Mine / My organisation / All** (the
  events list's one remembered choice, `useViewScope`; My organisation added 2026-10-17) on the line
  above the cards: Mine narrows Sports & divisions and Fixtures to their teams, My organisation to
  their organisation's; Where, When, Rules and — since 2026-10-18 — Taking part stay whole. Only the choices that
  differ are offered — an admin with no team of their own gets *My organisation / All*. The same
  choice, from `TournamentScope.tsx`, sits above the **Schedule** tab's toolbar (narrowing its
  fixtures), above the **Standings** tab (narrowing its Divisions list; the leaderboard is a
  comparison and stays whole) and under a **division page**'s banner (narrowing its fixtures; the
  table stays whole). Their team's invitation sits
  under the banner with ✓ Accept / ✕ Decline (`TeamInvitationRows`). A team's own page has an
  **Events** card — every tournament it is in, an invitation as a tinted row to answer — and a strip
  under its banner while one waits; the events list's invitations box names the team. Who sees what,
  and when: the public in §11; from when a tournament is public at all is `FIX-38`.

**Decided 2026-10-18 (`FIX-24`, `FIX-32`, `FIX-25`).** Mockup: `mockups/tournament-participant.html`,
the page as built with what is new tagged. **Built 2026-10-18 (phase 1):** the start on My
organisation, Taking part left whole, and To do — its card and its page — with teams to answer as
its one task so far ([TournamentTodo.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentTodo.tsx),
`events/[eventId]/todo`). **Phase 2, built 2026-10-18:** naming a TBC place — a To do task for the
organisation's admins, *Name the team*, and its dialog (`NAME_OWN_PLACEHOLDER`). **Phase 3, built
2026-10-22:** a team per game with proposed teams — the game page's *Confirm team*, Pick team starting
from the proposal, and To do's *Pick team* and *N games with a proposed team* (*Confirm all*), a team
task going to its coach or, with none, to the admin — and who may pick a side checked on the server
(`SCORE-19`, `AccessManager.canPickSide`).
- **A taking-part organisation's admin starts on My organisation.** The host's Admin and Staff still
  start on All (design_spec's role default); a guest organisation is there for its own teams.
- **To do** replaces the amber *Your teams are invited* card, in the same place, once there is more
  than invitations in it: teams to answer, TBC places to name, teams to pick, proposed teams to
  confirm. It lists what the viewer answers for — a coach's own team, an admin's whole organisation —
  whatever the switch shows, keeps today's title while invitations are all it holds, and goes when
  empty. **An admin's card holds only their own tasks**: what only an admin can do (teams to answer,
  TBC places), then team tasks with no coach, at most five, each group soonest first, and a line such
  as *6 more for coaches · See all 11 ›*. More than three teams to answer are one row (*Accept all /
  Answer each*). **See all** opens the tournament's **To do page** (`events/[eventId]/todo`):
  everything, the admin's first, then each coach's with the coach named, with *All / Yours /
  Coaches'*, sport and team filters. A coach's card holds only their own team's.
- **Naming a TBC place**: the organisation's admin picks which of its teams fills it — of the
  division's sport, its age group first, none already in the tournament — and its games keep their
  times and fields; the team goes in accepted. *We can't send a team* uses the answers that exist:
  while entries are open the place is declined, as a team is; once they are locked it is a
  withdrawal request, with a reason, for the organisers to confirm.
- **A team is picked per game**, on the game page. A game nobody has picked for takes the team of the
  latest earlier game in the tournament, shown as **Proposed** until confirmed or changed: one pick
  fills a tournament, and nothing the coach has not looked at shows as picked. An unconfirmed
  proposal follows the game it came from; the other side and the public see it as not yet picked;
  the game's next step stays *Pick team*; once the game starts it stands. A *copy from a previous
  game* button was rejected: a tap per game on the busiest day.
- **The public** reach a tournament from public listings, or by following a team or organisation in
  it, and get a read-only view of the same page. Settled 2026-10-22 in §11: public when the
  organisers make it so (`FIX-38`), no account needed, no players' names (`PEOPLE-4`).
- **Who to contact** is left to the communication work (`COM-1`).
- **The Overview adds To do and nothing more** (option A): a team's next game and its place stay on
  Schedule and Standings, which the switch already narrows. A *Your teams* card and a *Your games*
  list were set aside.
- **Taking part always lists every organisation**, whatever the switch shows — it is who you are
  playing. (Built today, Mine and My organisation narrow it.)

## 8. The division page (`FIX-27`)

> **Redone in tabs on 2026-10-22 (`FIX-40`, `mockups/division-tabs.html`, option A)**, like the
> tournament page: **Overview**, **Schedule**, **Standings** (*Results* for a Head to Head),
> addressed by `?tab=` — the tournament's Standings and a team's *Full table ›* open the Standings
> tab. **Overview**: the banner and next-step strip as below; *Live now* on the day; **Teams** —
> who is entered (for organisers with their answers and actions), and from the first result the
> division's table with *Standings ›*, the organisers' list then one tap away under *Manage teams*;
> a small **Fixtures** card ("6 fixtures · 3 played · next at 09:40", *Schedule ›*); Where (now with
> the venue's map and Directions), When, How it's played, Organisers. A Head to Head's pairing stays
> on the Overview. **Schedule**: for its organisers **the draw** — its state and buttons, without
> its fixture list — then the tournament's Schedule locked to this division (`divisionOnly`): the
> grid, or the all-days list for anyone who cannot move fixtures; *Edit in the Schedule ›* is gone,
> the schedule being right there. **Standings**: the full table, or the organisations' — **with its
> teams on nought before the first result**, unranked ("–"), rather than an empty box
> (`getDivisionTables` works out a stage's table while it is still empty). The cards
> below keep their rules; only where they sit changed.

> **Revised in Phase 7 (2026-10-11): Where, When and Organisers.** The division's *Organisers &
> courts* section is split to match the tournament page section for section: **Where** (its
> facilities, under the sport's own word — *Courts* for netball — and "Any of the tournament's" when
> none are chosen), **When** (each of the tournament's days: *Not playing*, or its first game start
> and last game end — the end *calculated* unless set, shown as the time the schedule worked out) and
> **Organisers** (organisers only). Its scheduling gaps sit at the foot of its **Fixtures**, marked
> "the tournament's" until it sets its own. No section title names a facility type, since that word
> is the sport's. *Edit details* keeps the division's own record: name, sport and age group.

Agreed 2026-10-09 on `mockups/division-read-first.html`, **option A**: one page of cards, read
first, at `events/[eventId]/divisions/[divisionId]`.

- **The banner** says what the division is — sport, age group, how it is played, how many teams —
  where it has got to **in the same words as its tile** on the tournament page (*Needs more teams*,
  *Not drawn yet*, *Changed since the draw*, *Draw made*; on the day *N live · x of y played*,
  *Finished*), and whether entries are open or locked. ✎ opens the details dialog.
- **One strip** under it says what the division needs next. A warning inside an otherwise good strip
  keeps the warning colour, and starts its own line on a phone.
- **Cards**, two columns on a wide screen, ordered by the moment: while setting up **Teams** leads;
  once drawn, the fixtures sit beside the teams; **on the day Fixtures lead**, then Standings.
  Each card edits itself — there is no separate edit screen.
- **Teams**: each team with its status (`FIX-31`); declined teams under *Not taking part*. Once
  entries are locked, *Accepted* badges go and only the exceptions keep one. A late-entry request
  or a withdrawal request sits at the top with its message — two lines, then *Show more* — and its
  two answers. Each team's ⋯: *Mark as accepted* (only once its organisation has accepted), *Mark as
  declined* (any time), *Replace*, *Withdraw* (after the lock; results stand), *Remove* (until it
  has played). A team entered for an organisation not yet invited reads *Not invited yet*; the
  division page never offers *Invite* — inviting is for the tournament's organisers only. Until a
  team's organisation accepts, the organisers see an accepted team as *Invited* (`entrantStatusShown`).
  The foot of the card holds, while entries are open, **Organisations can add their own teams** with
  its toggle — *Same as the tournament: on*, or *Off for this division · Use the tournament's
  setting* once overridden (`FIX-33`) — and **the lock**: *Entries open*, what is left, and *🔒 Lock
  entries* (disabled while anything waits); or *🔒 Entries locked* with when and by whom, and *Unlock*.
- **Add teams** lists only the organisations taking part, and only their teams **of this age group
  not already in the division**; **＋ A team from another age group** under each organisation is the
  exception. A place to be filled later is at the foot. **Replace** is the same picker choosing one,
  with a late entry not yet in the draw offered first, and says before confirming whether the
  replacement takes everything (nothing played) or only the unplayed fixtures (results stand).
- **How it's played**: *Round robin* (once / twice), *Pools & knockout*, *Knockout* (a game for third
  place), *Set fixtures by hand* (`Festival`: no draw). Chosen when the division is added, changed
  on the page until the draw — after it, changing means redoing the draw. What each option means may
  still change; the UI is what is settled. **The two knockout formats are not offered for now**
  (`TOUR-1`, 2026-10-13): the picker shows only *Round robin* and *Set fixtures by hand*, plus
  whichever knockout format a division is already set to, so it still reads correctly.
- **Fixtures are changed in the Schedule** (2026-10-16, design rule 32): at the foot of the
  Fixtures card — and of a Head to Head's pairing card — **Edit in the Schedule ›** opens the
  Schedule tab on this division, once it has fixtures; a division set by hand offers **Add fixtures
  in the Schedule ›** before it has any. Tapping a fixture still opens its game page, where *When &
  where* moves it; the card's *＋ Add a fixture* opens the Schedule's own *Add a fixture* sheet in
  place (`FIX-36`, 2026-10-17), for this division.
- **The draw** is made from locked entries (`FIX-31`); an unlocked division's *Make the draw* lists,
  as warnings, what still waits — or, when nothing does, offers **Lock and make the draw** in one
  press (rule 3). The strip says the same: what is left, then *🔒 Lock entries*, then *Make the
  draw*, with a late request as its warning. *Redo the draw* (not *Remake*) replaces the fixtures.
- **Details dialog**: name, sport (fixed once a team or a fixture exists), age group, division
  organisers, and the courts as chips with **＋ after them** opening the facility picker.
- **Adding a division** asks first: age group, then a name filled in from it, and how it is played.
  A sport's first division is asked for when the sport is added; *Skip* names it *Open*.

**Names, within a sport.** A division is read under its sport, so its name does not repeat it:
"U12", and "Open" with no age group; a second of the same age is "U12 B". Names are therefore
**unique within a sport**, not the tournament ("U12" in netball and in hockey), and the sport is put
back — "Netball U12" — wherever it is not already on screen (`divisionFullName`). The automatic name
no longer upper-cases the age group (`SPORT-11`); names given before, such as "Rugby U14" or
"RUGBY U14 - 2", keep their names and are still recognised as automatic, ignoring case.

**Once a game has started** — live, finished or holding a score — **only fixture changes by hand**:
no redrawing, no change to the format or the stages (a stage's name and earliest start may still
change), and the division cannot be deleted. *Replace* stays, because it keeps the draw. The
server refuses each of these itself (`assertDivisionNotStarted` in
[TournamentManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/TournamentManager.ts)).

**A division's sport** is fixed once a team is entered **or a fixture exists** — a fixture added by
hand is played under the sport's rules (`FIX-17`).

**Courts**: a facility picked for a division that the tournament does not use yet is **added to the
tournament too**, since the tournament's facilities are everything used on the day and drive its
map. The server does it inside `SET_DIVISION_FACILITIES`, because a division organiser may not set
the tournament's facilities directly; narrowing a division takes nothing off the tournament.

**Who may do what** (from `tournamentGate.ts`): a division organiser has the division's teams,
how it is played, the draw, fixtures and its courts; renaming or deleting it, and inviting an
organisation, are for the tournament's and the sport's organisers — so a division organiser sees the
name and age group read-only, and no *Delete division*.

**Built 2026-10-09.** The page is
[divisions/[divisionId]/index.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/%5BeventId%5D/divisions/%5BdivisionId%5D/index.tsx),
from [DivisionTeams.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/DivisionTeams.tsx)
(the Teams card, *Add teams* and *Replace* sharing one team picker),
[DivisionFixtures.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/DivisionFixtures.tsx)
(the draw and fixtures) and
[DivisionDialogs.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/DivisionDialogs.tsx)
(details, *How it's played*, *Add a division*). The tile and the page share `divisionStateOf`,
`DivisionStateLine` and `TournamentCard` in
[TournamentBits.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentBits.tsx), and
a division record carries `stageShapes` so its tile names the format as its page does. The
division's `/schedule` screen is gone. **Revised 2026-10-12 (Phase 7):** the Schedule tab is now the tournament's schedule — a grid by facility on a wide screen, a list by start time on a phone — for any number of divisions, so it no longer collapses to one division's panel, and `DivisionPanel` is deleted. A division's fixtures live on its page (`DivisionFixturesCard`). The collapse rule still governs the pickers.
Deleting a division deletes its unplayed fixtures with it. **Teams' answers, the lock and adding
built 2026-10-10 (`FIX-31` stage 2):** the badge, the request row, the adding line and the lock bar
are [DivisionEntries.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/DivisionEntries.tsx),
shared with the organisation's page; what still waits before the lock is `entryLockGaps` (shared),
the client's mirror of the server's `entryLockProblem`.

**A division with no format chosen is round robin** (`defaultDivisionFormat`): *Set fixtures by hand* (`Festival`) is only ever chosen, never a default, so a new sport's first division and a division added without a format start as round robin.

## 9. The game page (stage 3, `FIX-21`, `FIX-23`)

[games/[gameId]/index.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/%5BeventId%5D/games/%5BgameId%5D/index.tsx),
with its cards in [GameBits.tsx](file:///c:/Fred/Coding/SK/expo-app/components/game/GameBits.tsx) and its
dialogs in [GameDialogs.tsx](file:///c:/Fred/Coding/SK/expo-app/components/game/GameDialogs.tsx). Agreed
2026-10-14/15 on `mockups/game-read-first.html`: **option B, revised** (B was a scoreboard and tabs; A,
cards like the division page, and C, one column that follows the moment, were not chosen).

**One page instead of two.** The View and Edit screens and the View / Lineup / Edit / Score switcher
are gone. Score and Pick team stay their own screens, opened from the page and returning to it.

- **The scoreboard**: the two teams with their crests and, between them, the kick-off, the score
  (red while live) or a *Cancelled* flag. Above them a line back to where the game belongs — the sport
  for a match; tournament · division · round for a fixture — and the status; below them, when and
  where once. Then **the buttons, in the order things happen**: Pick team, Start scoring, Record
  result. **The highlighted one is the next step**: Pick team until this viewer's team is picked (it
  then reads *Change team*), then Start scoring, then Score while live, then Correct result. On a
  phone the three sit on one line.
- **Wide: no tabs.** The teams' sheets side by side on the left, with a fixture's division (both
  teams' places) under them; *Match events*, scrolling inside a fixed height, and *When & where* in a
  narrower column on the right. **Phone: tabs** — Overview (the teams first, one line a side), Teams,
  and Match events once the game has started.
- **No time.** A single match with a day and no time is **Time TBC**. A tournament fixture with no
  time or court is **No time yet**, as on the Schedule — TBC means the day is fixed and the time is
  not. Said in the scoreboard and in *When & where* (with *Set the time* / *Place it*), nowhere else.
- **Home** is never the first team: it is shown for a team playing at its own organisation's site,
  and nobody is at home on a neutral ground. The teams are **Teams**, not Home and Away.
- **Who sees what.** *Edit*, the **⋯** (cancel, reinstate, delete) and *Who played* only for whoever
  may edit the game. A team's **coach** sees the organiser's page without those — they pick their own
  team and may score, as before. A **scorer** gets the result buttons. Nothing on the page explains
  what a viewer cannot do: there is no read-only banner (agreed 2026-10-14; the outside views are
  `FIX-24` and `FIX-25`).
- **The other side's team is picked by its own organisation** (agreed 2026-10-14); you see its sheet
  but no button for it. The server's per-side check is `SCORE-19`, and a tournament's organisers can
  still pick for any team until `FIX-32`.
- **Once a game has started** (live or finished) it is **not deleted or cancelled** — only its result
  is corrected. The server refuses both (`refuseDeletingStartedGame`; a single match through
  `DELETE_EVENT` too).

**A single match** edits everything in one dialog, *Edit match*: its teams (an organisation and a team
each, joined by "V"), the day, the kick-off or *Time to be confirmed*, the venue and field, and the
sport shown but not changed. It saves the game and then the match's event, as the old screen did.

**A tournament fixture has no team pickers** (`FIX-21`). The old form's pickers sent the sides by
team, and a changed team became a new side with no entrant, source rule or scores — dropped from the
draw. Now:

- **A different team turned up for this one game** → *Who played* (`CHANGE_FIXTURE_SIDE`), a dialog
  offering the side's own organisation's teams in the sport. Only this game changes; its result still
  counts for the place in the draw.
- **Another team takes the place for good** → *Replace*, on the division page.
- **Changing who meets whom in one fixture** (A v B becomes A v C, the draw otherwise untouched) is
  not offered — left out for the proof of concept (2026-10-14).
- `UPDATE_GAME` refuses a team change on a side from the draw (`refuseTeamChangeOnDrawnSide`).

Its **When & where** is the Schedule's move sheet ([MoveSheet.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/MoveSheet.tsx)),
with the Schedule's clash check over the whole tournament ([useScheduleCheck.ts](file:///c:/Fred/Coding/SK/expo-app/components/tournament/useScheduleCheck.ts),
shared with the Schedule tab). Its link **Remove time and court** (was *Take its time away*) sends
the fixture back to *Without a time*.

**Adding a fixture** outside the Schedule — the division page's *＋ Add a fixture* and the tournament
page's *＋ Add a fixture by hand* — opens the Schedule's own *Add a fixture* sheet in place
([AddFixtureDialog.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/AddFixtureDialog.tsx),
`FIX-36`, 2026-10-17): the sides are the division's teams in play, so a hand-added fixture counts for
them as a drawn one does, and its time and court have the Schedule's clash check. Left without a time,
it waits under *Without a time*. The old `games/new` form, which added sides by team alone, is gone.

**Clashes (`FIX-23`)** are the Schedule's check everywhere: a field booked over the same time (or
ground it shares), a team in two games at once. A tournament fixture uses the tournament's own check;
*New match* and *Edit match* ask the server, by field and team, with `GET_GAME_CLASHES` — every
event's games, not only this organisation's. **Warned, never blocked.** **Two fields of one site at
the same time are not a clash** (2026-10-15): festivals run games side by side on purpose. **No news
is no message**: when there is no clash, nothing is said (the move sheet's *No clash at this time* is
gone).

**Later:** a player who turns up on the day, added by the scorer and linked by the coach afterwards,
is `SCORE-20`; its "say who" line will sit beside that team's sheet on this page.

## 10. The Standings tab (stage 4)

[StandingsTab.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/StandingsTab.tsx), with every
table drawn by [StandingsTable.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/StandingsTable.tsx).
Agreed 2026-10-17 on `mockups/standings-read-first.html`: **option A** (B, one table with a division
picker and a points-per-division grid, and C, a headline and podium above the table, were not chosen).

**The highest level first.** The tab opens on the **leaderboard by organisation** — who is winning the
day — with "9 of 18 fixtures played" beside its title. Beside it on a wide screen, under it on a phone,
**Divisions**: every division by sport, each with who leads it ("Led by DKL U16 A", "Won by…" once it
is finished) and the state line its tile shows. A division played in pools or with a knockout names
no leader there — its stage tables decide it — and says how it is played instead. The division scope
tabs are gone.

**Every row is a door, and each opens a page:**

- **An organisation** → its results page,
  [standings/organisations/[participantOrgId]](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/%5BeventId%5D/standings/organisations/%5BparticipantOrgId%5D.tsx):
  where it stands ("1st of 4 · 15 points · 3 teams") and one row per team, by sport, each with its
  division and place under its name. A page of its own rather than a card on the organisation's
  tournament page, which manages its invitation and entries and is the organisers' and the
  organisation's only; results are for anyone who can see the tournament.
- **A team** → its page,
  [standings/teams/[entrantId]](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/%5BeventId%5D/standings/teams/%5BentrantId%5D.tsx):
  where it stands, its fixtures and results (the division page's own rows, `FixtureList`), and its
  division's table with it picked out. *Full table* opens the division page; *Team page* the team's own
  page, for its organisation's members. A page, not a sheet, so every row opens the same way.
- **A division** → the division page, whose Standings card has its tables. There is no second
  division table page: "we do not want too many views of the same data" (the user, 2026-10-17).

**Every table has the same columns:** P W D L Pts; on a wide screen For, Against, ± and the last five
results as well, and ± on a phone too. Each row names its organisation and team ("Doringkloof U14 A",
"DKL U14 A" on a phone or in a narrow column) with its crest — the division page's tables named only
the team before. **The leaderboard is the one exception:** it shows **Teams** in place of For,
Against, ± and form, which added up across sports would add rugby points to netball goals. The
viewer's own organisation's rows are tinted (`bg-info-soft`). Mine / My organisation narrows the Divisions list to the viewer's (2026-10-17); a table's rows are never narrowed. The
adjustment dot and withdrawn rows are as before.

**A tournament scored on wins / draws / losses has no points column** (`SCORE-18`, built 2026-10-17).
The *Rules & scoring* dialog offers two systems: **Wins / draws / losses** (`winsDrawsLosses`: no
points; a table ranks by wins, then draws, then the tiebreakers) and **Simple points** (`byResult`:
points for a win, a draw and a loss, 3 / 1 / 0 by default). Every division follows the tournament's
system — none sets its own on screen. Under wins / draws / losses the leaderboard adds up each
organisation's wins and draws and ranks on them the same way, and the results pages, the team page and
the game page's division card give a record ("5 wins, 0 draws, 0 losses", "W3 D1 L1") where they gave
points. Scores are still kept, so For, Against and ± stay, and a game always shows its score.
`showScores` is there for **No Scores** (won / drawn / lost only), which is parked in `SCORE-18`
with *Custom points*.

**The data.** `event:{id}:standings` now carries `EventStandings`: the leaderboard and each division's
**whole** table (`tournament_divisions.cached_standings`, written by `recalculateEventStandings` — the
same rows it adds up, so an organisation's teams sum to its line). A stage's own table stays on
`division:{id}:standings`, the division page's. The last five results are worked out from the fixtures
the page already holds (`formByEntrant`), never a ranking.

**Test data:** *Test Autumn Festival* (`fx-tour-autumn`) is under way — Netball U14 finished, Rugby U16
half played, Netball U16 not started — and the reset rebuilds its tables after loading
(`rebuildFixtureStandings`). Checked by `e2e/12-standings.spec.ts`.

**Built 2026-10-22 (`SCORE-23`).**
- **A division of paired games ranks organisations, not teams.** A *Set fixtures by hand* division is
  usually paired by level across organisations — U16 A v U16 A, U16 B v U16 B — so each team plays
  once or twice, and one table of teams would crown a team that played once. Such a division, and
  every Head to Head division, gets a table like the leaderboard's but for the division:
  organisation, teams, P W D L, and points where the scoring system has them (none under wins /
  draws / losses, none for a Head to Head). It replaces the team table on the division page, and the
  Divisions line says *Won by DKL*; a Head to Head division, which had no Standings card, gets one
  too. A round robin keeps its team table. The server adds the division's kept team table up by
  organisation when the standings are read — the leaderboard's own roll-up over one division, so the
  two cannot disagree — and sends it as `byOrganisation` on `event:{id}:standings` (`ranksOrganisations`
  in [Tournament.ts](file:///c:/Fred/Coding/SK/shared/src/models/event/Tournament.ts) decides which
  divisions: one `Festival` stage). In a narrow column organisations go by their short names. Test
  data: *Test Netball Pairs Day* (`fx-tour-pairs`); `e2e/17-paired-standings.spec.ts`.
- **The Standings tab has a Sport dropdown**, in the style of the Schedule's filters (Day, Division,
  Facility — the Schedule has no sport filter of its own), for everyone, when the tournament has more
  than one sport. A sport narrows the Divisions list, whose rows already drop the sport from their
  names under it (rule 26), and makes the leaderboard that sport's: the server's roll-up of only its
  divisions (`EventStandings.sports`). There is no organisation filter on Standings: a table is a
  comparison.

## 11. The public view (`FIX-25`)

Designed 2026-10-22 on `mockups/tournament-public.html` (kept local), **option A**: the tournament
page as built, read-only. B (*Watch a team*, the public's stand-in for Mine) and C (an Overview that
changes with the moment) were not chosen. **The tournament's public pages were built 2026-10-22**
(how, below); the public organisation page that leads to them is `UI-34`.

**Who it is for, and how they get there.** Anyone outside every organisation taking part — a parent,
a supporter — **with or without an account**: logged out and logged in see the same page for now
(what an account adds is `FIX-37`). They reach it from the public organisation page of any
organisation taking part (`UI-34`, below), or from a shared link, which opens the page directly — not
the landing page. Following a team or organisation is left out for now (`UI-33`). It assumes the
tournament is public; making it public, and keeping it hidden until then, is `FIX-38` — events have no
such state today, and the event's public rooms are open from creation.

**The page.**
- **Outside every workspace**, in the public tab bar (Orgs marked), at a route of its own. *Share* in
  the header copies a link, or opens the phone's share sheet.
- **The same tabs and cards, without what only those taking part do**: no response card, To do,
  *Mine / My organisation / All*, Organisers or ⋯. The Schedule keeps its Day, Division and Facility
  dropdowns and adds an **Organisation** dropdown in place of *Mine / My organisation / All*.
- **On the day, Live now leads.** **Once it is over, the Leaderboard leads** — the top three
  organisations and *Standings ›* — and the divisions stay on the Standings tab, a tap away. Between
  days the same card shows the standings so far.
- **Scores are larger** for live and finished games, in Live now and on the Schedule, and a live
  game's minute sits under its start time to make the room.
- **A withdrawn team stays in the fixtures**, struck through and tagged *Withdrawn*, because it
  withdrew after the fixtures were made and the public must not see unexplained gaps. Its results
  stand; its games still to play read *Not played*. As the organisers' division page already shows it.
- **No players' names** until `PEOPLE-4` gives a consent rule: match events name the team, not the
  scorer, and the game page has no team sheets — said once, on its Teams card. Coaches are named
  (on the organisation page).

**How it is built (2026-10-22).** The public routes, `/events/[eventId]` and the pages under it in
`app/(tabs)/events/`, mount the workspace's own pages inside `PublicTournamentProvider`
([tournamentLinks.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/tournamentLinks.tsx)) —
one page for both, not a copy that drifts. Every link goes through `useTournamentLinks`, so it stays
on the side it started. Under the provider:
- **Read-only for everyone.** `useEventCapabilities` asks nothing, and the game page's permissions are
  worked out as for nobody: an organiser or a coach on the public link sees what the public sees, and
  edits in their workspace.
- **No roster.** The roster is the members' tier; the public page reads `event:{id}:teams` instead
  (`getPublicTeams`): team entrants in or withdrawn, of organisations that accepted or withdrew
  (`PUBLIC_TEAMS` in [eventVisibility.ts](file:///c:/Fred/Coding/SK/server/src/managers/eventVisibility.ts)),
  with nothing a fixture does not already say. Anyone else outside the tournament gets the same
  room in the workspace pages, so team counts and withdrawn teams show there too.
- **Taking part** opens an organisation's results page, as a leaderboard row does; there is no
  *See all*, the organisers' organisation pages not being public.
- **The Schedule is the list**, not the organisers' grid, on every screen — for anyone who cannot
  move fixtures (the public, a coach, a guest organisation; the user, 2026-10-22): every day under
  its heading, *All days* first in the Day dropdown to narrow it to one. It keeps Division and
  Facility and adds **Organisation**; a clash is not shown.
  Scores now show on every Schedule (the grid's blocks and the phone's list), and Live now's score is
  larger — for organisers too.
- **The game page** asks for no full record: score, both teams' **team sheets** (names and numbers),
  the **Match events** card, When & where and the division. Players were left unnamed at first; on
  2026-10-22 the user decided players are public until `PEOPLE-4` gives a way to hide them, so the
  team sheets (`game_roster`) and the scoring feed (`game:{id}:events`) became public (`FIX-39`). The
  card reads only those (`DynamicScoringProvider`'s `spectator`): no disputes, no team's members.
- **A withdrawn team** is struck through in the fixtures, as the organisers see it; "Not played" for
  its remaining games, drawn on the mockup, is not built.
- **Share** copies the page's address on the web, or opens the phone's share sheet. A phone has no
  public web address yet (`EXPO_PUBLIC_WEB_URL`, unset while there is only a dev environment), so it
  shares the app's own link until there is.

Test data: *Test Autumn Festival*'s Netball U16 has Kwaggafontein's U16 Comets withdrawn after the
draw; `e2e/18-public-tournament.spec.ts` reads the pages logged out and signed in.

**The public organisation page (`UI-34`)**, designed the same day on `mockups/org-public-events.html`
(option B) and `mockups/org-public-page.html` (option A). It is redone read-first: the workspace
Profile's banner (logo, name and short code, type, town), then the tournament page's underlined tabs
— **Overview** (*On now & next*, About, Address, Sports), **Teams** (by sport, each with its coach),
**Fixtures**, **Sites** and **Leagues**.
- **Fixtures is the organisation's Fixtures & Events list** (§1–4), read-only: the same rows,
  sections, *Events / All games*, *Upcoming / Past*, search and Filters, without *Mine / All* and
  *New event*. *Away* stays — it is about the organisation — and *Convening*, the viewer's role, goes.
  **Only what is public shows**: a tournament not made public, or one the organisation is only invited
  to or declined, is left out without a word.
- **On now & next** on the Overview: at most three rows, what is on now first, so the rest of the
  Overview stays easy to find; *All fixtures ›* opens the tab.
- **Gone**: the old counts in the banner (members are not the public's business), *Registration
  Alert* and *Inquire / Register as Athlete*, which did nothing. Applying to join comes back with
  `MEMBER-1`, only for an organisation that allows it.
- A member of the organisation sees the same page with *Manage Workspace ›* or *Open Workspace ›* at
  the end of the banner. Team and site rows open nothing until the public team and site pages are
  designed — the next piece of work.
- **Built 2026-10-22** in [organizations/[orgId].tsx](file:///c:/Fred/Coding/SK/expo-app/app/(tabs)/organizations/%5BorgId%5D.tsx),
  everything from public rooms (summary, teams, sites, events, fixtures, leagues). The Fixtures tab
  and *On now & next* are the workspace list itself, `OrgEventsListView` in
  [events/index.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/index.tsx) with
  `publicView` (and `nowNext={3}`, its rows in the compact layout), so the two lists cannot drift.
  The tab bar's own header is hidden on this page, which has its own with Back.
  `e2e/19-public-organisation.spec.ts`.
