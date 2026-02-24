
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

    // --- Venues ---
    /**
     * Action to create a new venue.
     * Expects payload: Omit<Venue, "id">
     */
    ADD_VENUE = 'ADD_VENUE',

    /**
     * Action to update an existing venue.
     * Expects payload: { id: string, data: Partial<Venue> }
     */
    UPDATE_VENUE = 'UPDATE_VENUE',

    /**
     * Action to delete a venue.
     * Expects payload: { id: string }
     */
    DELETE_VENUE = 'DELETE_VENUE',

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
     * Generic action to update game details.
     * Expects payload: { id: string, data: Partial<Game> }
     */
    UPDATE_GAME = 'UPDATE_GAME',

    /**
     * Action to delete a game.
     * Expects payload: { id: string }
     */
    DELETE_GAME = 'DELETE_GAME',

    // --- Persons ---
    /**
     * Action to create a new person record.
     * Expects payload: Omit<Person, "id"> & { id?: string }
     */
    ADD_PERSON = 'ADD_PERSON',

    /**
     * Action to update an existing person record.
     * Expects payload: { id: string, data: Partial<Person> }
     */
    UPDATE_PERSON = 'UPDATE_PERSON',

    /**
     * Action to delete a person (soft delete or hard delete depending on implementation).
     * Expects payload: { id: string }
     */
    DELETE_PERSON = 'DELETE_PERSON',

    /**
     * Action to set an organization-specific identifier for a person.
     * Expects payload: { personId: string, organizationId: string, identifier: string }
     */
    SET_PERSON_IDENTIFIER = 'SET_PERSON_IDENTIFIER',

        /**
     * Action to link a user account to a person record.
     * Expects payload: { email: string, personId: string }
     */
    LINK_USER_PERSON = 'LINK_USER_PERSON',

    // --- Memberships (Organization) ---
    /**
     * Action to add a person to an organization.
     * Expects payload: { personId: string, organizationId: string, roleId: string }
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
     * Expects payload: { personId: string, teamId: string, roleId: string }
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
     * Expects payload: { organizationId: string, contactEmail: string, referredByUserId: string }
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
}
