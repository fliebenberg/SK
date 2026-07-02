---
type: concept
title: Project Overview & Core Domains
description: High-level overview of ScoreKeeper, its target archetypes (Viewer vs Admin), and core glossary definitions.
tags:
  - concept
  - overview
  - domains
  - glossary
timestamp: 2026-07-02T14:56:00Z
---

# Project Overview & Core Domains

ScoreKeeper is a cross-platform application designed to manage sports organizations, teams, and events, while providing a real-time live viewer experience for fans.

For the full details on client page layouts and user authentication, see the OKF concepts [Client Pages & Routing Maps](file:///c:/Fred/Coding/SK/okf/client_routing.md) and [Authentication & Authorization Levels](file:///c:/Fred/Coding/SK/okf/auth_control.md).

## Target User Archetypes

1. **Fans / Viewers (Public/Unauthenticated)**:
   - Browse registered sports organizations, teams, and venues.
   - Follow active games with live play-by-play timelines, statistics, and scores updated instantly via WebSockets.
2. **Administrators / Officials (Authenticated Members)**:
   - Manage organizations, events, schedules, rosters, and facilities.
   - Record game events live via the dedicated scorekeeper dashboard interface.

## Core System Glossary

- **User**: The global application user account (handles authentication and global profiles).
- **Member (OrgProfile)**: An organization-specific persona. A User can have multiple Memberships across different Organizations.
- **Role**: Permission levels (Owner, Admin, Manager, Scorekeeper, Coach, Player) assigned to an `OrgMembership` or `TeamMembership`, rather than directly to a User.
- **Organization**: The top-level administrative container representing a league, school, club, or pub tournament.
- **Event**: A league, season, or tournament container that houses multiple games.
- **Game**: A single fixture between participants (teams or individuals).
- **Site**: A physical location/address (e.g., "City Sports Hub").
- **Facility**: A specific field, court, table, or track situated within a Site (e.g., "Field 2").
