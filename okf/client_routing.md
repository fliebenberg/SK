---
type: concept
title: Client Pages & Routing Maps
description: Layout of public viewer screens, admin controls, and navigation guard rules.
tags:
  - concept
  - routing
  - pages
  - navigation-guards
timestamp: 2026-10-09T00:00:00Z
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

### The organisation workspace (`/admin/[orgId]/*`)

Every screen below is behind [AuthGuard](file:///c:/Fred/Coding/SK/expo-app/components/AuthGuard.tsx),
applied at the layout so an unauthorized visitor never mounts the workspace or its subscriptions.

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
    read-first (stage 2, [events.md](file:///c:/Fred/Coding/SK/docs/events.md) §7): its first tab is
    **Setting up** — five step cards, the setup itself — for an organiser while it is being set up,
    and **Overview** after and for everyone else, then `Schedule / Standings`. An event whose `type`
    cannot be recognised shows an **error state rather than a Tournament** (U39 / `FIX-1`). Takes an
    optional `?tab=` (`setup` is the first tab) so a screen can return to it after a refresh or a
    deep link.
*   `/admin/[orgId]/events/[eventId]/setup/playing`, `/admin/[orgId]/events/[eventId]/setup/fixtures`: the two step screens left
    from U48 — **Sports & Divisions** (the sports, their organisers, removing a sport) and
    **Fixtures** (each division's draw state), reached from the Setting up cards until the
    drill-down work (`FIX-26`–`FIX-28`) decides their place. Basic Info and Rules & scoring are
    dialogs on the first tab since stage 2, and their routes are gone. The frame the two share is
    [useSetupStepScreen](file:///c:/Fred/Coding/SK/expo-app/hooks/useSetupStepScreen.ts); the order
    and the routes are
    [setupSteps.ts](file:///c:/Fred/Coding/SK/expo-app/components/tournament/setupSteps.ts).
*   `/admin/[orgId]/events/[eventId]/divisions/[divisionId]`: One division's **setup** — its **name,
    sport and age group** as one form (U50; the only place any of them is edited — the sport from the
    tournament's own list, U51), its convenors, its fields, and deletion (event organisers only, U52),
    headed `{tournament} - {division}`. Opened from Sports & Divisions. **Basics only (U53):** no
    entrants, stages, fixtures or table — those are later setup steps.
*   `/admin/[orgId]/events/[eventId]/divisions/[divisionId]/schedule`: One division's **schedule** —
    its stages as navigation tabs (U13/U14), its generation controls, a link to its entrants, and its own table.
    What the Schedule tab opens when there are several divisions (U53).
*   `/admin/[orgId]/events/[eventId]/organisations/[participantOrgId]`: One organisation in a
    tournament (`FIX-26`, 2026-10-08) — its invitation and response, and its teams in every division,
    saved through a save bar. Reached from step 3 and the Organisations card. Two readers (`FIX-30`):
    the organisers, and the organisation's own members once it is invited — they answer, ask to
    withdraw, and see their teams read-only.
*   `/admin/[orgId]/events/[eventId]/entrants` (`?divisionId=` to open filtered): **Since `FIX-26`
    (2026-10-05) no longer reached from the tournament page**, whose step 3 adds and invites
    organisations and enters each one's teams in dialogs (docs/events.md §7); still linked from a
    division's schedule (`DivisionPanel`) until the division page (`FIX-27`) takes entering by
    division, and retired with the step chain (`FIX-28`). Getting teams in, on **both axes over one dataset**
    (U21) — *by division* ("who is in the u14 rugby?") and *by organisation* ("what is Northcliff
    entering?"). The organisation axis is where **inline team creation** lives, because that is the
    moment you discover a school has no u16 netball team. Also the **Entrants step** of the setup
    checklist (U48), so it carries the invite list — which writes on press rather than through a
    save bar, because every other control on the screen does. Convenors and sport organisers use it
    too, for the divisions they run only and without the invite list (2026-09-24, `UI-20`); their
    division's schedule screen links here rather than carrying its own editor.
*   `/admin/[orgId]/events/[eventId]/games/new`, `/admin/[orgId]/events/[eventId]/games/[gameId]/edit`, `/admin/[orgId]/events/[eventId]/games/[gameId]/view`,
    `/admin/[orgId]/events/[eventId]/games/[gameId]/selection`, `/admin/[orgId]/events/[eventId]/games/[gameId]/score`: One fixture. `score` is the **Scorekeeper Console** for real-time event entry.
    `new` picks the division and stage a tournament fixture belongs to — silently where the
    collapse rule means there is only one of each (`FIX-12`).

> **The collapse rule (U15) decides whether a route is ever reached.** A level with exactly one child
> renders that child inline and shows no picker — so a tournament with one division shows that
> division's panel directly on its Schedule tab, and a division with one stage shows no stage
> tabs. **Since U50 this is layout only for divisions:** setup always lists the division and links
> to `/admin/[orgId]/events/[eventId]/divisions/[divisionId]`, one included, and the Schedule tab links to `/admin/[orgId]/events/[eventId]/divisions/[divisionId]/schedule`. The rule lives in
> [shared/src/utils/collapseRule.ts](file:///c:/Fred/Coding/SK/shared/src/utils/collapseRule.ts) and
> the shared rendering is
> [DivisionPanel](file:///c:/Fred/Coding/SK/expo-app/components/tournament/DivisionPanel.tsx), so the
> inline case and the routed case cannot drift apart. Adding a second child restructures the screen,
> which is **announced before it happens** rather than sprung on the organiser. It applies to the
> pickers too: the entry screen shows no division picker when there is one division, and
> `games/new` shows no division or stage picker in that case either.

> **The standings tab is one table with a division scope selector (U28), and the scope decides the
> row rather than the filter (U29).** *All divisions* ranks the tournament's `scoringSubject` — for
> a `Festival` that is the organisation, so the default is the day's leaderboard by school. *One
> division* ranks its **entrants**, so a school entering u14A and u14B is two rows there and one
> line in the roll-up. The client reads what the server computed and never calculates a table of
> its own (D30).

## Critical UI Rule: Navigation Guards

To prevent accidental data loss when editing rosters or logging game scores, all administrative editing forms must implement navigation guards to warn users before they navigate away with unsaved changes.

Splitting one form across several screens multiplies the guards rather than removing them: each of
the tournament setup step screens (U48) computes its own dirty state and calls `useUnsavedChanges`
itself, and each **clears the store on a successful save** — without that the screen stays dirty
and the next navigation raises a discard dialog over changes already written.
- Refer to [.agent/skills/unsaved-changes-warning/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/unsaved-changes-warning/SKILL.md) for enforcement.
