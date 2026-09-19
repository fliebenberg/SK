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
timestamp: 2026-09-19T12:00:00Z
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
    - `20260808_create_system_admin_org.ts`: Creates the System Administration Organization (`org-system-admins`) and provisions admin org profiles and memberships.
    - `20260814_derive_org_counts.ts`: Drops the denormalized `team_count` / `site_count` / `member_count` columns (now computed live) and `org_memberships.expiry_processed`; adds org-scoped foreign key indexes.
    - `20260901_tournaments.ts`: The tournaments schema (Phase 1). Nine new tables, four columns on `game_participants`, two on `events`; the `SportsDay` rewrite; `events.type` made `NOT NULL` with a `CHECK`; the `seasons.settings` default moved to 3/1/0; and `game_participants`' three missing foreign keys, which needed 8 orphaned rows deleted first. See below.
    - `20260902_game_stage_id.ts`: Adds `games.stage_id` and its index (Phase 3). One column, and the one place this build deviated from the settled data model — see below.
    - `20260903_backfill_stages.ts`: **Data only, no schema change** (Phase 6), so nothing to mirror into `init-db.ts` — a database built from scratch has no rows to fix. Gives the stages their format implies to divisions created before Phase 5, and attaches orphaned tournament fixtures to their division's first stage where the answer is unambiguous (an event with exactly one division). Fixtures on multi-division events are **reported and left alone**: nothing in the row says which division they belonged to, and guessing would put a fixture in a table it never counted toward. Closes `PEOPLE-3` for existing rows, the way `FIX-12` closes it for new ones.
    - `20260919_sport_age_groups.ts`: Age groups become a per-sport list. Creates `sport_age_groups` (official entries curated by an admin, custom ones added by users), seeds every sport with the starter list, and replaces the free-text `age_group` on `teams`, `tournament_divisions` and `leagues` with `age_group_id` under a composite foreign key on `(sport_id, age_group_id)` — so an age group can only be held by something of its own sport. Existing values are carried over: a starter name match takes the official entry, anything else becomes a custom one. Managed by [AgeGroupManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/AgeGroupManager.ts); see [database_structure.md §2d](file:///c:/Fred/Coding/SK/docs/database_structure.md).

## The tournaments schema

A tournament is four levels deep, and each level is named for its parent so that a table name tells
you what deletes it:

    events (type='Tournament', format='Festival'|…)
      └─ tournament_divisions        the netball, the U14 rugby
           ├─ division_stages        pools, then the knockout
           │    └─ stage_entrants    who is in this stage, and in which pool
           ├─ division_entrants      the roster: a team, a person, or an unresolved label
           ├─ division_facilities    a narrowing of event_facilities
           └─ division_adjustments   a deduction or a walkover, recorded as an override

Plus `event_facilities` (the facilities in play) and `event_organizers` / `division_organizers` (the
two grant scopes — full rights over the tournament, or the whole of one division). Both are keyed on
`org_profiles`, never `users`, so a convenor can be appointed before they have an account; see
[okf/auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md) for what each scope carries.

Four things about it are worth knowing before touching it:

*   **A game names its stage directly, in `games.stage_id`** (added in Phase 3;
    `ON DELETE SET NULL`, so a played fixture survives its stage being removed). The data model's
    §4.4 originally said a fixture would reach its stage *through its participants' entrants*, with
    a column as a cheap denormalisation for later. **That indirection is not awkward, it is
    insufficient**, and in the ordinary case: an entrant belongs to the *division*, and
    `stage_entrants` deliberately puts the same entrant in the pool stage and the knockout that
    follows, so resolving through participants returns **both** stages of every pools-and-knockout
    division. Everything the choke point does needs a single answer — rewrite *one* stage's table,
    ask whether *this* stage is complete, delete *this* stage's fixtures on a regeneration, where
    deleting the knockout's alongside the pool's would be data loss rather than a slow query.
*   **An unknown competitor is a `game_participants` row with `team_id` null** and a `source_rule`
    beside a `source_game_id` or `source_stage_id`. Resolving it writes `team_id`, so the scoring
    screens and `calculateStandings` never learn that progression exists. What such a row *prints*
    is derived from the rule and never stored — one shared helper,
    [fixtureSide.ts](file:///c:/Fred/Coding/SK/shared/src/utils/fixtureSide.ts), so a label cannot
    drift from the rule it describes.
*   **`cached_standings` on `division_stages` and on `events` is written by one engine.**
    [standings.ts](file:///c:/Fred/Coding/SK/shared/src/utils/standings.ts) computes every table in
    the app — a pool, a division, a league season, and the weighted organisation roll-up — because
    progression resolves `{ type: 'standing', position: 1 }` against the same `rank` a viewer reads,
    and two implementations of that answer is what the whole design exists to prevent.
*   **`tournament_divisions` is the one table not named for its parent.** `event_divisions` would sit
    beside `event_sports` and read as another join table, which it is not.
*   **One function rewrites those caches, and every writer calls it.**
    `TournamentManager.recalculateForGame` (D30) — stage table, then event roll-up, then any league
    season, then progression. Callers reach it through
    `EventManager.recalculateStandingsForGame`, which also publishes, so a result cannot be changed
    without both the table and the rooms hearing about it. The two paths that deliberately bypass
    it (season attach/detach, and the wholesale deletes in `deleteEvent` and a regeneration) are
    documented in [docs/api_actions.md](file:///c:/Fred/Coding/SK/docs/api_actions.md); each has a
    reason it *cannot* use the choke point, not merely a preference.

Full reasoning: [docs/tournaments-data-model.md](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md).
Column-by-column: [docs/database_structure.md](file:///c:/Fred/Coding/SK/docs/database_structure.md) §11d–11k.

## Migrations vs a clean install

Two paths build the same schema and both must be kept in step when a table or column is added:

*   `npm run db:migrate` — [run-all-migrations.ts](file:///c:/Fred/Coding/SK/server/src/scripts/run-all-migrations.ts) runs each unrun file in `src/scripts/migrations/` in its own transaction and records its filename in `schema_migrations`. This is the path a **deployed** environment takes.
*   `npm run db:setup` — reset, then [init-db.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/init-db.ts), then seed. `reset-db.ts` is a `DROP SCHEMA public CASCADE`, so this path **destroys data**; take a dump first ([server/backups/](file:///c:/Fred/Coding/SK/server/backups/)).

`init-db.ts` **stamps every migration filename into `schema_migrations`** as it finishes, so a
freshly created database is correctly "already migrated" and `db:migrate` against it is a no-op.
Without that a clean install believed no migration had ever run and replayed all of them — harmless
only for as long as every migration happens to be written defensively, and it made the two paths
impossible to compare. **A new table therefore goes in both files**, `IF NOT EXISTS` in each.

**Diff the two paths rather than trusting the rule.** Restore a dump into a scratch database and
migrate it, build another with `db:init`, then `pg_dump --schema-only --no-owner --no-privileges`
both and compare. Two things this catches that reading the diff of your own change never will:

*   **A missed `init-db.ts` mirror is otherwise invisible** until a new environment is built months
    later. The 2026-09-01 diff found the reverse case as well — three `game_participants` foreign
    keys that `init-db.ts` had and no migration ever added, so every existing database was missing
    them (`FIX-10`).
*   **Column order is part of the diff**, because `pg_dump` prints columns in `attnum` order and
    `ALTER TABLE ADD COLUMN` appends. New columns must be appended in `init-db.ts` in the same order
    the migration adds them, not slotted in where they read best.

`ADD CONSTRAINT` is the one statement with no `IF NOT EXISTS`, so guard each on `pg_constraint` or a
re-run fails. Guard on the *column* rather than the constraint name when a database might already
have one under Postgres' auto-generated name — a name check will happily add a duplicate beside it.

## Derived vs Stored Values

Organization team/site/member counts are **computed live** by the queries in [OrganizationManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/OrganizationManager.ts), not stored. Caching them previously required background jobs that could not keep them accurate, because membership validity depends on the clock rather than on writes. Before denormalizing any similar value, read [docs/background-tasks.md](file:///c:/Fred/Coding/SK/docs/background-tasks.md).

## Integration Test Rule: Test Org Reuse

To prevent database spam and ensure stable integration tests:
- **Rule**: Reuse the common "App Test Org" inside all integration tests rather than creating new temporary organizations.
- Refer to [.agent/skills/test-org-reuse/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/test-org-reuse/SKILL.md) for enforcement rules.
