---
type: concept
title: Client Pages & Routing Maps
description: Layout of public viewer screens, admin controls, and navigation guard rules.
tags:
  - concept
  - routing
  - pages
  - navigation-guards
timestamp: 2026-10-22T00:00:00Z
---

# Client Pages & Routing Maps

The ScoreKeeper application implements a unified navigation layout across platforms, routing viewer actions and administrative portals. 

**The route list is the folder.** Expo Router makes every file under
[expo-app/app/](file:///c:/Fred/Coding/SK/expo-app/app/) a route, so this page does **not** list every
screen — a hand-kept copy of the folder goes stale, as the old one did (rewritten 2026-10-09, when
nine of its routes no longer existed). It records what the folder cannot tell you: who can open each
part of the app, how you get around it, and the routes whose behaviour is not obvious from their
name — each linking the feature doc that owns it. **Any route written in backticks here must exist**:
`npm run check:routes` (pre-commit) fails on one that does not.

## Getting around

- **Phones (< 768px)**: a bottom menu — Live, Orgs, Family (guardians only), Teams, Settings. Settings opens the account settings, or for a system admin a small menu offering Admin Portal and My Account.
- **Tablet / desktop (>= 768px)**: a left navigation rail with the same destinations plus Sites.
- **Org workspace** (`/admin/[orgId]`): the rail swaps to the workspace's menu on desktop; on a phone a floating workspace button opens it, and the screens are a stack with their own `ScreenHeader`.

Full description, including where Exit sits: [design_spec.md §2](file:///c:/Fred/Coding/SK/docs/design_spec.md).

## Who can open what

| Folder | Routes | Who |
| --- | --- | --- |
| `app/index.tsx`, `app/landing.tsx` | `/` and `/landing` | Anyone. `/` only decides where to go: the Live feed when signed in, `/landing` otherwise. |
| `app/(auth)/` | `/login`, `/signup`, `/forgot-password`, `/reset-password` | Anyone. A guarded screen sends a visitor to `/login` with a redirect back. |
| `app/claim/` | `/claim`, `/claim/refer`, `/claim/decline` | Anyone holding an invitation to administer an org ([nomination-process.md](file:///c:/Fred/Coding/SK/docs/nomination-process.md)). |
| `app/(tabs)/` | `/` (Live feed), `/organizations`, `/organizations/[orgId]`, `/teams`, `/sites`, `/family`, `/settings` | Anyone; the directories are public. `/family` and `/settings` show their content only when signed in. |
| `app/leagues/` | `/leagues/[leagueId]` | Anyone: a league's public page. |
| `app/(tabs)/events/` | `/events/[eventId]` and the pages under it | Anyone, signed in or not: a tournament as the public sees it — read-only for everyone, an organiser included (`FIX-25`). |
| `app/(tabs)/admin/` | `/admin`, `/admin/users`, `/admin/reports`, `/admin/sports` | **System admins only** (`AuthGuard requireGlobalAdmin` on the layout). `/admin/reports` is user moderation, not analytics, and still a mockup on hardcoded data ([reports.md](file:///c:/Fred/Coding/SK/docs/reports.md)). |
| `app/admin/[orgId]/` | the org workspace, below | **Anyone with a role in that org** (`AuthGuard orgId` on the layout); what they may change depends on the role. A guardian holds no membership, so it refuses them. |

Every guard is a UX gate only: each action behind it is authorized again on the server, which is the
real boundary ([auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md)).

## Routes worth a note

*   `/family`: **My Family** — a guardian's children (`MEMBER-3`): their teams, their fixtures from
    the org's public fixtures room, whether each may use ScoreKeeper themselves (the guardian's
    switch), inviting them once allowed, and the guardian's own details at that org, read-only. It
    reads the user's own `dependants`, so it shows nothing to anyone who is not a guardian, and the
    rail and bottom menu list it only when there are dependants.

*   `/events/[eventId]`: **a tournament as the public sees it** (`FIX-25`, [events.md](file:///c:/Fred/Coding/SK/docs/events.md)
    §11). Its routes — the tournament, `/events/[eventId]/divisions/[divisionId]`,
    `/events/[eventId]/games/[gameId]`, an organisation's and a team's results pages (`/events/[eventId]/standings/organisations/[participantOrgId]`, `/events/[eventId]/standings/teams/[entrantId]`) and
    `/events/[eventId]/sports` — mount the workspace's own pages inside `PublicTournamentProvider`
    ([tournamentLinks.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/tournamentLinks.tsx)).
    **Every tournament page builds its links with `useTournamentLinks`**, never a workspace path of its own, so a
    link stays on the side it started; and under the provider the page edits nothing and shows nothing
    only those taking part see (capabilities are not asked, no roster, no players' names). A shared
    link opens it directly, signed in or not.

### The organisation workspace (`/admin/[orgId]/*`)

Every screen below is behind [AuthGuard](file:///c:/Fred/Coding/SK/expo-app/components/AuthGuard.tsx),
applied at the layout so an unauthorized visitor never mounts the workspace or its subscriptions.

The workspace menu's pages are listed once, in
[constants/workspaceNav.ts](file:///c:/Fred/Coding/SK/expo-app/constants/workspaceNav.ts), which both
the sidebar and the phone's workspace menu map over (`UI-27`): a new workspace page goes there, and
`currentWorkspacePage` names the one on screen.

*   `/admin/[orgId]`: Organization console.
*   `/admin/[orgId]/teams`, `/admin/[orgId]/teams/[teamId]`: The Teams list and one read-first team page — read-only for anyone but Admin and Staff (there is no separate view route; Add team is a dialog). [teams.md](file:///c:/Fred/Coding/SK/docs/teams.md).
*   `/admin/[orgId]/people`, `/admin/[orgId]/people/[membershipId]`: The People list and one read-first person page — read-only for anyone but Admin and Staff (there is no separate view route). [people.md](file:///c:/Fred/Coding/SK/docs/people.md).
*   `/admin/[orgId]/people/import`: Import people and their guardians from a spreadsheet — admin or staff, opened from the People screen's `⋯` menu. Rules: [identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md) §8.
*   `/admin/[orgId]/sites`, `/admin/[orgId]/sites/[siteId]`: The Sites list and one read-first site page, its facilities edited in dialogs on it — read-only for anyone but Admin and Staff (there is no separate view route, and facilities have no route of their own; Add site is a dialog). [sites.md](file:///c:/Fred/Coding/SK/docs/sites.md).
*   `/admin/[orgId]/leagues`, `/admin/[orgId]/leagues/[leagueId]`, `/admin/[orgId]/leagues/[leagueId]/seasons/[seasonId]`: Leagues and seasons.
*   `/admin/[orgId]/profile`: The org's profile — identity, about, address and sports, read-first
    with one edit dialog per card. `/admin/[orgId]/address` shows the address on a map.
*   `/admin/[orgId]/settings`: How the org runs — timezone and minors, one card per setting, each
    saving itself.
*   `/admin/[orgId]/nominate`: Only while the org has no administrator; the menu shows it in amber
    above the rest. All three: [org-profile.md](file:///c:/Fred/Coding/SK/docs/org-profile.md).

#### Fixtures, events and tournaments

*   `/admin/[orgId]/events`: Fixtures & Events, read-first (2026-10-04,
    [events.md](file:///c:/Fred/Coding/SK/docs/events.md)). One row per event: a single match opens
    its game, a tournament its event page. **Mine / All**, **Events / All games** and **Upcoming /
    Past** switches; sport, kind and role behind one Filters button. An event is **Past only once its
    last day is**, so a tournament still running stays under Upcoming (`FIX-22`).
*   `/admin/[orgId]/events/create`: Scheduling **one match**, and nothing else. A tournament has no
    creation screen: it is named and dated in a dialog on the events list, written as a `Festival`
    (D1/U34) and opened on its own Setup tab, where the format and everything else is edited
    (U45). The route no longer takes a `type`.
*   `/admin/[orgId]/events/[eventId]`: One event. A `SingleMatch` shows its game; a `Tournament` is
    read-first ([events.md](file:///c:/Fred/Coding/SK/docs/events.md) §7): its first tab is the
    **Overview** — cards that carry their status while it is being set up (2026-10-09; the
    *Setting up* tab of step cards is gone) — then `Schedule / Standings`. An event whose `type`
    cannot be recognised shows an **error state rather than a Tournament** (U39 / `FIX-1`). Takes an
    optional `?tab=` (`setup` is the first tab) so a screen can return to it after a refresh or a
    deep link, and with `tab=schedule` an optional `&division=` that opens the Schedule on that
    division (the division page's *Edit in the Schedule ›*, 2026-10-16).
*   `/admin/[orgId]/events/[eventId]/divisions/[divisionId]`: **One division, read first** (`FIX-27`,
    2026-10-09; docs/events.md §8) — a banner with its state in the same words as its tile, a
    what's-next strip, and cards: its **teams** (added, replaced, withdrawn and removed here — a
    convenor runs the whole division from this page), **how it is played**, **the draw and its
    fixtures**, the **table**, and its **organisers and courts**. Its details and its format are
    dialogs; deleting it is in the ⋯ menu. Opened from a division tile, the draw step and the
    Schedule tab. It replaced the division's basics form and its schedule screen (U53).
*   `/admin/[orgId]/events/[eventId]/sports`, `/admin/[orgId]/events/[eventId]/organisations`: the
    **full pages** of the Overview's Sports & divisions and Organisations & teams cards (*See all ›*,
    2026-10-09) — the same things the card shows, the same way, with more room. They load what they
    need through [useTournamentData](file:///c:/Fred/Coding/SK/expo-app/hooks/useTournamentData.ts),
    the same rooms the tournament page joins. Fixtures' full page is the Schedule tab. A sport's
    organiser who does not run the tournament gets their own sports here and on the card: the
    sport's ⋯ (*Sport organisers*, a dialog) and, while setting up, ＋ Add a … division.
    The U48 step screens (`setup/playing`, `setup/fixtures`, `entrants`) and their step chain were
    retired with `FIX-28` (2026-10-09).
*   `/admin/[orgId]/events/[eventId]/todo`: **To do** (`FIX-24`, 2026-10-18) — everything a taking-part
    organisation still owes the tournament, the viewer's own first, then its coaches'; the Overview
    card's *See all ›*. [TournamentTodo.tsx](file:///c:/Fred/Coding/SK/expo-app/components/tournament/TournamentTodo.tsx).
*   `/admin/[orgId]/events/[eventId]/organisations/[participantOrgId]`: One organisation in a
    tournament (`FIX-26`, 2026-10-08) — its invitation and response, and its teams in every division,
    saved through a save bar. Reached from the Organisations & teams card and its full page. Two readers (`FIX-30`):
    the organisers, and the organisation's own members once it is invited — they answer, ask to
    withdraw, and see their teams read-only.
*   `/admin/[orgId]/events/[eventId]/games/[gameId]`: **One game's page** (stage 3, 2026-10-15) —
    the scoreboard, the teams' sheets, match events and when & where, read first; edited through its
    dialogs (docs/events.md §9). Replaced the `view` and `edit` screens.
*   `/admin/[orgId]/events/[eventId]/games/[gameId]/selection`, `/admin/[orgId]/events/[eventId]/games/[gameId]/score`:
    `score` is the **Scorekeeper Console** for real-time event entry, and `selection` is Pick team;
    both come back to the game's page. There is no `games/new` route since 2026-10-17 (`FIX-36`): a
    tournament fixture is added with the Schedule's *Add a fixture* sheet, wherever it is opened.

> **The collapse rule (U15) decides whether a route is ever reached.** A level with exactly one child
> renders that child inline and shows no picker — so a tournament with one division shows that
> division's panel directly on its Schedule tab, and a division with one stage shows no stage
> tabs. **Since U50 this is layout only for divisions:** setup always lists the division and links
> to `/admin/[orgId]/events/[eventId]/divisions/[divisionId]`, one included, and so does the Schedule tab. The rule lives in
> [shared/src/utils/collapseRule.ts](file:///c:/Fred/Coding/SK/shared/src/utils/collapseRule.ts) and
> the shared rendering was `DivisionPanel`, so the inline case and the routed case could not drift
> apart. **Revised 2026-10-12 (Phase 7):** the Schedule tab is now the tournament's schedule — a grid by facility on a wide screen, a list by start time on a phone — for any number of divisions, so it no longer collapses to one division's panel, and `DivisionPanel` is deleted. A division's fixtures live on its page (`DivisionFixturesCard`). The collapse rule still governs the pickers. Adding a second child restructures the screen,
> which is **announced before it happens** rather than sprung on the organiser. It applies to the
> pickers too: the entry screen shows no division picker when there is one division, and the
> *Add a fixture* sheet shows no stage picker in that case either.

> **The Standings tab leads with the leaderboard by organisation, and every row opens a page**
> (stage 4, 2026-10-17; it replaced U28's one table with a division scope selector). An
> organisation opens `/admin/[orgId]/events/[eventId]/standings/organisations/[participantOrgId]`,
> a team `/admin/[orgId]/events/[eventId]/standings/teams/[entrantId]`, and a division its own page,
> whose Standings card holds its tables — there is no second division table page, so each table is
> shown in one place. A school entering U14 A and U14 B is two rows in the division's table and one
> line on the leaderboard. The client reads what the server computed and never calculates a table
> of its own (D30). Full description: [docs/events.md](file:///c:/Fred/Coding/SK/docs/events.md) §10.

## Critical UI Rule: Navigation Guards

Nobody loses typed work by leaving a screen, closing a dialog or closing the browser tab. How a
screen guards its edits follows from how it saves: a read-first page's `EditDialog` asks inside the
dialog, a switch that saves when pressed needs no guard, and a whole-page form with the floating
save bar calls `useUnsavedChanges`, which catches back navigation (`beforeRemove`), the side rail
and the workspace menu (the shared store), and on web the tab closing (`beforeunload`). Each such
form **clears the store on a successful save** — without that the next navigation raises a discard
dialog over changes already written.
- Refer to [.agent/skills/saving-edits/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/saving-edits/SKILL.md) for enforcement.
