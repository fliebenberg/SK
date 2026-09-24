---
type: concept
title: Client Pages & Routing Maps
description: Layout of public viewer screens, admin controls, and navigation guard rules.
tags:
  - concept
  - routing
  - pages
  - navigation-guards
timestamp: 2026-09-24T12:00:00Z
---

# Client Pages & Routing Maps

The ScoreKeeper application implements a unified navigation layout across platforms, routing viewer actions and administrative portals. 

For implementation details, refer to the navigation schema in the app root [expo-app/app/](file:///c:/Fred/Coding/SK/expo-app/app/).

## Navigation Layout Strategy

- **Mobile Viewports (< 768px)**: Bottom tab bar navigation (up to 5 tabs). The Settings tab triggers a speed dial menu popover (providing quick links to My Account and Admin Dashboard).
- **Tablet / Desktop Viewports (>= 768px)**: Automatically repositions bottom tabs to a left-side navigation rail.
- **Admin Dashboard Layout**: Managed via a persistent sidebar on desktop, and native drawer/stack push-pop states on mobile.

## Public Viewer Routes

Public view routes are accessible to all unauthenticated users:
*   `/` (General landing page): Explains app features and prompts registration.
*   `/live`: Central feed showing real-time active games. Serves as the primary landing page for authenticated logged-in users.
*   `/games/[id]`: Detailed game viewport displaying score, play-by-play timelines, lineups, and team stats.
*   `/organizations/[id]`: Public details of sports organizations.
*   `/claim/index`: Organization administrator claim verification landing.
*   `/claim/refer`: Delegated referral page to nominate another contact.
*   `/claim/decline`: Invitation decline workflow.
*   `/teams`: Roster directories of public teams.
*   `/teams/[id]`: Team profiles, matches, and member rosters.
*   `/sites`: Venue directory list.
*   `/sites/[id]`: Maps address and Facilities inside a Site.
*   `/profile`: Personal configuration and preferences.
*   `/notifications`: In-app notification center.

## Administrative Dashboard Routes (`/admin/*`)

Admin workflows are restricted to authenticated managers/owners:
*   `/admin`: Core management dashboard.
*   `/admin/claim`: Claim ownership workflow of pre-populated legacy org profiles.
*   `/admin/organizations`: List of organizations managed by the user.
*   `/admin/organizations/new`: Org creation wizard.
*   `/admin/organizations/[id]`: Specific organization console.

### The organisation workspace (`/admin/[orgId]/*`)

Every screen below is behind [AuthGuard](file:///c:/Fred/Coding/SK/expo-app/components/AuthGuard.tsx),
applied at the layout so an unauthorized visitor never mounts the workspace or its subscriptions.

*   `/admin/[orgId]`: Organization console.
*   `/admin/[orgId]/teams`, `/teams/new`, `/teams/[teamId]`, `/teams/[teamId]/view`: Teams.
*   `/admin/[orgId]/people`, `/people/[membershipId]`, `/people/[membershipId]/view`: Rosters, staff roles and memberships.
*   `/admin/[orgId]/sites`, `/sites/[siteId]`, `/sites/[siteId]/facilities/[facilityId]`: Venues and courts.
*   `/admin/[orgId]/leagues`, `/leagues/[leagueId]`, `/leagues/[leagueId]/seasons/[seasonId]`: Leagues and seasons.
*   `/admin/[orgId]/settings`: Organization settings.

#### Fixtures, events and tournaments

*   `/admin/[orgId]/events`: The fixture list, split into **Events** and **Games** tabs (U2/U36) over
    one room, with multi-select role chips — Hosting / Convening / Attending — beside the
    `Upcoming / Past` toggle (U4/U5).
*   `/admin/[orgId]/events/create`: Scheduling **one match**, and nothing else. A tournament has no
    creation screen: it is named and dated in a prompt on the events list, written as a `Festival`
    (D1/U34) and opened on its own Setup tab, where the format and everything else is edited
    (U45). The route no longer takes a `type`.
*   `/admin/[orgId]/events/[eventId]`: One event. A `SingleMatch` shows its game; a `Tournament` shows
    its structure over `Setup / Schedule / Standings`, where **Setup is the setup checklist and
    nothing else** (U17/U48); an event whose `type` cannot be recognised shows an **error state
    rather than a Tournament** (U39 / `FIX-1`). Takes an optional `?tab=` so a step screen can
    return to the checklist after a refresh or a deep link.
*   `/admin/[orgId]/events/[eventId]/setup/basics`, `/setup/playing`, `/setup/scoring`,
    `/setup/fixtures`: **One setup step each** (U48). Basics is the identity, dates, base site,
    fields and organisers; playing is **Sports & Divisions** (U50–U52) — the tournament's sports,
    which save as they are pressed and each create a first division, and the divisions grouped
    under them; scoring is the points per
    result; fixtures is a status and the ways to add one. Basics and scoring **save themselves** —
    their own dirty state, their own [`<FloatingSaveBar>`](file:///c:/Fred/Coding/SK/expo-app/components/FloatingSaveBar.tsx),
    and only their own fields in the write; playing writes on every press, and fixtures holds
    nothing to save. Back always goes to the checklist, never to the previous
    step. The frame they share is
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
*   `/admin/[orgId]/events/[eventId]/entrants` (`?divisionId=` to open filtered): Getting teams in, on **both axes over one dataset**
    (U21) — *by division* ("who is in the u14 rugby?") and *by organisation* ("what is Northcliff
    entering?"). The organisation axis is where **inline team creation** lives, because that is the
    moment you discover a school has no u16 netball team. Also the **Entrants step** of the setup
    checklist (U48), so it carries the invite list — which writes on press rather than through a
    save bar, because every other control on the screen does. Convenors and sport organisers use it
    too, for the divisions they run only and without the invite list (2026-09-24, `UI-20`); their
    division's schedule screen links here rather than carrying its own editor.
*   `/admin/[orgId]/events/[eventId]/games/new`, `/games/[gameId]/edit`, `/view`, `/selection`,
    `/score`: One fixture. `/score` is the **Scorekeeper Console** for real-time event entry.
    `new` picks the division and stage a tournament fixture belongs to — silently where the
    collapse rule means there is only one of each (`FIX-12`).

> **The collapse rule (U15) decides whether a route is ever reached.** A level with exactly one child
> renders that child inline and shows no picker — so a tournament with one division shows that
> division's panel directly on its Schedule tab, and a division with one stage shows no stage
> tabs. **Since U50 this is layout only for divisions:** setup always lists the division and links
> to `/divisions/[divisionId]`, one included, and the Schedule tab links to `/divisions/[divisionId]/schedule`. The rule lives in
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

*   `/admin/reports`: User moderation reports (Global Admins only). Not analytics — see [docs/reports.md](file:///c:/Fred/Coding/SK/docs/reports.md). The `expo-app` screen is still a mockup on hardcoded data.
*   `/admin/settings`: Management configurations.
*   `/admin/users`: User management interface (restricted to Global Admins).

## Critical UI Rule: Navigation Guards

To prevent accidental data loss when editing rosters or logging game scores, all administrative editing forms must implement navigation guards to warn users before they navigate away with unsaved changes.

Splitting one form across several screens multiplies the guards rather than removing them: each of
the tournament setup step screens (U48) computes its own dirty state and calls `useUnsavedChanges`
itself, and each **clears the store on a successful save** — without that the screen stays dirty
and the next navigation raises a discard dialog over changes already written.
- Refer to [.agent/skills/unsaved-changes-warning/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/unsaved-changes-warning/SKILL.md) for enforcement.
