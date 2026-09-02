# Socket API Actions Documentation

This document summarizes the WebSocket actions currently implemented in the server. It details the `action` types the server accepts, the logic performed, and the resulting broadcast events.

## Broadcast Strategy

**Global vs. Scoped Rooms:**
*   **Global Rooms** (e.g., `teams`) have been deprecated to improve scalability.
*   **Organization Scoped Rooms**: Lists of teams and venues are now broadcast to organization-specific rooms: `org:{orgId}:teams` and `org:{orgId}:venues`.
*   **Item Scoped Rooms**: Updates to specific items (like a single team) are broadcast to that item's room (e.g., `team:{id}`) to support detailed real-time views.

**Message envelope.** Every update is `{ topic, type, data }`, published through
[wss/broadcast.ts](file:///c:/Fred/Coding/SK/server/src/wss/broadcast.ts). `topic` names the
room it was sent to — socket.io does not tell a receiver which room delivered a message, so
without it a client can only filter on `type`. `data` is **the changed object itself**, never
a signal to refetch. See [.agent/skills/live-data](file:///c:/Fred/Coding/SK/.agent/skills/live-data/SKILL.md).

**Joining a room loads it.** `join_room` pushes the room's current state to the joining
socket, using the same envelope. A screen that subscribes does not also issue a `get_data`.

**Room access.** `join_room` authorizes before joining, against the identity proven by the
socket handshake, and refuses any room name not declared in
[wss/roomAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/roomAccess.ts). A refusal is
answered with `ROOM_ACCESS_DENIED`. Three levels: `public` (fixtures, results, venues, team
names — anonymous sockets included, since the org directory is browsable logged out),
`member` (personal data and org internals — `org:*:members`, `team:*`, `game:*`,
`game:*:events`), and `self` (`user:*`). The identity is resolved once per user in a single
query behind a 30-second TTL, so joining several rooms costs one lookup; that cache is
read-path only and never authorizes a write. Access is checked at **join** time and again on
**revocation**: `USER_MEMBERSHIPS_UPDATED` drops the cached identity and force-leaves any room the
user may no longer hold, answered with `ROOM_ACCESS_REVOKED`. A purely clock-based expiry is picked
up at the socket's next reconnect instead (`LIVE-5` in TODO.md).

**`get_data` authorization.** Queries are classified in
[wss/dataAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/dataAccess.ts); most resolve to the
room that owns the data and defer to `canJoinRoom`, and an unmapped type is refused. A request that
names no subject — no `orgId`, no `id` — is refused rather than authorized against a room built
from `undefined`.

**Enforcing since 2026-09-01** (`GET_DATA_ENFORCE=true`; the boot log says which mode is active).
Clearing the flag returns it to log-only, where the decision is still made and every refusal logged
as `[DataAccess] WOULD-REFUSE` but nothing is blocked. Because an unmapped type is refused,
**adding a `get_data` case now means adding its rule**, or the first call fails.

One request carries a parameter purely for authorization: **`team_members` accepts an optional
`gameId`**. A scoring screen shows both sides' players while the scorer belongs to only one of the
two orgs, so naming the game moves the decision from `team:{id}` to `game:{id}` — the tier that
already admits every org with a stake in the fixture. It is honoured only once the team is confirmed
to be playing in that game, so it cannot be used to reach an unrelated roster.

### Fixture rooms

| Room | Access | Pushes on join | Carries |
| --- | --- | --- | --- |
| `org:{orgId}:events` | public | `EVENTS_SYNC`, `GAME_SUMMARIES_SYNC` | `EVENT_ADDED/UPDATED/DELETED`, `GAME_SUMMARY_UPDATED/REMOVED` |
| `event:{id}` | public | `EVENT_UPDATED`, `GAME_SUMMARIES_SYNC` | event and game changes for one event |
| `game:{id}:summary` | public | `GAME_SUMMARY_UPDATED` | score, clock, status, teams |
| `game:{id}` | member | `GAME_UPDATED` (full game) | game state, rosters |
| `game:{id}:events` | member | `GAME_EVENTS_SYNC`, `ACTIVE_DISPUTES_SYNC` | the recorded scoring feed and disputes |

There is **no** `org:{orgId}:games` room — nothing ever published to one; game changes reach
a fixtures list on `org:{orgId}:events`.

### Division rooms

Added by tournaments Phase 3. Rooms follow **the screen's data needs, never the viewer's role**
(U33): a convenor looking at a whole event needs its data exactly as the host does, so the split
below is by what is *in* each room, not by who is entitled to organise.

| Room | Access | Pushes on join | Carries |
| --- | --- | --- | --- |
| `division:{id}:fixtures` | public | `DIVISION_UPDATED`, `STAGES_SYNC`, `DIVISION_GAMES_SYNC`, `DIVISION_FACILITIES_SYNC` | the division, its stages, its draw |
| `division:{id}:standings` | public | `DIVISION_STANDINGS_UPDATED` | each stage's table, `poolKey` per row |
| `division:{id}` | member | `DIVISION_ENTRANTS_SYNC`, `DIVISION_ADJUSTMENTS_SYNC`, `STAGE_ENTRANTS_SYNC` | the roster, pool membership, manual adjustments |

The draw and the table are `public` for the same reason `org:*:events` and `season:*:standings`
already are — a spectator may legitimately read who is playing whom and who is winning. The base
room is `member` because it carries the things a spectator may not: an entrant can be **a person**
rather than a team, and a `division_adjustments` row carries a reason written by an organiser
("ineligible player") and the id of whoever wrote it. Membership resolves through
`getDivisionOrgIds` — the hosting org, every org registered on the event, **and** every org whose
team is entered in the division, that third source being the same one `getGameOrgIds` needs and for
the same reason (`FIX-5`).

The event room also pushes `DIVISIONS_SYNC` and `EVENT_STANDINGS_UPDATED` on join, so the event
screen learns what its divisions are without joining every one of their rooms.

Every publish goes through [wss/tournaments.ts](file:///c:/Fred/Coding/SK/server/src/wss/tournaments.ts),
which owns the audience the way `wss/fixtures.ts` owns a fixture's.

## The batch contract (D13)

Written once, here, and obeyed by every batch action — because the moment the second action copies
the first, a contract stops being one. Enforced in
[wss/batch.ts](file:///c:/Fred/Coding/SK/server/src/wss/batch.ts).

**1. One transaction.** All of it applies or none of it does. A batch whose report carries any
error wrote **nothing**: a half-applied roster is not a state the organiser asked for and not one a
screen can render honestly, so the per-item report says which rows to fix, never which rows
survived. Every item is validated before anything is written.

**2. One permission scope.** Every item must belong to the same event, and a batch spanning two is
refused *before* any work rather than authorized against whichever item sorted first. `singleScope`
also refuses an item that names no event at all, since "no scope" is the shape an item takes when
it points at a row that is not there.

**3. One broadcast.** The whole batch publishes once. Ninety fixtures published one at a time would
put back on the client exactly the cost this contract removes on the server — which is why
`useLiveRoom` gains an `upsertMany` reduce kind alongside these actions (U32), not after them.

**4. One idempotency key.** `idempotencyKey` on the payload is client-generated, stable across
retries of the *same* batch and different for a new one. A repeat within ten minutes returns the
first attempt's result with `replayed: true` instead of writing again; a retry that lands while the
original is still in flight awaits it rather than racing a second transaction against it. Omitting
the key is allowed and means "no replay protection". A **failed** attempt is not cached — retrying
something that errored is the one case where the caller does want it to run again.

The cache is in memory, per process, and deliberately so: it is sized to the failure it exists for
— a client whose acknowledgement was lost sending the same batch again, seconds later, to the same
process. It is **not durable**, and a second server process would need a table instead. Stated
rather than left to be discovered.

The response shape is `BatchResponse<T>`: `{ applied, errors, replayed? }`. A refused batch comes
back as `{ status: 'error' }` with the per-item report on the error.

A `GameSummary` ([shared](file:///c:/Fred/Coding/SK/shared/src/models/event/GameSummary.ts)) is
status, scores, clock, times, venue ids and participants **with team name and org short name** —
so a client renders "SBHS 1st XV vs PBHS 1st XV 12 - 7" from the broadcast alone, with no teams
or organizations lookup. It deliberately excludes recorded events, disputes, rosters, sin bins
and `finalScoreData`.

Every change to a game's score, clock, status, kick-off, venue or participants publishes a
summary via `publishGameSummary`
([wss/fixtures.ts](file:///c:/Fred/Coding/SK/server/src/wss/fixtures.ts)), to the hosting org,
every org registered on the event, **and** every org owning a participating team.

## Action Handler

All state-changing operations are sent via the `action` event.

### 1. Teams

#### `ADD_TEAM`
*   **Payload**: `Omit<Team, "id">` (includes `name`, `ageGroup`, `sportId`, `organizationId`)
*   **Logic**: Creates a new team.
*   **Broadcasts**:
    *   **Topic**: `org:{orgId}:teams`
    *   **Event**: `TEAM_ADDED`
    *   **Data**: The complete `Team` object.

#### `UPDATE_TEAM`
*   **Payload**: `{ id, data }` (where `data` is `Partial<Team>`)
*   **Logic**: Updates the specified team's properties.
*   **Broadcasts**:
    1.  **Topic**: `org:{orgId}:teams`
        *   **Event**: `TEAM_UPDATED`
        *   **Data**: The updated `Team` object.
    2.  **Topic**: `team:{id}` (Specific Team Room)
        *   **Event**: `TEAM_UPDATED`
        *   **Data**: The updated `Team` object.

#### `DELETE_TEAM`
*   **Payload**: `{ id }`
*   **Logic**: Removes the team.
*   **Broadcasts**:
    1.  **Topic**: `org:{orgId}:teams`
        *   **Event**: `TEAM_DELETED`
        *   **Data**: `{ id: string }`
    2.  **Topic**: `team:{id}`
        *   **Event**: `TEAM_DELETED`
        *   **Data**: `{ id: string }` (Client should handle navigation away if on this page)

### 2. Team Members

#### `ADD_TEAM_MEMBER`
*   **Payload**: `{ orgProfileId, teamId, roleId }`
*   **Logic**: Links a person to a team.
*   **Broadcasts**:
    1.  **Topic**: `team:{teamId}`
        *   **Event**: `TEAM_MEMBERS_UPDATED`
        *   **Data**: The enriched member object.
    2.  **Topic**: `org:{orgId}:teams`
        *   **Event**: `TEAM_UPDATED`
        *   **Data**: The updated `Team` object (including new player/staff counts if applicable).

#### `UPDATE_TEAM_MEMBER`
*   **Payload**: `{ id, data }` (where `id` is membershipId and `data` is `Partial<TeamMembership>`)
*   **Logic**: Updates membership details (e.g., role, dates).
*   **Broadcasts**:
    *   **Topic**: `team:{teamId}`
    *   **Event**: `TEAM_MEMBER_UPDATED`
    *   **Data**: The updated enriched member object.

#### `REMOVE_TEAM_MEMBER`
*   **Payload**: `{ id }` (This is the `membershipId`)
*   **Logic**: Soft-deletes the membership (sets `endDate`).
*   **Broadcasts**:
    1.  **Topic**: `team:{teamId}`
        *   **Event**: `TEAM_MEMBER_UPDATED`
        *   **Data**: The updated membership object.
    2.  **Topic**: `org:{orgId}:teams`
        *   **Event**: `TEAM_UPDATED`
        *   **Data**: The updated `Team` object (with new counts).

### 3. Venues

#### `ADD_VENUE`
*   **Payload**: `Omit<Venue, "id">` (includes `name`, `address`, `organizationId`)
*   **Logic**: Creates a new venue.
*   **Broadcasts**:
    *   **Topic**: `org:{orgId}:venues`
    *   **Event**: `VENUE_ADDED`
    *   **Data**: The new `Venue` object.

#### `UPDATE_VENUE`
*   **Payload**: `{ id, data }` (where `data` is `Partial<Venue>`)
*   **Logic**: Updates the venue details.
*   **Broadcasts**:
    1.  **Topic**: `org:{orgId}:venues`
        *   **Event**: `VENUE_UPDATED`
        *   **Data**: The updated `Venue` object.
    2.  **Topic**: `venue:{id}` (Specific Venue Room)
        *   **Event**: `VENUE_UPDATED`
        *   **Data**: The updated `Venue` object.

#### `DELETE_VENUE`
*   **Payload**: `{ id }`
*   **Logic**: Removes the venue.
*   **Broadcasts**:
    1.  **Topic**: `org:{orgId}:venues`
        *   **Event**: `VENUE_DELETED`
        *   **Data**: `{ id: string }`
    2.  **Topic**: `venue:{id}`
        *   **Event**: `VENUE_DELETED`
        *   **Data**: `{ id: string }`

#### `get_data` — `{ type: 'facilities' }`
*   **Payload**: `{ type: 'facilities', id? | siteId? | orgId? }`
*   **Logic**: Scoped by site when `id` or `siteId` names one; otherwise scoped to every site belonging to `orgId` (`getFacilitiesByOrg`). A caller that supplies none of the three gets an unfiltered read, so always pass one.
*   **Returns**: `Facility[]`

### 4. Games

#### `ADD_GAME`
*   **Payload**: `{ homeTeamId, awayTeamId, venueId, date, ... }`
*   **Logic**: Schedules a new game.
*   **Broadcasts**:
    *   **Topic**: `games` (Global List - To be scoped later)
    *   *Topic**: `event:{eventId}`
    *   **Event**: `GAME_ADDED`
    *   **Data**: The new `Game` object.

#### `UPDATE_GAME_STATUS`
*   **Payload**: `{ id, status }`
*   **Logic**: Updates status (e.g., 'Scheduled', 'In Progress', 'Finished').
*   **Broadcasts**:
    *   **Topic**: `game:{id}`
    *   **Event**: `GAME_UPDATED`
    *   **Data**: Result of update.

#### `UPDATE_GAME_SCORE`
*   **Payload**: `{ id, scores, homeScore, awayScore, reason }`
*   **Logic**: Updates live/final game score map and score properties.
*   **Broadcasts**:
    *   **Topic**: `game:{id}`
    *   **Event**: `GAME_UPDATED`
    *   **Data**: Result of update.

### 5. Organizations

#### `ADD_ORG`
*   **Payload**: `Omit<Organization, "id">`
*   **Logic**: Creates a new organization.
*   **Broadcasts**:
    *   **Topic**: `organizations`
    *   **Event**: `ORGANIZATION_UPDATED`
    *   **Data**: The new `Organization` object.

#### `UPDATE_ORG`
*   **Payload**: `{ id, data }`
*   **Logic**: Updates organization details.
*   **Broadcasts**:
    *   **Topic**: `organizations`
    *   **Event**: `ORGANIZATION_UPDATED`
    *   **Data**: The updated `Organization` object.

#### `ADD_ORG_MEMBER`
*   **Payload**: `{ orgProfileId, organizationId, roleId }`
*   **Logic**: Adds a member to an organization.
*   **Broadcasts**:
    *   **Topic**: `org_memberships` (To be scoped)
    *   **Event**: `ORG_MEMBERSHIPS_UPDATED`
    *   **Data**: The new membership.

### 6. Referrals & Claiming

#### `REFER_ORG_CONTACT`
*   **Payload**: `{ organizationId, contactEmails, referredByUserId }`
*   **Logic**: Creates pending referral records and sends invitation emails.
*   **Returns**: `OrgClaimReferral[]`

#### `GET_CLAIM_INFO`
*   **Payload**: `{ token }`
*   **Logic**: Retrieves organization information associated with a claim token.
*   **Returns**: `{ organizationId, organizationName, ... }`

#### `CLAIM_ORG_VIA_TOKEN`
*   **Payload**: `{ token, userId }`
*   **Logic**: Claims the organization for the user, sets them as admin, and awards "Community Builder" badge if referral threshold met.
*   **Broadcasts**:
    *   **Topic**: `organizations`
    *   **Event**: `ORGANIZATIONS_UPDATED`

#### `DECLINE_CLAIM`
*   **Payload**: `{ token }`
*   **Logic**: Marks a referral as declined to prevent further contact.

#### `REFER_ORG_CONTACT_VIA_TOKEN`
*   **Payload**: `{ token, contactEmails }`
*   **Logic**: Allows a recipient to refer different contacts for an organization.

### 7. Reports

See [reports.md](reports.md) for the feature overview (producers, consumers, and current limitations).

#### `SUBMIT_REPORT`
*   **Payload**: `{ entityType, entityId, reason, description, reporterUserId }`
    *   `entityType`: `'organization' | 'event' | 'user'`
    *   `reason`: `'impersonation' | 'inappropriate_content' | 'spam' | 'other'`
*   **Logic**: Submits a report for an organization, user, or event for moderation. Inserted with `status: 'open'`.
*   **Returns**: The created `Report`.
*   **Broadcasts**: None. Admins do not receive a live update; the reports list is fetched on demand.

#### `get_data` — `{ type: 'reports' }`
*   **Payload**: `{ type: 'reports', id, entityType? }` where `id` is the **requesting user's id**, used for the permission check.
*   **Logic**: Returns all reports, newest first, optionally filtered by `entityType`. Guarded by `isAppAdmin(id)` — non-admins receive an empty array rather than an error.
*   **Returns**: `Report[]`

*Note: `reportManager.getReportsForEntity()` is exposed on `DataManager` but is not currently routed to any socket action.*

### 8. Badges

#### `GET_USER_BADGES`
*   **Payload**: `{ userId }`
*   **Logic**: Retrieves all badges earned by a specific user.
*   **Returns**: `UserBadge[]`

### 9. Notifications

#### `MARK_NOTIFICATION_READ`
*   **Payload**: `{ id }`
*   **Logic**: Marks a specific notification as read.

#### `MARK_ALL_NOTIFICATIONS_READ`
*   **Payload**: `{ userId }`
*   **Logic**: Marks all notifications for a user as read.

#### `DELETE_NOTIFICATION`
*   **Payload**: `{ id }`
*   **Logic**: Deletes a specific notification.

### 10. Tournaments

Added by Phase 3. **Every action below is authorized as its event**, through the same
`canEditEventOrGame` that already guards an event or game edit — one gate in
[index.ts](file:///c:/Fred/Coding/SK/server/src/index.ts) (`TOURNAMENT_ACTION_EVENT`) resolves each
payload to its event and checks it, rather than fourteen handlers each remembering to. A division,
a stage, a roster and an adjustment therefore inherit exactly the rights the event grants, and
Phase 4's organiser assignments widen **one function** rather than fourteen call sites.

Each payload carries `orgId` — the workspace the caller is acting from — which falls back to the
event's own org so the check cannot be skipped by omitting it, exactly as `UPDATE_GAME` and
`DELETE_GAME` already do.

| Action | Payload | Batch? | Broadcasts |
| --- | --- | --- | --- |
| `ADD_DIVISION` | `AddDivisionPayload` (optionally with the division's first `stage`) | no | `DIVISION_ADDED` to `division:{id}:fixtures` and `event:{eventId}` |
| `UPDATE_DIVISION` | `{ id, orgId, data }` | no | `DIVISION_UPDATED`, then `DIVISION_STANDINGS_UPDATED` — `weighting`, `scoring` and `tiebreakers` all change what the tables say |
| `DELETE_DIVISION` | `{ id, orgId }` | no | `DIVISION_DELETED`, `EVENT_STANDINGS_UPDATED` |
| `ADD_STAGE` / `UPDATE_STAGE` / `DELETE_STAGE` | a stage | no | `STAGES_SYNC` |
| `SET_DIVISION_ENTRANTS` | `{ divisionId, orgId, entrants[], idempotencyKey? }` | **yes** | `DIVISION_ENTRANTS_SYNC`, standings, and a `GAME_SUMMARY_UPDATED` per affected fixture |
| `SET_STAGE_ENTRANTS` | `{ stageId, orgId, entrants[], idempotencyKey? }` | **yes** | `STAGE_ENTRANTS_SYNC`, `STAGES_SYNC` |
| `GENERATE_STAGE_FIXTURES` | `{ stageId, orgId, mode, deleteResults? }` | server-side fan-out | `STAGE_FIXTURES_SYNC` (one message), `STAGES_SYNC`, standings |
| `SCHEDULE_STAGE` | `ScheduleStagePayload` | server-side fan-out | `STAGE_FIXTURES_SYNC`, plus a summary per fixture |
| `ADD_GAMES` / `UPDATE_GAMES` | `{ games[], idempotencyKey? }` | **yes** | a summary per fixture |
| `RESOLVE_PARTICIPANT` | `{ gameParticipantId, orgId, teamId? \| orgProfileId? \| entrantId? }` | no | `GAME_SUMMARY_UPDATED`, standings |
| `ADD_ADJUSTMENT` / `DELETE_ADJUSTMENT` | an adjustment | no | `DIVISION_ADJUSTMENTS_SYNC`, standings |
| `SET_EVENT_FACILITIES` / `SET_DIVISION_FACILITIES` | `{ …Id, orgId, facilityIds }` | no | `EVENT_FACILITIES_SYNC` / `DIVISION_FACILITIES_SYNC` |

Three behaviours are worth stating because they are refusals rather than features:

- **`GENERATE_STAGE_FIXTURES` never tops up a draw (D9).** `create` refuses a stage that already
  has fixtures; `regenerate` deletes them first. A regeneration that would destroy a recorded result
  needs `deleteResults`, and the refusal names the counts so the client can state the concrete cost
  ("this deletes 14 fixtures, 3 of which have results") rather than warning in the abstract.
- **`UPDATE_GAMES` cannot carry a score.** Its updatable set is when and where, plus status and
  stage. A result goes through the scoring path so the choke point runs and the undo and dispute
  rules apply; a bulk reschedule that could also write `finalScoreData` would be a second,
  unguarded way to change a match's outcome.
- **`RESOLVE_PARTICIPANT` clears `source_rule`**, and that clearing *is* the override (D29). Once
  the rule is gone the choke point will not touch the slot again, so an organiser's decision
  survives the source fixture being re-scored. Filling a "TBC — awaiting confirmation" slot and
  promoting a beaten semi-finalist are deliberately the same edit and the same code path.

### The choke point

`recalculateForGame(gameId)` in
[TournamentManager](file:///c:/Fred/Coding/SK/server/src/managers/TournamentManager.ts) is the only
thing that rewrites a standings table (D30):

```
recalculateForGame(gameId)
  -> the stage that owns the game    -> rewrite division_stages.cached_standings
  -> the event that owns the stage   -> rewrite events.cached_standings
  -> every season in game_seasons    -> existing recalculateSeasonStandings   (D21)
  -> the fixtures this game fills    -> winnerOf / loserOf                    (D26)
  -> if the stage just completed     -> resolve the next stage's entrants     (D23)
```

Callers reach it through `EventManager.recalculateStandingsForGame`, which recalculates **and
publishes** — one door in, one audience out, because leaving publication to each caller is exactly
how `FIX-3` and `FIX-6` happened. The paths that route through it: a game finishing, the
final-score override, dispute resolution, an undo, a reset, game deletion, an entrant substitution,
a manual slot fill, and a new adjustment row.

Two paths deliberately do **not**, and the reasons are worth keeping. Attaching or detaching a game
from a season changes a season's membership rather than a result, and detaching *cannot* use it —
the choke point resolves seasons from `game_seasons`, and by then the row is gone. Deleting an
event and regenerating a stage both delete fixtures wholesale, so they capture the affected season
ids **before** the delete and rebuild those tables themselves.
