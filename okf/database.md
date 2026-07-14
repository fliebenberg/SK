---
type: concept
title: Database & Data Persistence
description: Data storage configurations, schemas, file cache layouts, and migration patterns.
tags:
  - concept
  - database
  - PostgreSQL
  - migrations
  - persistence
timestamp: 2026-07-11T13:20:00Z
---

# Database & Data Persistence

ScoreKeeper uses PostgreSQL for relational database persistence and filesystem JSON stores for fast local caches.

For the detailed entity models and relationships, see [database_structure.md](file:///c:/Fred/Coding/SK/docs/database_structure.md) and [identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md).

## Storage Engines & Paths

1. **PostgreSQL Database**:
   - Connection: Configured via environment variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`) in [server/.env](file:///c:/Fred/Coding/SK/server/.env).
   - Handles schemas for Organizations, Teams, Events, Games, Memberships, and Users.
2. **Local Caches & Data Seeds**:
   - Directory: [server/data/](file:///c:/Fred/Coding/SK/server/data/) holds static data seeds and temporary configuration caches.

## Code Entrypoints

*   **Database Config**: [server/src/db.ts](file:///c:/Fred/Coding/SK/server/src/db.ts) initializes the PostgreSQL connection pool (using the `pg` package).
*   **Data Manager**: [server/src/DataManager.ts](file:///c:/Fred/Coding/SK/server/src/DataManager.ts) orchestrates reads and writes across the relational models and cache systems.
*   **Shared Models**: [shared/src/types/](file:///c:/Fred/Coding/SK/shared/src/types/) contains standard type declarations shared between client and server.
*   **Migrations**: [server/src/scripts/migrations/](file:///c:/Fred/Coding/SK/server/src/scripts/migrations/) holds sequential database modification scripts.
    - `20260705_add_league_and_season_logos.ts`: Adds branding logo support to leagues/seasons.
    - `20260711_rename_invite_cooldown_hours.ts`: Sets up default invite cooldown periods (2 weeks) and configures referral settings.

## Integration Test Rule: Test Org Reuse

To prevent database spam and ensure stable integration tests:
- **Rule**: Reuse the common "App Test Org" inside all integration tests rather than creating new temporary organizations.
- Refer to [.agent/skills/test-org-reuse/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/test-org-reuse/SKILL.md) for enforcement rules.
