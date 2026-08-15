---
type: concept
title: Client Pages & Routing Maps
description: Layout of public viewer screens, admin controls, and navigation guard rules.
tags:
  - concept
  - routing
  - pages
  - navigation-guards
timestamp: 2026-08-14T07:20:00Z
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
*   `/admin/organizations/[id]/events`: Create and manage seasons/tournaments.
*   `/admin/organizations/[id]/teams`: Create and manage organization teams.
*   `/admin/organizations/[id]/people`: Manage organization rosters, staff roles, and memberships.
*   `/admin/organizations/[id]/sites`: Manage organization venues/courts.
*   `/admin/games/[id]`: General edit panel for scheduling fixtures.
*   `/admin/games/[id]/score`: **Active Scorekeeper Console** for real-time play-by-play event entry.
*   `/admin/reports`: User moderation reports (Global Admins only). Not analytics — see [docs/reports.md](file:///c:/Fred/Coding/SK/docs/reports.md). The `expo-app` screen is still a mockup on hardcoded data.
*   `/admin/settings`: Management configurations.
*   `/admin/users`: User management interface (restricted to Global Admins).

## Critical UI Rule: Navigation Guards

To prevent accidental data loss when editing rosters or logging game scores, all administrative editing forms must implement navigation guards to warn users before they navigate away with unsaved changes.
- Refer to [.agent/skills/unsaved-changes-warning/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/unsaved-changes-warning/SKILL.md) for enforcement.
