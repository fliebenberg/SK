---
type: concept
title: Live Room Inventory
description: Every subscription room the server offers - its access tier, what it pushes on join, what it publishes afterwards, and how each message must be merged.
tags:
  - websockets
  - subscriptions
  - rooms
  - real-time
timestamp: 2026-09-26T12:00:00Z
---

# Live Room Inventory

Three files decide what a room is, and before this document there was no single place that put
them together:

| Question | Authority |
| --- | --- |
| Which room names exist, and who may join | `classifyRoom` in [roomAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/roomAccess.ts) |
| What a room hands over on join | the `join_room` handler in [index.ts](file:///c:/Fred/Coding/SK/server/src/index.ts) |
| What it publishes afterwards | every `broadcast()` / `additionalBroadcasts` call site, plus [fixtures.ts](file:///c:/Fred/Coding/SK/server/src/wss/fixtures.ts) and [tournaments.ts](file:///c:/Fred/Coding/SK/server/src/wss/tournaments.ts) |

A room is only correct when all three agree. A name in the first with nothing in the second starts
a screen empty; a name in the second with nothing in the third goes stale the moment anything
changes (`FIX-4`, `LIVE-8`). The closed gaps at the bottom of this document are all of that shape.

Read [.agent/skills/live-data/SKILL.md](file:///c:/Fred/Coding/SK/.agent/skills/live-data/SKILL.md)
first — it carries the rules. This is the data.

## The envelope

Every message, on join and on change, is `{ topic, type, data }`
([broadcast.ts](file:///c:/Fred/Coding/SK/server/src/wss/broadcast.ts)). `topic` is the room, so a
client can tell which subscription delivered what. `type` is the only thing that says how `data`
should be merged, and it says it by convention rather than by declaration — which is what the
**Merge semantics** section below has to spell out.

## The rooms

37 room names are joinable, and each carries **one dataset** (rule 4). `Join push` is what the
joining socket receives immediately; that push **is** the initial load, so a screen that joins must
not also query for the same data.

`npm run verify:rooms` checks every row of the `Join push` column against a running server.

### Organisation

| Room | Access | Join push | Published afterwards |
| --- | --- | --- | --- |
| `org:{id}:summary` | public | `ORGANIZATION_UPDATED` or `ENTITY_NOT_FOUND` | `ORGANIZATION_UPDATED` |
| `org:{id}:events` | public | `EVENTS_SYNC` (`Event[]`) | `EVENT_ADDED/UPDATED/DELETED` |
| `org:{id}:fixtures` | public | `GAME_SUMMARIES_SYNC` (`GameSummary[]`) | `GAME_SUMMARY_UPDATED`, `GAME_SUMMARY_REMOVED` |
| `org:{id}:teams` | public | `TEAMS_SYNC` | `TEAM_ADDED/UPDATED/DELETED` |
| `org:{id}:sites` | public | `SITES_SYNC` | `SITE_ADDED/UPDATED/DELETED` |
| `org:{id}:facilities` | public | `FACILITIES_SYNC` | `FACILITY_ADDED/UPDATED/DELETED` |
| `org:{id}:leagues` | public | `LEAGUES_SYNC` | `LEAGUE_*`, `SEASON_*` |
| `org:{id}:members` | member | `ORG_MEMBERS_SYNC` | `ORG_MEMBER_UPDATED`, `ORG_MEMBERS_SYNC` (a minors-setting change) |
| `org:{id}:guardians` | member | `GUARDIANS_SYNC` (every active `ProfileGuardian` in the org) | `PROFILE_GUARDIANS_UPDATED` (`{ playerProfileId, guardians }` — one player's whole current list; replace that player's slice) |
| `org:{id}:referrals` | member | `ORG_REFERRALS_SYNC` | `ORG_REFERRAL_ADDED` |

"Member" here means a membership that carries a member's privileges: a **restricted minor's**
membership opens none of these rooms (`MEMBER-3`; see
[auth_control.md](file:///c:/Fred/Coding/SK/okf/auth_control.md) §6).

### Team, site, facility

| Room | Access | Join push | Published afterwards |
| --- | --- | --- | --- |
| `team:{id}` | member, or the team's coach | `TEAM_UPDATED` | `TEAM_ADDED/UPDATED/DELETED` |
| `team:{id}:members` | member, or the team's coach | `TEAM_MEMBERS_SYNC` | `TEAM_MEMBERS_SYNC` |
| `site:{id}` | public | `SITE_UPDATED` | `SITE_ADDED/UPDATED/DELETED` |
| `facility:{id}` | public | `FACILITY_UPDATED` | `FACILITY_ADDED/UPDATED/DELETED` |

### Event

| Room | Access | Join push | Published afterwards |
| --- | --- | --- | --- |
| `event:{id}` | public | `EVENT_UPDATED` | `EVENT_ADDED`, `EVENT_UPDATED` |
| `event:{id}:fixtures` | public | `GAME_SUMMARIES_SYNC` | `GAME_ADDED/UPDATED/DELETED`, `GAME_SUMMARY_UPDATED`, `GAME_SUMMARY_REMOVED` |
| `event:{id}:divisions` | public | `DIVISIONS_SYNC` | `DIVISION_ADDED/UPDATED/DELETED` |
| `event:{id}:facilities` | public | `EVENT_FACILITIES_SYNC` | `EVENT_FACILITIES_SYNC` |
| `event:{id}:standings` | public | `EVENT_STANDINGS_UPDATED` | `EVENT_STANDINGS_UPDATED` |
| `event:{id}:entrants` | member | `EVENT_ENTRANTS_SYNC` (the whole tournament) | `DIVISION_ENTRANTS_SYNC` (one division's slice) |

**Sports and divisions publish each other (U52).** A tournament's sports and divisions move
together, so each write can publish the other's message: an `UPDATE_EVENT` (or `ADD_EVENT`) that adds
a sport with no division publishes a `DIVISION_ADDED` for the division it creates, and a
`DELETE_DIVISION` or sport-changing `UPDATE_DIVISION` that leaves a sport with no divisions publishes
an `EVENT_UPDATED` with that sport removed. Nothing new to merge; listed because the publisher is not
the obvious one.

### Division

| Room | Access | Join push | Published afterwards |
| --- | --- | --- | --- |
| `division:{id}` | public | `DIVISION_UPDATED` | `DIVISION_ADDED/UPDATED/DELETED` |
| `division:{id}:fixtures` | public | `DIVISION_GAMES_SYNC` | `STAGE_FIXTURES_SYNC`, `GAME_SUMMARY_UPDATED`, `GAME_SUMMARY_REMOVED` |
| `division:{id}:stages` | public | `STAGES_SYNC` | `STAGES_SYNC` |
| `division:{id}:standings` | public | `DIVISION_STANDINGS_UPDATED` | `DIVISION_STANDINGS_UPDATED` |
| `division:{id}:facilities` | public | `DIVISION_FACILITIES_SYNC` | `DIVISION_FACILITIES_SYNC` |
| `division:{id}:entrants` | member | `DIVISION_ENTRANTS_SYNC` | `DIVISION_ENTRANTS_SYNC` |
| `division:{id}:adjustments` | member | `DIVISION_ADJUSTMENTS_SYNC` | `DIVISION_ADJUSTMENTS_SYNC` |
| `division:{id}:stage_entrants` | member | one `STAGE_ENTRANTS_SYNC` per stage | `STAGE_ENTRANTS_SYNC` |

**`division:{id}` is `public`.** It carries the division record, which was already spectator-visible
— it used to be pushed to the public `division:{id}:fixtures` room. Leaving it at `member` when the
record moved would have taken the division's name away from anyone reading its draw.

### Game

The two tiers are different rooms, and the split is load-bearing (`LIVE-4`): a list wants the
summary and must never join `:events`, which hands over the whole match feed.

The internal tiers admit, besides a member of an org with a stake in the game, an organiser of its
event or division (a grant) and — since 2026-09-26 — a **duty**: the game's appointed scorer, or a
coach of a team playing in it (`MEMBER-3`).

| Room | Access | Join push | Published afterwards |
| --- | --- | --- | --- |
| `game:{id}:summary` | public | `GAME_SUMMARY_UPDATED` | `GAME_SUMMARY_UPDATED`, `GAME_SUMMARY_REMOVED` |
| `game:{id}` | member, a grant, or a duty | `GAME_UPDATED` (full `Game`) | `GAME_UPDATED` (always the full `Game`, clock actions included), `GAME_DELETED`, `GAME_RESET`, `GAME_EVENT_ADDED`, `GAME_EVENT_UPDATED`, `GAME_ROSTER_UPDATED` |
| `game:{id}:events` | member, a grant, or a duty | `GAME_EVENTS_SYNC` | `GAME_EVENT_ADDED/UPDATED/REMOVED`, `GAME_EVENTS_BATCH_UPDATED`, `GAME_EVENTS_SYNC`, `GAME_RESET` |
| `game:{id}:disputes` | member, a grant, or a duty | `ACTIVE_DISPUTES_SYNC` | `DISPUTE_STARTED`, `DISPUTE_VOTE_UPDATED`, `DISPUTE_RESOLVED` |

### League, season, user

| Room | Access | Join push | Published afterwards |
| --- | --- | --- | --- |
| `league:{id}:seasons` | public | `SEASONS_SYNC` | `SEASON_ADDED/UPDATED/DELETED` |
| `season:{id}:standings` | public | `STANDINGS_UPDATED` | `STANDINGS_UPDATED` |
| `user:{id}:notifications` | self | `NOTIFICATIONS_SYNC` | `NOTIFICATION_ADDED` |
| `user:{id}:memberships` | self | `USER_MEMBERSHIPS_UPDATED` (`{orgs, teams, dependants}`) | `USER_MEMBERSHIPS_UPDATED` |
| `user:{id}:capabilities` | self | `EVENT_GRANTS_SYNC` | `EVENT_CAPABILITIES_UPDATED` (one event), `EVENT_GRANTS_SYNC` (the set) |

There is no bare `user:{id}` room. It carried all three of the above, so a screen wanting one of
them subscribed to the other two by accident; `classifyRoom` now refuses the name outright.

## Why one room is not several collections

`event:{id}` is the worked example, and the reason a central subscription store cannot be keyed by
room alone. Until 2026-09-11 its join push was five messages writing five unrelated slots:

| Message | Shape | Slot it wrote |
| --- | --- | --- |
| `EVENT_UPDATED` | one `Event` | the event |
| `GAME_SUMMARIES_SYNC` | `GameSummary[]` | the fixture list |
| `DIVISIONS_SYNC` | `TournamentDivision[]` | the divisions |
| `EVENT_FACILITIES_SYNC` | `{eventId, facilityIds}` | which venues are in play |
| `EVENT_STANDINGS_UPDATED` | `{eventId, rows}` | the event-level table |

The event screen called `useLiveRoom` five times on the same room string, each reducer claiming its
own types and ignoring the rest — and the entrants screen, which wants the event and its divisions,
was handed the other three anyway: three server queries per join for data it discards.

Each is now its own room. **The cost of splitting was close to nothing**: five joins instead of one
is five socket frames and the *same* five queries the single join already ran, against one cached
identity lookup. The gain is that a screen pays only for what it reads, and the room name says what
you subscribed to.

The shape lesson survives the split, for anything holding room state on the client: a room is one
collection, so a store is `room -> rows` — but a *screen* is several rooms, so a screen's state is
`room -> collection -> rows` either way.

## Merge semantics, and which rooms need a message log

A late subscriber can be handed stored state instead of a replayed log **iff** every message type
in the room is idempotent under "keep the latest for this key". Sorting all types by that test:

| Class | Key | Collapse rule | Types |
| --- | --- | --- | --- |
| **Snapshot** | the collection | keep only the latest; everything before it is dead | `EVENTS_SYNC`, `GAME_SUMMARIES_SYNC`, `DIVISIONS_SYNC`, `TEAMS_SYNC`, `SITES_SYNC`, `FACILITIES_SYNC`, `ORG_MEMBERS_SYNC`, `ORG_REFERRALS_SYNC`, `TEAM_MEMBERS_SYNC`, `DIVISION_GAMES_SYNC`, `GAME_EVENTS_SYNC`, `ACTIVE_DISPUTES_SYNC`, `NOTIFICATIONS_SYNC`, `LEAGUES_SYNC`, `SEASONS_SYNC`, `STANDINGS_UPDATED` |
| **Scoped snapshot** | a scope id inside the payload | keep the latest **per scope id** | `EVENT_ENTRANTS_SYNC` (eventId), `DIVISION_ENTRANTS_SYNC` (divisionId), `STAGE_ENTRANTS_SYNC` (stageId), `STAGES_SYNC` (divisionId), `STAGE_FIXTURES_SYNC` (stageId), `EVENT_FACILITIES_SYNC`, `DIVISION_FACILITIES_SYNC`, `DIVISION_ADJUSTMENTS_SYNC`, `EVENT_STANDINGS_UPDATED`, `DIVISION_STANDINGS_UPDATED` |
| **Whole-entity upsert** | `data.id` | keep the latest per id | `ORGANIZATION_UPDATED`, `EVENT_ADDED/UPDATED`, `TEAM_*`, `SITE_*`, `FACILITY_*`, `LEAGUE_*`, `SEASON_*`, `DIVISION_UPDATED`, `GAME_SUMMARY_UPDATED`, `GAME_ADDED/UPDATED`, `GAME_EVENT_ADDED/UPDATED`, `TEAM_MEMBER_UPDATED`, `ORG_MEMBER_UPDATED`, `NOTIFICATION_ADDED` |
| **Removal** | `data.id` | keep the latest per id, ordered against upserts for that id | `*_DELETED`, `GAME_SUMMARY_REMOVED`, `GAME_EVENT_REMOVED` |

**The result: every room is storable — no room needs a message log.** Every type above is
idempotent under keep-the-latest-per-key, so a central store can hand a late subscriber its data
rather than a replay.

This was not true until 2026-09-11. Two messages broke it, and both are fixed: the
`UPDATE_GAME_CLOCK` delta was published as a partial under the `GAME_UPDATED` type name that
elsewhere carries a whole `Game`, making it the only non-idempotent merge in the system (`LIVE-16`);
and `USER_MEMBERSHIPS_UPDATED` carried `data: {}`, a nudge that could be neither stored nor replayed
(`LIVE-15`). **Keep it that way:** a new message type that patches rather than replaces, or that
carries no data, costs the client its ability to hold room state at all.

Two traps the table exists to prevent:

- **Collapse must be keyed, not per-type.** `division:{id}` pushes one `STAGE_ENTRANTS_SYNC` *per
  stage* on join. "Keep the last message of each type" would discard every stage but one.
- **A scoped snapshot cannot evict a full one.** In `event:{id}:entrants` a
  `DIVISION_ENTRANTS_SYNC` replaces one division's slice; the `EVENT_ENTRANTS_SYNC` before it
  seeded the other divisions and must survive. This is why `useLiveRoom` has `replaceWhere`.

## Closed gaps

All four disagreements found when this inventory was first compiled were fixed on 2026-09-11. Kept
here because each is a shape of defect that recurs:

- **A joinable, published-to room that pushes nothing on join** — `org:{id}:leagues`,
  `league:{id}:seasons` and `season:{id}:standings`. A screen joining one started empty and only
  filled in if somebody changed it while the screen was open (`LIVE-14`). Each now pushes, and the
  five screens that were covering for it with their own `get_data` no longer issue one.
- **A broadcast to a room nobody can join** — `site:{id}:facilities` received three `FACILITY_*`
  types while `classifyRoom` refused every three-part `site:*` name, so they reached nobody. Deleted
  rather than made joinable: `org:{id}:facilities` already carries the same three types (`FIX-4` is
  the same defect).
- **A nudge with no payload** — `USER_MEMBERSHIPS_UPDATED` (`LIVE-15`), now
  [wss/memberships.ts](file:///c:/Fred/Coding/SK/server/src/wss/memberships.ts).
- **A partial payload under a whole-object type name** — the clock delta (`LIVE-16`).

## Still open

- **`game:{id}:detail` looks redundant with `game:{id}`** — same join push, same published type.
- **The rule-4 migration is half done** — see `LIVE-18` and the note at the top of this document.
