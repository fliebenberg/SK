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
timestamp: 2026-09-24T18:00:00Z
---

# Database & Data Persistence

ScoreKeeper uses PostgreSQL for relational database persistence and filesystem JSON stores for fast local caches.

For the detailed entity models and relationships, see [database_structure.md](file:///c:/Fred/Coding/SK/docs/database_structure.md) and [identity_structure.md](file:///c:/Fred/Coding/SK/docs/identity_structure.md).

## Storage Engines & Paths

1. **PostgreSQL Database**:
   - Connection: Configured via environment variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`) in [server/.env](file:///c:/Fred/Coding/SK/server/.env).
   - Handles schemas for Organizations, Teams, Events, Games, Memberships, and Users.
2. **Seeds**: [server/src/scripts/setup/](file:///c:/Fred/Coding/SK/server/src/scripts/setup/) — see "Seed tiers and the test organisations" below.

## Code Entrypoints

*   **Database Config**: [server/src/db.ts](file:///c:/Fred/Coding/SK/server/src/db.ts) initializes the PostgreSQL connection pool (using the `pg` package).
*   **Transactions run on one connection** — `this.transaction(async (tx) => …)` in a manager ([BaseManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/BaseManager.ts)), `pool.connect()` in a script. `this.query('BEGIN')` or `pool.query('BEGIN')` lets each statement take a different pooled connection, so the block is atomic only while the pool is idle; under 30 concurrent writes it lost 6 of 15 valid events (`TX-1`). **Every statement inside the block, including a helper's, goes through `tx`**, and results are read back after it returns. `npm run check:transactions` (pre-commit) rejects the pooled pattern; [test-transactions.ts](file:///c:/Fred/Coding/SK/server/src/scripts/test-transactions.ts) exercises the converted paths.
*   **Data Manager**: [server/src/DataManager.ts](file:///c:/Fred/Coding/SK/server/src/DataManager.ts) orchestrates reads and writes across the relational models and cache systems.
*   **Shared Models**: [shared/src/types/](file:///c:/Fred/Coding/SK/shared/src/types/) contains standard type declarations shared between client and server.
*   **Migrations**: [server/src/scripts/migrations/](file:///c:/Fred/Coding/SK/server/src/scripts/migrations/) holds sequential database modification scripts.
    - `20260705_add_league_and_season_logos.ts`: Adds branding logo support to leagues/seasons.
    - `20260711_rename_invite_cooldown_hours.ts`: Sets up default invite cooldown periods (2 weeks) and configures referral settings.
    - `20260808_create_system_admin_org.ts`: Creates the System Administration Organization (`org-system-admins`) and provisions admin org profiles and memberships.
    - `20260810_migrate_sport_ids.ts`: **Data only, no schema change.** Canonicalises sport ids from the legacy `sport-` prefix to clean slugs (`sport-rugby` → `rugby`), duplicating the `sports` rows first so the foreign keys hold, repointing `teams`, `games`, `leagues`, `facilities` and the three sport join tables, then deleting the prefixed originals.
    - `20260810_update_rugby_event_templates.ts`: **Data only.** Rewrites rugby's `sports.event_templates` from `RUGBY_SEED_SPEC`. The seed is the source of truth for the spec; a full rewrite is what keeps the database copy from drifting field by field, which is why three migrations do the same thing on different dates and their order does not matter.
    - `20260815_rugby_trigger_team.ts`: **Data only.** Adds `triggerTeam: 'same' | 'opponent'` to the rugby templates, so a spawned follow-up event knows whose it is. The rule previously lived in expo-app as a hardcoded pair of template ids, where neither the server's edit cascade nor the event feed could see it. Rewrites `event_templates` from the seed.
    - `20260815_rugby_trigger_event_data.ts`: **Data only.** Moves the scrum outcomes' `eventData` to `triggerEventData` — it was being merged onto the event being *edited* rather than the one being spawned, so setting a free kick's outcome to Scrum overwrote the free kick's own infringement reason. Rewrites `event_templates` from the seed.
    - `20260820_add_sport_event_sections.ts`: Adds `sports.event_sections` (JSONB) and backfills each sport's list from the distinct `section` values its templates name, in first-appearance order, with the headings `DynamicScoringPanel` used to hardcode. Never overwrites a list already written by the sport editor.
    - `20260820_rename_sport_periods_setting.ts`: **Data only.** Renames `sports.default_settings.periods` to `scheduledPeriods`, matching the game- and event-level overrides that shadow it — under the old name an override written as `scheduledPeriods` was silently ignored.
    - `20260814_derive_org_counts.ts`: Drops the denormalized `team_count` / `site_count` / `member_count` columns (now computed live) and `org_memberships.expiry_processed`; adds org-scoped foreign key indexes.
    - `20260901_tournaments.ts`: The tournaments schema (Phase 1). Nine new tables, four columns on `game_participants`, two on `events`; the `SportsDay` rewrite; `events.type` made `NOT NULL` with a `CHECK`; the `seasons.settings` default moved to 3/1/0; and `game_participants`' three missing foreign keys, which needed 8 orphaned rows deleted first. See below.
    - `20260902_game_stage_id.ts`: Adds `games.stage_id` and its index (Phase 3). One column, and the one place this build deviated from the settled data model — see below.
    - `20260903_backfill_stages.ts`: **Data only, no schema change** (Phase 6), so nothing to mirror into `init-db.ts` — a database built from scratch has no rows to fix. Gives the stages their format implies to divisions created before Phase 5, and attaches orphaned tournament fixtures to their division's first stage where the answer is unambiguous (an event with exactly one division). Fixtures on multi-division events are **reported and left alone**: nothing in the row says which division they belonged to, and guessing would put a fixture in a table it never counted toward. Closes `PEOPLE-3` for existing rows, the way `FIX-12` closes it for new ones.
    - `20260905_referral_resend_and_nominators.ts`: Adds `org_claim_referrals.last_sent_at`, so a re-nomination resends only once the cooldown has passed without losing the original `created_at` (NULL on older rows reads as `created_at`); and `org_claim_referral_nominators`, because one referral row can only credit one nominator while a second person entering the same address must still see "you have referred this org". Backfilled from `referred_by_user_id`. See [docs/nomination-process.md](file:///c:/Fred/Coding/SK/docs/nomination-process.md) §2.
    - `20260919_sport_age_groups.ts`: Age groups become a per-sport list. Creates `sport_age_groups` (official entries curated by an admin, custom ones added by users), seeds every sport with the starter list, and replaces the free-text `age_group` on `teams`, `tournament_divisions` and `leagues` with `age_group_id` under a composite foreign key on `(sport_id, age_group_id)` — so an age group can only be held by something of its own sport. Existing values are carried over: a starter name match takes the official entry, anything else becomes a custom one. Managed by [AgeGroupManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/AgeGroupManager.ts); see [database_structure.md §2d](file:///c:/Fred/Coding/SK/docs/database_structure.md).
    - `20260920_event_sport_organizers.ts`: The third organiser scope — one sport of one tournament (D33, widened 2026-09-20). Creates `event_sport_organizers`, keyed on **(event, sport, profile)** with `ON DELETE CASCADE` on both halves, plus the `org_profile_id` index its two sibling grant tables carry. A rule rather than a list: it covers a division of that sport added tomorrow, and stops covering one moved to another sport, without a row being touched.
    - `20260921_host_is_a_participant.ts`: **Data only, no schema change.** Backfills the host into `event_organizations` for every existing event. Participation used to be implicit for the host and unioned back in by each reader, which left nowhere to record a host that runs a tournament without competing in it — an absent row already meant "never added" and so could not also mean "removed". See "Who is taking part in an event" below.
    - `20260920_org_short_code.ts`: Every organisation gets a short code. Backfills `organizations.short_name` from the name where it was blank, then makes the column `NOT NULL` with a non-blank `CHECK`. Codes are **not** unique by design — see "Organisation short codes" below.
    - `20260924_last_invite_email.ts`: Adds `org_profiles.last_invite_email`, the address the last member invite went to, so the resend cooldown is per address rather than per person. Backfilled from `email` where an invite had been sent.
    - `20260924_rename_invite_cooldown_setting.ts`: **Data only, no schema change.** Renames the `system_settings` key `org_admin_invite_cooldown_hours` to `invite_cooldown_hours`, keeping its value: one setting paces both org-claim referrals and member invites, and the old name suggested only the first.
    - `20260926_profile_guardians.ts`: Guardians of players (`MEMBER-3`). Creates `profile_guardians` — a guardian's org profile linked to a player's in the same org, many-to-many, with `relationship`, `is_primary` (one active primary per player) and `start_date` / `end_date` — and adds `org_profiles.own_account_allowed` (tri-state: `NULL` means the org's setting decides) with `own_account_set_at` / `own_account_set_by`. Being a guardian is derived from an active link and is **never** an `org_memberships` row, because a membership row is a permission. See [guardians-implementation-plan.md](file:///c:/Fred/Coding/SK/docs/guardians-implementation-plan.md) §0.1 and §0.3.

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

Plus `event_facilities` (the facilities in play) and the three grant tables `event_organizers`,
`event_sport_organizers` and `division_organizers` — full rights over the tournament, over one of
its sports, or over one division. All three are keyed on `org_profiles`, never `users`, so a convenor
can be appointed before they have an account; see
[okf/auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md) for what each scope carries.
`event_sport_organizers` keys on **(event, sport)** and so is a rule rather than a list: it covers
every division of that sport, including ones created later.

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

**`npm run check:migrations`** (from `server/`) catches the two omissions that go unnoticed
longest: a migration missing from the catalogue above, and a migration that creates or alters a
table `init-db.ts` never mentions. A migration with nothing to mirror exempts itself by saying
"Data only, no schema change" in its header. It is a cheap static check, not a substitute for the
diff below — it only asks whether the table name *appears* in `init-db.ts`.

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

## Seed tiers and the test organisations

The seed has two tiers (split 2026-09-24, `DATA-3`). **Core**
([seedCore.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/seedCore.ts)) is what the app needs
to work, and it is all a production install gets (`db:seed:core`). **Development** is the test
organisations, [fixtures/testOrgs.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/fixtures/testOrgs.ts):
four made-up organisations with "Test" in their names, loaded by `db:seed` into every development
database and by `db:test:setup` into the separate `sk_test` database. Commands and logins are in the
[setup README](file:///c:/Fred/Coding/SK/server/src/scripts/setup/README.md).

Three rules keep them useful as a known dataset:

*   **Nothing in them is generated at load time.** Ids, dates and the password hash are literals or
    are derived from literals, so a reload gives identical rows and a test can state what it
    expects. Membership validity depends on the clock, so every start and end date is a fixed date
    in the past, never `NOW()`.
*   **Every row they own starts with `fx-`**, and nothing else uses that prefix. `db:test-orgs`
    relies on it: it deletes every row whose `id` or `…_id` column starts with `fx-`, then follows
    foreign keys to remove what depends on those rows. There is no table list to keep up to date.
    Anything built on a test org through the app (an event it hosted, a game its team played) goes
    with it.
*   **A seeded sport belongs to its seed file.** `db:seed` rewrites the settings, sections and
    templates of every sport in [seeds/sports/](file:///c:/Fred/Coding/SK/server/src/scripts/setup/seeds/sports/)
    (rugby and netball), so a change made in the sport editor lasts only until the next reseed
    unless it is copied back into the seed.
*   **They are a base, not a catalogue of edge cases.** A test that needs a special case adds it on
    top rather than editing the shared file, so one test's setup can't change another test's
    expected results.

## Who is taking part in an event

`event_organizations` is the list of organisations **competing**, and since 2026-09-21 the host is
an ordinary row in it. `events.org_id` says who *runs* the event and nothing more; the two are
independent, so a school can host a tournament it does not play in.

It used to be implicit — the table held everybody else and each reader unioned `events.org_id` back
in. The saving was real and the cost was that hosting and competing could not be told apart:
an absent row already meant "the host was never added", so it could not also mean "the host was
removed". `EventManager.addEvent` now writes the host's row, the migration backfilled the old
events, and `TournamentManager.getEventCandidateTeams` reads `event_organizations` alone — which is
what makes taking the host off the list actually remove its teams from the entry grid.

Two consequences worth knowing. The single-match screens
([events/create](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/create.tsx) and
[games/[gameId]/edit](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/events/%5BeventId%5D/games/%5BgameId%5D/edit.tsx))
used to filter the acting organisation out of `participatingOrgIds` on the same assumption, and
`UPDATE_EVENT` replaces the whole set — so they would have silently removed the host from its own
match. Both now send both sides. And `syncPlayingOrgs` still excludes the host when adding
organisations whose teams appear in a fixture; harmless, because the host now has its row from
creation, but it means a host removed by hand is not re-added by playing.

## Organisation short codes

`organizations.short_name` is **`NOT NULL` with a `CHECK (btrim(short_name) <> '')`** since
2026-09-20 ([20260920_org_short_code.ts](file:///c:/Fred/Coding/SK/server/src/scripts/migrations/20260920_org_short_code.ts)).
`NOT NULL` alone would accept `''`, which is the state the change exists to remove, so the two
always travel together.

It became required when the tournament entrants screen made it structural — a column heading, a
tab, a team flag on a phone are all places a full name does not fit. A screen that falls back to
the name for the organisations that never set a code is a screen with broken columns.

**Codes are deliberately not unique**, and no index enforces otherwise. Two schools really are both
`NHS`; a uniqueness constraint would start refusing the obvious code and push people into `NHS2`.
Where a code could be ambiguous the UI shows the full name beside it. The migration's numeric
suffixing is cosmetic — it only stops the *backfill* manufacturing collisions nobody chose.

Nothing asks a user for a code they have not been offered.
[`deriveOrgShortCode`](file:///c:/Fred/Coding/SK/shared/src/utils/orgShortCode.ts) turns a name into
initials (dropping connectives, so "University of Cape Town" is `UCT`), and one function serves
three jobs: it backfilled the existing rows, it pre-fills the field on all three create paths
through [`useOrgShortCode`](file:///c:/Fred/Coding/SK/expo-app/hooks/useOrgShortCode.ts), and it is
the server's fallback in `OrganizationManager.addOrganization` for a caller that sends none. An
**update** that names `shortName` may not blank it and is refused rather than re-derived: the
organisation already has a code people have seen.

## Derived vs Stored Values

Organization team/site/member counts are **computed live** by the queries in [OrganizationManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/OrganizationManager.ts), not stored. Caching them previously required background jobs that could not keep them accurate, because membership validity depends on the clock rather than on writes. Before denormalizing any similar value, read [docs/background-tasks.md](file:///c:/Fred/Coding/SK/docs/background-tasks.md).

## Integration Test Rule: Test Org Reuse

New tests should start from the test organisations above, against `sk_test`. The existing
integration scripts predate them and still use the rule below until a test framework replaces them (`DB-2`).

To prevent database spam and ensure stable integration tests:
- **Rule**: Reuse the common "App Test Org" inside all integration tests rather than creating new temporary organizations.
- Refer to [.agent/skills/test-org-reuse/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/test-org-reuse/SKILL.md) for enforcement rules.
