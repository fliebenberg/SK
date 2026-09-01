# Database Structure

This document describes the database schema for the Sports Manager application. The database is powered by **PostgreSQL**.

## Relationship Diagram (Conceptual)

Below is a simplified view of how the core tables relate to each other:

- **Organizations** own **Sites**, **Facilities**, **Teams**, and **Events**.
- **Sports** are associated with **Organizations**, **Teams**, **Events**, and **Facilities**.
- **Persons/Profiles** belong to **Organizations** and **Teams** via membership tables.
- **Users** are authentication accounts that can be linked to **Persons** (implied via email) and have **Favorites**, **Badges**, and **Notifications**.
- **Events** contain **Games**, which involve **Teams** and take place at **Sites** and **Facilities**.
- A **Tournament** event contains **Divisions**, each containing **Stages** and **Entrants**. A
  **Game** reaches its stage through its participants' entrants, not through a column of its own.

---

## Tables

### 1. `addresses`
Stores physical locations used by various entities.
- `id` (TEXT, PK)
- `full_address` (TEXT)
- `address_line_1` (TEXT)
- `address_line_2` (TEXT)
- `city` (TEXT)
- `province` (TEXT)
- `postal_code` (TEXT)
- `country` (TEXT)
- `latitude` (DOUBLE PRECISION)
- `longitude` (DOUBLE PRECISION)

### 2. `sport_categories`
Table for referential integrity and metadata for grouping sports.
- `id` (TEXT, PK)
- `name` (TEXT): e.g., 'Athletics', 'Target Sports'.
- `icon_url` (TEXT): Optional icon graphic.

### 2b. `sports`
Metadata for supported sports.
- `id` (TEXT, PK): Unique identifier (e.g., 'rugby', '100m').
- `name` (TEXT): Display name of the sport.
- `category_id` (TEXT): FK to `sport_categories.id`.
- `participant_type` (TEXT): 'TEAM' or 'INDIVIDUAL'.
- `match_topology` (TEXT): 'HEAD_TO_HEAD' or 'MULTI_COMPETITOR'.
- `default_settings` (JSONB): Contains rules, periods, positions, event types, match resolution logic.
- `event_sections` (JSONB): The scoring panels this sport stacks, in order — `[{ id, name, affectsScore? }]`. A template's `section` names one by `id`; `affectsScore` is what decides whether recording it moves the scoreboard.
- `event_templates` (JSONB): The scoring events this sport can record, each naming the `section` it files under. The source of truth for what a scoring screen offers.
- `facility_term` (TEXT): Term used for the sport's facility (e.g., 'Field', 'Court').
- `period_term` (TEXT): What this sport calls a period — 'Half', 'Quarter', 'Period', 'Innings'.

### 2c. `sport_presets`
Variation templates for a specific sport.
- `id` (TEXT, PK)
- `sport_id` (TEXT): FK to `sports.id`.
- `name` (TEXT): Name of preset (e.g., 'U13 Rugby').
- `settings_override` (JSONB)

### 3. `organizations`
High-level entities like schools, clubs, or federations.
- `id` (TEXT, PK): Unique identifier.
- `name` (TEXT): Full name of the organization.
- `short_name` (TEXT): Abbreviated name.
- `logo` (TEXT): URL or path to the logo image.
- `primary_color` (TEXT): CSS-compatible color code.
- `secondary_color` (TEXT): CSS-compatible color code.
- `is_claimed` (BOOLEAN): Whether the org has been claimed by a user.
- `creator_id` (TEXT): User ID who added the org.
- `is_active` (BOOLEAN): Status toggle.
- `settings` (JSONB): Organization-specific configuration.
- `address_id` (TEXT): FK to `addresses.id`.
- `type` (TEXT): DEFAULT `'OTHER'` — 'SCHOOL', 'CLUB', 'ORGANIZATION', 'OTHER'.
- `custom_type` (TEXT): the label when `type` is 'OTHER'.

> `supported_sport_ids` and `supported_role_ids` are **not columns**, though the `Organization` API
> model presents them as arrays. They are the `organization_sports` and `organization_roles` join
> tables (3b and 3c), which `OrganizationManager` assembles the arrays from. Same drift as the one
> corrected on `events`; both fixed 2026-09-01.

*Derived, not stored*: `teamCount`, `siteCount`, `memberCount` and `eventCount` are computed live by the organization queries and returned on the API model. They were previously cached columns maintained by background jobs; see [background-tasks.md](background-tasks.md) for why that was removed.

### 3b. `organization_sports`
Which sports an organisation offers. `PRIMARY KEY (org_id, sport_id)`, both FKs cascading.

Note this is **not** a column on `organizations`, though `Organization.supportedSportIds` presents it
as one — `OrganizationManager` assembles the array from this table.

### 3c. `organization_roles`
Which role ids an organisation has enabled for its members. `PRIMARY KEY (org_id, role_id)`;
`org_id` cascades, `role_id` is a plain `TEXT` naming a role from the role catalogue rather than a FK.

### 4. `sites`
Primary locations managed by an organization (e.g., 'Main Campus').
- `id` (TEXT, PK)
- `name` (TEXT)
- `address_id` (TEXT): FK to `addresses.id`.
- `org_id` (TEXT): FK to `organizations.id`.
- `is_active` (BOOLEAN): DEFAULT true.

### 5. `facilities`
Specific playing areas within a site (e.g., 'A-Field', 'Court 1').
- `id` (TEXT, PK)
- `name` (TEXT)
- `site_id` (TEXT): FK to `sites.id`.
- `primary_sport_id` (TEXT): FK to `sports.id`.
- `address_id` (TEXT): FK to `addresses.id`.
- `surface_type` (TEXT)
- `latitude` (DOUBLE PRECISION)
- `longitude` (DOUBLE PRECISION)
- `is_active` (BOOLEAN): DEFAULT true.
- `category` (TEXT): DEFAULT `'other'`.

### 5b. `facility_sports`
Which sports a facility can host — what the scheduler filters on when placing a fixture.
`PRIMARY KEY (facility_id, sport_id)`, both FKs cascading. Distinct from
`facilities.primary_sport_id`, which is the one it is mainly *for*.

### 6. `teams`
Groups of players representing an organization.
- `id` (TEXT, PK): Unique identifier.
- `name` (TEXT): Team name (e.g., '1st XV').
- `age_group` (TEXT): e.g., 'U19', 'Senior'.
- `sport_id` (TEXT): FK to `sports.id`.
- `org_id` (TEXT): FK to `organizations.id`.
- `is_active` (BOOLEAN): Status toggle.
- `creator_id` (TEXT): User ID who created the team.
- `short_name` (TEXT): Abbreviated name, used on fixture cards where the full one will not fit.

### 7. `users`
Authentication and user profile data.
- `id` (TEXT, PK)
- `name` (TEXT)
- `email` (TEXT): UNIQUE.
- `email_verified` (TIMESTAMPTZ)
- `image` (TEXT): Default profile picture.
- `custom_image` (TEXT): User-uploaded image.
- `avatar_source` (TEXT): 'custom' or 'provider'.
- `password_hash` (TEXT)
- `global_role` (TEXT): 'user', 'admin'.
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)
- `preferences` (JSONB)
- `theme` (TEXT)
- `force_password_reset` (BOOLEAN): DEFAULT false. Set when an admin issues a temporary password.

### 8. `org_profiles`
Core records for individuals in an organization (players, coaches, staff).
- `id` (TEXT, PK): Unique identifier.
- `org_id` (TEXT): FK to `organizations.id`.
- `user_id` (TEXT): FK to `users.id`. Links the profile to an active authentication account.
- `name` (TEXT): Full name.
- `email` (TEXT): Contact email.
- `cellphone` (TEXT): Contact number.
- `birthdate` (DATE): Date of birth.
- `national_id` (TEXT): Optional identity number.
- `identifier` (TEXT): Organization-specific ID (e.g., Student Number).
- `image` (TEXT): Organization-specific profile image.
- `primary_role_id` (TEXT): Cached primary organization role for UI convenience.
- `last_invite_sent_at` (TIMESTAMPTZ): When this person was last invited to claim an account. A
  profile with a null `user_id` is a first-class citizen — someone the organisation knows about who
  has not signed up — which is what makes it possible to appoint an organiser who has no account yet.
- `image_config` (JSONB): crop and focal point for `image`.
- *Constraint*: UNIQUE(`org_id`, `identifier`).

### 9. `team_memberships`
Links a profile to a specific team with a role.
- `id` (TEXT, PK)
- `org_profile_id` (TEXT): FK to `org_profiles.id`.
- `team_id` (TEXT): FK to `teams.id`.
- `role_id` (TEXT): e.g., 'player', 'coach'.
- `start_date` (TIMESTAMPTZ)
- `end_date` (TIMESTAMPTZ)

### 10. `org_memberships`
Links a profile to an organization.
- `id` (TEXT, PK)
- `org_profile_id` (TEXT): FK to `org_profiles.id`.
- `org_id` (TEXT): FK to `organizations.id`.
- `role_id` (TEXT): e.g., 'admin', 'staff'.
- `start_date` (TIMESTAMPTZ)
- `end_date` (TIMESTAMPTZ)

### 11. `events`
A single match, or a tournament containing many.
- `id` (TEXT, PK)
- `type` (TEXT): **NOT NULL**, `CHECK (type IN ('SingleMatch', 'Tournament'))`. `'SportsDay'` is
  gone — a sports day is a `Tournament` whose `format` is `'Festival'`. An event without a type
  raises rather than defaulting to one.
- `name` (TEXT)
- `start_date` (TIMESTAMPTZ)
- `end_date` (TIMESTAMPTZ)
- `site_id` (TEXT): FK to `sites.id`.
- `facility_id` (TEXT): FK to `facilities.id`. Still the whole story for a `SingleMatch`; a
  tournament names its facilities in `event_facilities` instead.
- `org_id` (TEXT): FK to `organizations.id`. The host.
- `settings` (JSONB): scoring subject, scoring system, tiebreak order, schedule days.
- `status` (TEXT)
- `cached_standings` (JSONB): written by the recalculation path, read on every view — data, not
  configuration, exactly as `seasons.cached_standings` is.
- `format` (TEXT): `'Festival' | 'RoundRobin' | 'Knockout' | 'PoolsKnockout'`. A column rather than
  a settings key, because it is what the event screen keys its tabs and setup steps off.

> The participating organisations and sports are **not** columns. They are the `event_organizations`
> and `event_sports` join tables (sections 11b and 11c). This document listed them as
> `participating_org_ids (TEXT[])` and `sport_ids (TEXT[])` until 2026-09-01; that was drift —
> `EventManager` has always assembled those arrays with `ARRAY(SELECT … FROM event_sports …)`
> subqueries in its projection.

### 11b. `event_sports`
Which sports an event runs. `PRIMARY KEY (event_id, sport_id)`, both FKs cascading.

### 11c. `event_organizations`
Which organisations are taking part. `PRIMARY KEY (event_id, org_id)`, both FKs cascading.

**Participation is determined by the teams taking part, and by nothing else.** Appointing an
organiser or a convenor must never write a row here — see `event_organizers` (section 11k).

### 11d. `tournament_divisions`
The netball, the U14 rugby. A division is a substantial entity with children of its own, which is
why it is not called `event_divisions` — that name would read as a join table beside `event_sports`.
Everything else here is named for its parent, so a table name tells you what deletes it.
- `id` (TEXT, PK): `div-<uuid>`.
- `event_id` (TEXT): NOT NULL, FK to `events.id` (ON DELETE CASCADE).
- `name` (TEXT): NOT NULL, free text. Need not be `sport + age group` — "Division B" beside
  "Division A" with the same sport and age group is legitimate.
- `sport_id` (TEXT): FK to `sports.id`. What generation and team filtering key off.
- `age_group` (TEXT)
- `scoring_subject` (TEXT): `'Team' | 'Organisation'`; NULL inherits the event's.
- `weighting` (NUMERIC(6,3)): NOT NULL DEFAULT 1.0. `NUMERIC` so 1.5 means 1.5.
- `settings` (JSONB): this division's scoring system and tiebreak order, when it overrides the event.
- `sort_order` (INTEGER), `created_at`, `updated_at`

### 11e. `division_stages`
Pools, then the knockout. Every division has at least one; the UI stays silent about staging when it
has exactly one.
- `id` (TEXT, PK): `stg-<uuid>`.
- `division_id` (TEXT): NOT NULL, FK to `tournament_divisions.id` (ON DELETE CASCADE).
- `name` (TEXT): NOT NULL.
- `format` (TEXT): NOT NULL. `'Festival' | 'RoundRobin' | 'Knockout' | 'Plate' | 'Swiss'`.
- `sequence` (INTEGER): NOT NULL, `UNIQUE (division_id, sequence)`.
- `status` (TEXT): NOT NULL DEFAULT `'Pending'`. `'Pending' | 'Ready' | 'InProgress' | 'Complete'`.
  Generation acts on `Ready` stages — this is what makes Swiss work.
- `earliest_start` (TIMESTAMPTZ): the knockout may not start before day 2.
- `settings` (JSONB): the format-shaped blob — `legs`, `pools`, `bracketSize`, `rounds`, and
  `entrantSource` when this stage's entrants come from the previous one's standings.
- `cached_standings` (JSONB), `created_at`, `updated_at`

### 11f. `division_entrants`
The three kinds of entrant in one table.
- `id` (TEXT, PK): `ent-<uuid>`.
- `division_id` (TEXT): NOT NULL, FK to `tournament_divisions.id` (ON DELETE CASCADE).
- `team_id` (TEXT): FK to `teams.id` (ON DELETE SET NULL). The default kind.
- `org_profile_id` (TEXT): FK to `org_profiles.id` (ON DELETE SET NULL). An athlete or singles player.
- `org_id` (TEXT): FK to `organizations.id`. **Denormalised** from the team or the profile at write
  time, because the organisation roll-up and the weighting sum both group by it. Must be rewritten
  whenever `team_id` changes.
- `label` (TEXT): what to print while unresolved — "TBC — awaiting confirmation".
- `seed` (INTEGER), `status` (TEXT: `'active' | 'withdrawn'`), `created_at`, `updated_at`
- `CONSTRAINT entrant_is_team_or_person CHECK (team_id IS NULL OR org_profile_id IS NULL)` — an
  entrant may not be both a team and a person. It need not be either: that is the unresolved case.

### 11g. `stage_entrants`
Who takes part in each stage, and where they sit in it. For a single-stage division this is a copy
of the roster and the UI never mentions it.
- `stage_id` (TEXT): FK to `division_stages.id` (ON DELETE CASCADE).
- `entrant_id` (TEXT): FK to `division_entrants.id` (ON DELETE CASCADE).
- `pool_key` (TEXT): `'A'`, `'B'`; NULL when the stage has no pools. Pool membership lives on the
  membership row rather than in the stage's JSON, so "which pool is Northcliff in?" is a query.
- `seed` (INTEGER), `sort_order` (INTEGER)
- `PRIMARY KEY (stage_id, entrant_id)`

### 11h. `event_facilities`
The facilities an event has in play. `PRIMARY KEY (event_id, facility_id)`, both FKs cascading.

### 11i. `division_facilities`
A division narrowing that to its own subset. A division with **no rows** may use any of the event's
facilities that support its sport. `PRIMARY KEY (division_id, facility_id)`, both FKs cascading.
Pool-level allocation, being rarer, rides in the stage's `settings` rather than earning a third table.

### 11j. `division_adjustments`
A points deduction for an ineligible player, or points for a walkover — recorded *as* an override,
with a reason and an author, rather than as a quiet edit to a game that never happened.
`calculateStandings` adds these after computing from fixtures.
- `id` (TEXT, PK): `adj-<uuid>`.
- `division_id` (TEXT): NOT NULL, FK to `tournament_divisions.id` (ON DELETE CASCADE).
- `entrant_id` (TEXT): NOT NULL, FK to `division_entrants.id` (ON DELETE CASCADE).
- `points_delta` (NUMERIC(6,2)): NOT NULL DEFAULT 0.
- `reason` (TEXT): NOT NULL.
- `created_by_user_id` (TEXT): FK to `users.id`.
- `created_at` (TIMESTAMPTZ)

### 11k. `event_organizers` and `division_organizers`
The two grant scopes: a row in the first is an event organiser with full rights over the tournament,
a row in the second is the narrow convenor of one division. Both cascade away with their parent — a
grant is meaningless without the thing it grants access to.
- `event_id` / `division_id` (TEXT): FK to the parent (ON DELETE CASCADE).
- `org_profile_id` (TEXT): FK to `org_profiles.id` (ON DELETE CASCADE).
- `granted_by_org_profile_id` (TEXT): FK to `org_profiles.id` (ON DELETE SET NULL). Nullable — an
  app admin acting globally may hold no profile in any org involved.
- `created_at` (TIMESTAMPTZ)
- `PRIMARY KEY (<parent>_id, org_profile_id)`

Three things about this shape were decided rather than assumed:

- **Two tables, not one with a nullable `division_id`.** Postgres treats NULLs as *distinct* in a
  unique index, so a single table would have let the same person be appointed event organiser any
  number of times. Split, the composite primary key says it for free, and each foreign key points at
  exactly one parent — so a grant cannot pair event A with a division of event B.
- **Grants reference `org_profiles`, never `users`.** `AccessManager` resolves a user into a set of
  profile ids, by `user_id` or verified email, so profile is the identity the permission layer works
  in. A person with no account can therefore be appointed, and the grant needs no rewrite when they
  later claim it.
- **Holding both rows is not a third state.** An event organiser's rights strictly contain a
  convenor's, so the access check stops at `event_organizers` and never consults divisions. The
  division row carries *intent* — "this person is the netball convenor" — which drives the role chips.

### 12. `user_emails`
Support for multiple emails per user.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `email` (TEXT): UNIQUE.
- `is_primary` (BOOLEAN)
- `verified_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

### 13. `accounts`
NextAuth accounts (Social providers).
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `type` (TEXT)
- `provider` (TEXT)
- `provider_account_id` (TEXT)
- `refresh_token` (TEXT)
- `access_token` (TEXT)
- `expires_at` (INTEGER)
- `token_type` (TEXT)
- `scope` (TEXT)
- `id_token` (TEXT)
- `session_state` (TEXT)
- `provider_image` (TEXT)
- *Constraint*: UNIQUE(`provider`, `provider_account_id`).

### 14. `sessions`
NextAuth sessions.
- `id` (TEXT, PK)
- `session_token` (TEXT): UNIQUE.
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `expires` (TIMESTAMPTZ)

### 15. `verification_tokens`
Tokens for email verification.
- `identifier` (TEXT)
- `token` (TEXT)
- `expires` (TIMESTAMPTZ)
- *Constraint*: PRIMARY KEY (`identifier`, `token`).

### 16. `password_reset_tokens`
Tokens for password resets.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `token_hash` (TEXT)
- `expires_at` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

### 17. `user_favorites`
Entities a user follows.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `entity_type` (TEXT): 'team', 'organization', 'event'.
- `entity_id` (TEXT)
- `created_at` (TIMESTAMPTZ)
- *Constraint*: UNIQUE(`user_id`, `entity_type`, `entity_id`).

### 18. `games`
Generic match entity supporting various topologies and participant types.
- `id` (TEXT, PK)
- `event_id` (TEXT): FK to `events.id` (ON DELETE CASCADE).
- `sport_id` (TEXT): which sport this fixture is. Not a FK.
- `start_time` (TIMESTAMPTZ): when it actually kicked off.
- `scheduled_start_time` (TIMESTAMPTZ): when it was meant to. Null means TBD.
- `finish_time` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)
- `status` (TEXT)
- `site_id` (TEXT): FK to `sites.id`.
- `facility_id` (TEXT): FK to `facilities.id`.
- `final_score_data` (JSONB): Flexible summary obj (e.g. {home: 12, away: 5} or {standings: [...]})
- `custom_settings` (JSONB): Finalized rules copied from sport default.
- `live_state` (JSONB): Running state of the match avoiding fetching entire event log.

### 18b. `game_participants`
One side of a fixture: a team, an individual, or — in a tournament — a slot that does not know who
fills it yet.
- `id` (TEXT, PK)
- `game_id` (TEXT): FK to `games.id` **ON DELETE CASCADE** (`game_participants_game_fk`).
- `team_id` (TEXT): FK to `teams.id` **ON DELETE SET NULL** (`game_participants_team_fk`). Null for
  an individual sport, and null for an unresolved tournament side.
- `org_profile_id` (TEXT): FK to `org_profiles.id` **ON DELETE SET NULL**
  (`game_participants_profile_fk`). Null if team sport.
- `status` (TEXT): 'active', 'withdrawn', 'disqualified', 'did_not_start'.
- `sort_order` (INTEGER)
- `entrant_id` (TEXT): FK to `division_entrants.id` (ON DELETE SET NULL).
- `source_game_id` (TEXT): FK to `games.id` (ON DELETE SET NULL).
- `source_stage_id` (TEXT): FK to `division_stages.id` (ON DELETE SET NULL).
- `source_rule` (JSONB): only what a foreign key cannot express — `{"type":"winnerOf"}`,
  `{"type":"loserOf"}`, or `{"type":"standing","poolKey":"A","position":1}`.

`team_id` stays the field the scoring screens and `calculateStandings` read: resolving a slot writes
it, so those consumers never learn that progression exists. All four new columns are null for every
existing row and for every single match.

> **Cascade only where the row is meaningless without its parent**, which a participant is relative
> to its game. `team_id` and `org_profile_id` are references, not ownership: deleting a team must not
> delete the fixtures it played. `RESTRICT` was rejected for the same reason — it would make a team
> undeletable for the lifetime of its results. Added 2026-09-01 (`FIX-10`); the table carried no
> foreign keys at all until then, and the dev database had accumulated 8 rows pointing at games that
> no longer existed.

### 18c. `game_rosters`
Explicit tracks of individuals playing in a specific game for a team.
- `id` (TEXT, PK)
- `game_participant_id` (TEXT): FK to `game_participants.id`
- `org_profile_id` (TEXT): FK to `org_profiles.id`.
- `position` (TEXT)
- `is_reserve` (BOOLEAN)
- `jersey_number` (TEXT)

### 18d. `game_officials`
Assigns roles to officials for a game.
- `id` (TEXT, PK)
- `game_id` (TEXT): FK to `games.id`
- `org_profile_id` (TEXT): FK to `org_profiles.id`
- `role` (TEXT): e.g., 'SCORER', 'REFEREE', 'TIMEKEEPER', 'JUDGE'

### 18e. `game_events`
The immutable audit log for any events during a game.
- `id` (TEXT, PK)
- `game_id` (TEXT): FK to `games.id`
- `timestamp` (TIMESTAMPTZ)
- `game_participant_id` (TEXT): FK to `game_participants.id` (the team/side)
- `actor_org_profile_id` (TEXT): FK to `org_profiles.id` (the individual performing the action)
- `initiator_org_profile_id` (TEXT): FK to `org_profiles.id` (official recording the action)
- `type` (TEXT)
- `sub_type` (TEXT)
- `event_data` (JSONB)

### 19. `org_claim_referrals`
Invites sent to organizations to claim their profile.
- `id` (TEXT, PK)
- `org_id` (TEXT): FK to `organizations.id`.
- `referred_email` (TEXT)
- `referred_by_user_id` (TEXT): FK to `users.id`.
- `claim_token` (TEXT): UNIQUE.
- `claim_token_expires_at` (TIMESTAMPTZ)
- `status` (TEXT): 'pending', 'claimed', 'declined'.
- `claimed_by_user_id` (TEXT): FK to `users.id`.
- `created_at` (TIMESTAMPTZ)
- `claimed_at` (TIMESTAMPTZ)
- `notified_referrer_at` (TIMESTAMPTZ)

### 19b. `leagues`
A recurring competition an organisation runs: "Northern Districts U16 Rugby". A league is the
container; the thing you actually play in is a **season** of it.
- `id` (TEXT, PK)
- `name` (TEXT): NOT NULL.
- `org_id` (TEXT): NOT NULL, FK to `organizations.id`. The organiser.
- `sport_id` (TEXT): NOT NULL, FK to `sports.id`. One sport per league — unlike a tournament, which
  splits across sports by division.
- `age_group` (TEXT)
- `join_policy` (TEXT): NOT NULL DEFAULT `'CLOSED'`. Whether a team may apply to join.
- `criteria` (JSONB): eligibility rules a joining team must meet.
- `logo` (TEXT), `created_at` (TIMESTAMPTZ)

### 19c. `seasons`
One running of a league — the thing with a table, a fixture list and a winner.
- `id` (TEXT, PK)
- `league_id` (TEXT): NOT NULL, FK to `leagues.id` (ON DELETE CASCADE).
- `name` (TEXT): NOT NULL.
- `start_date` / `end_date` (TIMESTAMPTZ): both NOT NULL.
- `status` (TEXT): NOT NULL DEFAULT `'UPCOMING'`.
- `settings` (JSONB): DEFAULT `{"pointsPerWin": 3, "pointsPerDraw": 1, "pointsPerLoss": 0}`. **This
  is the same `ScoringSystem` shape a tournament uses** (D19), which is the point — the same
  configuration means the same thing in both places. The default moved from 4/2/0 to 3/1/0 on
  2026-09-01 (D17); it applies to **new rows only**, since existing seasons store their values
  explicitly, so no league's table moved.
- `cached_standings` (JSONB): DEFAULT `'[]'`. Written by the recalculation path on every result and
  read on every view. `events.cached_standings` follows this precedent exactly.
- `logo` (TEXT), `created_at`, `updated_at`

### 19d. `season_teams`
Who is in the season. `PRIMARY KEY (season_id, team_id)`, both FKs cascading.
- `status` (TEXT): NOT NULL DEFAULT `'approved'` — a team that applied under an open `join_policy`
  sits here until it is.

### 19e. `game_seasons`
Which seasons a game counts toward. `PRIMARY KEY (game_id, season_id)`, both FKs cascading.

**Many-to-many on purpose**, and it is what makes D21 work without new storage: a tournament fixture
that also counts toward a league season is an ordinary row in this ordinary table. Only the UI to
create one from the tournament side is missing.

### 19f. `game_disputes`
A challenge to something that was recorded during a match — an undo, or a correction — put to a vote
rather than applied unilaterally. See [live-scoring.md](live-scoring.md) for the flow.
- `id` (VARCHAR, PK)
- `game_id` (VARCHAR): NOT NULL.
- `game_event_id` (VARCHAR): NOT NULL. The event being disputed.
- `initiator_org_profile_id` (VARCHAR): who raised it.
- `initiator_id` (VARCHAR): legacy identity column, superseded by the profile above.
- `status` (VARCHAR): NOT NULL DEFAULT `'OPEN'`.
- `type` (VARCHAR): DEFAULT `'UNDO'`.
- `update_data` (JSONB): for a correction, what it should become.
- `dispute_config` (JSONB): the voting rules this dispute was opened under, captured so that
  changing the sport's configuration later cannot change how an open dispute resolves.
- `created_at`, `expires_at` (NOT NULL), `resolved_at` (TIMESTAMPTZ)

### 19g. `game_dispute_votes`
One vote on one dispute.
- `id` (VARCHAR, PK)
- `dispute_id` (VARCHAR): NOT NULL, FK to `game_disputes.id`.
- `voter_org_profile_id` (VARCHAR)
- `vote` (VARCHAR): NOT NULL.
- `created_at`, `updated_at` (TIMESTAMPTZ) — a voter may change their mind while the dispute is open.

### 20. `reports`
Moderation reports raised by users. See [reports.md](reports.md) for the feature overview.
- `id` (TEXT, PK)
- `reporter_user_id` (TEXT): FK to `users.id`. Nullable, though every current producer sets it.
- `entity_type` (TEXT): 'organization', 'event', 'user'.
- `entity_id` (TEXT): id of the reported entity.
- `reason` (TEXT): 'impersonation', 'inappropriate_content', 'spam', 'other'.
- `description` (TEXT): free-text detail from the reporter, or the audit's correction summary.
- `status` (TEXT): 'open', 'investigating', 'resolved', 'dismissed'. Currently always 'open' — no resolution workflow is implemented yet.
- `resolved_by_user_id` (TEXT): no FK constraint. Never written yet.
- `resolved_at` (TIMESTAMPTZ): never written yet.
- `created_at` (TIMESTAMPTZ)

### 21. `user_badges`
Gamification rewards.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id`.
- `badge_type` (TEXT)
- `earned_at` (TIMESTAMPTZ)
- `metadata` (JSONB)

### 22. `notifications`
System alerts for users.
- `id` (TEXT, PK)
- `user_id` (TEXT): FK to `users.id` (ON DELETE CASCADE).
- `title` (TEXT)
- `message` (TEXT)
- `type` (TEXT)
- `link` (TEXT)
- `is_read` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

### 23. `system_settings`
Global key/value configuration, seeded by `seed-db.ts` and editable by an app admin.
- `key` (TEXT, PK)
- `value` (TEXT): NOT NULL. A string even when it holds a number — read it through the settings
  accessor rather than casting at each call site.

### 24. `schema_migrations`
Which migration files have run. `name` (VARCHAR, PK), `executed_at` (TIMESTAMPTZ).

Written by two scripts and by nothing else: `run-all-migrations.ts` inserts a filename as it applies
it, and **`init-db.ts` stamps every migration filename at the end of a clean install** — so a fresh
database is correctly "already migrated" and `db:migrate` against it is a no-op rather than a replay
of the entire history. See [okf/database.md](file:///c:/Fred/Coding/SK/okf/database.md).

---

## Maintenance

To keep this document updated:
1. Whenever `server/src/scripts/setup/init-db.ts` is modified with new tables or columns, this file must be updated accordingly.
2. Check `shared/src/models/` for interface changes that might indicate new data requirements.
3. Use `npm run db:setup` in development to ensure your local schema matches the source of truth in `init-db.ts`.

> **`db:setup` is a `DROP SCHEMA public CASCADE` and destroys everything entered through the app.**
> Take a dump first — see [server/backups/](file:///c:/Fred/Coding/SK/server/backups/).
>
> **Check the live schema, not this file, when it matters** — `information_schema.columns` is the
> authority, per `migrations/README.md`. This document was reconciled against it on 2026-09-01 and
> every table and column agreed at that point, but it is prose maintained by hand and the database
> is not. The reconciliation is worth repeating rather than trusting: it is what found `games`
> missing four columns, and two tables presenting a join table as an array column.
