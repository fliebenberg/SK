# Tournaments — Phased Implementation Plan

**Status:** In progress. **Phases 0–5 complete, every exit criterion met** (0–2 on 2026-09-01, 3 on 2026-09-01 and signed off 2026-09-02, 4 and 5 on 2026-09-03). The tournament work is now visible in the app: a tournament can be created with a format, navigated, and restructured, and every level with one child is collapsed away. **Phase 6 is next** — the first phase that delivers a *usable* tournament: entrants, generation and standings.
**Implements:** [tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md) (D1–D33),
[tournaments-data-model.md](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md),
[tournaments-ui.md](file:///c:/Fred/Coding/SK/docs/tournaments-ui.md) (U1–U42).
**Reading order:** §0 (the three things to settle first) → the phase table → the phases.

---

## How this plan is meant to be used

Ten phases, executed in order. Each one states what it builds, what it depends on, and an **exit
criterion that can be checked** — because the point of phasing is that phase N+1 starts from a
known-good base rather than from a half-finished one.

Two rules for running it:

- **A phase is done when its exit criterion passes, not when its code is written.** Several exit
  criteria are deliberately awkward (run the migration against a restored dump; open the app as a
  non-admin). That awkwardness is the value.
- **Do not start a phase whose "settle first" items are still open.** They are listed per phase and
  collected in §0.

### How each phase is verified

The repo has **no test framework** in `server/`, `shared/` or `expo-app/` — only the deprecated
`client/` has Jest.

> **Decided 2026-09-01 — bring in Vitest, but only in `shared/`.** Phase 2 adds it and writes
> permanent unit tests for the standings engine. `server/` and `expo-app/` keep using `ts-node`
> scripts and manual checks for now.
>
> `shared/` is where this pays and nowhere else does yet. It is a plain TypeScript package — no React
> Native, no sockets, no database — so the setup is a dev dependency and a config file. The standings
> engine is the highest-risk code in the feature, is consumed by leagues as well as tournaments (D19),
> and is what progression reads to decide who plays the semi-final (D30). And the assertions get
> written either way: Phase 2's exit criterion is a list of cases the engine must satisfy, so writing
> them as throwaway script output rather than as tests would be discarding the work at the moment it
> was finished.
>
> `server/` is deliberately excluded **for now** because its tests need a disposable database, fixture
> setup and teardown, and the guard from `TODO.md`'s *"ensure tests never run in production
> environment"*. That is test *infrastructure*, a piece of work in its own right, and it should not be
> bundled into a feature build. Revisit at Phase 3, when the progression harness exists and the cost
> is concrete rather than estimated.

**The line between a test and a script is what the check is about**, not which phase it falls in:

| | Keep as a permanent test | Write as a throwaway script |
|---|---|---|
| **Asserts** | a rule that must hold forever | that *this* migration ran correctly *this* time |
| **Examples** | 3 points for a win; tiebreak order produces a definite rank; an unresolved fixture does not score; weighting rolls up correctly | the Phase 1 schema diff; the Phase 6 ninety-fixture timing check; the Phase 3 progression run (until `server/` has a harness) |
| **Lives in** | `shared/src/**/*.test.ts` | `server/src/scripts/`, deleted when its phase closes |

Where a phase produces pure logic (Phase 2), tests are not optional — they are the only way that phase
can be shown to work. Everything else is a named manual check in the app, per
[no-browser-verification](file:///c:/Fred/Coding/SK/.agent/skills/no-browser-verification/SKILL.md).

### Deviation from the build order in the UI doc

[tournaments-ui.md §17](file:///c:/Fred/Coding/SK/docs/tournaments-ui.md) gives a five-step order:
fixture-side component → capability flags → divisions and stages as screens → `Festival` /
`RoundRobin` → knockout. That is a UI-cost ordering and it is right about what matters; it just does
not say when the schema and the server arrive, and every one of its steps needs both.

This plan keeps its priorities and interleaves the backend:

| UI doc step | Lands here | Why it moved |
|---|---|---|
| `GET_DATA_ENFORCE` before step 1 | Phase 0 | Unchanged. |
| 1 — fixture-side component | **Phase 2** | It renders three states defined by *types*, not by tables, so it can be built the moment the shared types exist — which is also when its inputs stop being guesses. Still the first UI built, as intended. |
| 2 — capability flags + `AccessManager` | **Phase 4** | Blocked on storage that no document defines yet (§0.1). |
| 3 — divisions/stages screens + migration | Migration → **Phase 1**; screens → **Phase 5** | The migration is the foundation of everything and should not wait for three phases of client work. |
| 4 — `Festival`/`RoundRobin` end to end | **Phases 6 and 7** | Split: fixtures, entrants and standings ship without the schedule grid; the grid, auto-schedule and conflicts are a phase of their own. See Phase 7's note. |
| 5 — knockout, then the bracket | **Phases 8 and 9** | Unchanged, split as the doc splits it. |

---

## 0. Settle these before Phase 1

Three items block or reshape later phases. Two are decisions; one is a gap in the documents.

### 0.1 There is no storage for a division or event organiser — and Phase 4 needs it

**This is the one real gap between the two settled documents.** D22, D31 and D33 make "a named
person granted edit rights over a container" the whole permission model, and
[tournaments-ui.md §4](file:///c:/Fred/Coding/SK/docs/tournaments-ui.md) builds `canEditEvent` and
`convenesDivisionIds` on top of it. But the data model's §3 defines seven new tables and none of them
holds an assignment — D33 was added in the UI review on 2026-08-30, *after* the data model was
written, and its storage was never carried back.

Nothing else is missing, and the fix is small. **Two tables**, in the naming convention of §3.0 (a
table is named for its parent, and it tells you what deletes it) and following the composite-key
shape of the join tables already beside them — `event_sports`, `event_organizations`,
`division_facilities`:

```sql
CREATE TABLE IF NOT EXISTS event_organizers (
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE CASCADE,
    granted_by_org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (event_id, org_profile_id)
);
CREATE INDEX IF NOT EXISTS idx_event_organizers_profile ON event_organizers(org_profile_id);

CREATE TABLE IF NOT EXISTS division_organizers (
    division_id TEXT REFERENCES tournament_divisions(id) ON DELETE CASCADE,
    org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE CASCADE,
    granted_by_org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (division_id, org_profile_id)
);
CREATE INDEX IF NOT EXISTS idx_division_organizers_profile ON division_organizers(org_profile_id);
```

Two scopes, exactly as D33 describes them: a row in the first is the event-level organiser with full
rights (U12), a row in the second is the narrow convenor (D31). Both cascade away with their parent,
which is what "the grant should expire with the event" means in storage terms, and is correct by the
data model's own rule — a grant is meaningless without the thing it grants access to.

**Why two rather than one table with a nullable `division_id`.** An earlier draft of this section
proposed the single table. It handles multiple organisers per division fine (the rows differ by
person) and a person holding both scopes fine (two rows, one with `division_id` null), so those are
not the reason. Two things are:

- **`UNIQUE (event_id, division_id, <person>)` would not have worked.** Postgres treats NULLs as
  distinct in unique indexes, so the same person could be appointed event organiser any number of
  times, and withdrawing them would delete one row of several. It would have needed two partial unique
  indexes to say what a composite primary key says for free.
- **Nothing would stop a grant pairing event A with a division of event B.** Split, each foreign key
  points at exactly one parent and the division already knows its event, so the pairing cannot be
  expressed. Under one table the same guarantee needs a composite foreign key and a redundant
  `UNIQUE (event_id, id)` on `tournament_divisions`.

**"Both scopes" is not a third state, and Phase 4 should not build one.** U12 gives an event organiser
full rights over the tournament, which strictly contains D31's "this division's fixtures and results".
So a person holding both rows has exactly the rights of an event organiser, and the division row grants
no additional access. What it carries is *intent* — "this person is the netball convenor" — which
drives the role chips (U4) and where they land (U8). Concretely: the `AccessManager` check stops at
`event_organizers` and never consults divisions; the capability flags read both, so
`convenesDivisionIds` is populated for that person even though it changes nothing they may do.

**Spelling.** `organizers`, not `organisers` — the prose in all three tournament documents says
"organiser", but the schema says `organizations`, `event_organizations`, `organization_roles`. The
table name follows the schema; the UI label follows the prose.

**Accepted in review, 2026-09-01.** Both tables go in the Phase 1 migration — adding one later is
cheap, but discovering in Phase 4 that Phase 1's migration has already run in a deployed environment
is not.

> **Decided 2026-09-01 — a convenor may be anyone, including someone from no participating
> organisation at all.** D33 says "a member of the hosting org"; review widened it. At a real sports
> day the netball convenor is often a visiting school's teacher, and may be an **external specialist**
> — a qualified official or coach brought in for one discipline, who belongs to none of the
> organisations present. Both must be appointable.
>
> **This needs no schema change, because the existing model already separates the two ideas.**
> `org_profiles` is the *person* record; `org_memberships` is the *membership*, with its own role and
> dates. [UserManager](file:///c:/Fred/Coding/SK/server/src/managers/UserManager.ts) writes them
> independently — creating a profile does not create a membership. So an external specialist is:
>
> - an `org_profile` in the **hosting org**, with **no `org_membership`** — a person the host knows
>   about, who is not a member of it;
> - granted the division via `division_organizers`, which is the only right they hold.
>
> The security property falls out of the existing code rather than needing to be built:
> `getMembershipSnapshot` derives a user's orgs by joining **`org_memberships`**
> ([AccessManager.ts:65](file:///c:/Fred/Coding/SK/server/src/managers/AccessManager.ts#L65)), so a
> profile with no membership yields no orgs and confers nothing. The grant then adds exactly the
> tournament rights and nothing else — which is precisely what you want for an outsider.
>
**An appointed person's organisation does not become a participating organisation.** Stated
explicitly because it is exactly the sort of thing a helpful implementation adds by itself. The
external specialist may well have a profile in one or more orgs — just not in one with teams here —
and appointing them must **never** write a row into `event_organizations`.

> **Participation is determined by the teams taking part, and by nothing else.** An org is in the
> tournament because it entered a team, full stop. Appointing a convenor, like assigning an official,
> says nothing about whether their org is competing.

The precedent is already in the codebase and is worth following rather than re-deriving:
[`GameOfficial`](file:///c:/Fred/Coding/SK/shared/src/models/event/GameOfficial.ts) is
`{ gameId, orgProfileId, role }` — a *person* attached to a fixture, with no organisation on the
record at all and no implication for who is playing. A convenor is the same shape one level up. If
`event_organizations` ever gains a row as a side effect of an appointment, the standings roll-up (D6)
will show an organisation that played nothing, which is how this bug would first be noticed.

> **What this asks of the picker (Phase 4).** Three tiers, in this order:
>
> 1. **Default — profiles in the host and participating orgs.** Covers the ordinary case in one search.
> 2. **Global search, behind an explicit control.** Not the default, because most searches do not want
>    it and a global list of people is a privacy surface rather than a convenience. But available, since
>    a specialist official may already be on the app under an org that is not here.
> 3. **Create a new person**, when neither finds them — a host-org profile with no membership, and the
>    existing invite flow links an account later if they ever want one.
>
> **The global tier needs a lean projection, and this is not optional.**
> [`searchProfiles`](file:///c:/Fred/Coding/SK/server/src/managers/UserManager.ts#L473) already
> supports an unscoped search — `op.org_id = $2 OR $2 IS NULL` — so the capability is there for free.
> But it selects `cellphone`, `birthdate` and `national_id`, and `search_people` is gated only at
> `authenticated`. Returning those fields for arbitrary people across every organisation is not
> something this feature should introduce. The organiser picker gets **name, org name and image**, and
> nothing else. Logged as `PEOPLE-1` in `TODO.md`, since the permissive handler is a
> pre-existing gap rather than something this feature introduces.

**Two sub-questions that come with it, both answerable in a sentence:**

- **The grant references `org_profiles(id)`, not `users(id)`** — corrected 2026-09-01 in review, and
  the DDL above reflects it. An earlier draft keyed on `users` "because that is what `AccessManager`
  resolves", which was backwards. `AccessManager` resolves a user **into a set of profile ids**, by
  `user_id` *or* verified email
  ([AccessManager.ts:65](file:///c:/Fred/Coding/SK/server/src/managers/AccessManager.ts#L65)), so
  profile is the identity the permission layer already works in.

  Three things follow, and together they are decisive:

  - **You can appoint someone who has no account yet.** `org_profiles.user_id` is nullable and the
    table carries `last_invite_sent_at` — an unclaimed profile is a first-class citizen, and the
    nomination flow exists to fill it in later. Keying on `users` would make "appoint the netball
    convenor, who will get an invite" impossible, which is a normal thing to want.
  - **The grant needs no rewrite when they claim it.** Because matching is by `user_id` *or* verified
    email, a person signing up and verifying the address on their profile is matched automatically.
    Nothing updates the grant row.
  - **One identity space.** A person can be an event organiser, a convenor of two divisions, and a
    player in the same tournament. Playing is already `org_profiles` (`division_entrants.org_profile_id`,
    `game_participants.org_profile_id`, `team_memberships`). Keying grants on `users` would split that
    person across two identity spaces and make "is this convenor also playing?" a join through
    account-claim state.

  **`granted_by_org_profile_id` is a profile too** — corrected in review, 2026-09-01. An earlier draft
  made it a `users` reference on the grounds that the actor is by definition logged in. True but
  irrelevant: the field exists to be *read*, on an audit trail or an info line, and a person should be
  shown as who they are known as in the organisation. A user account is the right identity only when
  the question is "which real person is behind this profile", which matters to that user and almost
  nobody else. **The general rule for this feature: refer to people by profile; reach for `users` only
  to identify the account behind one.**

  Which profile gets recorded is well defined rather than arbitrary: **the profile through which the
  actor's own permission was derived** — their `event_organizers` row if they are an appointed
  organiser, or their profile in the org whose admin rights they used. Nullable, because an app admin
  acting globally may hold no profile in any org involved.
- Does an organiser assignment survive the event being copied (U18)? **It is offered, not assumed** —
  both tables appear as choices in the copy step, defaulted on, because last year's netball convenor
  is usually this year's. An earlier draft of this plan recommended "no, copying brings structure not
  people", which was the wizard making a decision that belongs to the organiser. U18 was amended on
  2026-09-01 to state the general principle; see Phase 9.

### 0.2 `format` sits in JSONB while `type` becomes a constrained column

U39 makes `events.type` `NOT NULL` with a `CHECK` admitting exactly `SingleMatch` and `Tournament`,
on the principle that an unknown value should raise rather than default. In the same migration,
`format` — which after D1 carries *more* meaning than `type` does, since it is what the event screen
keys its tabs and setup steps off — goes into `events.settings` JSONB, where it can be any string, is
awkward to filter on, and cannot be constrained.

The inconsistency is small but it is in the same statement.

> **Decided 2026-09-01 — promote it to a column.**
>
> ```sql
> ALTER TABLE events ADD COLUMN IF NOT EXISTS format TEXT;
> -- backfilled from type; CHECK added once the SportsDay rewrite has run
> ```
>
> Cheap now, and it makes "list the festivals at this venue" a query. `format` moves out of
> `events.settings` in the same migration; the `CHECK` follows the `SportsDay` rewrite so it is not
> validating a value the rewrite is about to remove.

### 0.3 `init-db.ts` does not stamp `schema_migrations`

Recorded as open in
[tournaments-data-model.md §10](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md). A fresh
database believes no migration has run, so `db:migrate` against it replays everything. Harmless today
only because every existing migration happens to be written defensively.

This plan's Phase 1 exit criterion is *"the migration runs against a restored dump **and** `db:setup`
produces an identical schema"* — which is precisely the thing that becomes hard to trust while a
fresh database is mislabelled.

> **Decided 2026-09-01 — fix it in Phase 0.** `init-db.ts` stamps every filename in
> `src/scripts/migrations/` into `schema_migrations` on completion, so a freshly created database is
> correctly "already migrated" and `db:migrate` against it is a no-op. A few lines, and it is the
> difference between the Phase 1 check meaning something and being a ritual. It also lets the
> migration files be kept indefinitely without the risk the data model flagged.

---

## The phases at a glance

| # | Phase | Size | Status | Ships something a user can see? |
|---|---|---|---|---|
| 0 | Pre-flight and guardrails | S | ✅ done | No |
| 1 | Schema and migration | M | ✅ done | No |
| 2 | Shared types, scoring engine, the fixture-side component | M | ✅ done | No (a component, not a screen) |
| 3 | Server: divisions, stages, entrants, and the recalculation choke point | L | ✅ done | No |
| 4 | Permissions: organiser assignments and capability flags | M | ✅ done | A component, not yet a screen |
| 5 | Client foundations: routes, screens, the collapse rule | L | ← next | Yes — a tournament you can navigate |
| 6 | `Festival` and `RoundRobin`: entrants, generation, standings | L | | **Yes — the first genuinely usable tournament** |
| 7 | Scheduling: facilities, day windows, the greedy pass, the grid | L | | Yes |
| 8 | `Knockout` and `PoolsKnockout` on the round list | L | | Yes |
| 9 | The bracket graphic, and copy-a-tournament | M | | Yes |

Phases 0–3 build nothing visible. That is four phases of foundation before the first screen, which is
worth naming up front rather than discovering in week three — it follows directly from D12 ("model
for the complex formats now, phase the UI"), and from D30 moving standings server-side.

**If an earlier demo matters more than that ordering**, the shortest honest path to something
clickable is 0 → 1 → 2 → 3 → 5 → 6, deferring Phase 4 and running everything as the hosting org's
admin under today's `canEdit === event.orgId === orgId`. Phase 4 then lands before any real user is
given a link. This is a legitimate reordering; what does not work is deferring Phase 3, because the
screens in 5 and 6 have nothing to read.

---

## Phase 0 — Pre-flight and guardrails

**Goal:** remove the two risks that would otherwise surface mid-build, and settle §0.

**Build:**

1. `pg_dump --format=custom` of the working database, kept somewhere findable.
   [Data model §12](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md) is emphatic and correct:
   run `db:migrate`, never `db:setup`, and the dump makes the distinction survivable if someone does.
2. Run `SELECT type, COUNT(*) FROM events GROUP BY type;` and record the answer in the migration's
   header comment. It decides two things: whether the dropped backfill step (data model §9) has to go
   back in, and how many untyped rows `FIX-1` must fix.
3. `GET_DATA_ENFORCE=true` (**U42**, `DATA-1`). Exercise the app's existing screens, watch for
   `[DataAccess]` refusals, fix any false positive. This must happen **before** any new `get_data`
   type exists, which is the whole argument for its position.
4. Settle §0.1, §0.2, §0.3 and write the answers into the relevant doc.

**In scope from `TODO.md`:** `DATA-1` (closed by step 3).

**In scope, decided 2026-09-01:** `DATA-2` — `site_facilities` and `team_roster` are emitted by
expo-app and match no server `case`. Under enforcement their behaviour changes: today they silently
return `undefined`; unmapped types are *refused*, so they would start logging refusals and carry that
noise through nine phases. Resolve them here: look at what each caller does with the result, then
either delete the dead call or restore the screen it was quietly breaking. Five minutes, and it keeps
the enforcement log meaningful — which is the whole point of turning it on before the tournament work
adds its own request types.

**Deliberately not in scope:** `DATA-3` (the seed split, and hand-entered data not surviving a reset).
Phase 0's `pg_dump` covers the immediate risk, which is the reason the data model flagged it here. The
two-tier `seed:core` / `seed:dev` split is a real piece of work and folding it in would delay Phase 1
for no tournament benefit. **It is already logged as `DATA-3` in `TODO.md`** under Real-time
Subscriptions, with the full analysis, so leaving it here loses nothing.

**Exit criterion:** `GET_DATA_ENFORCE=true` is set in the dev environment and a full pass over the
existing screens produces no refusal for a legitimate call. The dump exists and has been test-restored
once — an untested backup is not a backup.

**Docs:** `TODO.md` (`DATA-1` checked off with what enforcement caught); §0 answers recorded in
[tournaments-data-model.md](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md).

### Done — 2026-09-01

1. **Dump taken and test-restored.** `server/backups/sk-20260901-phase0.dump`, custom format,
   git-ignored, with [a README](file:///c:/Fred/Coding/SK/server/backups/README.md) carrying the
   take-and-restore commands. Restored into a scratch database and compared against the source —
   41 tables, 1 event, 11 organisations, 1 game, 29 org profiles, 7 stamped migrations, identical —
   then dropped.
2. **Census run.** `SELECT type, COUNT(*) FROM events GROUP BY type` returns exactly one row,
   `SingleMatch = 1`, and no untyped rows. Recorded in
   [tournaments-data-model.md §9](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md), which is
   where Phase 1's migration header comment should copy it from. **The dropped backfill stays
   dropped**, and `FIX-1` has no row to fix — but re-run the census immediately before the migration
   rather than trusting a stale number.
3. **`GET_DATA_ENFORCE=true`**, in `server/.env` and documented in `server/.env.example`; the
   server boots logging `[DataAccess] get_data authorization: ENFORCING`. Before flipping it,
   `audit-data-access.ts` — a throwaway, deleted with the phase — ran `canReadData` over every request shape expo-app
   emits, with real ids, as an anonymous socket and as a signed-in org member. **It found two
   things, both fixed:** `team_members` would have blanked the opposing side's names on every
   cross-org scoring screen (now widened via an authorization-only `gameId`, honoured only once
   `gameHasTeam` confirms the team is in that game), and `facilities` with no subject was building
   the room `site:undefined` and being **allowed** (now refused, like every other rule).
4. **`DATA-2` closed.** Neither call was dead — both were quietly broken screens with a working
   handler under another name. See `TODO.md`.
5. **§0.1, §0.2, §0.3 recorded.** The first two were already carried into the data model; §0.3 is
   now *built*: `init-db.ts` stamps `schema_migrations`, verified on a scratch database where
   `db:init` stamped 7 migrations and `db:migrate` then found nothing pending. The two schema paths
   are written up in [okf/database.md](file:///c:/Fred/Coding/SK/okf/database.md).

6. **The screen pass — automated, not clicked through.** The exit criterion's *"full pass over the
   existing screens"* was first written up here as a manual check. That was the wrong call:
   [no-browser-verification](file:///c:/Fred/Coding/SK/.agent/skills/no-browser-verification/SKILL.md)
   says the opposite — do not hand the user a click-through, automate it or drive it yourself.

   `verify-screens.ts` — a throwaway, deleted with the phase — connected a **real socket.io client to the running server as a real
   signed-in user**, then replays screen by screen the exact `get_data` calls and `join_room`
   subscriptions each screen issues, in the order it issues them, resolving ids from earlier responses
   where the screen does — a game's participants, a team's org — and repeats the public screens signed
   out. Under enforcement a refusal comes back as `{ status: 'error' }` and a refused join as
   `ROOM_ACCESS_DENIED`, so both are visible to it.

   **Result: 136 calls across 31 screens — zero refusals, zero denied joins, zero timeouts**, and the
   server log carried no `[DataAccess] REFUSED` line at all. Both `DATA-2` fixes were confirmed
   *with data* rather than merely reaching a handler (18-player roster, 1 facility), and so was the
   `team_members` widening — the opposing side's 18 players came back through `gameId` on the
   scoring path.

   **It found one defect, and it is worth having.** `DATA-4`: the `organization` handler read only
   `id`, but six screens pass `{ orgId }`, so `org` came back `undefined` and `isOwner` was
   permanently false on them — an org's creator silently lost edit affordances unless they also held
   an admin or staff membership. Not a refusal, so not strictly this phase's business, but the same
   client/server contract mismatch as `DATA-2` and a one-line fix: the handler now reads
   `getOrganization(id || orgId)`, widened rather than correcting the six callers, because
   correcting callers leaves the next one free to repeat it. **Fixed and re-verified** — the walk
   was re-run against the running server and `organization orgId=…` returns the org, with the other
   135 calls unchanged.

**What the walk still does not cover.** It exercises the *data* path, not rendering — it cannot tell
you a screen lays out correctly, and it replays the request shapes as written rather than as a user
might provoke them. That residue is small and is not what the exit criterion was about.

---

## Phase 1 — Schema and migration

**Goal:** the database can hold a tournament. No code reads any of it yet.

**Depends on:** Phase 0, and specifically the §0.1 decision — the organiser tables should be in this
migration, not a later one.

**Build**, in `server/src/scripts/migrations/20260901_tournaments.ts` **and** mirrored into
[init-db.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/init-db.ts), per the standing rule in
[migrations/README.md](file:///c:/Fred/Coding/SK/server/src/scripts/migrations/README.md):

1. **New tables** — `tournament_divisions`, `division_stages`, `division_entrants`, `stage_entrants`,
   `event_facilities`, `division_facilities`, `division_adjustments`, and the two organiser tables `event_organizers` / `division_organizers` (§0.1).
   DDL is given verbatim in [data model §3](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md).
2. **`game_participants`** gains `entrant_id`, `source_game_id`, `source_stage_id` (all
   `ON DELETE SET NULL` — the data model caught a `CASCADE` here that would have deleted one side of a
   fixture when a stage was removed) and `source_rule JSONB`, plus two indexes.
3. **`events`** gains `cached_standings`, and `format` if §0.2 promotes it.
4. **The `SportsDay` rewrite (D1)** — in place, no alias.
5. **`event_facilities` backfill** from each event's existing `facility_id`, which stays where it is.
6. **Drop** `pointSystem` and `levelWeighting` from `events.settings`.
7. **`seasons.settings` default → 3/1/0** (D17). New rows only.
8. **`FIX-1` / U39** — backfill the untyped row, `events.type` `NOT NULL`, `CHECK (type IN
   ('SingleMatch','Tournament'))`. This lands here because it is the same statement that changes which
   values are valid. The four *client* call sites are Phase 5.

9. **`FIX-10` — give `game_participants` its foreign keys**, in two parts, and in this order:
   **clean, then constrain.** The table has exactly one constraint today (`PRIMARY KEY (id)`), and
   Phase 0 found **8 rows** in the working database pointing at a `game_id` no longer in `games` and
   a `team_id` no longer in `teams` — so adding the constraints over the data as it stands would
   simply fail.

   ```sql
   -- (a) Clean. Report the count first; a migration that silently deletes rows is worse than one
   --     that stops. See the note below on how this differs from every other step here.
   DELETE FROM game_participants gp
    WHERE NOT EXISTS (SELECT 1 FROM games g WHERE g.id = gp.game_id);

   -- (b) Constrain. Cascade only where the row is meaningless without its parent — which a
   --     participant is, relative to its game. The other two are references, not ownership.
   ALTER TABLE game_participants
     ADD CONSTRAINT game_participants_game_fk
     FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
   ALTER TABLE game_participants
     ADD CONSTRAINT game_participants_team_fk
     FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
   ALTER TABLE game_participants
     ADD CONSTRAINT game_participants_profile_fk
     FOREIGN KEY (org_profile_id) REFERENCES org_profiles(id) ON DELETE SET NULL;
   ```

   `team_id` and `org_profile_id` are `SET NULL` rather than `CASCADE` deliberately: deleting a team
   must not delete the fixtures it played, and `game_participants.team_id` is already nullable
   because a tournament side can be an unresolved rule (§2.0). `RESTRICT` was the alternative and is
   rejected for the same reason — it would make a team undeletable for the lifetime of its results.

   **Note the asymmetry, because it is the point.** Step (b) is ordinary schema work. Step (a)
   **deletes rows**, which nothing else in this migration does, and it is included only because the
   user asked for `FIX-10` in this phase (2026-09-01) — otherwise a destructive statement does not
   belong in a schema migration. Two consequences: it runs **after** the Phase 1 dump is confirmed,
   and it must `RAISE NOTICE` the count it is about to remove so the run log records what was lost.
   If the count comes back larger than the 8 Phase 0 measured, **stop and look** rather than letting
   it run — a jump means something is deleting games without their participants, which is a bug to
   find, not data to tidy.

Every statement `IF NOT EXISTS` or otherwise re-runnable. The `ADD CONSTRAINT` statements are the
exception — Postgres has no `IF NOT EXISTS` for them, so guard each on `pg_constraint` or catch the
duplicate-object error, or a re-run fails.

**In scope from `TODO.md`:** `FIX-1` (closed) and `FIX-10` (closed — **added to this phase
2026-09-01 at the user's request**, having been logged in Phase 0). "Consolidate Sportsday and
Tournament view" — this phase does its schema half; the UI half is Phase 5.

**Exit criterion — two runs, both required:**

- `db:migrate` against a **restored copy** of the dump completes, and the existing test event still
  loads in the app. This is the path a deployed environment takes and the only path never exercised by
  starting clean.
- `db:setup` on a scratch database produces a schema **identical** to the migrated one. Diff them
  (`pg_dump --schema-only` both, compare) rather than eyeballing — the two-source-of-truth rule in
  `migrations/README.md` is only as good as the check that enforces it, and a missed `init-db.ts`
  mirror is invisible until a new environment is built months later.
- **`game_participants` has no orphans and three foreign keys.** `SELECT count(*) FROM
  game_participants gp LEFT JOIN games g ON g.id = gp.game_id WHERE g.id IS NULL` returns `0`, and
  `pg_constraint` lists the three `FOREIGN KEY` rows alongside the primary key. Check on **both**
  databases — the constraints are part of the schema diff above, but the orphan count is data, so
  only the migrated copy can answer it.

**Docs:** [database_structure.md](file:///c:/Fred/Coding/SK/docs/database_structure.md) — add the new
tables, **and fix the drift the spec §12 already found** (it lists `participating_org_ids` and
`sport_ids` as columns on `events`; they are the `event_sports` and `event_organizations` join
tables). [okf/database.md](file:///c:/Fred/Coding/SK/okf/database.md).

### Done — 2026-09-01

The migration is
[`server/src/scripts/migrations/20260901_tournaments.ts`](file:///c:/Fred/Coding/SK/server/src/scripts/migrations/20260901_tournaments.ts),
mirrored into
[`init-db.ts`](file:///c:/Fred/Coding/SK/server/src/scripts/setup/init-db.ts). Ten steps, in the
order §9 requires: nine tables, then the `game_participants` and `events` columns, then D1's
`SportsDay` rewrite and the `format` / `type` backfills, then the `event_facilities` backfill and the
settings-key drop, and only *then* the `events.type` constraints — which would have rejected the very
rows the two backfills exist to fix. The `seasons` default and `FIX-10` close it out.

1. **Both exit runs pass, and the schema diff is clean where it matters.** The migration ran against a
   **restored copy** of a fresh dump (`sk-20260901-phase1-pre.dump`) — the path a deployed environment
   takes, and the only one never exercised by starting clean. A second database was built with
   `db:init`, both were `pg_dump --schema-only`'d, and the two diffed. **No Phase 1 object appears in
   the residual diff**: not one of the nine tables, not a column, not a constraint, not an index.

   Making that true needed one thing the plan did not anticipate. **Column order is part of a
   `pg_dump` diff**, because `ALTER TABLE ADD COLUMN` appends and `pg_dump` prints in `attnum` order,
   so `events.cached_standings` and `events.format` — and the four on `game_participants` — are
   appended in `init-db.ts` in the order the migration adds them, rather than slotted in where they
   read best. Constraint *names* are in the diff for the same reason, so `init-db.ts` names its
   `game_participants` foreign keys explicitly instead of leaving them to Postgres.

2. **The residual diff is real, and every line of it predates this phase.** To know that rather than
   assume it, the same two-database comparison was run against the **pre-Phase-1** code and the two
   diffs compared. Phase 1 adds nothing to it, and removes one thing: the three `game_participants`
   foreign keys that `init-db.ts` had always declared and no migration ever added, so a fresh database
   had them and every migrated one did not. **That is the origin of `FIX-10`**, and the argument for
   this check in one line — the drift was invisible from either file alone.

   What remains is column ordering on seven older tables, `system_settings.value` (`jsonb` on one path,
   `text NOT NULL` on the other), and three missing `event_organizations` foreign keys. None of it is
   this phase's to fix, but it is now measured rather than suspected, and the method is written up in
   [okf/database.md](file:///c:/Fred/Coding/SK/okf/database.md).

3. **Re-runnable, and proven so rather than asserted.** The `ADD CONSTRAINT` statements cannot be
   `IF NOT EXISTS`, so each is guarded — and the `game_participants` guards check the **column**
   rather than the constraint name, because a database built from the old `init-db.ts` already had
   keys there under Postgres' auto-generated names, and a name check would have added a duplicate
   beside each one. Verified by deleting the row from `schema_migrations` and running the whole file a
   second time: it completed, reported nothing left to change, and left exactly three foreign keys.

4. **`FIX-10` cleaned 8 rows, and said so before it did.** The count is reported first, and the
   migration **aborts if it exceeds the 8 Phase 0 measured** — a jump would mean something is deleting
   games without their participants, which is a bug to find rather than data to tidy. After the run:
   `0` orphans, and `pg_constraint` lists `game_participants_game_fk` (CASCADE),
   `game_participants_team_fk` and `game_participants_profile_fk` (both SET NULL) beside the primary
   key. The 2 legitimate rows survived, which the walk below confirmed by loading the fixture and
   getting both sides back.

5. **`FIX-1` had nothing to backfill, as the census predicted.** Re-run immediately before the
   migration rather than trusted from Phase 0: one event, `SingleMatch`, no untyped rows, and the
   orphan count still 8. So D1's rewrite processed 0 rows, the `format` backfill 0 and the `type`
   backfill 0, and `SET NOT NULL` plus `events_type_check` went onto clean data.

6. **The app was checked against the migrated database, not asserted to work.** `verify-event-loads.ts`
   — a throwaway, deleted with the phase — connected a real socket.io client to a running server as a
   real signed-in user and replayed what the two screens that read an event actually issue: the events
   list's `org:{orgId}:events` join and its sites and facilities rooms, the event screen's six
   `get_data` calls, and the game the event contains. **15/15 passed on the restored copy**, with no
   `[DataAccess] REFUSED` line in the server log — then the working database was migrated and the same
   15 passed against it.

7. **`init-db.ts` stamps the new migration automatically**, so a fresh database reports 8 applied and
   `db:migrate` against it is a no-op. Phase 0 §0.3 doing its job on the first migration written after
   it.

**Four things were found outside this phase's scope. All four were logged, and then — at the user's
request, before starting Phase 2 — fixed:**

- **`FIX-11`** — the create wizard still wrote `'SportsDay'`, which the new `CHECK` rejects. Both
  container entry points now write `Tournament` / `Festival`, exactly as D1 does to stored rows.
  **This pulled one small piece of Phase 2 forward**: `format` was a column with no code behind it,
  so `Event.format` is now an optional `EventFormat` on the shared model and `EventManager` selects,
  inserts and updates it. That is the whole of it — nothing *reads* `format` yet, and `EventType`
  keeps its `'SportsDay'` member for the four client call sites Phase 5 rewrites.
- **`SEED-1`** — `db:setup`'s seed half could not complete: `existing_orgs.json` is a 2026-02-28
  snapshot naming `sport-rugby` and friends, which `20260810_migrate_sport_ids` renamed away, so a
  foreign key violation rolled back the entire seed. Now canonicalised (the same prefix rule the
  migration used) and checked against the seeded sports, so a stale id is repaired and an unknown
  one costs a warning rather than the transaction. `db:setup` completes end to end. Distinct from
  `DATA-3`, which is untouched.
- **`SOCK-1`** — a `join_room` payload that was not a string crashed the server process, from an
  anonymous socket. Observed rather than theorised: it killed the test server when the verification
  script had the payload shape wrong. Five handlers now check their payload at the boundary, and the
  same defect turned out to sit at two more — `action` read `action.type` before its try block, and
  `get_data` destructured its request outside both of its own. Verified by attempting the crash
  eight ways.
- **`DOC-1`** — `database_structure.md` documented 30 of the schema's 50 tables. All twelve missing
  ones are written up, checked against `information_schema` rather than against `init-db.ts`, which
  is what caught a further set of column-level gaps and one more instance of the same `events` drift
  this phase already owed (`organizations` listing two join tables as array columns).

None of it changed the migration or the schema, so the exit criteria above still stand as measured.

---

## Phase 2 — Shared types, the scoring engine, and the fixture-side component

**Goal:** the logic that everything else calls, with nothing yet calling it. This is the highest-risk
code in the feature and the easiest to verify in isolation, which is why it is alone in a phase.

**Depends on:** Phase 1 for the shapes; nothing at runtime.

**Build:**

1. **`shared/src/models/event/Tournament.ts`** — the types in
   [data model §5](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md) verbatim:
   `TournamentFormat`, `ScoringSubject`, `TiebreakFactor`, `ScoringSystem` (both modes),
   `TournamentDivision`, `TournamentStage`, `TournamentEntrant`, `ParticipantSourceRule`,
   `TournamentAdjustment`, `TournamentStandingRow`.
2. **`GameParticipant`** gains `entrantId`, `sourceGameId`, `sourceStageId`, `sourceRule`.
3. **`shared/src/utils/standings.ts` — the real work of this phase.** It is currently a clean pure
   function that reads `participantsList[0]` and `[1]` and `finalScoreData.home` / `.away`. It needs:
   - **N participants**, not two. Required by ranked meets (D27) even though no athletics UI ships —
     the two-sided assumption is exactly the thing D12 says to fix now rather than retrofit.
   - **`ScoringSystem` as input**, both modes: `byResult` (today's win/draw/loss) and `byPlacing`
     (position → points). One engine, per "points by placing is a scoring system".
   - **Ordered tiebreakers producing a definite `rank`.** This is the part that must be got right:
     today's points-then-difference ordering is a *display* ordering, and progression needs a
     *definite* answer, because `{ type: 'standing', poolKey: 'A', position: 1 }` resolves against it.
     Ship the default order from D29; the organiser reorders it.
   - **`division_adjustments` folded in** after computing from fixtures (D29).
   - **Unresolved fixtures skipped**, never scored as byes (D7).
   - **Division weighting and the org roll-up** (D6, D18).
4. **The fixture-side component (U22)** — `expo-app/components/`, renders all three states from
   [data model §2.0](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md): a known entrant, an
   entrant with only a `label` ("TBC — awaiting confirmation"), and a rule-based placeholder ("Winner
   QF1", derived from the rule and **not stored**). It needs only the types above, which is why it can
   be built here — and it is the component every later screen is checked against.

**In scope from `TODO.md`:** `SPORT-10` — this phase is its first consumer. The engine consults
`MatchTopology` for `byPlacing`; it does **not** close the item, since fixture creation and the
scoring screens still ignore both flags. Rewrite the entry to say what remains rather than checking
it off.

**Set up first:** Vitest as a dev dependency of `shared/`, with an `npm test` script. Config is a few
lines for a plain TS package; no environment or transform work is needed, which is the reason this is
the one package getting a framework now.

**Exit criterion:** `npm test` in `shared/` passes, covering at minimum: a two-team round robin; a
pool with a three-way tie that **each** tiebreak factor in turn has to separate; a division with an
adjustment; an unresolved fixture that must not score; a `byPlacing` division; and a weighted
two-division roll-up. Assert the ranks, not just that it does not throw — the whole point of `rank` is
that it is definite.

These are permanent. They are the regression net for every later phase that touches scoring, and for
`LeagueManager`, which calls the same function.

**Risk:** it is tempting to keep the old two-participant path beside a new N path. Do not. Two
implementations of the standings answer is precisely what D19 and D30 exist to prevent, and
`LeagueManager` calls the same function.

**Docs:** [okf/api_comms.md](file:///c:/Fred/Coding/SK/okf/api_comms.md) if the shared types are
catalogued there; `TODO.md` for `SPORT-10`.

### Done — 2026-09-01

**Exit criterion met: `npm test` in `shared/` passes, 42 assertions across two files**, covering
every case the criterion named and asserting ranks rather than absence of a throw —
[standings.test.ts](file:///c:/Fred/Coding/SK/shared/src/utils/standings.test.ts) and
[fixtureSide.test.ts](file:///c:/Fred/Coding/SK/shared/src/utils/fixtureSide.test.ts). Vitest is a
dev dependency of `shared/` only, with [vitest.config.mts](file:///c:/Fred/Coding/SK/shared/vitest.config.mts)
and an `npm test` script; `tsconfig.json` excludes `*.test.ts` so nothing test-shaped reaches `dist/`.

1. **The engine is one implementation, and the old two-participant path is gone.**
   [standings.ts](file:///c:/Fred/Coding/SK/shared/src/utils/standings.ts) takes N sides, a
   `ScoringSystem` in either mode, an ordered tiebreak list, adjustments and disciplinary points.
   Both existing callers were moved onto the new signature rather than left on a shim —
   `LeagueManager.recalculateSeasonStandings` and the event screen's live standings — so there is no
   second answer for the two-sided case, which is what D19 and D30 exist to prevent.

2. **`rank` is definite, and where it cannot be, it says so.** Ranking is group-based rather than a
   pairwise comparator: rows are partitioned by points, and each group is split by the factors in
   order, recursing on what a factor could not separate. That matters for `headToHead`, which is
   computed as a **mini-league among the tied entrants only** (`requireAllSidesRanked`) — a pairwise
   head-to-head comparator over three teams can be non-transitive, and a non-transitive comparator
   makes `Array.sort` produce a different table depending on input order. Entrants no configured
   factor can separate **share** a rank (1, 2, 2, 4). That is the honest answer, and D29's manual
   override is the mechanism for breaking it; inventing an order from ids would have looked definite
   and been arbitrary, which is worse for progression than a visible tie.

3. **The three-way-tie test exercises every factor in one pool**, as the criterion asked. Four
   entrants: one clear on 6 points; three level on 3 with identical points difference *and*
   identical points for, so the first two factors decide nothing; head-to-head lifts the only one of
   the three to have beaten another of them; most wins cannot split the remaining pair; fewest cards
   does. Asserted as `[1, 2, 3, 4]`, and as `[1, 2, 3, 3]` when no disciplinary record exists.

4. **Where a score comes from turned out to be the real decision, and it is not what the old code
   read.** `calculateStandings` read `finalScoreData.home` / `.away`; nothing writes that on the
   normal scoring path — the score lives at `liveState.scores[gameParticipantId]` (this is `FIX-9`
   again, one layer down). The engine now reads three shapes in order of how final they are:
   `finalScoreData.scores`, then `finalScoreData.placings` for a meet recorded as finishing order
   alone, then the legacy `{ home, away }` blob, and only then `liveState.scores`. **The order is
   load-bearing**: the event screen's quick-score modal writes `finalScoreData` onto a game whose
   `liveState.scores` is still the empty object it was created with, so reading the live state first
   would have scored every such fixture 0-0 and called it a draw. There is a test for exactly that.

5. **`byPlacing` is the same code path, not a branch beside it.** Positions come from explicit
   `finalScoreData.placings` where present — so a race where the lower time wins works — and
   otherwise from score order, with standard competition ranking (1, 2, 2, 4). A dead heat **splits
   the points of the positions it occupies** (two tied for second share 2nd and 3rd), which is what
   keeps the total awarded constant; a shared first place counts as a draw for each of them, so
   `mostWins` still means something in a ranked division.

6. **`SPORT-10`'s consult is small, real, and deliberately not more than that.** `matchTopology`
   decides one thing: whether the two-sided `{ home, away }` shape may be read at all. Under
   `MULTI_COMPETITOR` it is refused, because "home" and "away" mean nothing in an eight-competitor
   race and applying them to whichever two participants sort first would invent a result. A
   competitor is also matched by `entrantId`, then `teamId`, then `orgProfileId`, so an individual
   sport resolves without a team. The item is **rewritten, not closed**: nothing supplies the flag
   yet (both callers take the `HEAD_TO_HEAD` default; a division passes its sport's real value from
   Phase 3), fixture creation still assumes two sides, and `participantType` is still read by
   nothing. **The sport editor now says as much** rather than offering two settings the app mostly
   ignores: a notice above both controls, and a per-setting hint naming what reads it today — which
   retires a line at a time as consumers land, where one blanket disclaimer would go stale as a
   whole. The values are worth setting correctly ahead of the UI that consumes them; it was the
   silence that was the bug.

7. **The fixture-side component (U22) is built, and its wording is not in it.**
   [FixtureSide.tsx](file:///c:/Fred/Coding/SK/expo-app/components/FixtureSide.tsx) renders the three
   states; the text is derived in
   [fixtureSide.ts](file:///c:/Fred/Coding/SK/shared/src/utils/fixtureSide.ts) — `resolveFixtureSide`
   and `describeParticipantSource` — because the same labels are needed server-side and on anything
   printed, and because that is where they can be unit tested. Resolution order is deliberate: a
   known competitor beats everything (so a filled slot is indistinguishable from one that was never a
   placeholder, even if a stale rule is still on the row), then an entrant, then the rule. A rule
   degrades rather than breaks without names to hand: "Winner of an earlier fixture", not "Winner
   undefined".

8. **Verified beyond `tsc`.** `server/` and `expo-app/` both type-check clean, and the two touched
   client files were bundled through Metro (`FixtureSide` and the event detail screen, both 200), per
   [expo-app/AGENTS.md](file:///c:/Fred/Coding/SK/expo-app/AGENTS.md) — a Metro bundle is the check
   `tsc` cannot make.

**One thing was found outside this phase's scope, logged, and then — at the user's request, before
starting Phase 3 — fixed: `SCORE-14`.**
`LeagueManager.recalculateSeasonStandings` selected neither `g.status` nor `g.live_state`, so every
game reached the engine with `status` undefined and was dropped by the "only finished fixtures
count" guard — **every league season's cached standings were all zeros, and had been since the
engine was written**. The guard was right and the projection was wrong. Both columns are now in it.

**Verified before and after against the dev database rather than reasoned about**, which is the only
way to tell a fix from a plausible fix here: a throwaway script built a real three-team season — a
win, a draw, and one fixture scored through the event screen's quick-score `{ home, away }` path —
and ran the **old** projection and the new one over the same rows. The old one counted 0 fixtures and
ranked all three teams first; the new one returns `P2 W2 F44 A21 pts6 rank1` / `pts1 rank2` /
`pts1 rank3`, and `seasons.cached_standings` persisted with all six sides counted. That third fixture
counting is what proves both score shapes are read, not just the one the engine prefers. The script
deleted everything it created and is itself deleted with the phase; per
[test-org-reuse](file:///c:/Fred/Coding/SK/.agent/skills/test-org-reuse/SKILL.md) it left
`app-test-org` behind, which the dev database did not previously have.

**This is also the first thing that would justify a `server/` test harness**, which Phase 3's exit
criterion says to decide on. The script is the shape one would take — real managers, real database,
plain assertions, cleanup in a `finally` — and it was written and thrown away rather than kept,
which is exactly the cost the decision is about.

**Deviations from the plan as written, both deliberate:**

- **`okf/api_comms.md` was not updated.** It catalogues communication mechanics and code
  entrypoints, not shared types, and this phase adds no socket action or room. The plan's own wording
  made this conditional. The shared package's new modules and its test framework are recorded in
  [okf/architecture.md](file:///c:/Fred/Coding/SK/okf/architecture.md), the standings engine and the
  fixture-side derivation in [okf/database.md](file:///c:/Fred/Coding/SK/okf/database.md) beside the
  `cached_standings` columns they write, and the one-component rule in
  [okf/design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md).
- **`Array.prototype.flatMap` and `Object.values` are avoided** in `standings.ts`. `shared/`
  compiles at `target: es6` with no `lib` override, so both are compile errors there. Raising the
  target for one convenience would change the type envelope of a package the server and the app both
  consume; the loops are three lines.

---

## Phase 3 — Server: divisions, stages, entrants, and the choke point

**Goal:** every tournament structure is creatable, readable and live over sockets. Still no client.

**Depends on:** Phases 1 and 2.

**Build:**

1. **`TournamentManager`** in `server/src/managers/`, following `BaseManager` and the snake_case →
   camelCase aliasing convention. CRUD for divisions, stages, entrants, stage entrants, facility
   allocations and adjustments. Registered on
   [DataManager](file:///c:/Fred/Coding/SK/server/src/DataManager.ts) like every other manager.
2. **The socket actions** in [data model §8](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md)
   — `ADD/UPDATE/DELETE_DIVISION`, the same for stages, `SET_DIVISION_ENTRANTS`,
   `GENERATE_STAGE_FIXTURES`, `SCHEDULE_STAGE`, `ADD_GAMES`, `UPDATE_GAMES`, `RESOLVE_PARTICIPANT`,
   `ADD/DELETE_ADJUSTMENT`. Added to `SocketActions.ts`, `Protocol.ts` and the `index.ts` switch.
3. **The batch contract (D13)** — written once, in
   [okf/api_comms.md](file:///c:/Fred/Coding/SK/okf/api_comms.md), and obeyed by every batch action:
   one transaction with a per-item error report, **one permission scope per batch** (refuse batches
   spanning two), one batched broadcast, and an idempotency key so a retried batch of ninety does not
   double-write. The spec is explicit that this contract outlives the feature; write it down before
   the second action copies the first.
4. **Rooms** (U33) — new rooms for a division's fixtures and standings, declared in
   [roomAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/roomAccess.ts). An undeclared room is
   refused, so this is not optional. Rooms follow the screen's data needs, never the viewer's role.
5. **New `get_data` types** classified in
   [dataAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/dataAccess.ts), deferring to `canJoinRoom`
   where a room owns the data. Under Phase 0's enforcement an unclassified type is refused, which is
   the intended safety net rather than an obstacle.
6. **`recalculateForGame(gameId)` — the choke point (D30).** The single function that rewrites
   `division_stages.cached_standings`, then `events.cached_standings`, then every season in
   `game_seasons` via the existing `recalculateSeasonStandings`, then — if the stage just became
   `Complete` — resolves the next stage's `stage_entrants` and fills its participants' `source_rule`s.
   **That last arrow is where progression actually happens**, and it is the same code path as
   recalculating the table because the table is what it reads.

   Every path that changes a result must route through it: a game finishing, the final-score override
   on an already-finished game, dispute resolution, game deletion, attach/detach from a season, an
   entrant substitution (D10), and a new adjustment row. Enumerate them explicitly and check each
   one — a cache is only as good as the paths that invalidate it, and this list is longer than it
   looks.

**Exit criterion:** a `ts-node` script that builds a two-stage division end to end over the real
managers — create a division, add four entrants, generate a pool stage, finish its games, and assert
that the knockout's placeholders **resolved to the right teams** and that `events.cached_standings`
moved. If progression works headlessly here, every screen after this is presentation.

Write it as plain assertions with no interactive output, so it can graduate into a real integration
test without being rewritten. **Decide at this point whether `server/` gets a test harness** — this
script is the first thing that would justify one, and by now the cost of a disposable test database is
concrete rather than estimated. If the answer is no, the script stays a script.

**Risk:** the choke point is the single highest-value thing in the feature and the easiest to leave
half-wired. Grep for every writer of `finalScoreData` and every `DELETE FROM games` before declaring
it done.

**Docs:** [api_actions.md](file:///c:/Fred/Coding/SK/docs/api_actions.md),
[okf/api_comms.md](file:///c:/Fred/Coding/SK/okf/api_comms.md) (the batch contract and the new rooms).

### Done — 2026-09-01

**Exit criterion met: a two-stage division runs end to end headlessly.**
[phase3-progression.ts](file:///c:/Fred/Coding/SK/server/src/scripts/phase3-progression.ts) builds a
division, four entrants, a pool stage and a knockout **generated before the pool is played**, plays
the six pool fixtures through the ordinary scoring path, and then asserts what progression did —
**44 assertions, twice, with the database left clean between runs**. It is written as plain
assertions with no interactive output, so it can graduate into an integration test unchanged.

The assertions that matter are the ones about who ended up where. The pool finishes 9 / 6 / 3 / 0,
every rank separated on points alone; the knockout's `stage_entrants` are then written in that
order, the two semi-finals are 1st-v-4th and 2nd-v-3rd, and **the final is still "Winner SF1 v
Winner SF2"** — because a pool completing decides the semis and not the final. Playing the semis
fills the final. `events.cached_standings` moves to `22.5` and `4.5` for the two organisations,
which is 15 and 3 raw points at the division's `weighting` of 1.5 — so D18 is asserted rather than
assumed.

1. **The choke point is one function, and the audit the phase asked for found two paths that were
   not routed through it.** `recalculateForGame` does the stage table, the event roll-up, the league
   seasons, then progression, and every writer reaches it through
   `EventManager.recalculateStandingsForGame`, which **also publishes** — one door in, one audience
   out, because leaving publication to each caller is how `FIX-3` and `FIX-6` happened. Grepping
   every writer of `finalScoreData` and every `DELETE FROM games`, as the risk note says to, turned
   up:

   - **`deleteGame` recalculated nothing at all.** Deleting a finished fixture left every table that
     had counted it standing. It now captures the stage and event *before* the row goes — the same
     trap `captureFixtureRooms` exists for — and routes through the choke point.
   - **`deleteEvent` deletes every fixture under an event and told no league season.** A tournament
     fixture can also count toward a season (D21), and `game_seasons` cascades with the game, so the
     seasons have to be captured first. Same fix applied to a stage regeneration, which deletes
     fixtures for the same reason and had the same hole.

   Two paths deliberately stay outside it, and the reasons are recorded beside them: season
   attach/detach changes membership rather than a result, and *detach cannot use it* — the choke
   point resolves seasons from `game_seasons`, and by then the row is gone.

2. **A stage's status is derived, never asserted.** `Complete` is "every fixture has a result",
   `Ready` is "entrants but no fixtures", and both are recomputed from the rows rather than set by
   whichever writer remembered. That is what makes progression fire reliably: the last pool fixture
   finishing is the *only* thing that triggers it, and it does so because the status is recalculated
   rather than because a caller said so.

3. **`rank` is read, and a shared rank resolves to nobody.** `{ type: 'standing', poolKey: 'A',
   position: 1 }` matches on the engine's `rank`, not on array order, and if two entrants share a
   rank the slot **stays a placeholder**. Picking whichever sorted first would look decisive and put
   the wrong team in a semi-final; a visible placeholder is the engine saying a human has to decide,
   which is what D29's manual override is for.

4. **A manual fill clears `source_rule`, and that clearing *is* the override.** Once the rule is
   gone the choke point will not touch the slot again, so an organiser's decision survives the
   source fixture being re-scored — asserted in the script. Filling a "TBC — awaiting confirmation"
   slot and promoting a beaten semi-finalist are deliberately the same edit and the same code path,
   which was the deciding argument for one placeholder entity rather than two.

5. **The batch contract is written down once and enforced in code**
   ([wss/batch.ts](file:///c:/Fred/Coding/SK/server/src/wss/batch.ts),
   [api_actions.md](file:///c:/Fred/Coding/SK/docs/api_actions.md)): one transaction, one permission
   scope, one broadcast, one idempotency key. Two things about it were decided rather than assumed.
   **"One transaction" and "a per-item report" are not in tension** — a batch with any failed item
   writes *nothing*, and the report says which rows to fix rather than which survived, because a
   half-applied roster is not a state anybody asked for. And the **idempotency cache is in memory,
   per process, with a ten-minute TTL**, sized to the failure it exists for (a lost acknowledgement,
   seconds later, to the same process); it is not durable, a second server process would need a
   table, and that is written down rather than left to be discovered. The in-flight map matters as
   much as the completed one, since a retry usually arrives *because* the first attempt is slow.

6. **`ADD_GAMES` and `UPDATE_GAMES` do not loop over `EventManager.addGame`, and that is the reason
   `TX-1` exists.** `BaseManager.query` goes through the pool, so the existing
   `this.query('BEGIN')` … `this.query('COMMIT')` blocks can run each statement on a different
   backend — they are not transactions, and their `ROLLBACK` undoes nothing. Looping over one would
   have made the contract's headline rule false in the very action it exists for. `BaseManager` now
   has a real `transaction(fn)` that checks out one client; `TournamentManager` uses it throughout.
   The existing call sites are logged as **`TX-1`** rather than swept up here — they are the hottest
   write paths in the app and want their own change.

7. **`UPDATE_GAMES` refuses to carry a score.** Its updatable set is when and where, plus status and
   stage. A result goes through the scoring path so the choke point runs and the undo and dispute
   rules apply; a bulk reschedule that could also write `finalScoreData` would be a second,
   unguarded way to change a match's outcome.

8. **One authorization gate, not fourteen.** `TOURNAMENT_ACTION_EVENT` in `index.ts` resolves every
   tournament action's payload to its event and runs the existing `canEditEventOrGame` — the same
   shape as `SCORING_ACTION_GAME_ID` beside it. So a division, a stage, a roster and an adjustment
   inherit exactly the rights the event already grants, and **Phase 4 widens one function rather
   than fourteen call sites**. `orgId` falls back to the event's own org, so the check cannot be
   skipped by omitting it.

9. **The read boundary was checked, not reasoned about.**
   [phase3-access-audit.ts](file:///c:/Fred/Coding/SK/server/src/scripts/phase3-access-audit.ts)
   replays every new room and every new `get_data` type as an anonymous socket and as a signed-in
   member: **31 checks, all passing**, and the ones that matter are the negatives. Three rooms per
   division, split by what is *in* them rather than by who may organise (U33): `:fixtures` and
   `:standings` are **public**, exactly as `org:*:events` and `season:*:standings` already are,
   while the base `division:{id}` is **member** — an entrant may be a *person* rather than a team,
   and a `division_adjustments` row carries a reason an organiser wrote and the id of who wrote it.

10. **A generated draw renders from the broadcast alone.** `GameSummary`'s participants gained
    `entrantId`, `entrantLabel`, `sourceGameId`, `sourceStageId` and `sourceRule`, for the same
    reason they already carry `orgShortName` (`FIX-7`): a freshly generated knockout is precisely
    the screen where *every* slot is unfilled, so resolving placeholders client-side would be a
    lookup per row on every row. Phase 2's `resolveFixtureSide` now has everything it needs.

11. **Generation refuses rather than guesses.** `create` will not top up an existing draw and
    `regenerate` states the cost before destroying results (D9 — two paths, no silent top-up); a
    bye advances its entrant instead of being recorded as a walkover nobody played; a draw does not
    decide a knockout, so `winnerOf` leaves the placeholder in place; and Swiss raises a named error
    rather than silently producing nothing, since the format is deliberately carried forward.

**The one schema change, and it is a deviation from a settled document.**
[data model §4.4](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md) says `games` gains no
columns and that a fixture reaches its stage "through its participants' entrants", with a
denormalised column as a cheap addition later. **That indirection is not awkward, it is
insufficient**, and in the ordinary case rather than an exotic one: an entrant belongs to the
*division*, and `stage_entrants` deliberately puts the same entrant in the pool stage *and* the
knockout, so resolving through participants returns **both** stages of every pools-and-knockout
division. Every part of the choke point needs one answer — rewrite *one* stage's table, ask whether
*this* stage is complete, delete *this* stage's fixtures on a regeneration, where deleting the
knockout's alongside the pool's would be data loss rather than a slow query. So
[20260902_game_stage_id.ts](file:///c:/Fred/Coding/SK/server/src/scripts/migrations/20260902_game_stage_id.ts)
adds `games.stage_id` (`ON DELETE SET NULL`, matching `source_stage_id` — removing a stage must not
delete the fixtures played in it) with an index, mirrored into `init-db.ts` per the standing rule,
and documented in `okf/database.md` and `docs/database_structure.md`. **Raised and agreed before it
was written**, rather than done quietly.

**`SCHEDULE_STAGE` ships as the server half only, agreed up front.** It honours the two hard
constraints (an entrant plays once at a time, a facility hosts once at a time) and the stage's
`earliest_start`, and it walks the facility cascade — request, then division, then event. **Phase 7
still owns scheduling**: day windows and last start times, turnaround by sport, the grid, moving a
fixture, and conflicts that warn rather than block. Two limits are stated in the code rather than
left to be found: an entrant is only checked against *this stage*, so a school playing in two
divisions at once is not yet detected, and slots run continuously from `startAt` with no notion of
a day ending.

**Both scripts are kept, which is a departure from how Phase 0's throwaways were handled.**
The exit criterion already says the progression run "stays a script" while `server/` has no harness,
so that one was never in question. The access audit was written as a throwaway in the Phase 0 mould
and is kept for the same reason the harness was deferred: with no test infrastructure, deleting it
would leave **nothing** checking that the roster and the adjustment reasons stay unreadable to an
anonymous socket. Both are cheap to run, leave the database as they found it, and are the obvious
first candidates to graduate when a harness does land.

**No `server/` test harness, decided here as the plan asks.** Both scripts are the shape one would
take — real managers, a real database, plain assertions, cleanup in a `finally`, and
[test-org-reuse](file:///c:/Fred/Coding/SK/.agent/skills/test-org-reuse/SKILL.md) honoured
(`app-test-org` reused and left behind, everything else deleted). But a harness means a disposable
database, fixture setup and teardown, and `TODO.md`'s "never run in production" guard — test
*infrastructure*, a piece of work in its own right, and one script does not yet justify bundling it
into a feature build. Revisit at Phase 6, where the ninety-fixture case has to be repeatable.

**Verified beyond `tsc`.** `shared/`, `server/` and `expo-app/` all type-check clean; Phase 2's 42
unit tests still pass; the server boots with the whole module graph loaded (the manager cycles are
lazy `require`s, as `LeagueManager` already was); and both scripts run green twice with the
tournament tables back to zero rows afterwards.

**One thing not built, deliberately:** `settings.feedsPlate` is read by nothing. Loser routing into
a parallel bracket is Phase 8, and the `loserOf` primitive the third-place playoff already uses is
what makes it reachable there.

---

## Phase 4 — Permissions: organiser assignments and capability flags

**Goal:** the app can answer "what is *this user's* relationship to this event?" — the question
`canEdit = event.orgId === orgId` cannot ask.

**Depends on:** Phase 1 (the `event_organizers` and `division_organizers` tables from §0.1), Phase 3.

**Build:**

1. **Assignment actions** — appoint and withdraw an organiser at event scope (`event_organizers`,
   full rights per U12) or division scope (`division_organizers`; D31: fixtures and results only).
2. **The organiser picker** — three tiers per §0.1: participating orgs by default, global search behind
   an explicit control, and "add a person" creating a host-org profile **with no membership**. Reuses
   the shape already proven in
   [PersonnelAutocomplete](file:///c:/Fred/Coding/SK/expo-app/components/PersonnelAutocomplete.tsx).
   The global tier returns **name, org name and image only** — never `cellphone`, `birthdate` or
   `national_id` (`PEOPLE-1`). And appointing someone **must not** add their org to
   `event_organizations`: assert this in the exit criterion, because it is a plausible accident.
3. **The `AccessManager` check (U10)** — beside the existing event and game checks, not inside the
   tournament manager, so there is one rulebook. Two properties of the manager to work with rather
   than around:
   - It already turns a user into a **set of profile ids**, matching by `user_id` or verified email.
     Since grants are profile-keyed (§0.1), the check is "is any of my profile ids granted this event
     or division?" — one more condition over machinery that exists, not a second identity lookup.
   - Read-path membership resolution is cached for 30 seconds behind `getMembershipSnapshot`, while
     **writes query every time** (`LIVE-1`). An organiser grant is a write-authorising fact, so it
     follows the write path — do not cache it into a mutation check.
4. **Capability flags (U9)** — `{ canEditEvent, convenesDivisionIds }` on the event payload,
   `canEdit` on each division. `participatesAsOrgIds` is deliberately **not** sent; the client
   intersects the event's participating orgs with the user's own.
5. **The constraint from §1 of the UI doc, which is the thing to get right here:** compute the flags
   from **the user and the event**, never from the `orgId` in the route. The personal cross-org
   framing is later work, and it must not have to compute the same answer a second, different way.

**Before building:** the feature spec §10 says the permission model "needs confirming against
[okf/auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md)". Do that confirmation as the
first task of this phase, not after.

**Exit criterion:** as a **non-admin member** appointed event organiser, you can edit the tournament
and nothing else in the org. As a division convenor you can edit that division's fixtures and enter
its results, and the app refuses — server-side, not merely by hiding a button — an attempt to add an
entrant or touch another division. Verify the refusal on the wire.

Then the case profile-keyed grants exist for: **appoint a convenor whose profile has no user account**,
confirm the appointment saves, then create an account against that profile's email, verify it, and
confirm the convenor rights appear **without the grant row being touched**. If that works, the grant
and the claim flow are properly decoupled.

Finally, the accident this design is most likely to produce: **appoint a convenor from an org with no
team in the tournament, then check `event_organizations` and the standings roll-up.** The org must be
absent from both. An organisation that appears in the table having played nothing is the symptom.

**Docs:** [okf/auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md) — this phase changes the
permission model, so it is a required update, not an optional one.

### Done — 2026-09-03

**The confirmation this phase opens with came back clean, and that is worth stating rather than
skipping.** [okf/auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md) described three
sources of authority — membership role in an org, app admin via `org-system-admins`, and the
public / authenticated tiers — and **no concept of a grant scoped to one event**. So the feature
spec's §10 does not contradict it; it adds a fourth tier. Nothing in the document had to change, and
it gained a section describing the grant, what each scope carries, and the one place the workspace
constraint deliberately does not apply.

**Exit criterion met, and asserted rather than clicked through.**
[phase4-permissions.ts](file:///c:/Fred/Coding/SK/server/src/scripts/phase4-permissions.ts) — kept,
in the Phase 3 mould — runs **66 checks** against a real database with four actors: a non-admin
member of the hosting org, an external specialist with no membership anywhere, an unclaimed profile
that later claims an account, and a stranger who is refused throughout so the positives are not
vacuous. All three cases the phase asks for pass:

- **The appointed non-admin can edit the tournament and nothing else in the org.** Falsified
  properly: a *second* event in the same organisation is refused, `isOrganizationAdmin` stays false,
  and they still cannot manage the org's teams.
- **The grant and the account claim are decoupled.** A convenor with no user account is appointed,
  an account is then created against that profile's email and verified, the rights appear — and the
  grant row is asserted **byte-identical** afterwards (`created_at` and `granted_by` unchanged).
- **Appointing an outsider adds nothing to `event_organizations`,** and their organisation is absent
  from the standings roll-up. Both asserted, because an org in the table having played nothing is
  how this bug would first be noticed.

**The refusals are checked on the wire, not by hiding a button** — which needed one structural
change. The gate was inline in `index.ts`, where nothing could call it, so both scope maps and the
decision moved to
[wss/tournamentGate.ts](file:///c:/Fred/Coding/SK/server/src/wss/tournamentGate.ts) and the audit
exercises `enforceTournamentAction` itself. A gate nobody can call is a gate nobody can test.

**Four things came out differently from the plan above, three of them decisions and one of them a
gap in the plan.**

1. **The convenor's scope was widened, at the user's direction (D31).** The plan carried D31's
   "fixtures and results only". A convenor now runs the whole of their division — entrants included
   — so that an event organiser can hand netball over and stop thinking about netball. The line that
   remains is: not the division's own record (its `weighting` decides how its points roll up into
   the event, so it is an event-level decision), not the event, and **not appointing anybody**. That
   last one is what keeps an appointee from ever building a position they cannot be removed from,
   which is the asymmetry D33 relies on.
2. **The capability flags are their own read, not a field on the event.** `{ canEditEvent,
   convenesDivisionIds }` is exactly what the plan asks for; where it arrives is different. A
   `canEdit` on a division object would be published to `division:{id}` and `event:{id}` like
   everything else — and those are *rooms*, so one viewer's answer would be delivered to every other
   viewer, and any later broadcast of that division would silently overwrite the flags client-side.
   So: `get_data { type: 'event_capabilities', eventId }`, answered per socket from the identity the
   handshake proved, plus a push to `user:{id}` when a grant changes. The client derives a
   division's `canEdit` as `canEditEvent || convenesDivisionIds.includes(id)` — one field fewer on
   the wire, and no per-user data on a shared object.
3. **`PEOPLE-1` was closed rather than worked around.** The plan expected the picker to ship a lean
   projection while the permissive handler stayed. The user chose to close it: `search_people` now
   returns contact and identity fields **only** when the search is scoped to an org the caller
   belongs to, and the lean projection everywhere else. Matching is unchanged in both modes —
   searching by an email you already know is how you confirm you have the right person.
4. **The plan's build list had no read path, and the exit criterion cannot pass without one.** An
   external convenor holds no membership, so `division:{id}` and `division_entrants` refused them:
   they would have been appointed to run a division and then denied its roster. Grants now reach
   `roomAccess` and `dataAccess` — on the read path only, cached beside the membership snapshot
   under the same 30-second TTL, and never consulted by a mutation check (`LIVE-1`).

**Withdrawal closes what the grant opened, at once.** A grant change publishes
`EVENT_CAPABILITIES_UPDATED` to the affected person's `user:{id}` room, and `broadcast()` hooks that
message the way it already hooks `USER_MEMBERSHIPS_UPDATED`: drop the cached identity, then
`revalidateUserRooms`. A withdrawn convenor stops receiving a division's roster immediately rather
than at their next reconnect.

**The picker is built but not mounted**, following the Phase 2 precedent —
[FixtureSide](file:///c:/Fred/Coding/SK/expo-app/components/FixtureSide.tsx) was written before any
screen existed too. [OrganizerPicker](file:///c:/Fred/Coding/SK/expo-app/components/OrganizerPicker.tsx)
implements all three tiers; Phase 5 mounts it.

**`PEOPLE-2` was found here and fixed here, and it was worse than it first looked.** Wiring the
picker's third tier turned up that `ADD_ORG_PROFILE` had no permission check; pulling on that showed
`LINK_USER_PROFILE` and `UPDATE_ORG_PROFILE` were an **org-admin takeover available to any signed-in
user** — a profile's email and `user_id` are both matching rules `AccessManager` uses to resolve a
user into their memberships, and `search_people` hands out the profile ids. Parked at first, then
fixed the same day once the chain was clear: all four writes now go through
[wss/profileGate.ts](file:///c:/Fred/Coding/SK/server/src/wss/profileGate.ts), gated on admin or
staff of the holding org, with one creation-only exception for an event's organiser so the picker's
third tier still works. The audit script grew to **82 checks** covering it.

**Two decisions were recorded rather than built**, because they are identity-model work rather than
tournament work: `MEMBER-1` (invite / apply membership, where applying is not joining until an admin
approves) and `MEMBER-2` (a reserved, membership-free home for people affiliated to no organisation,
plus "External" as a derived label rather than a stored role).

**One issue logged rather than fixed:**

- **`PEOPLE-3` — a fixture with no stage belongs to no division,** so a convenor can neither read nor
  score it while the event's organisers can. Correct for the model as it stands, but a state a
  screen can create; Phase 5/6 will decide whether a fixture may sit in a division without a stage.

**Verified beyond the audit.** `shared/`, `server/` and `expo-app/` all type-check clean, Phase 2's
Vitest suite still passes, and Phase 3's access audit was re-run — 31 checks, still green — because
this phase changed `roomAccess.ts`, which is exactly what that script exists to protect.

---

## Phase 5 — Client foundations: routes, screens, the collapse rule

**Goal:** a tournament exists, can be navigated, and its structure is visible. It has no fixtures.

**Depends on:** Phases 2, 3, 4.

**Build:**

1. **Create wizard changes (U17, partial)** — format picker (`Festival` / `RoundRobin` / `Knockout` /
   `PoolsKnockout`, labelled as stored per U34), venue(s), participating orgs. "Sports Day" goes.
   The implicit division is created **silently with the tournament** (U16), not lazily.
   Copy-an-existing-tournament (U18) is Phase 9.
2. **`FIX-1`'s client half (U39)** — the four `=== 'SingleMatch' ? … : Tournament` fall-throughs
   become explicit branches whose default case is an **error state**, not a Tournament.
3. **Division screen** at `/admin/[orgId]/events/[eventId]/divisions/[divisionId]` (U13), with
   **stages as navigation tabs** carrying `TabItem`'s `sublabel` for state — "Pools · complete",
   "Knockout · 4 of 7 played" (U14). The sublabel already exists, from `SCORE-10`.
4. **The collapse rule (U15), applied once and everywhere:** *a level with exactly one child renders
   that child inline and shows no picker.* One division → the event screen **is** the division screen.
   One stage → no stage tabs. And **announce the appearance**: adding a second division restructures
   the screen, so say so first.
5. **`Events` / `Games` tabs (U2, U36)** on the existing events screen. Both are already delivered by
   the one room — `EVENTS_SYNC` and `GAME_SUMMARIES_SYNC` both arrive on join — so this is a
   presentation split over data the screen already receives, with no new fetch.
6. **Role chips on the event card (U4, U5)** — Hosting / Convening / Attending as a **set**, from
   Phase 4's flags, with multi-select filter chips beside the existing `Upcoming / Past` toggle.
   Read them with `get_data { type: 'event_capabilities', eventId }` and refresh on
   `EVENT_CAPABILITIES_UPDATED` from the `user:{id}` room; a division's `canEdit` is
   `canEditEvent || convenesDivisionIds.includes(divisionId)`, derived rather than sent.
   **And this phase owes `matchPermissions.ts` the same widening**: it computes `canEdit` and
   `canScore` client-side from org memberships alone, so today it would hide the edit and scoring
   controls from an appointed organiser the server would happily let through. The server is already
   right; the screen is not. Mount [OrganizerPicker](file:///c:/Fred/Coding/SK/expo-app/components/OrganizerPicker.tsx)
   here too — Phase 4 built it, unmounted, the way Phase 2 built `FixtureSide`.
7. **`useLiveRoom` gains `upsertMany` (U32)** — it reduces one message at a time today, so a batch of
   ninety would produce ninety renders, relocating to the client exactly the cost D13 removed on the
   server. It lands **with** the batch actions rather than after them.
8. **The setup checklist scaffold (U17)** — the container and its dismissible steps; the steps
   themselves fill in over Phases 6–8.

**In scope from `TODO.md`:** "Consolidate Sportsday and Tournament view" — closed by this phase
together with Phase 1. `FIX-1` client half.

**Exit criterion:** create a tournament with one division; confirm the word "Division" never appears
anywhere (the U15 collapse). Add a second; confirm the restructure was **announced before** it
happened, and that stage tabs appear only on adding a second stage. On the events list, an event you
host and coach in shows **two** chips, not one.

**Docs:** [okf/client_routing.md](file:///c:/Fred/Coding/SK/okf/client_routing.md) — new routes;
[design_spec.md](file:///c:/Fred/Coding/SK/docs/design_spec.md) if the collapse rule generalises
beyond tournaments, which it probably should.

---

### Done — 2026-09-03

**Exit criterion met, and most of it is asserted rather than clicked through.** The criterion is
written as things to look at, and two of the three turned out to be pure functions once they were
written down properly — so they became tests rather than a walkthrough:

- **The collapse rule and the type resolution are tested**, in `shared/` where Vitest already runs.
  [collapseRule.test.ts](file:///c:/Fred/Coding/SK/shared/src/utils/collapseRule.test.ts) asserts
  that nothing *and* one child both collapse, that the second child un-collapses, that the
  announcement names the existing child, and that `resolveEventType` returns `Unknown` for an
  untyped row, a null event and the retired `'SportsDay'` — never `Tournament`.
- **"Two chips, not one" is a test.**
  [eventRoles.test.ts](file:///c:/Fred/Coding/SK/shared/src/utils/eventRoles.test.ts) asserts the
  exit criterion's own sentence directly: an event you host and coach in yields `['Hosting',
  'Attending']`, and three roles when you convene a division of it too. It also asserts the
  negatives that make those meaningful — a grant on another event does not leak, and a plain
  membership of the hosting org is neither hosting nor attending.
- **What only exists once a row is written** is
  [phase5-structure.ts](file:///c:/Fred/Coding/SK/server/src/scripts/phase5-structure.ts), kept in
  the Phase 3 and 4 mould: **39 checks** against a real database covering all four formats.

The suite went from 42 tests to **66**; the three server audits now stand at 31 + 82 + 39.

**Six things came out differently from the build list above.**

1. **The implicit division is created with its stages, not just by itself — and server-side.** The
   plan said "created silently with the tournament (U16), not lazily". Two choices inside that were
   the user's: the tournament's **first stage or stages are created with it too** (D11), derived
   from the format by `stagePlanForFormat` — `PoolsKnockout` is the one format that is genuinely
   two, which is also what makes it the format that exercises the stage tabs. And it happens in the
   `ADD_EVENT` handler rather than in the wizard, so the invariant holds for every caller rather
   than for the one screen that remembered.

   This is also a partial answer to **`PEOPLE-3`**: a division that is never stageless is a division
   whose fixtures always have a stage to belong to, so the orphan state a convenor cannot read
   becomes much harder to reach. The final call is still Phase 6's, when the fixture-creation
   screens land — and until then the division panel deliberately *shows* stageless fixtures, since
   that is the only way anybody would discover one existed.

2. **The list reads grants, not capabilities per card.** The plan says to read role chips with
   `get_data { type: 'event_capabilities', eventId }`. On a list of thirty events that is thirty
   round trips on a screen load — the "notify, then everybody refetches" cost the live-data design
   exists to remove, relocated to the client. So the list asks the one thing it genuinely cannot
   derive: `my_event_grants`, one read, with each division grant carrying its event id. UI doc §4
   already says hosting and attending *are* client-derivable and convening is not, so this is that
   sentence implemented rather than a departure from it. The **event screen still asks
   `event_capabilities`** and drives its controls from that, which is the authoritative answer.

3. **The event screen moved onto its room, and that exposed a real defect.** `join_room` pushes
   `GAME_SUMMARIES_SYNC` to `event:{id}` and `DIVISION_GAMES_SYNC` to `division:{id}:fixtures`, but
   `fixtureRooms` published to neither — so both rooms handed data over on join and then never
   updated it. That is `FIX-4`'s shape exactly, and it would have made every screen this phase
   built go stale on the first score. Both rooms are now in the audience of `publishGameSummary`
   and of every removal.

4. **`FIX-2` was closed, at the user's direction, and closed the way the decision described rather
   than by fixing the `Array.isArray` test.** Display names now travel: `Event.participatingOrgs`
   carries `{ id, name, shortName }` and a fixture's team and org names were already on its
   summary, so the screen holds no organisations at all. The invite picker stays a search, which it
   already was. The bulk read is gone rather than repaired.

5. **Two fields were added to fixtures because a permission check needed them.** `GameSummary` and
   `Game` now carry `stageId` and a derived `divisionId`. Without the second, `matchPermissions`
   cannot tell whether a convenor's grant covers *this* fixture, so it would hide the edit and
   scoring controls from somebody the server would let through — the server being right and the
   screen being wrong, which is the worse failure because it is invisible. The four game screens
   pass capabilities in for the same reason.

6. **The pure logic moved to `shared/`.** `resolveEventType`, `deriveEventRoles` and the collapse
   rule started in `expo-app/utils/` and were moved, because Phase 0's decision put Vitest in
   `shared/` only and these are exactly the kind of rule that decision was about — no React, no
   sockets, no database, and a rule that must hold forever. `EventGrants` went with them, beside
   `EventCapabilities`, since it is a wire shape rather than a client type.

**Two things in the build list were done differently in a smaller way**, and both are worth saying
so they are not discovered as surprises:

- **The event screen's `Group: time / sport / site` control is gone.** The old screen grouped a flat
  list of every fixture in the event; the new one renders fixtures inside their stage, where
  grouping by sport makes no sense (a division has one) and grouping by venue is the schedule
  grid's job. Fixtures are grouped by kick-off, with `Time TBD` last. If grouping by venue is
  wanted before Phase 7, say so — it is a small addition to `DivisionPanel`, not a rebuild.
- **The setup checklist is a scaffold with real steps, but only two of them act.** Structure and
  organisers are live; entrants, generation and scheduling say what they are waiting for rather
  than offering a button that does nothing. They fill in over Phases 6-8, as the plan intends.

**The event table still calculates client-side when the server has no rows.** The choke point only
writes `cached_standings` for a fixture that sits in a stage, and a tournament whose fixtures were
added by hand has none — so the screen prefers the server's roll-up and falls back to the local
calculation rather than showing an empty table. That fallback should disappear in Phase 6, when
generated fixtures land in stages.

**One issue logged rather than fixed:** `FIX-12` — `ADD_GAME` from the fixture-creation screen still
writes no `stage_id`, so a fixture added by hand on a tournament lands outside every stage. Phase 5
made that visible rather than silent (the panel shows such fixtures, and `PEOPLE-3` explains why a
convenor cannot touch them); Phase 6 owns the fix, because it owns the screen that creates them.

**Verified beyond the assertions.** `shared/`, `server/` and `expo-app/` all type-check clean, the
66-test Vitest suite passes, Phase 3's access audit and Phase 4's permission audit were both re-run
green — this phase changed `AccessManager` and the fixture publish path, which is what those scripts
exist to protect — and every new or changed screen was bundled through Metro (`200` on all twelve),
per [expo-app/AGENTS.md](file:///c:/Fred/Coding/SK/expo-app/AGENTS.md).

---

## Phase 6 — `Festival` and `RoundRobin`: entrants, generation, standings

**Goal:** **the first phase that delivers a usable tournament.** A sports day can be built, played and
ranked. Fixtures carry times entered by hand; the schedule grid is Phase 7.

**Depends on:** Phase 5.

**Build:**

1. **Entrants on both axes (U21), over one dataset** — *by division* ("who is in the u14 rugby?") and
   *by organisation* ("what is Northcliff entering?"), the second as a division × org grid or per-org
   checklist. The org axis is where **inline team creation** belongs, because that is the moment you
   discover Northcliff has no u16 netball team. Fifteen divisions × five schools done one division at
   a time is fifteen screen visits, which is the friction that gets a feature abandoned on first use.
2. **Placeholder entrants (D7)** — an entrant row with `team_id` null and a `label`, schedulable and
   printable like any other, resolved later by filling `team_id` so **every fixture referring to it
   updates at once**.
3. **Generation** — round robin by the circle method so byes distribute evenly on odd N; `legs` for
   double. `Festival` offers it as a **starting point** (D8) and then gets out of the way: delete, add,
   reorder freely, and a hand-built division is indistinguishable from a generated one.
4. **Regeneration (D9, U31)** — on entrant add/remove, exactly two paths: regenerate from scratch, or
   leave it alone and add by hand. **No silent top-up.** The dialog states the concrete cost — *"this
   deletes 14 fixtures, 3 of which have results"* — escalating to a second confirmation only where
   results exist. Replacing one entrant with another (D10) is **not** a regeneration: substitute in
   place, recalculate nothing, offer nothing.
5. **Standings screen (U28, U29)** — one table with a **division scope selector**, defaulting to all
   divisions. The scope decides the row, not just the filter: *all divisions* ranks the tournament's
   `scoringSubject` (a school leaderboard for a `Festival`); *one division* ranks its **entrants**, so
   a school entering u14A and u14B is **two rows**. The client **stops calling `calculateStandings`**
   (D30) and reads what the server computed.
6. **No points system is still a scoreboard** — played / won / drawn / lost appears as soon as any
   game is finished. Points are what configuration *adds*, not what makes the table exist.
7. **Overrides visible as overrides (U30, D29)** — a subtle marker on an adjusted row, the reason on
   tap, from `division_adjustments`.
8. **`FIX-2` and the typeahead (U41)** — display names come from the event and game payloads with no
   query at all (as `FIX-7` did for the fixtures list); the invite picker becomes a debounced
   `search_organizations` typeahead mirroring
   [PersonnelAutocomplete](file:///c:/Fred/Coding/SK/expo-app/components/PersonnelAutocomplete.tsx) —
   2-char minimum, 300ms debounce, limit ~50, lean projection. The new request type is classified at
   `authenticated` in `dataAccess.ts`, as `search_people` is; under Phase 0's enforcement it cannot
   ship unclassified. This **disposes of** the missing-`limit` half of `FIX-2` rather than fixing it.
9. **Batch subscriptions (U40)** — the first windowed list appears here, so apply the distinction:
   where the room's contents *are* the screen's contents, the join push is the load and a fetch would
   load twice; where the screen shows a window over a larger set, fetch the window and batch-subscribe
   to those ids.

**In scope from `TODO.md`:** `FIX-2` (closed); the unnumbered batch-subscription audit (partially —
rewrite it to say what remains).

**Exit criterion:** build a four-school, three-sport, five-age-group `Festival` — the 90-fixture case
the batch contract exists for — generate every division's fixtures, score a representative sample, and
confirm the org roll-up matches a hand-computed answer with a non-1.0 weighting on one division. Time
the generation: ninety fixtures should be one round trip and one render, not ninety of each.

**Docs:** [reports.md](file:///c:/Fred/Coding/SK/docs/reports.md) if standings appear there; `TODO.md`.

---

## Phase 7 — Scheduling

**Goal:** where and when. This is a phase of its own because it is the largest single UI surface and,
per D14, **the editing affordance is the feature** — the algorithm produces a legal schedule, the
organiser produces a good one.

**Depends on:** Phase 6.

**Build:**

1. **The facility cascade (spec §7)** — event picks venues, then facilities; a division may narrow to
   a subset; a division with no allocation may use any event facility supporting its sport.
2. **Day windows and stage gates (D15)** — start and end per day, where the end is the latest a fixture
   may *start*; plus a per-stage `earliest_start`, without which a greedy scheduler will happily start
   a semi-final before its pool has finished.
3. **The greedy pass (D14)** — fixtures into slots in order, respecting two hard constraints: an
   entrant plays once at a time, a facility hosts once at a time. **No optimiser** — deferred on
   sequencing, not ruled out.
4. **The schedule view (U24)** — a day-and-facility filtered list on narrow screens, a time × facility
   grid on wide, over the same data.
5. **Moving a fixture (U23)** — reuse the proven pattern in
   [selection.tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/[orgId]/events/[eventId]/games/[gameId]/selection.tsx):
   HTML5 drag-and-drop on web, tap-a-slot-to-open-a-sheet on mobile, chosen on `Platform.OS`. A
   schedule slot is the same shape of target as a position slot, so both good interactions come from
   an established pattern rather than being invented.
6. **The unscheduled tray *and* the filter (U25)** — both; they serve different moments.
7. **Conflicts warn, never block (U26)** — on the fixture *and* in a day-level panel. The fixture
   warning catches it as you make it; the panel is how you check the day before publishing. Organisers
   routinely know something the app does not.
8. **Venue and facility named together (D16)** wherever more than one venue is in play. "Field A" is
   ambiguous the moment two sites are involved, and a tournament makes that normal.
9. **Offline behaviour (U20)** — reading the schedule works offline; entering a result queues and
   sends on reconnect; generating and rescheduling require connectivity, since they are bulk server
   operations whose outcome cannot be guessed locally. A school sports day is close to the worst
   connectivity the app will meet, and the schedule is the only copy of what happens next.

**In scope from `TODO.md`:** "Add Venue Location (a group of Venues)" — D16 addresses the tournament
half. Open question 3 in [tournaments.md §13](file:///c:/Fred/Coding/SK/docs/tournaments.md) asks
whether that closes the item; **answer it here**, where the code is in front of you, and either check
it off or rewrite it to describe the non-tournament remainder.

**Exit criterion:** auto-schedule the Phase 6 festival across two days and eight facilities; confirm no
team is double-booked, no facility hosts two fixtures at once, no fixture starts after the day's last
start time, and a stage with an `earliest_start` respects it. Then drag one fixture into a conflict and
confirm it warns, does not block, and appears in the day panel.

---

## Phase 8 — `Knockout` and `PoolsKnockout` on the round list

**Goal:** brackets work, without a bracket being drawn. Per U37 the expensive part of a knockout is
the progression, not the drawing — and the round-by-round list is the narrow-screen rendering we need
in any case, so nothing built here is thrown away.

**Depends on:** Phase 7 (a bracket needs scheduling), and Phase 3's choke point, which is where
progression actually lives.

**Build:**

1. **Bracket generation** — single elimination sized to the next power of two, byes to the top seeds;
   optional third-place playoff fed by the losing semi-finalists.
2. **Pools → knockout** — split into P pools (seeded or random), round-robin within each, then a
   bracket seeded from pool finishers with crossover rules (A1 v B2), expressed as
   `{ type: 'standing', poolKey: 'A', position: 1 }`. Pool membership lives on `stage_entrants`, so
   "which pool is Northcliff in?" is a query.
3. **Progression in the UI** — the participants filled by Phase 3 appear as real teams; the
   placeholder rendering from Phase 2 covers the interval. Because the choke point already does the
   work, this phase is mostly presentation, which is the payoff for Phase 3's exit criterion.
4. **Plate / consolation (D28)** — losers of an early round route into a parallel bracket. Double
   elimination stays deferred; the loser-routing primitive built here is what makes it reachable later
   by firing every round instead of once.
5. **Manual override of a fill (D26, D29)** — a withdrawal promotes the beaten semi-finalist by
   writing the team and clearing the rule. Under the chosen model this is *the same edit* as filling a
   TBC slot, which was the deciding argument for one placeholder entity rather than two — so make sure
   it stays one code path.

**Exit criterion:** run an 8-team `PoolsKnockout` from empty to a winner, including one three-way pool
tie that a tiebreak factor has to separate, and one manual override promoting a losing semi-finalist.
Confirm the standings, the progression and the fixture list all agree afterwards.

---

## Phase 9 — The bracket graphic, and copy-a-tournament

**Goal:** the last two pieces, both additive to an already-working feature.

**Depends on:** Phase 8.

**Build:**

1. **The bracket on wide screens (U27, U37)** — computed from the rule chains, since geometry is
   derived rather than stored. The narrow-screen round list from Phase 8 stays as the mobile rendering,
   not as a fallback. This is the point at which the data model's "what would change my mind about
   Option A" question becomes answerable from experience rather than prediction: if deriving positions
   on every render proves uncomfortable, A → B is still available, and the rules already contain
   everything a slots table would hold.
2. **Copy an existing tournament (U18)** — the first question in the create wizard, with a
   choose-what-to-copy step and a collection step for what cannot be copied, chiefly the new dates.
   Last year's sports day is the best possible template for this year's.

   **The copy step offers, it never assumes** (U18 as amended 2026-09-01). Everything carryable is a
   choice with a sensible default, not a decision the wizard takes: structure and settings, divisions,
   stages, entrants, facilities, participating organisations, and **the organiser and convenor
   assignments from both tables in §0.1**. This is D8's "generate to save labour, never to remove
   control" applied to setup rather than to fixtures — and the people are the case where the temptation
   to assume is strongest and the assumption most annoying to undo by hand.

   Three consequences for the build:

   - **The choices have dependencies.** Entrants imply divisions; convenor assignments imply divisions.
     Selecting a dependent element selects its parent and says so, rather than failing validation.
   - **A copied grant is a new grant.** `granted_by_user_id` is whoever ran the copy, not the original
     grantor. Copying access is a deliberate act by someone who already holds it, and any admin can
     withdraw it afterwards as normal.
   - **Never offered:** results, scores, standings, `division_adjustments`, scheduled times. Copying
     those would be a falsehood rather than a convenience.
   - **A `Festival`'s fixtures are offered**, settled 2026-09-01 (see
     [tournaments-ui.md §17](file:///c:/Fred/Coding/SK/docs/tournaments-ui.md)): the option appears for
     `Festival` only — absent, not disabled, elsewhere — is **defaulted off**, and selecting it
     selects entrants and therefore divisions, since a fixture between entrants that were not copied
     is incoherent. A hand-arranged draw is real work no generator reproduces, which is why it is
     offered; it also encodes last year's absences and arrives with no scheduled time, which is why
     it is off by default.

**In scope from `TODO.md`:** "Add the ability to make a copy of an event" — closed for tournaments;
whether it closes for `SingleMatch` is a separate call, so rewrite rather than check off unless you
make it. "Prevent saving duplicate events (i.e. events that are exactly the same)" — the same code
path, and worth raising here: a copy wizard is a *duplicate factory*, so whatever rule prevents
accidental duplicates has to know the difference between a copy and a mistake. Decide before building
the wizard, not after.

**Exit criterion:** copy the Phase 6 festival into new dates twice — once accepting the defaults, once
with entrants and organisers deselected — and confirm each copy contains exactly what was ticked and
nothing more. Confirm no copy carries a result, a standing, an adjustment or a stale scheduled time,
and that deselecting divisions while entrants are ticked pulls divisions back in rather than erroring.

---

## Carried forward, deliberately

Named so they are not built by accident, per
[tournaments.md §11](file:///c:/Fred/Coding/SK/docs/tournaments.md) and
[tournaments-ui.md §15](file:///c:/Fred/Coding/SK/docs/tournaments-ui.md):

- **Ranked / meet-style screens** — the schema and the Phase 2 engine satisfy them (D27); no
  athletics UI. Confirmed 2026-09-01: wanted, not yet designed. `SPORT-10` stays open until fixture
  creation and the scoring screens honour `MatchTopology` too; until then the sport editor labels
  both settings with what actually reads them.
- **Double elimination and the bracket reset** (D28) — reachable via Phase 8's loser-routing primitive.
- **Swiss** — the generator interface is "produce the next stage", which Phase 3's stage `status`
  already honours, so the shape is in place; the format is not built.
- **A scheduling optimiser** (D14) — Phase 7's manual adjustment stands in for it, and the point of
  shipping greedy first is to learn which constraints actually matter.
- **Bonus points** — the `ScoringSystem` shape admits them; no UI.
- **A printable fixture list** (U38) — needed, and its own feature, because done properly it means
  editable templates rather than a print stylesheet.
- **The personal cross-org framing** (U3, UI §1) — this work builds the org framing only, and Phase 4's
  constraint (flags from the user and the event, never the route) is what keeps it cheap later.
- **Officials assignment**, the public spectator view, entry fees.
- **`DATA-3`** — the seed split and preserving hand-entered data.

---

## Per-phase doc obligations, in one place

Per [.agent/skills/okf-maintenance](file:///c:/Fred/Coding/SK/.agent/skills/okf-maintenance/SKILL.md),
these are part of the phase, not a follow-up:

| Phase | Must update |
|---|---|
| 0 | `TODO.md` (`DATA-1`); §0 answers into the data model |
| 1 | ✅ `docs/database_structure.md` (**incl. the `events` drift fix**), `okf/database.md`, `TODO.md` (`FIX-1`, `FIX-10`; `FIX-11` / `SEED-1` / `SOCK-1` / `DOC-1` logged) |
| 2 | ✅ `okf/architecture.md`, `okf/database.md`, `okf/design_system.md` (`api_comms.md` does not catalogue shared types — see the phase note); `TODO.md` (`SPORT-10` rewritten not closed; `SCORE-14` logged, then fixed) |
| 3 | ✅ `docs/api_actions.md`, `okf/api_comms.md` (the batch contract, the new rooms); **plus** `okf/database.md` and `docs/database_structure.md` for the one schema change (`games.stage_id`), and `TODO.md` (`TX-1` logged, `SPORT-10` narrowed) |
| 4 | **`okf/auth_control.md`** — required; the permission model changes |
| 5 | `okf/client_routing.md`, `docs/design_spec.md` (the collapse rule), `TODO.md` |
| 6 | `TODO.md` (`FIX-2`, batch subscriptions), `docs/reports.md` if standings appear there |
| 7 | `TODO.md` (Venue Location — answer open question 3) |
| 8–9 | `docs/tournaments-ui.md` status; `TODO.md` (copy an event, duplicate events) |
