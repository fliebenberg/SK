
import { SocketAction } from "../constants/SocketActions";
import { Organization } from "../models/organization/Organization";
import { OrganizationMembership } from "../models/organization/OrganizationMembership";
import { Team } from "../models/team/Team";
import { TeamMembership } from "../models/team/TeamMembership";
import { Venue } from "../models/venue/Venue";
import { Event } from "../models/event/Event";
import { Game } from "../models/event/Game";
import { Person, PersonIdentifier } from "../models/people/Person";
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

export interface AddVenuePayload extends Omit<Venue, "id"> {}

export interface UpdateVenuePayload {
    id: string;
    data: Partial<Venue>;
}

export interface DeleteVenuePayload {
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

export interface AddPersonPayload extends Omit<Person, "id"> {
    id?: string;
}

export interface UpdatePersonPayload {
    id: string;
    data: Partial<Person>;
}

export interface DeletePersonPayload {
    id: string;
}

export interface SetPersonIdentifierPayload {
    personId: string;
    organizationId: string;
    identifier: string;
}

export interface LinkUserPersonPayload {
    email: string;
    personId: string;
}

export interface AddOrgMemberPayload {
    personId: string;
    organizationId: string;
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
    personId: string;
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
    organizationId: string;
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

    [SocketAction.ADD_VENUE]: { payload: AddVenuePayload; response: Venue };
    [SocketAction.UPDATE_VENUE]: { payload: UpdateVenuePayload; response: Venue };
    [SocketAction.DELETE_VENUE]: { payload: DeleteVenuePayload; response: void };

    [SocketAction.ADD_EVENT]: { payload: AddEventPayload; response: Event };
    [SocketAction.UPDATE_EVENT]: { payload: UpdateEventPayload; response: Event };
    [SocketAction.DELETE_EVENT]: { payload: DeleteEventPayload; response: void };

    [SocketAction.ADD_GAME]: { payload: AddGamePayload; response: Game };
    [SocketAction.UPDATE_GAME_STATUS]: { payload: UpdateGameStatusPayload; response: Game };
    [SocketAction.UPDATE_GAME_SCORE]: { payload: UpdateGameScorePayload; response: Game };
    [SocketAction.UPDATE_GAME]: { payload: UpdateGamePayload; response: Game };
    [SocketAction.DELETE_GAME]: { payload: DeleteGamePayload; response: void };

    [SocketAction.ADD_PERSON]: { payload: AddPersonPayload; response: Person };
    [SocketAction.UPDATE_PERSON]: { payload: UpdatePersonPayload; response: Person };
    [SocketAction.DELETE_PERSON]: { payload: DeletePersonPayload; response: void };
    [SocketAction.SET_PERSON_IDENTIFIER]: { payload: SetPersonIdentifierPayload; response: any }; // Define PersonIdentifier type if available
    [SocketAction.LINK_USER_PERSON]: { payload: LinkUserPersonPayload; response: Person };

    [SocketAction.ADD_ORG_MEMBER]: { payload: AddOrgMemberPayload; response: OrganizationMembership };
    [SocketAction.UPDATE_ORG_MEMBER]: { payload: UpdateOrgMemberPayload; response: OrganizationMembership };
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
