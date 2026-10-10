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
lands on it. Schedule and Standings are unchanged (division work, stage 4).

**One page of cards, read first**, as the division page is: a **banner** (name, dates, venue,
sports; Edit), **one strip** for what the tournament needs next, then the cards — two columns on a
wide screen, one on a phone (left column, then right).

| Card | Holds | Edited in | Full page |
|---|---|---|---|
| Where | The base site and the facilities it uses, as chips; the map once set up | *Where* dialog (site + `FacilityPicker`) | — |
| Sports & divisions | One sport at a time (below) | *Sports* dialog; a division's own page | `…/sports` |
| Organisations & teams | Warnings, who is not invited yet, then each organisation with its invitation and teams (below) | *Add organisations*; each organisation's page | `…/organisations` |
| Rules & scoring | The points; *Confirm* while the default is unconfirmed | *Rules & scoring* dialog | — |
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
  left, Where, Rules & scoring, Fixtures and Organisers on the right. **On the day** — any day of the
  tournament, or while a game is live — it rearranges: **Live now** leads, then Sports & divisions
  and Fixtures; Where, Organisations and Rules to the side. For anyone who cannot edit: Sports &
  divisions and Fixtures, then Where, who is taking part, and Rules.
- **On a phone, while setting up, a finished card folds** to its heading and its summary ("Main
  Campus · 5 facilities"); any heading opens or closes its card, remembered on the device per
  tournament. A wide screen does not fold.
- **The strip** names the first unfinished section's most important task, in the order the work is
  done (Where, Sports & divisions, Organisations & teams, Rules & scoring, Fixtures), with the one
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
- **The name and dates are the banner's**, edited in *Edit tournament*; a tournament has its first
  day from the moment it is created, so there is no setup section for them. Where is the venue only.
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
    change it: "To change this, contact Valley Prep."
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
  - The organisation's page is open to its own members once it is invited; its teams are read-only
    for them until teams answer for themselves (`FIX-31`).
- **Done** when every organisation still in it has accepted and has at least one entry, and none is
  asking to withdraw. Since 2026-10-09 it no longer waits for every division to have two entrants:
  that keeps **Fixtures** from being done instead, as such a division cannot be drawn.
- Entering **by division**, and Replace / Withdraw / Remove, belong to the division page (`FIX-27`);
  a convenor enters teams there.

**Once set up, and for anyone who cannot edit**: the banner (on the day, "Day 2 of 2 · 5 live"),
**Live now** while games are being played, Sports & divisions (each tile saying where the division
has got to), Fixtures, Organisations, Where with the map, Rules & scoring, and Organisers for an
organiser when there are any. Invitation badges are an organiser's; anyone else sees who is taking
part, without declined organisations. A guest organisation sees its own first. These outside views are accepted for
now and are to be designed properly (`FIX-24`, `FIX-25`).

**The ⋯ menu**: Organisers (appointed in a dialog — most tournaments have none, so no empty card),
Cancel, and Delete, which is disabled with the reason once results are recorded.

**Gone**: the Basic Info and Rules & scoring step screens (`setup/basics`, `setup/scoring`), the
checklist component, and (2026-10-09) the *Setting up* tab with its numbered, folding step cards.  With
`FIX-28` (2026-10-09) the last step screens went too — Sports & Divisions (`setup/playing`),
Fixtures (`setup/fixtures`) and the old entrants screen — with their footer and step chain
(`setupSteps.ts`, `useSetupStepScreen`). *Not needed* went on 2026-10-10. The event-level `format` is
no longer shown anywhere on the page: every tournament is created a Festival and the formats live on
each division's stages.


## 8. The division page (`FIX-27`)

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
  division page never offers *Invite* — inviting is for the tournament's organisers only.
- **Add teams** lists only the organisations taking part, and only their teams **of this age group
  not already in the division**; **＋ A team from another age group** under each organisation is the
  exception. A place to be filled later is at the foot. **Replace** is the same picker choosing one,
  with a late entry not yet in the draw offered first, and says before confirming whether the
  replacement takes everything (nothing played) or only the unplayed fixtures (results stand).
- **How it's played**: *Round robin* (once / twice), *Pools & knockout*, *Knockout* (a game for third
  place), *Set fixtures by hand* (`Festival`: no draw). Chosen when the division is added, changed
  on the page until the draw — after it, changing means redoing the draw. What each option means may
  still change; the UI is what is settled.
- **The draw** is made from locked entries (`FIX-31`); an unlocked division's *Make the draw* lists,
  as warnings, the teams still to answer. *Redo the draw* (not *Remake*) replaces the fixtures.
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
division's `/schedule` screen is gone; the Schedule tab's `DivisionPanel` links to the page. Until
teams answer for themselves (`FIX-31`) a team's badge is its organisation's invitation, there is no
lock, and *Make the draw* says which teams' organisations have not accepted rather than refusing.
Deleting a division deletes its unplayed fixtures with it.

**A division with no format chosen is round robin** (`defaultDivisionFormat`): *Set fixtures by hand* (`Festival`) is only ever chosen, never a default, so a new sport's first division and a division added without a format start as round robin.
