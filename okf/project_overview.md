---
type: concept
title: Project Overview & Core Domains
description: High-level overview of ScoreKeeper, its target archetypes (Viewer vs Admin), and core glossary definitions.
tags:
  - concept
  - overview
  - domains
  - glossary
timestamp: 2026-09-01T21:30:00Z
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
- **Event**: One of exactly two things — a **SingleMatch** wrapping one game, or a **Tournament**
  containing many. `events.type` admits nothing else. A "sports day" is a Tournament whose `format`
  is `Festival`; it is not a third kind (D1).
- **League / Season**: A *separate* entity from an Event, and a common thing to confuse with one. A
  League is a recurring competition an organisation runs; a Season is one running of it, with a
  table and a fixture list. A game can belong to a Season **and** a Tournament at once — that is an
  ordinary row in `game_seasons`.
- **Division**: A competition within a Tournament — the netball, the U14 rugby. Has its own
  entrants, stages and standings.
- **Stage**: A phase of a Division — pools, then a knockout. Every Division has at least one, and
  the UI says nothing about staging when it has exactly one.
- **Entrant**: Who is competing in a Division: a Team, an individual Member, or an unresolved slot
  that carries only a label until someone fills it in.
- **Game**: A single fixture between participants (teams or individuals).
- **Site**: A physical location/address (e.g., "City Sports Hub"). **Never called a "venue" in the
  interface** — that word had drifted onto three different things at once (a Site, a Site + Facility
  pair, and `venue_hall`, one of the Facility *categories*), which is worse than having no word.
  `UI-14` tracks the screens still saying it.
- **Facility**: Anything at a Site worth putting a pin on — a field, court, hall, clubhouse, shop,
  car park or toilet block (the `category` values), each with its own `latitude`/`longitude`. It is
  **not** a synonym for a playing surface, and the UI must not call the set of them "fields": half
  of what an organiser selects for a tournament is never played on, and the tournament map is drawn
  from all of it. A sport that wants its own word for the surface it plays on has
  `Sport.facilityTerm` ("pitch", "lane", "court") — a display override on top of the general term,
  never a replacement for it.

The tournament nouns are defined in full in
[docs/tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md) and mapped to storage in
[okf/database.md](file:///c:/Fred/Coding/SK/okf/database.md).
