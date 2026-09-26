/**
 * Every room name, in one place.
 *
 * Rule 4 of the live-data skill says a room is one dataset. That rule is only as good as the ability
 * to see what the set of rooms *is*, and before this the names were template literals scattered over
 * `index.ts`, `fixtures.ts` and `tournaments.ts` — so "which rooms carry a game summary?" was a grep
 * for a string shape rather than a question the code could answer.
 *
 * Each function below is one dataset. If you are about to add a second `broadcast` of an unrelated
 * type to an existing room, that is the rule telling you to add a function here instead.
 *
 * The access tier for each of these lives in `classifyRoom` ([roomAccess.ts](./roomAccess.ts)) and
 * the join push in the `join_room` handler; [okf/live_rooms.md](../../../okf/live_rooms.md) lists all
 * three together, and `npm run verify:rooms` checks the second one against a running server.
 */

// --- Organisation ---
export const orgSummaryRoom = (orgId: string) => `org:${orgId}:summary`;
/** The `Event` records. Not the games under them — that is `orgFixturesRoom`. */
export const orgEventsRoom = (orgId: string) => `org:${orgId}:events`;
/** The `GameSummary` rows for every event in the org. */
export const orgFixturesRoom = (orgId: string) => `org:${orgId}:fixtures`;
export const orgTeamsRoom = (orgId: string) => `org:${orgId}:teams`;
export const orgSitesRoom = (orgId: string) => `org:${orgId}:sites`;
export const orgFacilitiesRoom = (orgId: string) => `org:${orgId}:facilities`;
export const orgLeaguesRoom = (orgId: string) => `org:${orgId}:leagues`;
export const orgMembersRoom = (orgId: string) => `org:${orgId}:members`;
/** Every active guardian link in the org (`MEMBER-3`). People data, at the member list's tier. */
export const orgGuardiansRoom = (orgId: string) => `org:${orgId}:guardians`;
export const orgReferralsRoom = (orgId: string) => `org:${orgId}:referrals`;

// --- Team, site, facility ---
export const teamRoom = (teamId: string) => `team:${teamId}`;
export const teamMembersRoom = (teamId: string) => `team:${teamId}:members`;
export const siteRoom = (siteId: string) => `site:${siteId}`;
export const facilityRoom = (facilityId: string) => `facility:${facilityId}`;

// --- Event ---
/** The `Event` record itself. */
export const eventRoom = (eventId: string) => `event:${eventId}`;
export const eventFixturesRoom = (eventId: string) => `event:${eventId}:fixtures`;
export const eventDivisionsRoom = (eventId: string) => `event:${eventId}:divisions`;
export const eventFacilitiesRoom = (eventId: string) => `event:${eventId}:facilities`;
export const eventStandingsRoom = (eventId: string) => `event:${eventId}:standings`;
/**
 * The whole tournament's roster, every division at once (U21).
 *
 * The scope clause of rule 4: the entry screens work a division x organisation grid over one
 * dataset, so scoping this per division would be correct by the letter of the rule and fifteen
 * joins on one screen open.
 */
export const eventEntrantsRoom = (eventId: string) => `event:${eventId}:entrants`;

// --- Division ---
/** The `TournamentDivision` record itself. */
export const divisionRoom = (divisionId: string) => `division:${divisionId}`;
export const divisionFixturesRoom = (divisionId: string) => `division:${divisionId}:fixtures`;
export const divisionStagesRoom = (divisionId: string) => `division:${divisionId}:stages`;
export const divisionStandingsRoom = (divisionId: string) => `division:${divisionId}:standings`;
export const divisionFacilitiesRoom = (divisionId: string) => `division:${divisionId}:facilities`;
export const divisionEntrantsRoom = (divisionId: string) => `division:${divisionId}:entrants`;
export const divisionAdjustmentsRoom = (divisionId: string) => `division:${divisionId}:adjustments`;
/**
 * Pool membership, every stage at once — the scope clause again. `stage:{id}:entrants` would be a
 * join per stage for a screen that renders all of them.
 */
export const divisionStageEntrantsRoom = (divisionId: string) => `division:${divisionId}:stage_entrants`;

// --- Game ---
/** The full `Game`. Spectator tier is `gameSummaryRoom`. */
export const gameRoom = (gameId: string) => `game:${gameId}`;
export const gameSummaryRoom = (gameId: string) => `game:${gameId}:summary`;
/** The recorded scoring feed. Disputes are `gameDisputesRoom`. */
export const gameEventsRoom = (gameId: string) => `game:${gameId}:events`;
export const gameDisputesRoom = (gameId: string) => `game:${gameId}:disputes`;

// --- League and season ---
export const leagueSeasonsRoom = (leagueId: string) => `league:${leagueId}:seasons`;
export const seasonStandingsRoom = (seasonId: string) => `season:${seasonId}:standings`;

// --- User (self tier) ---
export const userNotificationsRoom = (userId: string) => `user:${userId}:notifications`;
export const userMembershipsRoom = (userId: string) => `user:${userId}:memberships`;
/** What this user may do, per event they hold a grant on. */
export const userCapabilitiesRoom = (userId: string) => `user:${userId}:capabilities`;
