# Tournaments — Phased Implementation Plan

**Status:** Proposed execution plan. Nothing built.
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

| # | Phase | Size | Ships something a user can see? |
|---|---|---|---|
| 0 | Pre-flight and guardrails | S | No |
| 1 | Schema and migration | M | No |
| 2 | Shared types, scoring engine, the fixture-side component | M | No (a component, not a screen) |
| 3 | Server: divisions, stages, entrants, and the recalculation choke point | L | No |
| 4 | Permissions: organiser assignments and capability flags | M | Yes — role chips on the events list |
| 5 | Client foundations: routes, screens, the collapse rule | L | Yes — a tournament you can navigate |
| 6 | `Festival` and `RoundRobin`: entrants, generation, standings | L | **Yes — the first genuinely usable tournament** |
| 7 | Scheduling: facilities, day windows, the greedy pass, the grid | L | Yes |
| 8 | `Knockout` and `PoolsKnockout` on the round list | L | Yes |
| 9 | The bracket graphic, and copy-a-tournament | M | Yes |

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

Every statement `IF NOT EXISTS` or otherwise re-runnable.

**In scope from `TODO.md`:** `FIX-1` (closed). "Consolidate Sportsday and Tournament view" — this
phase does its schema half; the UI half is Phase 5.

**Exit criterion — two runs, both required:**

- `db:migrate` against a **restored copy** of the dump completes, and the existing test event still
  loads in the app. This is the path a deployed environment takes and the only path never exercised by
  starting clean.
- `db:setup` on a scratch database produces a schema **identical** to the migrated one. Diff them
  (`pg_dump --schema-only` both, compare) rather than eyeballing — the two-source-of-truth rule in
  `migrations/README.md` is only as good as the check that enforces it, and a missed `init-db.ts`
  mirror is invisible until a new environment is built months later.

**Docs:** [database_structure.md](file:///c:/Fred/Coding/SK/docs/database_structure.md) — add the new
tables, **and fix the drift the spec §12 already found** (it lists `participating_org_ids` and
`sport_ids` as columns on `events`; they are the `event_sports` and `event_organizations` join
tables). [okf/database.md](file:///c:/Fred/Coding/SK/okf/database.md).

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
  athletics UI. `SPORT-10` stays open until fixture creation and the scoring screens honour
  `MatchTopology` too.
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
| 1 | `docs/database_structure.md` (**incl. the `events` drift fix**), `okf/database.md`, `TODO.md` (`FIX-1`) |
| 2 | `okf/api_comms.md` if shared types are catalogued there; `TODO.md` (`SPORT-10`, rewritten not closed) |
| 3 | `docs/api_actions.md`, `okf/api_comms.md` (the batch contract, the new rooms) |
| 4 | **`okf/auth_control.md`** — required; the permission model changes |
| 5 | `okf/client_routing.md`, `docs/design_spec.md` (the collapse rule), `TODO.md` |
| 6 | `TODO.md` (`FIX-2`, batch subscriptions), `docs/reports.md` if standings appear there |
| 7 | `TODO.md` (Venue Location — answer open question 3) |
| 8–9 | `docs/tournaments-ui.md` status; `TODO.md` (copy an event, duplicate events) |
