
/**
 * Enum defining all possible socket actions in the application.
 * Use these constants to ensure type safety and prevent typos between client and server.
 */
export enum SocketAction {
    // --- Organizations ---
    /**
     * Action to create a new organization.
     * Expects payload: Omit<Organization, "id"> & { creatorId?: string }
     */
    ADD_ORG = 'ADD_ORG',

    /**
     * Action to update an existing organization.
     * Expects payload: { id: string, data: Partial<Organization> }
     */
    UPDATE_ORG = 'UPDATE_ORG',

    /**
     * Action to claim an organization.
     * Expects payload: { id: string, userId: string }
     */
    CLAIM_ORG = 'CLAIM_ORG',

    /**
     * Action to delete an organization.
     * Expects payload: { id: string }
     */
    DELETE_ORG = 'DELETE_ORG',

    // --- Teams ---
    /**
     * Action to create a new team.
     * Expects payload: Omit<Team, "id">
     */
    ADD_TEAM = 'ADD_TEAM',

    /**
     * Action to update an existing team.
     * Expects payload: { id: string, data: Partial<Team> }
     */
    UPDATE_TEAM = 'UPDATE_TEAM',

    /**
     * Action to delete a team.
     * Expects payload: { id: string }
     */
    DELETE_TEAM = 'DELETE_TEAM',

    // --- Sites & Facilities ---
    /**
     * Action to create a new site.
     * Expects payload: { site: Site }
     */
    ADD_SITE = 'ADD_SITE',

    /**
     * Action to update an existing site.
     * Expects payload: { id: string, data: Partial<Site> }
     */
    UPDATE_SITE = 'UPDATE_SITE',

    /**
     * Action to delete a site.
     * Expects payload: { id: string }
     */
    DELETE_SITE = 'DELETE_SITE',

    /**
     * Action to create a new facility.
     * Expects payload: { facility: Facility }
     */
    ADD_FACILITY = 'ADD_FACILITY',

    /**
     * Action to update an existing facility.
     * Expects payload: { id: string, data: Partial<Facility> }
     */
    UPDATE_FACILITY = 'UPDATE_FACILITY',

    /**
     * Action to delete a facility.
     * Expects payload: { id: string }
     */
    DELETE_FACILITY = 'DELETE_FACILITY',

    // --- Events ---
    /**
     * Action to create a new event.
     * Expects payload: Omit<Event, "id">
     */
    ADD_EVENT = 'ADD_EVENT',

    /**
     * Action to update an existing event.
     * Expects payload: { id: string, data: Partial<Event> }
     */
    UPDATE_EVENT = 'UPDATE_EVENT',

    /**
     * Action to delete an event.
     * Expects payload: { id: string }
     */
    DELETE_EVENT = 'DELETE_EVENT',

    // --- Games ---
    /**
     * Action to create a new game.
     * Expects payload: Omit<Game, "id">
     */
    ADD_GAME = 'ADD_GAME',

    /**
     * Action to update a game's status (e.g., SCHEDULED -> LIVE).
     * Expects payload: { id: string, status: GameStatus }
     */
    UPDATE_GAME_STATUS = 'UPDATE_GAME_STATUS',

    /**
     * Action to update a game's score.
     * Expects payload: { id: string, homeScore: number, awayScore: number }
     */
    UPDATE_GAME_SCORE = 'UPDATE_GAME_SCORE',

    /**
     * Action to ingest a new game event (score, penalty, substitution).
     * Expects payload: { gameId: string, initiatorOrgProfileId: string, type: string, subType?: string, eventData?: any, actorOrgProfileId?: string, gameParticipantId?: string }
     */
    ADD_GAME_EVENT = 'ADD_GAME_EVENT',

    /**
     * Action to initiate a consensus vote for an undo.
     * Expects payload: { gameId: string, eventIdToUndo: string, initiatorId: string }
     */
    INITIATE_UNDO_VOTE = 'INITIATE_UNDO_VOTE',

    /**
     * Action to cast a vote on an active undo consensus.
     * Expects payload: { gameId: string, officialId: string, vote: 'APPROVE' | 'REJECT' }
     */
    CAST_UNDO_VOTE = 'CAST_UNDO_VOTE',

    /**
     * Generic action to update game details.
     * Expects payload: { id: string, data: Partial<Game> }
     */
    UPDATE_GAME = 'UPDATE_GAME',

    /**
     * Action to delete a game.
     * Expects payload: { id: string }
     */
    DELETE_GAME = 'DELETE_GAME',

    // --- Org Profiles ---
    /**
     * Action to create a new org profile.
     * Expects payload: Omit<OrgProfile, "id"> & { id?: string }
     */
    ADD_ORG_PROFILE = 'ADD_ORG_PROFILE',

    /**
     * Action to update an existing org profile.
     * Expects payload: { id: string, data: Partial<OrgProfile> }
     */
    UPDATE_ORG_PROFILE = 'UPDATE_ORG_PROFILE',

    /**
     * Action to delete an org profile.
     * Expects payload: { id: string }
     */
    DELETE_ORG_PROFILE = 'DELETE_ORG_PROFILE',

    /**
     * Action to link a user account to an org profile.
     * Expects payload: { email: string, orgProfileId: string }
     */
    LINK_USER_PROFILE = 'LINK_USER_PROFILE',

    // --- Memberships (Organization) ---
    /**
     * Action to add a person to an organization.
     * Expects payload: { orgProfileId: string, orgId: string, roleId: string }
     */
    ADD_ORG_MEMBER = 'ADD_ORG_MEMBER',

    /**
     * Action to update a person's role in an organization.
     * Expects payload: { id: string, roleId: string }
     */
    UPDATE_ORG_MEMBER = 'UPDATE_ORG_MEMBER',

    /**
     * Action to remove a person from an organization.
     * Expects payload: { id: string }
     */
    REMOVE_ORG_MEMBER = 'REMOVE_ORG_MEMBER',

    // --- Memberships (Team) ---
    /**
     * Action to add a person to a team.
     * Expects payload: { orgProfileId: string, teamId: string, roleId: string }
     */
    ADD_TEAM_MEMBER = 'ADD_TEAM_MEMBER',

    /**
     * Action to update a person's role or details in a team.
     * Expects payload: { id: string, data: Partial<TeamMembership> }
     */
    UPDATE_TEAM_MEMBER = 'UPDATE_TEAM_MEMBER',

    /**
     * Action to remove a person from a team.
     * Expects payload: { id: string }
     */
    REMOVE_TEAM_MEMBER = 'REMOVE_TEAM_MEMBER',

    // --- Referrals ---
    /**
     * Action to refer a contact person for an organization.
     * Expects payload: { orgId: string, contactEmail: string, referredByUserId: string }
     */
    REFER_ORG_CONTACT = 'REFER_ORG_CONTACT',

    /**
     * Action to claim an organization via a unique token.
     * Expects payload: { token: string, userId: string }
     */
    CLAIM_ORG_VIA_TOKEN = 'CLAIM_ORG_VIA_TOKEN',

    /**
     * Action to submit a report against an entity.
     * Expects payload: { entityType: string, entityId: string, reason: string, description?: string, reporterUserId: string }
     */
    SUBMIT_REPORT = 'SUBMIT_REPORT',

    // --- Notifications ---
    /**
     * Action to mark a notification as read.
     * Expects payload: { id: string }
     */
    MARK_NOTIFICATION_READ = 'MARK_NOTIFICATION_READ',

    /**
     * Action to mark all notifications for a user as read.
     * Expects payload: { userId: string }
     */
    MARK_ALL_NOTIFICATIONS_READ = 'MARK_ALL_NOTIFICATIONS_READ',

    /**
     * Action to delete a notification.
     * Expects payload: { id: string }
     */
    DELETE_NOTIFICATION = 'DELETE_NOTIFICATION',

    /**
     * Action to decline an organization claim.
     * Expects payload: { token: string }
     */
    DECLINE_CLAIM = 'DECLINE_CLAIM',

    /**
     * Action to refer a contact person for an organization via a token (from an existing referral).
     * Expects payload: { token: string, contactEmails: string[] }
     */
    REFER_ORG_CONTACT_VIA_TOKEN = 'REFER_ORG_CONTACT_VIA_TOKEN',
    /**
     * Action to retrieve all badges earned by a user.
     * Expects payload: { userId: string }
     */
    GET_USER_BADGES = 'GET_USER_BADGES',

    // --- Feed & Home ---
    /**
     * Action to get the personalized home feed for a user.
     * Expects payload: { userId?: string, timezone?: string }
     */
    FEED_GET_HOME = 'FEED_GET_HOME',

    /**
     * Action to subscribe to a lightweight scoreboard feed.
     * Event payload: { gameId: string, status: GameStatus, homeScore: number, awayScore: number }
     */
    GAME_SCORE_UPDATED = 'GAME_SCORE_UPDATED',

    /**
     * Action to signal clients to refresh their global caches/views.
     */
    GLOBAL_CACHE_REFRESH = 'GLOBAL_CACHE_REFRESH',

    /**
     * @deprecated Use GLOBAL_CACHE_REFRESH instead.
     */
    RESET_CACHE = 'RESET_CACHE',
}
