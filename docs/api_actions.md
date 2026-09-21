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

All state-changing operations are sent via the `action` event, as `{ type, payload, requestId? }`,
and only through `sendAction` on the client (`expo-app/services/actions.ts`).

**Replies.** `{ status: 'ok', data }` or `{ status: 'error', message }` (`ActionAck`). An action whose
handler changed nothing — its target was deleted a moment ago — is refused with an error rather than
answered `ok` with `data: null`, and no handler encodes a refusal inside `data`.

**`requestId`.** Optional. A repeat of the same id from the same user within ten minutes is answered
with the first attempt's reply (plus `replayed: true`) and applies nothing; only successes are
remembered, so a refused attempt can be retried with the same id. In memory, per process (`SYNC-5`).

**Failures log.** Every refusal is written to `server/logs/failures-YYYY-MM-DD.jsonl`.

#### `client_failures` (socket event, not an action)
*   **Payload**: `Array<{ kind: 'no-answer' | 'unexpected-reply', actionType, message, requestId?, occurredAt?, platform?, screen? }>`
*   **Logic**: written to the failures log with the socket's own user id. At most 20 items per message
    and 60 per minute per socket; malformed items are dropped. No reply.

### 1. Teams

#### `ADD_TEAM`
*   **Payload**: `Omit<Team, "id">` (includes `name`, `ageGroupId`, `sportId`, `orgId`). `ageGroupId` must be an entry of the team's sport — see [Age groups](#age-groups). Reads carry `ageGroup` (the name) as well; writes ignore it.
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

A `data.sportId` that changes the team's sport without an `ageGroupId` clears the age group, since
an age group belongs to one sport. The same holds for `UPDATE_DIVISION`.

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

### Age groups

Each sport has one age-group list (`sport_age_groups`): official entries curated in the sport
editor, and custom ones users add. Teams, divisions and leagues hold an `ageGroupId`; the database
refuses one of another sport. See [database_structure.md §2d](file:///c:/Fred/Coding/SK/docs/database_structure.md).

#### `ADD_AGE_GROUP`
*   **Payload**: `{ sportId, name, orgId? }` — `orgId` is the workspace it was added from, shown to
    the admin reviewing custom entries.
*   **Gate**: signed in. Anyone who can give a team, division or league an age group may need one the
    official list lacks.
*   **Logic**: returns the entry already carrying that name (official or custom, ignoring case and
    spacing) rather than making a second; otherwise adds a custom entry. Names are 1–40 characters.
*   **Response**: the `AgeGroup`.
*   **Broadcasts**: none. The picker that asked adds it locally; other screens see it the next time
    they read `get_data: sports`.

The admin operations are REST, under `requireAdmin`, and each answers with the sport's whole list as
`AgeGroupAdminView[]` (usage counts and the adding organisation included):

| Route | Does |
|---|---|
| `GET /api/admin/sports/:id/age-groups` | The list. |
| `POST /api/admin/sports/:id/age-groups` `{ name }` | Adds to the end of the official list; promotes a custom entry of that name instead. |
| `PUT /api/admin/sports/:id/age-groups/order` `{ ids }` | Sets the official order. |
| `PATCH /api/admin/age-groups/:id` `{ name?, isOfficial? }` | Rename (refused onto another entry's name), promote or demote. |
| `DELETE /api/admin/age-groups/:id` | Only when nothing uses it. |
| `POST /api/admin/age-groups/:id/merge` `{ intoId }` | Moves every team, division and league to `intoId` and deletes `:id`, in one transaction. Answers `{ moved, ageGroups }`. |

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

#### `UPDATE_GAME` — planning only
*   **Payload**: `{ id, data }` — teams, sport, kick-off, venue, custom settings, and a status of
    `Scheduled` or `Cancelled`.
*   **Authorised**: `orgGate`, rule `edit-fixture` (`canEditEventOrGame`).
*   **Logic**: Edits the fixture. Since 2026-09-21 it does **not** touch the result or the match's
    progress: `refuseResultInFixtureEdit` in `wss/fixtureRules.ts` refuses `finalScoreData`,
    `liveState`, a status of `Live` or `Finished`, and any status change on a match that has already
    started. An *unchanged* status is allowed, so editing a finished match's venue still saves. It
    used to finish matches without writing a game-log entry, and to finish a started match with an
    empty live score that the table read as 0–0.

#### `RECORD_GAME_RESULT`
*   **Payload**: `{ id, scores?, notProvided?, initiatorOrgProfileId? }` — exactly one of `scores`
    (points by `gameParticipantId`, one for every side) and `notProvided: true`.
*   **Authorised**: the scoring gate (`canScoreGame`), which already admits the host's admins and
    staff, event organisers, division convenors and official scorers — so a fixture's editors may
    record its result.
*   **Logic**: Checked by `validateRecordedResult` (both sides known; a score for every side and
    only those; numbers ≥ 0). Writes `finalScoreData` and finishes the match in one statement, then
    recalculates standings and writes a `RESULT_RECORDED` game-log entry. Recording again corrects
    the result. **Not provided** is a result, not an absence of one: the match is finished, counts
    toward no table (`isResultNotProvided` is read first by `sideScores` and `gameOutcome`), decides
    no knockout, and shows as "Score not provided" / "No score" rather than 0–0.
*   **Broadcasts**: `GAME_UPDATED` to `game:{id}` and the event's fixtures room; the game summary is
    republished.

#### `UPDATE_GAME_STATUS` (and `UPDATE_GAME_CLOCK`)
*   **Payload**: `{ id, status, log?, initiatorOrgProfileId? }` — the clock takes `action` in place of
    `status`. `log: { subType, eventData }` is the game-log entry the change is recorded as
    (`GAME_STARTED`, `PERIOD_ENDED`, …); the server writes it only once the change has applied, so the
    log never records a refused change. `initiatorOrgProfileId` must be one of the caller's own
    profiles, or omitted for an uncredited entry.
*   **Logic**: Updates status (e.g., 'Scheduled', 'In Progress', 'Finished'), publishes the game, then
    writes the log entry. If the change applied but the entry could not be written, the reply is an
    error saying so — the status change stands and has already been published.
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

#### Person records — `ADD_ORG_PROFILE`, `UPDATE_ORG_PROFILE`, `DELETE_ORG_PROFILE`, `LINK_USER_PROFILE`

All four go through [wss/profileGate.ts](file:///c:/Fred/Coding/SK/server/src/wss/profileGate.ts),
added 2026-09-03 (`PEOPLE-2`). **Before that they had no permission check at all**, and two of them
handed over an admin membership to anybody signed in: `LINK_USER_PROFILE` sets a profile's email,
and `getOrganizationRole` matches a user to a profile by verified email, so pointing an admin's
profile at your own address inherited their membership. `UPDATE_ORG_PROFILE` could write `user_id`
for the same effect by the other matching rule. Profile ids are not secret — `search_people` returns
them to any signed-in user.

*   **Rule**: an **admin or staff member of the organisation holding the profile**
    (`AccessManager.canManageOrgPeople`) — the same pair every other "manage this org's things"
    check uses. The org is taken from `payload.orgId` on the create and resolved from the profile row
    on the other three, which carry only an id.
*   **One exception, on creation only**: someone who may organise an event may create a profile in
    the org **hosting that event**, by naming `eventId` in the payload. That is the organiser
    picker's third tier — appointing a convenor who is not on the app — and follows U12. The event
    must be hosted by the org the profile is going into, or organising any event anywhere would let
    you write into any organisation's people list.
*   **`userId` is stripped from `UPDATE_ORG_PROFILE`, always.** Re-pointing a profile at a user
    account hands over every membership it holds; the one legitimate caller
    (`UserManager.ensureProfileForUserInOrg`) is server-side, and no client sends it.
*   The gate is on the **action**, not in `UserManager`, so the server's own writes — the invite
    flow's `lastInviteSentAt`, the claim flow's link — keep working. They are not requests.

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

Added by Phase 3. **Every action below goes through one gate**,
[wss/tournamentGate.ts](file:///c:/Fred/Coding/SK/server/src/wss/tournamentGate.ts), rather than
twenty handlers each remembering to check. The gate asks two questions, in this order:

1. **Event scope** — `canEditEventOrGame`, the same function that already guards an event or game
   edit, so a division, a stage, a roster and an adjustment inherit exactly the rights the event
   grants. Since Phase 4 it also admits an **appointed event organiser**, which is why the
   assignments widened one function rather than fourteen call sites.
2. **Division scope** — only for actions that name a division (`TOURNAMENT_ACTION_DIVISION`). A
   convenor's grant covers the whole of their division and nothing above or beside it.

Each payload carries `orgId` — the workspace the caller is acting from — which falls back to the
event's own org so the check cannot be skipped by omitting it, exactly as `UPDATE_GAME` and
`DELETE_GAME` already do. The two assignment actions take it as **optional**, because an appointee
may hold no membership anywhere and so act from no workspace at all.

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
| `APPOINT_ORGANIZER` / `WITHDRAW_ORGANIZER` | `{ eventId \| (eventId + sportId) \| divisionId, orgProfileId, orgId? }` | no | `EVENT_CAPABILITIES_UPDATED` to `user:{id}` — **not** to a division room |

**Which of these a division convenor may send** (Phase 4, widened from D31 on 2026-09-03): every
action that names their division — entrants, stages, fixtures, scheduling, results and adjustments —
so that an event organiser can hand a division over and stop thinking about it. **Not**
`ADD_DIVISION`, `UPDATE_DIVISION`, `DELETE_DIVISION` or `SET_EVENT_FACILITIES`: the division's own
record and the shape of the event belong to whoever runs the event. The assignment actions are
allowed **within their own division only** (revised 2026-09-19): a convenor may appoint
co-convenors, and may withdraw only the ones they appointed — checked in the handler against
`granted_by_org_profile_id`, since the gate cannot see who granted a row. Event scope is refused.
A division's organiser list carries a per-viewer `canWithdraw` in replies to its caller. An attempt
on another division resolves to a division they do not hold and is refused **on the wire**, not by
a hidden button.

**Which a sport's organiser may send** (added 2026-09-20): every action a convenor of any division
of that sport could send, resolved through the division's *current* sport rather than a stored list
— plus `ADD_DIVISION` and `DELETE_DIVISION` for their own sport, and `UPDATE_DIVISION` on a division
of it. Three refusals define the edge, and all three are decisions about the tournament rather than
about the sport: an `UPDATE_DIVISION` that would **move a division to another sport** (refused in the
gate — it would walk a division out of their reach or somebody else's into it), a `DELETE_DIVISION`
of the sport's **last** division (refused in the handler: it would take the sport out of the
tournament, U52), and any event-scope appointment. Appointing is allowed within their sport, at both
scopes below them — co-organisers of the sport and convenors of its divisions — withdrawing only the
people they appointed, checked in the handler exactly as a convenor's is.

**How the three scopes are told apart.** A sport-scope payload carries `eventId` *and* `sportId`, so
`eventId` on its own stopped meaning event scope when the sport scope was added. Every reader —
the gate, the manager, both handlers, the picker — asks `organizerScopeOf`
(`shared/src/utils/organizerScope.ts`), which takes the most specific field present: a division id
wins, then a sport with its event, then an event alone. A payload naming none is refused rather than
defaulted.

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

### Organiser assignments and capability flags (Phase 4)

Both assignment actions are **idempotent** and answer with the scope's **whole list**
(`OrganizersResult`), so a caller replaces rather than patches — the same reasoning rule 1 of the
broadcast strategy gives. An appointment writes exactly one row: it never adds the appointee's
organisation to `event_organizations`.

The list is deliberately **not** broadcast. `event:{id}` is a public room and an organiser list
names people, so it is read through `get_data` at the organiser tier instead:

| Request | Who may read it |
| --- | --- |
| `{ type: 'event_capabilities', eventId }` | any signed-in user — it answers about **the caller** and there is no way to ask about anybody else |
| `{ type: 'event_organizers', eventId }` | whoever may organise that event |
| `{ type: 'sport_organizers', eventId, sportId }` | whoever may organise that sport of that tournament |
| `{ type: 'division_organizers', divisionId }` | whoever may organise that division |
| `{ type: 'organizer_candidates', eventId, query, global?, sportId?, divisionId? }` | whoever may organise that event, sport or division |

`sport_organizers` is asked **per sport rather than per event**, so the read is gated by exactly the
grant that would let the caller change it: a netball organiser reads their own sport's list without
being handed the people running every other sport, and there is no wider read for them to be refused
by. A tournament has a handful of sports and the reads run together. Its rows carry the same
per-viewer `canWithdraw` a division's do.

`organizer_candidates` is the picker's search, in tiers: by default the host and participating
organisations, and `global: true` is the explicit control that widens it to everybody. **Both tiers
return name, organisation and image only** — never `cellphone`, `birthdate` or `national_id`. That
projection rule now applies to `search_people` as well, which returns contact and identity fields
only when the search is scoped to an org the caller belongs to (`PEOPLE-1`, closed 2026-09-03).

A grant change publishes `EVENT_CAPABILITIES_UPDATED` to the affected person's `user:{id}` room,
carrying their freshly computed `{ canEditEvent, convenesDivisionIds }`. `broadcast()` hooks that
message the way it hooks `USER_MEMBERSHIPS_UPDATED`: it drops their cached identity and revalidates
the rooms their sockets already hold, so a withdrawn convenor stops receiving a division's roster at
once rather than at their next reconnect. Nobody to notify is a normal outcome — the grant may name
a profile with no account yet.


### What a screen reads instead of fetching (Phase 5)

Three payloads gained fields in Phase 5, all of them for the same reason: a screen that has to look
something up is a screen that makes N round trips and then renders a stale answer.

| Payload | Field | Why it travels rather than being resolved |
| --- | --- | --- |
| `Event` | `participatingOrgs` — `{ id, name, shortName }[]` | `FIX-2`. The event screen used to read *every organisation in the system* to name a handful, and kept the answer only `if (Array.isArray(res))`, which a paginated response never satisfies, so it named none of them. Displaying orgs already in an event is data a room owns. |
| `GameSummary` / `Game` | `stageId`, `divisionId` | A division's fixture list has to say which stage a fixture is in, and a client-side permission check has to know which division it belongs to — a convenor's grant is scoped to exactly that id, so without it the screen hides the scoring control from somebody the server would let through. `divisionId` is derived through `division_stages`, never stored twice. |
| `Event.settings` | `dismissedSetupSteps` | Which setup-checklist steps the organiser has put away (U17), written from the step's own screen (U48). On the event rather than per viewer: a step that does not apply does not apply for anybody organising it. A key here that matches no current step is ignored, not an error — `schedule` was dropped in U48 and events that dismissed it still carry it. Any write must **spread the existing `settings`**, because `UPDATE_EVENT` replaces the column. |

And one new read:

| Request | Who may read it | Answers |
| --- | --- | --- |
| `{ type: 'my_event_grants' }` | any signed-in user — like `event_capabilities`, it answers about **the caller** and no one else | `{ eventIds, divisions: [{ divisionId, eventId }] }` |

`event_capabilities` is the authoritative answer for **one** event and the event screen asks it. A
fixtures list cannot: role chips on thirty cards would be thirty round trips, which is the
"notify, then everybody refetches" cost the whole design exists to remove, relocated to a screen
load. So a list reads `my_event_grants` once and derives the rest — hosting and attending follow
from the user's memberships, the event's own org and its participating orgs, and only convening
follows from nothing the client holds. It is display only; every write is gated server-side
regardless of what a chip says. Both are refreshed by `EVENT_CAPABILITIES_UPDATED`.

**The fixture audience gained two rooms**, and this was a latent bug rather than a new feature:
`join_room` pushes `GAME_SUMMARIES_SYNC` to `event:{id}` and `DIVISION_GAMES_SYNC` to
`division:{id}:fixtures`, but `fixtureRooms` published to neither — so both handed over data on join
and then never updated it. A room that hands data over and never republishes it is `FIX-4`'s shape.
Both are now in the audience of every `publishGameSummary` and every removal.

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
