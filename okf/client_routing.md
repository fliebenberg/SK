---
type: concept
title: Client Pages & Routing Maps
description: Layout of public viewer screens, admin controls, and navigation guard rules.
tags:
  - concept
  - routing
  - pages
  - navigation-guards
timestamp: 2026-09-03T00:00:00Z
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
*   `/admin/[orgId]/events/create?type=game|tournament`: Creation wizard. The tournament path picks a
    **format** (`Festival` / `RoundRobin` / `Knockout` / `PoolsKnockout`); "Sports Day" is gone, since
    a sports day is a `Tournament` whose format is `Festival` (D1/U34).
*   `/admin/[orgId]/events/[eventId]`: One event. A `SingleMatch` shows its game; a `Tournament` shows
    its structure with a setup checklist (U17); an event whose `type` cannot be recognised shows an
    **error state rather than a Tournament** (U39 / `FIX-1`).
*   `/admin/[orgId]/events/[eventId]/divisions/[divisionId]`: One division — its stages as navigation
    tabs (U13/U14), its roster and generation controls, its own table, and its convenors.
*   `/admin/[orgId]/events/[eventId]/entrants`: Getting teams in, on **both axes over one dataset**
    (U21) — *by division* ("who is in the u14 rugby?") and *by organisation* ("what is Northcliff
    entering?"). The organisation axis is where **inline team creation** lives, because that is the
    moment you discover a school has no u16 netball team. Event organisers only; a convenor reaches
    the same per-division editor through their division's screen, since both mount
    [DivisionEntrantsEditor](file:///c:/Fred/Coding/SK/expo-app/components/tournament/DivisionEntrantsEditor.tsx).
*   `/admin/[orgId]/events/[eventId]/games/new`, `/games/[gameId]/edit`, `/view`, `/selection`,
    `/score`: One fixture. `/score` is the **Scorekeeper Console** for real-time event entry.
    `new` picks the division and stage a tournament fixture belongs to — silently where the
    collapse rule means there is only one of each (`FIX-12`).

> **The collapse rule (U15) decides whether a route is ever reached.** A level with exactly one child
> renders that child inline and shows no picker — so a tournament with one division *is* its division
> screen and never links to `/divisions/[divisionId]`, and a division with one stage shows no stage
> tabs. The rule lives in
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
- Refer to [.agent/skills/unsaved-changes-warning/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/unsaved-changes-warning/SKILL.md) for enforcement.
