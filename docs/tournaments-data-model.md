# Tournaments — Data Model

**Status:** Settled. Nothing is built. Updated 2026-09-01 from the implementation-plan review —
§3.7 (organiser storage, which D33 needed and this document lacked), §4.2 (`format` becomes a
column; `events.type` becomes `NOT NULL`), §9 (migration step order), §10 (both open items answered).
**Implements:** the decisions in [docs/tournaments.md](file:///c:/Fred/Coding/SK/docs/tournaments.md).
Decision ids below (D1…D33) refer to that document's table.
**Build order:** [docs/tournaments-implementation-plan.md](file:///c:/Fred/Coding/SK/docs/tournaments-implementation-plan.md).

Conventions follow the existing schema
([init-db.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/init-db.ts)): `TEXT` primary keys
with a typed prefix and a uuid, `ON DELETE CASCADE` from owner to owned, `JSONB` for
format-shaped configuration, snake_case columns aliased to camelCase in the manager layer, and
indexes on every foreign key used as a filter.

---

## 1. The shape

```
events                       (existing — gains a format, a scoring system, day windows)
│
├── event_facilities         which fields/courts the whole event may use          [new]
│
├── event_organizers         people who may edit the whole tournament (D33)       [new]
│
└── tournament_divisions      "u14 Rugby", "Open Netball"                        [new]
    │   weighting, scoring subject, tiebreak order
    │
    ├── division_facilities    optional narrowing of the event's facilities       [new]
    │
    ├── division_organizers    the convenor: this division only (D22, D31)        [new]
    │
    ├── division_entrants      the roster: who is entered in this division        [new]
    │      a team, an individual, or an unresolved "TBC"
    │
    ├── division_adjustments   manual points corrections, recorded as such        [new]
    │
    └── division_stages        ordered phases: "Pools", "Knockout", "Final"       [new]
        │   format, sequence, earliest start, cached standings
        │
        ├── stage_entrants     who plays this stage, and in which pool            [new]
        │
        └── games              (existing — unchanged except for its participants)
            │
            └── game_participants   (existing — gains an entrant link and a fill rule)
```

Four new tables carry the concepts (`divisions`, `stages`, `entrants`, `stage_entrants`), five
more are joins or ledgers, and the fixture tables we already have are extended rather than
replaced. `games` itself needs no change at all.

---

## 2. The central choice: how an unknown competitor is represented

This is the decision everything else hangs off, so the alternatives are worth setting out.

A knockout semi-final exists in the schedule before anyone knows who plays in it. Something has to
represent "the winner of QF1" — printable, schedulable, and replaceable by a real team later
(D7, D26).

### 2.0 The three states of a fixture side

Whichever option below is chosen, a side of a fixture is in one of three states. What prints on
the fixture list differs in each, and the difference is worth being precise about.

| State | Who is playing | What prints | Where the text comes from |
|---|---|---|---|
| **Known** | A real team or individual | "Northcliff u14A" | The team's own name |
| **Awaiting a person** | Nobody yet; a human will decide | "TBC — awaiting confirmation" | `division_entrants.label` |
| **Awaiting a result** | Nobody yet; a fixture will decide | "Winner QF1" | Derived from the fill rule; not stored |

The middle row is what `label` is for, and it belongs to a **registered entrant that has no team
attached yet**. The organiser has said "a fourth school is coming, I just do not know which" — so
the division roster holds an entrant row with `team_id` null and `label` set, and fixtures can be
generated and scheduled against it like any other entrant. When the school confirms, `team_id` is
filled in and every fixture referring to that entrant updates at once, because they all point at
the same row.

The third row needs no label stored, because the rule already says what to print: a participant
whose rule is `{winnerOf: QF1}` renders as "Winner QF1" from the rule itself. Storing a label there
too would be a second copy to keep in step.

*(An earlier draft of this table wrongly showed the "awaiting a person" state with `entrant_id`
null, which contradicted the label living on the entrant. It is `entrant_id` **set**, pointing at
an entrant with no team.)*

### 2.1 The two options, concretely

Take an 8-team knockout: four quarter-finals, two semis, a final. Seven fixtures, of which four
have known competitors and three do not.

**Option A — the fill rule lives on `game_participants` (proposed).**

`game_participants` is already the row that says "this side of this fixture". It gains
`entrant_id` (which competitor, once known) and `source_rule` (how it will be filled). The
knockout is then 8 entrant rows, 7 games and 14 participant rows, and nothing else:

```
game_participants
  QF1  ├─ team_id=northcliff  entrant_id=ent-1  source_rule=null
       └─ team_id=parktown    entrant_id=ent-2  source_rule=null
  …
  SF1  ├─ team_id=null  entrant_id=null  source_rule={winnerOf: QF1}
       └─ team_id=null  entrant_id=null  source_rule={winnerOf: QF2}
  F    ├─ team_id=null  entrant_id=null  source_rule={winnerOf: SF1}
       └─ team_id=null  entrant_id=null  source_rule={winnerOf: SF2}
```

When QF1 finishes, the recalculation path finds the participant whose rule names QF1, writes
`team_id` and `entrant_id`, and clears the rule. That row is now indistinguishable from one that
was known all along.

**Option B — a `tournament_slots` table.**

A slot is a *position in the bracket*, existing independently of the fixture that fills it. The
same knockout becomes 8 entrants, 14 slots, 7 games, and participant rows that point at slots:

```
tournament_slots
  slot-1  stage=QF  position=1  entrant_id=ent-1  source=null
  …
  slot-9  stage=SF  position=1  entrant_id=null   source_game_id=QF1  source_type=winner
  …
games → game_participants → slot_id → entrant_id → team_id
```

Resolution writes `entrant_id` onto the slot. Every consumer asking "who is playing?" walks
participant → slot → entrant → team.

### 2.2 How they compare

| | **A — rules on participants** | **B — slots table** |
|---|---|---|
| **Existing readers** (scoring screens, `calculateStandings`, fixture list, `GameSummary` broadcast) | Unchanged. They read `team_id`, which a resolved slot writes. | Every one learns a two-hop lookup, or we denormalise the team back onto the participant and maintain both copies. |
| **Single matches and existing data** | Both columns null; nothing behaves differently. | Either slots become mandatory for all fixtures, or fixtures have two shapes. |
| **Resolving a slot** | One `UPDATE` on a row that already exists. | One `UPDATE`, plus the denormalisation if we chose it. |
| **Manual override** (withdrawal promotes the beaten semi-finalist) | Same edit as any other fill: write the team, clear the rule. | Same edit, on the slot. Both fine. |
| **Rendering a bracket** | Read the stage's games and reconstruct the tree from the rules. Derivable, but it *is* work. | The bracket is already an object with positions. Straightforward. |
| **Referential integrity** | A `gameId` inside JSONB cannot have a foreign key — deleting a game could orphan a rule. **Mitigated below.** | Real FK with `ON DELETE`, enforced by the database. |
| **Regenerating a stage** (D9) | Rewrite participant rows. | Repoint slots; fixtures can survive. |
| **Table count for the common case** | None. A festival fixture between two known teams needs nothing new. | Two slot rows per fixture, for every fixture, forever. |

### 2.3 Why A, and what would change my mind

Two arguments decide it.

**The first is reversibility.** Option A can become Option B later without a rewrite: a slots table
can be introduced and *populated from the existing `source_rule` values*, because the rules already
contain everything a slot would hold. Going the other way is much harder — once every consumer
reads through slots, unwinding that indirection touches all of them. Starting with A is the
decision that stays open; starting with B is the one that commits.

**The second is blast radius.** Option B's cost is not in the tournament code, which we are writing
anyway — it is in the code we are *not* touching. The scoring screens, the standings engine, the
fixture list and the live `GameSummary` broadcast all read `game_participants.team_id` today. Under
A they never learn tournaments exist. Under B they either change, or we keep a denormalised copy
and accept two sources of truth for "who is playing" during the window between the two writes.

What B genuinely buys is bracket *geometry* and database-enforced integrity. Geometry we do not
need until we build a bracket view, and it is derivable. Integrity is a fair hit, so:

> **Refinement prompted by review.** Rather than leaving the game reference buried in JSON, promote
> it to real columns: `source_game_id TEXT REFERENCES games(id) ON DELETE SET NULL` and
> `source_stage_id TEXT REFERENCES division_stages(id) ON DELETE SET NULL`, with `source_rule`
> keeping only the parts a foreign key cannot express (the rule type, pool key, position). That
> recovers most of B's integrity advantage at the cost of two columns, and means a deleted fixture
> cannot leave a rule pointing at nothing.

**What would change my mind:** if we decide to build a proper visual bracket editor — drag a team
onto a position, reshape the draw by hand — then geometry becomes a first-class thing the user
manipulates, and deriving it from rules on every render gets uncomfortable. That is a v2 question,
and by then A→B is still available.

### 2.4 Also rejected: entrants scoped to the stage rather than the division

Tempting, because a stage's entrant list is exactly what generation consumes, and it would remove
`stage_entrants` entirely. Rejected because the scheduler's hardest constraint — an entrant cannot
play two fixtures at once — has to hold *across* stages. If a team's pool identity and its knockout
identity are separate rows, every such check has to resolve through progression rules first.
Keeping one entrant row per competitor per division means the constraint is a straight comparison,
and "who is entered in u14 Rugby?" stays a single query.

---

## 3. New tables

### 3.0 A note on the names

Raised in review: why name a table for the tournament when its parent is the *division*?

> **Decided — name tables after their parent.** Everything owned by a division carries the
> `division_` prefix: `division_stages`, `division_entrants`, `division_adjustments`,
> `division_facilities`. Everything owned by a stage carries `stage_`: `stage_entrants`. This
> matches the dominant convention in the existing schema — `event_sports`, `season_teams`,
> `game_seasons`, `game_participants` — and it means a table name tells you what deletes it.

**`tournament_divisions` is the one exception**, and deliberately. Its parent is `events`, but
`event_divisions` would sit alongside `event_sports` and `event_organizations` and read as another
join table, which it is not — a division is a substantial entity with children of its own. It also
only exists for events that are tournaments, so `tournament_divisions` describes it more honestly
than its parent table does. Say so rather than leaving it looking like an oversight.

For reference, the two conventions the existing schema mixes:

- **Entities with their own identity** get a plain plural: `leagues`, `seasons`, `events`, `games`,
  `teams`. A season belongs to a league but is not called `league_seasons`.
- **Links and owned rows** get `<parent>_<children>`: `event_sports`, `season_teams`,
  `game_seasons`, `game_participants`.

### 3.1 `tournament_divisions`

```sql
CREATE TABLE IF NOT EXISTS tournament_divisions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sport_id TEXT REFERENCES sports(id),
    age_group TEXT,
    scoring_subject TEXT,           -- 'Team' | 'Organisation'; NULL inherits the event
    weighting NUMERIC(6,3) NOT NULL DEFAULT 1.0,
    settings JSONB DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_divisions_event ON tournament_divisions(event_id);
```

Ids are `div-<uuid>`.

`name` is required and free text, because divisions are user-editable and need not be
`sport + age group` (D3). `sport_id` and `age_group` remain as the fields generation and team
filtering key off, and are what the app uses to *propose* divisions — but a division named
"Division B" with the same sport and age group as "Division A" is legitimate and expected.

`weighting` implements D18. `NUMERIC` rather than a float so 1.5 means 1.5.

`settings` holds the division's scoring system and tiebreak order when it overrides the event's —
see [§6](#6-scoring-configuration).

### 3.2 `division_stages`

```sql
CREATE TABLE IF NOT EXISTS division_stages (
    id TEXT PRIMARY KEY,
    division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    format TEXT NOT NULL,           -- 'Festival' | 'RoundRobin' | 'Knockout' | 'Plate' | 'Swiss'
    sequence INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
                                    -- 'Pending' | 'Ready' | 'InProgress' | 'Complete'
    earliest_start TIMESTAMPTZ,     -- D15: the knockout may not start before day 2
    settings JSONB DEFAULT '{}'::jsonb,
    cached_standings JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (division_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_division_stages_division ON division_stages(division_id);
```

Ids are `stg-<uuid>`.

Every division has at least one stage (D11). A `Festival` or plain round robin has exactly one,
and the UI stays silent about staging when that is so.

`status` is what makes Swiss work: a stage is `Pending` until its entrants are known, `Ready` when
they are and fixtures can be generated, `InProgress` once fixtures exist, `Complete` when every
fixture has a result. Generation acts on `Ready` stages, which is the "produce the next stage"
interface the Swiss discussion in the spec called for.

`settings` is the format-shaped blob D5 settled on. Its known shapes:

```jsonc
// RoundRobin
{ "legs": 1 }

// Pools (a RoundRobin stage split into groups)
{ "legs": 1, "pools": [ { "key": "A", "name": "Pool A" }, { "key": "B", "name": "Pool B" } ] }

// Knockout / Plate
{ "bracketSize": 8, "thirdPlacePlayoff": true, "feedsPlate": "stg-…" }

// Swiss
{ "rounds": 5, "roundsGenerated": 2 }

// Where this stage's entrants come from, when they are not registered directly
{ "entrantSource": [
    { "fromStage": "stg-…", "poolKey": "A", "positions": [1, 2] },
    { "fromStage": "stg-…", "poolKey": "B", "positions": [1, 2] }
] }
```

### 3.3 `division_entrants`

```sql
CREATE TABLE IF NOT EXISTS division_entrants (
    id TEXT PRIMARY KEY,
    division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
    org_id TEXT REFERENCES organizations(id),
    label TEXT,                     -- shown while unresolved: 'TBC — awaiting confirmation'
    seed INTEGER,
    status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'withdrawn'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT entrant_is_team_or_person CHECK (team_id IS NULL OR org_profile_id IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_division_entrants_division ON division_entrants(division_id);
CREATE INDEX IF NOT EXISTS idx_division_entrants_org ON division_entrants(org_id);
```

Ids are `ent-<uuid>`.

The three kinds of entrant from the spec, in one table:

- **Team** — `team_id` set. The default.
- **Individual** — `org_profile_id` set. An athlete or a singles player. This mirrors
  `game_participants`, which already carries both columns, so nothing new is being invented.
- **Unresolved** — both null, `label` carries what to print. Filled in by a person later.

`org_id` is denormalised from the team or the profile's membership at write time. It exists
because the organisation roll-up (D6) and the weighting sum (D18) both group by it, and without it
every roll-up joins through teams and memberships. It is derived data and must be rewritten
whenever `team_id` changes.

The `CHECK` prevents an entrant being both a team and a person. It does not require one of them —
that is the unresolved case.

### 3.4 `stage_entrants`

```sql
CREATE TABLE IF NOT EXISTS stage_entrants (
    stage_id TEXT REFERENCES division_stages(id) ON DELETE CASCADE,
    entrant_id TEXT REFERENCES division_entrants(id) ON DELETE CASCADE,
    pool_key TEXT,                  -- 'A', 'B'; NULL when the stage has no pools
    seed INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (stage_id, entrant_id)
);
CREATE INDEX IF NOT EXISTS idx_stage_entrants_stage ON stage_entrants(stage_id);
```

Who takes part in each stage, and where they sit in it. For a single-stage division this is a copy
of the roster and the UI never mentions it. For pools it is where pool membership lives — on the
membership row rather than in the stage's JSON, so "which pool is Northcliff in?" is a query
rather than a scan.

A stage's rows are written when the stage becomes `Ready`: directly by the organiser for the first
stage, or by resolving `settings.entrantSource` against the previous stage's standings.

### 3.5 `event_facilities` and `division_facilities`

```sql
CREATE TABLE IF NOT EXISTS event_facilities (
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, facility_id)
);

CREATE TABLE IF NOT EXISTS division_facilities (
    division_id TEXT REFERENCES tournament_divisions(id) ON DELETE CASCADE,
    facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
    PRIMARY KEY (division_id, facility_id)
);
CREATE INDEX IF NOT EXISTS idx_division_facilities_division ON division_facilities(division_id);
```

The cascade from §7 of the spec. The event names the facilities in play; a division may narrow
that to its own subset; a division with no rows may use any of the event's facilities that support
its sport. Pool-level allocation, being rarer, rides in the stage's `settings` rather than earning
a third table.

`events.facility_id` stays as it is for `SingleMatch`, where one facility is the whole story.

### 3.6 `division_adjustments`

```sql
CREATE TABLE IF NOT EXISTS division_adjustments (
    id TEXT PRIMARY KEY,
    division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
    entrant_id TEXT NOT NULL REFERENCES division_entrants(id) ON DELETE CASCADE,
    points_delta NUMERIC(6,2) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    created_by_user_id TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_division_adjustments_division ON division_adjustments(division_id);
```

Ids are `adj-<uuid>`.

This is the standings half of D29 — "any result the app computes, a person can override, and the
override is recorded *as* an override". A points deduction for an ineligible player, or points
awarded for a walkover, becomes a row here with a reason and an author, rather than a quiet edit to
a game that never happened. `calculateStandings` adds these after computing from fixtures.

The other halves of D29 need no new storage: a game score override already exists
([`updateFinalScore`](file:///c:/Fred/Coding/SK/expo-app/components/sports/shared/DynamicScoringContext.tsx#L759)),
and a manual slot fill is just writing `team_id` and clearing `source_rule`.

### 3.7 `event_organizers` and `division_organizers`

Added 2026-09-01. **D33 postdates the first draft of this document**, so the storage for it was
specified in the UI review and never carried back here — the gap was found while writing
[the implementation plan](file:///c:/Fred/Coding/SK/docs/tournaments-implementation-plan.md) §0.1,
where the full reasoning lives.

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

The four things about this shape that were decided rather than assumed:

> **Decided — two tables, not one with a nullable `division_id`.** A composite primary key is then
> the uniqueness rule, which matters because Postgres treats NULLs as *distinct* in a unique index:
> `UNIQUE (event_id, division_id, org_profile_id)` would have let the same person be appointed event
> organiser any number of times. Splitting also means each foreign key points at exactly one parent,
> so a grant cannot pair event A with a division of event B — which one table could only guarantee
> with a composite foreign key and a redundant `UNIQUE (event_id, id)` on `tournament_divisions`.

> **Decided — grants reference `org_profiles`, never `users`.** `AccessManager` already resolves a
> user *into a set of profile ids*, by `user_id` or verified email
> ([AccessManager.ts:65](file:///c:/Fred/Coding/SK/server/src/managers/AccessManager.ts#L65)), so
> profile is the identity the permission layer works in. Three consequences: a person with no account
> can be appointed (`org_profiles.user_id` is nullable and `last_invite_sent_at` exists for exactly
> this); the grant needs no rewrite when they later claim it, because matching is by email; and
> organiser, convenor and *player* stay in one identity space, since playing is already
> `org_profiles` everywhere.

> **Decided — `granted_by` is a profile too.** The field is written for audit and display, and a
> person should be shown as who they are known as in the organisation. **The general rule: refer to
> people by profile, and reach for `users` only to identify the account behind one.** The profile
> recorded is the one through which the actor's own permission derived — their `event_organizers` row,
> or their profile in the org whose admin rights they used. Nullable, since an app admin acting
> globally may hold no profile in any org involved.

> **Decided — an appointment says nothing about participation.** A convenor may come from a visiting
> org, or from **no participating org at all** — an external specialist official belongs to none of
> the schools present. Appointing them must **never** write a row into `event_organizations`:
> *participation is determined by the teams taking part, and by nothing else.* The precedent is
> [`GameOfficial`](file:///c:/Fred/Coding/SK/shared/src/models/event/GameOfficial.ts), which is
> `{ gameId, orgProfileId, role }` — a person attached to a fixture with no organisation on the record.
> An external with no profile anywhere gets one in the hosting org **with no `org_membership`**:
> `getMembershipSnapshot` derives orgs by joining `org_memberships`, so such a profile confers
> nothing, and the grant adds exactly the tournament rights and no more.

---

## 4. Changes to existing tables

### 4.1 `game_participants` — two nullable columns

```sql
ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS entrant_id TEXT
    REFERENCES division_entrants(id) ON DELETE SET NULL;
ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS source_game_id TEXT
    REFERENCES games(id) ON DELETE SET NULL;
ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS source_stage_id TEXT
    REFERENCES division_stages(id) ON DELETE SET NULL;
ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS source_rule JSONB;
CREATE INDEX IF NOT EXISTS idx_game_participants_entrant ON game_participants(entrant_id);
CREATE INDEX IF NOT EXISTS idx_game_participants_source_game ON game_participants(source_game_id);
```

All null for every existing row and for every single match, so nothing that reads this table today
changes behaviour. `team_id` remains the field the scoring screens and `calculateStandings` read —
a resolved slot writes it, so those consumers never learn that progression exists.

`source_game_id` and `source_stage_id` are real foreign keys rather than ids buried in JSON, per
the refinement in [§2.3](#23-why-a-and-what-would-change-my-mind): the database then guarantees a
rule cannot point at a fixture that no longer exists. `source_rule` carries only what a key cannot
express:

```jsonc
// with source_game_id = 'game-…'
{ "type": "winnerOf" }
{ "type": "loserOf" }                              // plate; and double elimination if D28 returns

// with source_stage_id = 'stg-…'
{ "type": "standing", "poolKey": "A", "position": 1 }
```

**Rules compose more than a bracket needs**, which is worth stating because it is the main thing
the approach buys. `standing` names a stage, an optional pool and a position, so it expresses far
more than "winner of game 4":

```jsonc
{ "type": "standing", "poolKey": "C", "position": 3 }   // third place in Pool C
{ "type": "standing", "position": 2 }                   // runner-up of the whole stage
{ "type": "standing", "poolKey": "B", "position": 1 }   // Pool B winner, for an A1 v B2 crossover
```

That is what makes pools-into-knockout seeding, plate brackets and multi-stage draws the same
mechanism rather than three. The position is resolved against the stage's `cached_standings` after
tiebreakers have run, which is why D20's ordered tiebreak list has to produce a *definite* rank
rather than a display ordering.

### 4.2 `events` — a format, a scoring system, day windows

```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS cached_standings JSONB DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS format TEXT;

-- U39 / FIX-1: an event without a type should not exist, so stop defaulting and start refusing.
-- Both constraints come after the SportsDay rewrite in §9, or they would reject the rows it fixes.
ALTER TABLE events ALTER COLUMN type SET NOT NULL;
ALTER TABLE events ADD CONSTRAINT events_type_check CHECK (type IN ('SingleMatch', 'Tournament'));
```

> **Decided 2026-09-01 — `format` is a column, not a settings key.** An earlier draft put it in
> `settings` JSONB alongside the rest of the configuration. That sat badly beside U39, which in the
> *same migration* makes `type` `NOT NULL` with a `CHECK` on the grounds that an unknown value should
> raise rather than default — while `format`, which after D1 carries more meaning than `type` does
> (it is what the event screen keys its tabs and setup steps off), would have been an unconstrained
> string inside a blob. A column also makes "list the festivals at this venue" a query.

Everything else the event needs goes in its existing `settings` JSONB, which is already there and
already carries loose configuration:

```jsonc
{
  "scoringSubject": "Organisation",  // divisions inherit unless they override
  "scoring": { "pointsPerWin": 3, "pointsPerDraw": 1, "pointsPerLoss": 0, "bonusRules": {} },
  "tiebreakers": ["pointsDifference", "pointsFor", "headToHead", "mostWins", "fewestCards"],
  "schedule": {
    "days": [ { "date": "2026-09-12", "startTime": "08:00", "lastStartTime": "15:30" } ],
    "turnaroundMinutes": 5,
    "durationBySport": { "rugby": 25, "netball": 15 }
  }
}
```

`cached_standings` is a real column rather than another settings key because it is written by the
recalculation path on every result and read on every view — it is data, not configuration, and it
follows the `seasons.cached_standings` precedent exactly.

**`Event.settings.pointSystem` and `levelWeighting` are removed.** They are superseded by
`scoring` above and by `tournament_divisions.weighting` (D18), and nothing reads them today.

### 4.3 `seasons` — one default, one shape

```sql
ALTER TABLE seasons ALTER COLUMN settings
    SET DEFAULT '{"pointsPerWin": 3, "pointsPerDraw": 1, "pointsPerLoss": 0}'::jsonb;
```

D17. This changes the default for *new* seasons only; existing rows have their values stored
explicitly and are untouched, so no league's table moves. The `settings` shape is now the same
`ScoringSystem` a tournament uses (D19), which is the point — the same configuration means the
same thing in both places.

### 4.4 What deliberately does not change

- **`games`** — no new columns. A fixture already knows its event, sport, facility and scheduled
  time. Its stage is reached through its participants' entrants, and if that indirection proves
  awkward in queries a `stage_id` column is a cheap denormalisation to add later.
- **`game_seasons`** — already the many-to-many D21 needs. A tournament fixture counting toward a
  league season is an existing row in an existing table; only the UI to create it from the
  tournament side is missing.
- **`teams`, `organizations`, `facilities`, `sports`** — untouched.

---

## 5. Shared types

New file `shared/src/models/event/Tournament.ts`:

```ts
export type TournamentFormat =
  | 'Festival'
  | 'RoundRobin'
  | 'Knockout'
  | 'Plate'
  | 'Swiss';

export type ScoringSubject = 'Team' | 'Organisation';

export type TiebreakFactor =
  | 'pointsDifference'
  | 'pointsFor'
  | 'headToHead'
  | 'mostWins'
  | 'fewestCards';

/**
 * Shared by tournaments and league seasons (D19).
 *
 * Two modes, because awarding points by finishing position is a scoring system in its own right
 * and not a special case: a head-to-head division scores `byResult`, a ranked meet scores
 * `byPlacing`. Both feed the same standings engine, so an athletics division and a rugby division
 * can sit in one sports day and roll up into one organisation table.
 */
export type ScoringSystem =
  | {
      mode: 'byResult';
      pointsPerWin: number;
      pointsPerDraw: number;
      pointsPerLoss: number;
      bonusRules?: Record<string, any>;
    }
  | {
      mode: 'byPlacing';
      /** Position (1-based) to points. Positions beyond the last entry score `pointsBeyond`. */
      pointsByPosition: number[];
      pointsBeyond?: number;
    };

export interface TournamentDivision {
  id: string;
  eventId: string;
  name: string;
  sportId?: string;
  ageGroup?: string;
  scoringSubject?: ScoringSubject;   // inherits the event when unset
  weighting: number;                 // D18, default 1.0
  settings?: {
    scoring?: ScoringSystem;         // overrides the event's
    tiebreakers?: TiebreakFactor[];
  };
  sortOrder: number;
  stages?: TournamentStage[];
  entrants?: TournamentEntrant[];
}

export interface StagePool { key: string; name: string; }

export interface EntrantSourceRule {
  fromStage: string;
  poolKey?: string;
  positions: number[];
}

export interface TournamentStage {
  id: string;
  divisionId: string;
  name: string;
  format: TournamentFormat;
  sequence: number;
  status: 'Pending' | 'Ready' | 'InProgress' | 'Complete';
  earliestStart?: string;            // ISO
  settings?: {
    legs?: number;
    pools?: StagePool[];
    bracketSize?: number;
    thirdPlacePlayoff?: boolean;
    feedsPlate?: string;             // stage id losers drop into
    rounds?: number;                 // Swiss
    roundsGenerated?: number;        // Swiss
    entrantSource?: EntrantSourceRule[];
  };
  cachedStandings?: TournamentStandingRow[];
}

export interface TournamentEntrant {
  id: string;
  divisionId: string;
  teamId?: string;
  orgProfileId?: string;
  orgId?: string;
  label?: string;                    // printed while unresolved
  seed?: number;
  status: 'active' | 'withdrawn';
}

/** How an unfilled fixture slot knows what will fill it (D26). */
export type ParticipantSourceRule =
  | { type: 'winnerOf' }                                    // with sourceGameId
  | { type: 'loserOf' }                                     // with sourceGameId
  | { type: 'standing'; poolKey?: string; position: number }; // with sourceStageId

export interface TournamentAdjustment {
  id: string;
  divisionId: string;
  entrantId: string;
  pointsDelta: number;
  reason: string;
  createdByUserId?: string;
  createdAt: string;
}
```

`TournamentStandingRow` extends the existing `LeagueStandingRow` rather than replacing it, so one
table shape serves leagues, seasons and tournaments (D19):

```ts
export interface TournamentStandingRow extends LeagueStandingRow {
  entrantId: string;
  orgId?: string;
  poolKey?: string;
  adjustment?: number;    // sum of division_adjustments, already folded into `points`
  rank?: number;          // after tiebreakers — the definite answer progression needs
}
```

And `GameParticipant` gains the two fields matching §4.1:

```ts
export interface GameParticipant {
  // …existing fields…
  entrantId?: string;
  sourceGameId?: string;
  sourceStageId?: string;
  sourceRule?: ParticipantSourceRule;
}
```

---

## 6. Scoring configuration

Resolution order, most specific wins: **division `settings.scoring`** → **event
`settings.scoring`** → **3/1/0** (D17). The same order applies to `tiebreakers` and
`scoringSubject`.

Only two levels can override, deliberately. A per-stage scoring system is expressible in the JSON
but is not read: a division whose pool stage and knockout scored differently would produce a table
nobody could interpret.

---

## 7. Standings: where the numbers live and when they move

D30 settled that standings are persisted and recalculated when a result is finalised. The model
puts them in two places:

- **`division_stages.cached_standings`** — the table people look at, and the one progression
  reads. Pool tables are distinguished by `poolKey` on the rows rather than by separate storage.
- **`events.cached_standings`** — the organisation roll-up (D6): each division's competition points
  multiplied by its `weighting` and summed by `org_id`.

The division level deliberately caches nothing. For a single-stage division it would duplicate the
stage exactly; for a pools-and-knockout division a combined table is not a meaningful object.

### The choke point

The spec's warning was that a cache is only as good as the paths that invalidate it, and there are
more of those than is obvious. So recalculation hangs off **one function**, called by the write
that changes a result and by nothing else:

```
recalculateForGame(gameId)
  → the stage that owns the game        → rewrite division_stages.cached_standings
  → the event that owns the stage       → rewrite events.cached_standings
  → every season in game_seasons        → existing recalculateSeasonStandings  (D21)
  → any stage whose entrants source from this one, if it just became Complete
      → resolve its stage_entrants and fill its participants' source_rules  (D23)
```

The callers that must route through it: a game finishing, the final-score override on an
already-finished game, dispute resolution, game deletion, a game being attached to or detached
from a season, an entrant substitution (D10), and a new `division_adjustments` row.

That last arrow is the important one — it is where progression actually happens. A pool stage
completing is what fills the knockout's slots, and it is the same code path as recalculating the
table, because the table is what it reads.

---

## 8. Socket actions

Following D13 — batch where N>1 is genuinely the case, single elsewhere, one shared batch
contract (one transaction, per-item error report, one broadcast, idempotency key).

| Action | Payload | Batch? |
|---|---|---|
| `ADD_DIVISION` / `UPDATE_DIVISION` / `DELETE_DIVISION` | a division | no |
| `ADD_STAGE` / `UPDATE_STAGE` / `DELETE_STAGE` | a stage | no |
| `SET_DIVISION_ENTRANTS` | `{ divisionId, entrants: [...] }` | **yes** — a whole roster arrives at once |
| `GENERATE_STAGE_FIXTURES` | `{ stageId, mode: 'create' \| 'regenerate' }` | server-side fan-out |
| `SCHEDULE_STAGE` | `{ stageId, ...constraints }` | server-side fan-out |
| `ADD_GAMES` | `{ games: [...] }` | **yes** — the 90-fixture case |
| `UPDATE_GAMES` | `{ games: [...] }` | **yes** — rescheduling a day moves many at once |
| `RESOLVE_PARTICIPANT` | `{ gameParticipantId, teamId? , entrantId? }` | no — the manual override |
| `ADD_ADJUSTMENT` / `DELETE_ADJUSTMENT` | an adjustment | no |

`GENERATE_STAGE_FIXTURES` and `SCHEDULE_STAGE` are single actions that write many rows inside one
transaction, rather than the client sending ninety `ADD_GAME` calls. `ADD_GAMES` still exists for
the organiser hand-adding fixtures to a `Festival`.

---

## 9. Migration

### How the two paths already work

The repo already has the split this needs, documented in
[migrations/README.md](file:///c:/Fred/Coding/SK/server/src/scripts/migrations/README.md):

- **`init-db.ts` is the source of truth for a fresh database.** Its stated rule is that any
  migration altering structure **must also** be added to `init-db.ts`, so a new environment gets
  the current schema without running a single migration file.
- **Migrations only bring an existing database forward.** `run-all-migrations.ts` tracks applied
  files in `schema_migrations` and runs only what is pending.

So the concern about a future production database is already answered by policy: a clean prod
install runs `db:init` + `db:seed` and needs no migration files at all. What we owe it is
discipline — the new DDL goes into `init-db.ts` *as well as* the migration, not instead of it.

> **Gap worth closing.** `init-db.ts` does not populate `schema_migrations`, so a freshly created
> database believes *no* migrations have run. If anyone then runs `db:migrate` against it, every
> historical migration executes against an already-current schema. Today that is harmless —
> the existing migrations are all written defensively, with `IF NOT EXISTS` and guarded `WHERE`
> clauses (`20260810_migrate_sport_ids` only touches rows `LIKE 'sport-%'`, for instance) — but
> that safety is a property of how each was written, not something the tooling enforces. Having
> `init-db.ts` stamp every migration filename into `schema_migrations` on completion would make a
> fresh database correctly "already migrated", and would let the migration files be kept
> indefinitely without risk. Small change, outside this feature's scope; flagged rather than done.

### The steps

**Order matters from step 2 onward** — the constraints in step 6 would reject the very rows steps 2
and 3 exist to fix.

1. **Create** the new tables and columns — `IF NOT EXISTS` throughout, so re-runnable — in the
   migration **and** in `init-db.ts`. This is all nine new tables, including `event_organizers` and
   `division_organizers` (§3.7), plus `events.format` and `events.cached_standings`.
2. **Rewrite the event type** (D1) — `UPDATE events SET type = 'Tournament', format = 'Festival'
   WHERE type = 'SportsDay'`. In place, no alias retained. Note `format` is now a column (§4.2), not
   a `settings` key.
3. **Backfill `format`** for container events that were already `Tournament`, and **backfill `type`**
   for the one untyped test row (`FIX-1`). Confirm the counts first with
   `SELECT type, format, COUNT(*) FROM events GROUP BY type, format;`.
4. **Backfill `event_facilities`** from each event's existing single `facility_id`.
5. **Drop** `pointSystem` and `levelWeighting` from `events.settings`, and `format` if any row
   acquired one there before this decision.
6. **Constrain `events.type`** — `SET NOT NULL` and the `CHECK` (U39, §4.2). Last, because it is only
   safe once steps 2 and 3 have left every row with a valid value.
7. **Change the `seasons.settings` default** to 3/1/0 (D17). New rows only; existing seasons store
   their values explicitly and do not move.

### The step that is probably unnecessary

An earlier draft had a sixth step: *derive a division per sport for every existing container event,
register its teams as entrants, and attach them to a generated `Festival` stage* — so that events
predating this feature would open with a populated schedule rather than an empty one.

Review reports the database holds **one real event, a single match, used for testing**. If that is
accurate the step is a no-op: `SingleMatch` events get no divisions, and there are no `SportsDay` or
`Tournament` rows to convert. Writing a backfill that will never process a row is not worth the
effort or the risk of getting it subtly wrong.

**Recommendation:** drop the backfill and keep steps 1–5, which are all schema-level and fast.
Before running anything, confirm with
`SELECT type, COUNT(*) FROM events GROUP BY type;` — if that returns any `SportsDay` or
`Tournament` rows, the backfill goes back in.

### On testing the migration versus resetting

Both, cheaply. `db:setup` (reset + init + seed) is the fastest way to get a correct database and is
what a fresh environment will do anyway, so it exercises the `init-db.ts` half. But the migration
half deserves one real run, because it is what a *deployed* environment will execute and it is the
only path that is never tested by starting clean.

Suggested sequence: take a dump of the current database, run `db:migrate` against a restored copy,
confirm the tables appear and the single test event still loads — then reset the working database
with `db:setup` and carry on. That way the migration is proven without the dev database depending
on it having worked.

---

## 10. Resolved, and what is left

> **Decided — table naming.** Tables are named for their parent: `division_stages`,
> `division_entrants`, `division_adjustments`, `stage_entrants`. `tournament_divisions` is the
> deliberate exception — see §3.0.

> **Decided — bracket geometry is derived, not stored.** The rules-based approach is confirmed. The
> observation that settles it: a drag-and-drop bracket editor can *pre-compute* slot positions in
> the UI from the rule chains, so it gets a concrete grid to manipulate while the stored model stays
> rule-based. That was the one scenario in §2.3 that would have argued for a slots table, and it
> turns out not to — the UI can have its positions without the database committing to them, and
> rules keep the flexibility for structures that change while a tournament is running.

> **Decided — no `stage_pairings` table for now.** Swiss can ask "have these two met in this
> stage?" as a query over existing fixtures, which is cheap at tournament sizes. Revisit when the
> Swiss format is actually built; the table is additive if it turns out to be wanted.

> **Decided — no `games.stage_id` for now.** Deferred as a pure optimisation. It is additive and
> can be backfilled in one statement, so it costs almost nothing to add later if the scheduler's
> query path proves slow.

> **Decided — points by placing is a scoring system.** Awarding points by finishing position is a
> legitimate scoring system in its own right, not a special case bolted onto win/draw/loss. So the
> shared `ScoringSystem` shape gains a mode: a division scores either by *result* (the current
> `pointsPerWin` / `Draw` / `Loss`) or by *placing* (a table mapping position to points — 8 for
> first, 6 for second, and so on). Both feed the same standings engine and the same organisation
> roll-up, and a ranked meet simply picks the second mode. Its only storage consequence is that
> `finalScoreData` must admit an ordering, which is a JSONB shape question, not a schema change.

### Both former open items now have answers

> **Decided 2026-09-01 — stamp `schema_migrations` from `init-db.ts`, in Phase 0.** A fresh database
> currently believes no migration has run, so `db:migrate` against it replays everything; that is
> harmless today only because each existing migration happens to be written defensively. Having
> `init-db.ts` insert every filename in `src/scripts/migrations/` on completion makes a clean install
> correctly "already migrated" and lets the migration files be kept indefinitely.
>
> It moved from "outside this feature" to "first task of it" for a concrete reason: the tournament
> migration's exit criterion is *"`db:migrate` against a restored dump produces the same schema as
> `db:setup` on a clean one"*, and that comparison cannot be trusted while one side is mislabelled.
> See [the implementation plan](file:///c:/Fred/Coding/SK/docs/tournaments-implementation-plan.md)
> §0.3.

> **Decided — seed tiers are logged, not built.** The two-tier `seed:core` / `seed:dev` split and the
> loss of hand-entered data on reset are real, and are recorded as **`DATA-3`** in `TODO.md` with the
> full analysis in §11 below. Not folded into this feature: it is test-and-environment infrastructure
> rather than tournament work, and `pg_dump` covers the immediate risk this migration creates. The
> plan's Phase 0 takes that dump before anything runs.

---

## 11. Seeds, and what a reset would cost you

Raised in review: *do the seeds already cover the orgs and players created in the app? I would not
want to re-enter everything if the database is reset.*

### The direct answer: no, and a reset would lose them

- [reset-db.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/reset-db.ts) runs
  `DROP SCHEMA public CASCADE` — a total wipe, not a selective clear. `npm run db:setup` calls it.
- [seed-db.ts](file:///c:/Fred/Coding/SK/server/src/scripts/setup/seed-db.ts) then restores a
  **fixed** set: the sports and their event templates, system settings, one admin org and user, and
  hardcoded demo data — "Springfield High School", two teams (`First XI`, `U16 A`) and three
  profiles (Sarah Connor, Kyle Reese, John Connor).
- There is a partial escape hatch:
  [extract-orgs.ts](file:///c:/Fred/Coding/SK/server/src/scripts/extract-orgs.ts) dumps
  organisations to `server/data/existing_orgs.json`, and the seed loads that file when present. It
  currently holds **10 organisations** — including "Fred's Cool School" and the test schools —
  captured on **28 February 2026**, so it is six months stale.
- Critically, that escape hatch covers **organisations only**. Its query is
  `WHERE logo IS NOT NULL OR name ILIKE '%Springfield%'`, and nothing extracts sites, facilities,
  teams, `org_profiles`, memberships, events or games.

**So: the players would be lost.** No `team_memberships` are seeded at all, and no profile beyond
the three hardcoded ones. Organisations would come back as a stale, partial February snapshot.

### Before running any reset

Take a dump. This is what `pg_dump` is for, and it is the right tool for preserving real work —
seeds are for a *reproducible starting state*, not for protecting data somebody typed in:

```bash
pg_dump --format=custom --file=backup-$(date +%Y%m%d).dump "$DATABASE_URL"
# restore: pg_restore --clean --if-exists --dbname="$DATABASE_URL" backup-YYYYMMDD.dump
```

### The two-tier split, which is the right structure

The review's own proposal is correct and worth building:

| Tier | Contents | Runs on production? |
|---|---|---|
| **Core** | Sports and their event templates, system settings, roles, the initial admin user. Everything the app needs to *function*. | **Yes** |
| **Development** | Demo organisations, sites, facilities, teams, profiles, memberships. Everything that exists to have something to look at. | No |

`db:setup` would run reset → init → `seed:core` → `seed:dev`; a production install runs init →
`seed:core` and stops. Today the two are interleaved in one file, so there is no way to get a clean
production database without also getting Springfield High School.

A third, optional piece would answer the original worry properly: extend `extract-orgs.ts` into a
real snapshot — orgs, sites, facilities, teams, profiles and memberships — writing a
`seed:local` dataset so hand-entered work survives a deliberate reset. Larger than the split, and
only worth it if resets stay frequent; a `pg_dump` covers the same need with no code.

> **Not part of this feature.** Logged as `DATA-3` in `TODO.md`. Flagged here because the
> tournaments migration is the first thing likely to prompt a reset.

---

## 12. Does this change lose any existing data?

Asked directly in review: *will we lose org, team or sport data? Game data is expendable — there is
one test game — but anything else should be preserved first.*

**No. Nothing in this plan destroys organisations, teams, sports, sites, facilities, people or
memberships.** Step by step:

| Migration step | Effect on existing data |
|---|---|
| Create the new tables | **Additive.** New empty tables; nothing else is read or written. |
| Add columns to `game_participants` | **Additive.** Three nullable columns, null on every existing row. |
| Add `events.cached_standings` | **Additive.** Nullable with a default. |
| Rewrite `SportsDay` → `Tournament` | Touches `events.type` and `events.settings` only. **No rows to touch** — there are no container events. |
| Backfill `event_facilities` | **Additive insert**, reading `events.facility_id` and leaving it in place. |
| Drop `pointSystem` / `levelWeighting` | Removes two keys from `events.settings` that **nothing writes and nothing reads**. There is no stored value to lose. |
| `seasons.settings` default → 3/1/0 | Changes the *default for new rows*. Existing seasons store their settings explicitly and are untouched. |

No table is dropped, no column is dropped, and no row is deleted. The one rewrite targets a row
type that does not exist in the database.

### The danger is the reset, not the migration

The two paths differ completely, and it is worth being explicit about which to run:

```bash
npm run db:migrate    # applies pending migrations. Additive. Keeps everything.
npm run db:setup      # reset + init + seed. DROP SCHEMA public CASCADE. Destroys everything.
```

`db:setup` is the one that loses the orgs and players — see §11. So for this change: **run
`db:migrate`, not `db:setup`.**

### Take a dump anyway

Cheap insurance, and it makes the question moot:

```bash
pg_dump --format=custom --file=pre-tournaments-20260830.dump "$DATABASE_URL"
```

Restore with `pg_restore --clean --if-exists --dbname="$DATABASE_URL" pre-tournaments-20260830.dump`.
Worth doing before the first migration run whatever the analysis above says — the cost is seconds
and the alternative is re-entering everything by hand.

### One destructive default caught while checking this

The audit found a genuine mistake in an earlier draft of §4.1. `source_stage_id` was declared
`ON DELETE CASCADE`, which would mean **deleting a stage deletes the `game_participants` rows that
reference it** — silently removing one side of a fixture and leaving a half-populated game behind.
It is now `ON DELETE SET NULL`, matching `source_game_id`: deleting a stage leaves the participant
in place with its fill rule dangling, which the resolution path already has to tolerate.

Worth stating as a rule for the rest of the implementation: **cascade deletes belong on rows that
are meaningless without their parent** — a `stage_entrants` link, a `division_facilities`
allocation — and never on a row that something else still depends on.
