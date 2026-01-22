# Socket API Actions Documentation

This document summarizes the WebSocket actions currently implemented in the server. It details the `action` types the server accepts, the logic performed, and the resulting broadcast events.

## Broadcast Strategy

**Global vs. Scoped Rooms:**
*   **Global Rooms** (e.g., `teams`) have been deprecated to improve scalability.
*   **Organization Scoped Rooms**: Lists of teams and venues are now broadcast to organization-specific rooms: `org:{orgId}:teams` and `org:{orgId}:venues`.
*   **Item Scoped Rooms**: Updates to specific items (like a single team) are broadcast to that item's room (e.g., `team:{id}`) to support detailed real-time views.

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
*   **Payload**: `{ personId, teamId, roleId }`
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
    *   **Event**: `TEAM_MEMBERS_UPDATED`
    *   **Data**: The updated enriched member object.

#### `REMOVE_TEAM_MEMBER`
*   **Payload**: `{ id }` (This is the `membershipId`)
*   **Logic**: Soft-deletes the membership (sets `endDate`).
*   **Broadcasts**:
    1.  **Topic**: `team:{teamId}`
        *   **Event**: `TEAM_MEMBERS_UPDATED`
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

### 4. Games

#### `ADD_GAME`
*   **Payload**: `{ homeTeamId, awayTeamId, venueId, date, ... }`
*   **Logic**: Schedules a new game.
*   **Broadcasts**:
    *   **Topic**: `games` (Global List - To be scoped later)
    *   **Event**: `GAMES_UPDATED`
    *   **Data**: The new `Game` object.

#### `UPDATE_GAME_STATUS`
*   **Payload**: `{ id, status }`
*   **Logic**: Updates status (e.g., 'Scheduled', 'In Progress', 'Finished').
*   **Broadcasts**:
    *   **Topic**: `games`
    *   **Event**: `GAMES_UPDATED`
    *   **Data**: Result of update.

#### `UPDATE_SCORE`
*   **Payload**: `{ id, homeScore, awayScore }`
*   **Logic**: Updates the score.
*   **Broadcasts**:
    *   **Topic**: `games`
    *   **Event**: `GAMES_UPDATED`
    *   **Data**: Result of update.

### 5. Organizations

#### `ADD_ORG`
*   **Payload**: `Omit<Organization, "id">`
*   **Logic**: Creates a new organization.
*   **Broadcasts**:
    *   **Topic**: `organizations`
    *   **Event**: `ORGANIZATIONS_UPDATED`
    *   **Data**: The new `Organization` object.

#### `UPDATE_ORG`
*   **Payload**: `{ id, data }`
*   **Logic**: Updates organization details.
*   **Broadcasts**:
    *   **Topic**: `organizations`
    *   **Event**: `ORGANIZATIONS_UPDATED`
    *   **Data**: The updated `Organization` object.

#### `ADD_ORG_MEMBER`
*   **Payload**: `{ personId, organizationId, roleId }`
*   **Logic**: Adds a member to an organization.
*   **Broadcasts**:
    *   **Topic**: `organization_memberships` (To be scoped)
    *   **Event**: `ORG_MEMBERSHIPS_UPDATED`
    *   **Data**: The new membership.
