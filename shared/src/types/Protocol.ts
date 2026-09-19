
import { SocketAction } from "../constants/SocketActions";
import { Organization, OrganizationType } from "../models/organization/Organization";
import { OrgMembership } from "../models/organization/OrgMembership";
import { Team } from "../models/team/Team";
import { TeamMembership } from "../models/team/TeamMembership";
import { Site } from "../models/venue/Site";
import { Facility } from "../models/venue/Facility";
import { Event } from "../models/event/Event";
import { Game } from "../models/event/Game";
import { GameParticipant } from "../models/event/GameParticipant";
import { OrgProfile } from "../models/people/OrgProfile";
import { UserBadge } from "../models/people/UserBadge";
import { FeedHomeResponse } from "../models/feed/Feed";
import { GameEvent } from "../models/event/GameEvent";
import { GameDispute } from "../models/event/GameDispute";
import { OrgClaimReferral } from "../models/referral/OrgClaimReferral";
import { Report } from "../models/Report";
import { AgeGroup } from "../models/sport/AgeGroup";
import { Notification } from "../models/notification/Notification";
import { League, Season, SeasonTeam, LeagueSettings, LeagueStandingRow } from "../models/league/League";
import { GameSummary } from "../models/event/GameSummary";
import {
    ScoringSubject,
    StageEntrant,
    TournamentAdjustment,
    TournamentDivision,
    TournamentEntrant,
    TournamentFormat,
    TournamentOrganizer,
    TournamentStage,
} from "../models/event/Tournament";
// --- Shared Response Type ---
/**
 * Standard response wrapper for all socket actions.
 */
export interface ActionResponse<T = any> {
    status: 'ok' | 'error';
    data?: T;
    message?: string;
}

/**
 * Parameters for paginated data requests.
 */
export interface PaginationParams {
    page: number;
    limit: number;
    search?: string;
    orgId?: string; // Optional filter by org
    isClaimed?: boolean;
}

/**
 * Standard wrapper for paginated responses.
 */
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
}

// --- Specific Payloads ---

export interface AddOrgPayload {
    name: string;
    description?: string;
    type?: OrganizationType;
    customType?: string;
    email?: string;
    website?: string;
    logo?: string;
    colors?: { primary: string; secondary: string };
    creatorId?: string;
    isClaimed?: boolean;
    supportedSportIds?: string[];
}

export interface UpdateOrgPayload {
    id: string;
    data: Partial<Organization>;
}

export interface ClaimOrgPayload {
    id: string;
    userId: string;
}

export interface DeleteOrgPayload {
    id: string;
}

export interface AddTeamPayload extends Omit<Team, "id"> {}

export interface UpdateTeamPayload {
    id: string;
    data: Partial<Team>;
}

export interface DeleteTeamPayload {
    id: string;
}

export interface AddSitePayload extends Omit<Site, "id"> {}

export interface UpdateSitePayload {
    id: string;
    data: Partial<Site>;
}

export interface DeleteSitePayload {
    id: string;
}

export interface AddFacilityPayload extends Omit<Facility, "id"> {}

export interface UpdateFacilityPayload {
    id: string;
    data: Partial<Facility>;
}

export interface DeleteFacilityPayload {
    id: string;
}

export interface AddEventPayload extends Omit<Event, "id"> {}

export interface UpdateEventPayload {
    id: string;
    /**
     * The workspace the caller is acting from — authorization, never stored. The server falls back
     * to the event's or game's own organisation when it is omitted.
     */
    orgId?: string;
    data: Partial<Event>;
}

export interface DeleteEventPayload {
    id: string;
    /**
     * The workspace the caller is acting from — authorization, never stored. The server falls back
     * to the event's or game's own organisation when it is omitted.
     */
    orgId?: string;
}

export interface AddGamePayload extends Omit<Game, "id" | "status" | "finalScoreData" | "liveState" | "participants"> {
    id?: string;
    participants?: (Omit<GameParticipant, "id" | "gameId"> & { id?: string; gameId?: string })[];
}

export interface UpdateGameStatusPayload {
    id: string;
    status: Game['status'];
}

export interface UpdateGameScorePayload {
    id: string;
    scores?: { [participantId: string]: number };
    homeScore?: number;
    awayScore?: number;
    reason?: string;
}

export interface UpdateGamePayload {
    id: string;
    /**
     * The workspace the caller is acting from — authorization, never stored. The server falls back
     * to the event's or game's own organisation when it is omitted.
     */
    orgId?: string;
    data: Partial<Omit<Game, "participants">> & {
        participants?: (Partial<GameParticipant> & { teamId: string })[];
    };
}

export interface DeleteGamePayload {
    id: string;
    /**
     * The workspace the caller is acting from — authorization, never stored. The server falls back
     * to the event's or game's own organisation when it is omitted.
     */
    orgId?: string;
}

export interface AddOrgProfilePayload extends Omit<OrgProfile, "id"> {
    id?: string;
    /**
     * The event whose organiser is creating this person, when that is what authorizes the write.
     *
     * Creating a person record is otherwise an org admin's job (`PEOPLE-2`). The organiser picker's
     * third tier is the exception — appointing a convenor who is not on the app at all — so it names
     * the event, which must be hosted by `orgId`. Authorization only; never stored on the profile.
     */
    eventId?: string;
}

export interface UpdateOrgProfilePayload {
    id: string;
    data: Partial<OrgProfile>;
}

export interface DeleteOrgProfilePayload {
    id: string;
}

export interface LinkUserProfilePayload {
    email: string;
    orgProfileId: string;
}

export interface AddOrgMemberPayload {
    orgProfileId: string;
    orgId: string;
    roleId: string;
    id?: string; // Optional specific ID
}

export interface UpdateOrgMemberPayload {
    id: string;
    roleId: string;
}

export interface RemoveOrgMemberPayload {
    id: string;
}

export interface AddTeamMemberPayload {
    orgProfileId: string;
    teamId: string;
    roleId: string;
}

export interface UpdateTeamMemberPayload {
    id: string;
    data: Partial<TeamMembership>;
}

export interface RemoveTeamMemberPayload {
    id: string;
}

// --- Referrals & Reports Payloads ---

export interface ReferOrgContactPayload {
    orgId: string;
    contactEmails: string[];
    referredByUserId: string;
}

export interface ClaimOrgViaTokenPayload {
    token: string;
    userId: string;
}

export interface SubmitReportPayload {
    entityType: 'organization' | 'event' | 'user';
    entityId: string;
    reason: 'impersonation' | 'inappropriate_content' | 'spam' | 'other';
    description?: string;
    reporterUserId: string;
}

export interface MarkNotificationReadPayload {
    id: string;
}

export interface MarkAllNotificationsReadPayload {
    userId: string;
}

export interface DeleteNotificationPayload {
    id: string;
}

export interface DeclineClaimPayload {
    token: string;
}

export interface ReferOrgContactViaTokenPayload {
    token: string;
    contactEmails: string[];
}

export interface GetUserBadgesPayload {
    userId: string;
}

export interface FeedGetHomePayload {
    userId?: string;
    timezone?: string;
}

export interface AddGameEventPayload {
    gameId: string;
    initiatorOrgProfileId: string;
    type: string;
    subType?: string;
    eventData?: any;
    actorOrgProfileId?: string;
    gameParticipantId?: string;
}

export interface UpdateGameEventPayload {
    gameId: string;
    eventId: string;
    eventData: any;
    actorOrgProfileId?: string;
    gameParticipantId?: string;
}

export interface InitiateUndoVotePayload {
    gameId: string;
    eventIdToUndo: string;
    initiatorId: string;
}

export interface CastUndoVotePayload {
    gameId: string;
    officialId: string;
    vote: 'APPROVE' | 'REJECT';
    disputeId: string;
}

export interface InitiateUpdateVotePayload {
    gameId: string;
    eventId: string;
    initiatorId: string;
    updateData: any;
}

export interface CastUpdateVotePayload {
    gameId: string;
    officialId: string;
    vote: 'APPROVE' | 'REJECT';
    disputeId: string;
}

export interface UpdateGameClockPayload {
    id: string;
    action: 'START' | 'PAUSE' | 'RESUME' | 'RESET' | 'SET_PERIOD' | 'END_PERIOD' | 'START_PERIOD';
}

export interface ResetGamePayload {
    id: string;
}

export interface SaveGameRosterPayload {
    gameId: string;
    participantId: string;
    items: Array<{ orgProfileId: string, position?: string, jerseyNumber?: string, isReserve: boolean }>;
}

export interface UndoGameEventPayload {
    gameId: string;
    eventId: string;
    initiatorId: string;
}

export interface SendMemberInvitePayload {
    /** The org profile to invite — it must have an email. */
    memberId: string;
}

export interface RemoveSinBinPayload {
    gameId: string;
    sinBinId: string;
}

export interface AddAgeGroupPayload {
    sportId: string;
    name: string;
    /** The workspace the user is acting from — recorded so an admin can see who added it. */
    orgId?: string;
}

export interface AddLeaguePayload {
    name: string;
    orgId: string;
    sportId: string;
    /** An entry in the sport's age-group list. */
    ageGroupId?: string | null;
    joinPolicy: 'CLOSED' | 'INVITE' | 'OPEN';
    criteria?: Record<string, any>;
}

export interface UpdateLeaguePayload {
    id: string;
    data: Partial<Omit<League, 'id' | 'orgId'>>;
}

export interface DeleteLeaguePayload {
    id: string;
}

export interface AddSeasonPayload {
    leagueId: string;
    name: string;
    startDate: string;
    endDate: string;
    status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
    settings?: Partial<LeagueSettings>;
}

export interface UpdateSeasonPayload {
    id: string;
    data: Partial<Omit<Season, 'id' | 'leagueId'>>;
}

export interface DeleteSeasonPayload {
    id: string;
}

export interface AddSeasonTeamPayload {
    seasonId: string;
    teamId: string;
    status?: 'approved' | 'pending';
}

export interface RemoveSeasonTeamPayload {
    seasonId: string;
    teamId: string;
}

export interface AddGameToSeasonPayload {
    gameId: string;
    seasonId: string;
}

export interface RemoveGameFromSeasonPayload {
    gameId: string;
    seasonId: string;
}

export interface GetSystemSettingsPayload {}

// --- Tournaments ------------------------------------------------------------------------------

/**
 * The batch contract (D13), as it appears on the wire.
 *
 * Written once and obeyed by every batch action, because the second action to need it would
 * otherwise copy the first. Four rules, enforced server-side in
 * [wss/batch.ts](file:///c:/Fred/Coding/SK/server/src/wss/batch.ts):
 *
 * 1. **One transaction.** All of it applies or none of it does. A per-item report says which items
 *    were the problem, but a batch with any failed item writes nothing — a half-applied roster is
 *    not a state the organiser asked for and not one the UI can render honestly.
 * 2. **One permission scope.** Every item must belong to the same event; a batch spanning two is
 *    refused before any work, rather than authorized against whichever item happened to be first.
 * 3. **One broadcast.** Ninety fixtures publish one batched message, not ninety — otherwise the
 *    cost this contract removes on the server is simply relocated to the client.
 * 4. **One idempotency key.** A retried batch of ninety does not double-write.
 */
export interface BatchPayload {
  /**
   * Client-generated, stable across retries of the *same* batch and different for a new one — a
   * uuid per user gesture. Omitting it is allowed and means "no replay protection".
   */
  idempotencyKey?: string;
}

/** Why one item of a batch could not be applied. Reported per item; the batch still wrote nothing. */
export interface BatchItemError {
  /** Position in the submitted array, so the client can point at the row. */
  index: number;
  /** The item's id where it had one. */
  id?: string;
  message: string;
}

export interface BatchResponse<T> {
  applied: T[];
  errors: BatchItemError[];
  /**
   * True when this `idempotencyKey` had already been applied and this is the stored result rather
   * than a second write. The client should treat it exactly as a success.
   */
  replayed?: boolean;
}

export interface AddDivisionPayload {
    eventId: string;
    /** The workspace the caller is acting from. Authorization, not data — never stored. */
    orgId: string;
    name: string;
    sportId?: string;
    /** An entry in the sport's age-group list. */
    ageGroupId?: string | null;
    scoringSubject?: ScoringSubject;
    weighting?: number;
    settings?: TournamentDivision['settings'];
    sortOrder?: number;
    /**
     * Created with the division when given. A division must end up with at least one stage (D11),
     * so the caller that knows the format says so here rather than making a second round trip.
     */
    stage?: Omit<AddStagePayload, 'divisionId' | 'orgId'>;
}

export interface UpdateDivisionPayload {
    id: string;
    orgId: string;
    data: Partial<Omit<TournamentDivision, 'id' | 'eventId' | 'stages' | 'entrants'>>;
}

export interface DeleteDivisionPayload {
    id: string;
    orgId: string;
}

export interface AddStagePayload {
    divisionId: string;
    orgId: string;
    name: string;
    format: TournamentFormat;
    /** Appended after the division's last stage when omitted. */
    sequence?: number;
    status?: TournamentStage['status'];
    earliestStart?: string;
    settings?: TournamentStage['settings'];
}

export interface UpdateStagePayload {
    id: string;
    orgId: string;
    data: Partial<Omit<TournamentStage, 'id' | 'divisionId' | 'cachedStandings'>>;
}

export interface DeleteStagePayload {
    id: string;
    orgId: string;
}

/** One competitor in a submitted roster. All three identity fields absent is the "TBC" entrant. */
export interface DivisionEntrantInput {
    /** Preserved across a roster replace, so an entrant keeps its fixtures. */
    id?: string;
    teamId?: string;
    orgProfileId?: string;
    label?: string;
    seed?: number;
    status?: TournamentEntrant['status'];
}

export interface SetDivisionEntrantsPayload extends BatchPayload {
    divisionId: string;
    orgId: string;
    entrants: DivisionEntrantInput[];
}

export interface StageEntrantInput {
    entrantId: string;
    poolKey?: string;
    seed?: number;
    sortOrder?: number;
}

export interface SetStageEntrantsPayload extends BatchPayload {
    stageId: string;
    orgId: string;
    entrants: StageEntrantInput[];
}

export interface GenerateStageFixturesPayload {
    stageId: string;
    orgId: string;
    /**
     * `create` refuses to touch a stage that already has fixtures; `regenerate` deletes them first
     * (D9 — two paths, no silent top-up). The client is expected to have stated the concrete cost
     * before sending `regenerate`; `deleteResults` is the second confirmation, without which a
     * regeneration that would destroy a recorded result is refused.
     */
    mode: 'create' | 'regenerate';
    deleteResults?: boolean;
    idempotencyKey?: string;
}

export interface ScheduleStagePayload {
    stageId: string;
    orgId: string;
    /** ISO. The stage's own `earliestStart` wins when it is later. */
    startAt: string;
    /** How long a fixture occupies its facility, including the turnaround. */
    slotMinutes: number;
    /**
     * Facilities to allocate across. Falls back to the division's allocation, then the event's
     * (data model §3.5). A stage with none available is refused rather than scheduled nowhere.
     */
    facilityIds?: string[];
    /** Leave already-scheduled fixtures where they are. Default false. */
    keepScheduled?: boolean;
    idempotencyKey?: string;
}

export interface AddGamesPayload extends BatchPayload {
    games: AddGamePayload[];
}

export interface UpdateGamesPayload extends BatchPayload {
    games: UpdateGamePayload[];
}

export interface ResolveParticipantPayload {
    gameParticipantId: string;
    orgId: string;
    teamId?: string;
    orgProfileId?: string;
    entrantId?: string;
}

export interface AddAdjustmentPayload {
    divisionId: string;
    orgId: string;
    entrantId: string;
    pointsDelta: number;
    reason: string;
}

export interface DeleteAdjustmentPayload {
    id: string;
    orgId: string;
}

export interface SetEventFacilitiesPayload {
    eventId: string;
    orgId: string;
    facilityIds: string[];
}

export interface SetDivisionFacilitiesPayload {
    divisionId: string;
    orgId: string;
    facilityIds: string[];
}

/**
 * Appoint an organiser, at exactly one of the two scopes (D33).
 *
 * `orgProfileId` is a *profile*, not a user: a convenor can be appointed before they have an
 * account, and the grant needs no rewrite when they claim one, because `AccessManager` already
 * resolves a user into a set of profile ids by `user_id` or verified email.
 *
 * `orgId` is the workspace the caller is acting from, as on every other tournament write.
 */
export interface AppointOrganizerPayload {
    /** Set for an event-scope grant. Exactly one of this and `divisionId`. */
    eventId?: string;
    /** Set for a division-scope grant. */
    divisionId?: string;
    orgProfileId: string;
    /**
     * The workspace the caller is acting from, when there is one.
     *
     * Optional, unlike every other tournament payload's: an appointed organiser may hold no
     * membership anywhere and so act from no workspace at all. The gate falls back to the event's
     * own org, which is also what §1 of the UI doc asks for — the answer is computed from the user
     * and the event, never from the `orgId` in the route.
     */
    orgId?: string;
}

export interface WithdrawOrganizerPayload {
    eventId?: string;
    divisionId?: string;
    orgProfileId: string;
    orgId?: string;
}

/**
 * What an appointment or a withdrawal returns: the scope's whole list, not the row that changed.
 *
 * Sending the list means the caller replaces rather than patches, which is the same reasoning rule
 * 1 of the live-data contract gives for broadcasts. The list is *not* broadcast: `event:{id}` is a
 * public room and this names people.
 */
export interface OrganizersResult {
    eventId?: string;
    divisionId?: string;
    organizers: TournamentOrganizer[];
}

/** What a generation or scheduling run actually did, so the client can say so. */
export interface StageFixturesResult {
    stageId: string;
    divisionId: string;
    eventId: string;
    /** The stage's fixtures after the run, as summaries — the one batched broadcast's payload. */
    games: GameSummary[];
    created: number;
    updated: number;
    deleted: number;
}

// --- Protocol Map ---
/**
 * Mapping of SocketActions to their Request Payload and Response Data types.
 */
export type SocketActionPayloadMap = ProtocolMap;

export interface ProtocolMap {
    [SocketAction.ADD_ORG]: { payload: AddOrgPayload; response: Organization };
    [SocketAction.UPDATE_ORG]: { payload: UpdateOrgPayload; response: Organization };
    [SocketAction.CLAIM_ORG]: { payload: ClaimOrgPayload; response: Organization };
    [SocketAction.DELETE_ORG]: { payload: DeleteOrgPayload; response: void };
    [SocketAction.REFER_ORG_CONTACT]: { payload: ReferOrgContactPayload; response: OrgClaimReferral[] };
    [SocketAction.CLAIM_ORG_VIA_TOKEN]: { payload: ClaimOrgViaTokenPayload; response: Organization };
    
    [SocketAction.ADD_TEAM]: { payload: AddTeamPayload; response: Team };
    [SocketAction.UPDATE_TEAM]: { payload: UpdateTeamPayload; response: Team };
    [SocketAction.DELETE_TEAM]: { payload: DeleteTeamPayload; response: void };

    [SocketAction.ADD_SITE]: { payload: AddSitePayload; response: Site };
    [SocketAction.UPDATE_SITE]: { payload: UpdateSitePayload; response: Site };
    [SocketAction.DELETE_SITE]: { payload: DeleteSitePayload; response: void };

    [SocketAction.ADD_FACILITY]: { payload: AddFacilityPayload; response: Facility };
    [SocketAction.UPDATE_FACILITY]: { payload: UpdateFacilityPayload; response: Facility };
    [SocketAction.DELETE_FACILITY]: { payload: DeleteFacilityPayload; response: void };

    [SocketAction.ADD_EVENT]: { payload: AddEventPayload; response: Event };
    [SocketAction.UPDATE_EVENT]: { payload: UpdateEventPayload; response: Event };
    [SocketAction.DELETE_EVENT]: { payload: DeleteEventPayload; response: void };

    [SocketAction.ADD_LEAGUE]: { payload: AddLeaguePayload; response: League };
    [SocketAction.UPDATE_LEAGUE]: { payload: UpdateLeaguePayload; response: League };
    [SocketAction.DELETE_LEAGUE]: { payload: DeleteLeaguePayload; response: void };
    [SocketAction.ADD_AGE_GROUP]: { payload: AddAgeGroupPayload; response: AgeGroup };
    [SocketAction.SEND_MEMBER_INVITE]: { payload: SendMemberInvitePayload; response: unknown };
    [SocketAction.REMOVE_SIN_BIN]: { payload: RemoveSinBinPayload; response: unknown };
    [SocketAction.ADD_SEASON]: { payload: AddSeasonPayload; response: Season };
    [SocketAction.UPDATE_SEASON]: { payload: UpdateSeasonPayload; response: Season };
    [SocketAction.DELETE_SEASON]: { payload: DeleteSeasonPayload; response: void };
    [SocketAction.ADD_SEASON_TEAM]: { payload: AddSeasonTeamPayload; response: SeasonTeam };
    [SocketAction.REMOVE_SEASON_TEAM]: { payload: RemoveSeasonTeamPayload; response: void };
    [SocketAction.ADD_GAME_TO_SEASON]: { payload: AddGameToSeasonPayload; response: void };
    [SocketAction.REMOVE_GAME_FROM_SEASON]: { payload: RemoveGameFromSeasonPayload; response: void };

    [SocketAction.ADD_GAME]: { payload: AddGamePayload; response: Game };
    [SocketAction.UPDATE_GAME_STATUS]: { payload: UpdateGameStatusPayload; response: Game };
    [SocketAction.UPDATE_GAME_SCORE]: { payload: UpdateGameScorePayload; response: Game };
    [SocketAction.UPDATE_GAME]: { payload: UpdateGamePayload; response: Game };
    [SocketAction.DELETE_GAME]: { payload: DeleteGamePayload; response: void };

    [SocketAction.ADD_ORG_PROFILE]: { payload: AddOrgProfilePayload; response: OrgProfile };
    [SocketAction.UPDATE_ORG_PROFILE]: { payload: UpdateOrgProfilePayload; response: OrgProfile };
    [SocketAction.DELETE_ORG_PROFILE]: { payload: DeleteOrgProfilePayload; response: void };
    [SocketAction.LINK_USER_PROFILE]: { payload: LinkUserProfilePayload; response: OrgProfile };

    [SocketAction.ADD_ORG_MEMBER]: { payload: AddOrgMemberPayload; response: OrgMembership };
    [SocketAction.UPDATE_ORG_MEMBER]: { payload: UpdateOrgMemberPayload; response: OrgMembership };
    [SocketAction.REMOVE_ORG_MEMBER]: { payload: RemoveOrgMemberPayload; response: void };

    [SocketAction.ADD_TEAM_MEMBER]: { payload: AddTeamMemberPayload; response: TeamMembership };
    [SocketAction.UPDATE_TEAM_MEMBER]: { payload: UpdateTeamMemberPayload; response: TeamMembership };
    [SocketAction.REMOVE_TEAM_MEMBER]: { payload: RemoveTeamMemberPayload; response: void };

    [SocketAction.SUBMIT_REPORT]: { payload: SubmitReportPayload; response: Report };
    [SocketAction.MARK_NOTIFICATION_READ]: { payload: MarkNotificationReadPayload; response: Notification };
    [SocketAction.MARK_ALL_NOTIFICATIONS_READ]: { payload: MarkAllNotificationsReadPayload; response: void };
    [SocketAction.DELETE_NOTIFICATION]: { payload: DeleteNotificationPayload; response: string };
    [SocketAction.DECLINE_CLAIM]: { payload: DeclineClaimPayload; response: void };
    [SocketAction.REFER_ORG_CONTACT_VIA_TOKEN]: { payload: ReferOrgContactViaTokenPayload; response: OrgClaimReferral[] };
    [SocketAction.GET_USER_BADGES]: { payload: GetUserBadgesPayload; response: UserBadge[] };

    [SocketAction.FEED_GET_HOME]: { payload: FeedGetHomePayload; response: FeedHomeResponse };

    [SocketAction.ADD_GAME_EVENT]: { payload: AddGameEventPayload; response: GameEvent };
    [SocketAction.UPDATE_GAME_EVENT]: { payload: UpdateGameEventPayload; response: GameEvent };
    [SocketAction.INITIATE_UNDO_VOTE]: { payload: InitiateUndoVotePayload; response: GameDispute };
    [SocketAction.CAST_UNDO_VOTE]: { payload: CastUndoVotePayload; response: GameDispute };
    [SocketAction.INITIATE_UPDATE_VOTE]: { payload: InitiateUpdateVotePayload; response: GameDispute };
    [SocketAction.CAST_UPDATE_VOTE]: { payload: CastUpdateVotePayload; response: GameDispute };
    [SocketAction.UPDATE_GAME_CLOCK]: { payload: UpdateGameClockPayload; response: Game };
    [SocketAction.RESET_GAME]: { payload: ResetGamePayload; response: Game };
    [SocketAction.SAVE_GAME_ROSTER]: { payload: SaveGameRosterPayload; response: void };
    [SocketAction.UNDO_GAME_EVENT]: { payload: UndoGameEventPayload; response: { success: boolean, error?: string } };
    [SocketAction.GET_SYSTEM_SETTINGS]: { payload: GetSystemSettingsPayload; response: Record<string, any> };

    [SocketAction.ADD_DIVISION]: { payload: AddDivisionPayload; response: TournamentDivision };
    [SocketAction.UPDATE_DIVISION]: { payload: UpdateDivisionPayload; response: TournamentDivision };
    [SocketAction.DELETE_DIVISION]: { payload: DeleteDivisionPayload; response: { id: string } };
    [SocketAction.ADD_STAGE]: { payload: AddStagePayload; response: TournamentStage };
    [SocketAction.UPDATE_STAGE]: { payload: UpdateStagePayload; response: TournamentStage };
    [SocketAction.DELETE_STAGE]: { payload: DeleteStagePayload; response: { id: string } };
    [SocketAction.SET_DIVISION_ENTRANTS]: { payload: SetDivisionEntrantsPayload; response: BatchResponse<TournamentEntrant> };
    [SocketAction.SET_STAGE_ENTRANTS]: { payload: SetStageEntrantsPayload; response: BatchResponse<StageEntrant> };
    [SocketAction.GENERATE_STAGE_FIXTURES]: { payload: GenerateStageFixturesPayload; response: StageFixturesResult };
    [SocketAction.SCHEDULE_STAGE]: { payload: ScheduleStagePayload; response: StageFixturesResult };
    [SocketAction.ADD_GAMES]: { payload: AddGamesPayload; response: BatchResponse<GameSummary> };
    [SocketAction.UPDATE_GAMES]: { payload: UpdateGamesPayload; response: BatchResponse<GameSummary> };
    [SocketAction.RESOLVE_PARTICIPANT]: { payload: ResolveParticipantPayload; response: GameSummary };
    [SocketAction.ADD_ADJUSTMENT]: { payload: AddAdjustmentPayload; response: TournamentAdjustment };
    [SocketAction.DELETE_ADJUSTMENT]: { payload: DeleteAdjustmentPayload; response: { id: string } };
    [SocketAction.SET_EVENT_FACILITIES]: { payload: SetEventFacilitiesPayload; response: { eventId: string; facilityIds: string[] } };
    [SocketAction.SET_DIVISION_FACILITIES]: { payload: SetDivisionFacilitiesPayload; response: { divisionId: string; facilityIds: string[] } };
    [SocketAction.APPOINT_ORGANIZER]: { payload: AppointOrganizerPayload; response: OrganizersResult };
    [SocketAction.WITHDRAW_ORGANIZER]: { payload: WithdrawOrganizerPayload; response: OrganizersResult };
}

/**
 * Strict discriminated union for get_data WebSocket requests.
 */
export type GetDataRequest =
  | { type: 'organization' | 'team' | 'site' | 'facility' | 'event' | 'game' | 'league' | 'season' | 'sport' | 'game_roster' | 'roster' | 'season_standings' | 'user_memberships'; id: string }
  | { type: 'organizations' | 'teams' | 'games' | 'events' | 'sites' | 'leagues'; orgId: string }
  | { type: 'org_members'; orgId: string }
  | { type: 'team_members'; teamId: string }
  | { type: 'seasons'; leagueId: string }
  | { type: 'facilities'; siteId?: string; id?: string }
  | { type: 'season_teams' | 'season_games'; seasonId: string }
  | { type: 'sports' | 'roles' | 'org_profiles' | 'team_memberships' | 'org_memberships' }
  // Tournaments. Each is classified in `wss/dataAccess.ts` against the room that owns it; under
  // `GET_DATA_ENFORCE` an unclassified type is refused, so a new one cannot be born unauthenticated.
  | { type: 'divisions' | 'event_facilities'; eventId: string }
  | { type: 'division' | 'division_stages' | 'division_entrants' | 'division_adjustments'
        | 'division_standings' | 'division_games' | 'division_facilities'; divisionId: string }
  | { type: 'stage' | 'stage_entrants' | 'stage_games'; stageId: string }
  | { type: 'event_standings'; eventId: string }
  // Permissions (Phase 4). `event_capabilities` answers for the **caller** and nobody else — the
  // identity comes from the handshake, so the request names no user and one cannot be asked for.
  | { type: 'event_capabilities' | 'event_organizers'; eventId: string }
  | { type: 'division_organizers'; divisionId: string }
  // The organiser picker's search. Tiered rather than global by default: `eventId` scopes tier 1
  // to the host and participating orgs, and `global: true` is the explicit control that widens it.
  // Either way the projection is name, org and image — never contact or identity fields.
  | { type: 'organizer_candidates'; eventId: string; query: string; global?: boolean };

