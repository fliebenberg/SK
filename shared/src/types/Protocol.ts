
import { SocketAction } from "../constants/SocketActions";
import { Organization } from "../models/organization/Organization";
import { OrgMembership } from "../models/organization/OrgMembership";
import { Team } from "../models/team/Team";
import { TeamMembership } from "../models/team/TeamMembership";
import { Site } from "../models/venue/Site";
import { Facility } from "../models/venue/Facility";
import { Event } from "../models/event/Event";
import { Game } from "../models/event/Game";
import { OrgProfile } from "../models/people/OrgProfile";
import { UserBadge } from "../models/people/UserBadge";
import { FeedHomeResponse } from "../models/feed/Feed";
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
    organizationType?: string;
    email?: string;
    website?: string;
    logo?: string;
    colors?: { primary: string; secondary: string };
    creatorId?: string;
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
    data: Partial<Event>;
}

export interface DeleteEventPayload {
    id: string;
}

export interface AddGamePayload extends Omit<Game, "id"> {}

export interface UpdateGameStatusPayload {
    id: string;
    status: Game['status'];
}

export interface UpdateGameScorePayload {
    id: string;
    homeScore: number;
    awayScore: number;
}

export interface UpdateGamePayload {
    id: string;
    data: Partial<Game>;
}

export interface DeleteGamePayload {
    id: string;
}

export interface AddOrgProfilePayload extends Omit<OrgProfile, "id"> {
    id?: string;
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

// --- Protocol Map ---
/**
 * Mapping of SocketActions to their Request Payload and Response Data types.
 */
export interface ProtocolMap {
    [SocketAction.ADD_ORG]: { payload: AddOrgPayload; response: Organization };
    [SocketAction.UPDATE_ORG]: { payload: UpdateOrgPayload; response: Organization };
    [SocketAction.CLAIM_ORG]: { payload: ClaimOrgPayload; response: Organization };
    [SocketAction.DELETE_ORG]: { payload: DeleteOrgPayload; response: void };
    [SocketAction.REFER_ORG_CONTACT]: { payload: ReferOrgContactPayload; response: any }; // Returns created referrals
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

    [SocketAction.SUBMIT_REPORT]: { payload: SubmitReportPayload; response: any }; // Returns Report
    [SocketAction.MARK_NOTIFICATION_READ]: { payload: MarkNotificationReadPayload; response: any };
    [SocketAction.MARK_ALL_NOTIFICATIONS_READ]: { payload: MarkAllNotificationsReadPayload; response: void };
    [SocketAction.DELETE_NOTIFICATION]: { payload: DeleteNotificationPayload; response: string };
    [SocketAction.DECLINE_CLAIM]: { payload: DeclineClaimPayload; response: any };
    [SocketAction.REFER_ORG_CONTACT_VIA_TOKEN]: { payload: ReferOrgContactViaTokenPayload; response: any };
    [SocketAction.GET_USER_BADGES]: { payload: GetUserBadgesPayload; response: UserBadge[] };

    [SocketAction.FEED_GET_HOME]: { payload: FeedGetHomePayload; response: FeedHomeResponse };
}
