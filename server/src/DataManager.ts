import { 
  organizationManager 
} from "./managers/OrganizationManager";
import { siteManager } from "./managers/SiteManager";
import { facilityManager } from "./managers/FacilityManager";
import { teamManager } from "./managers/TeamManager";
import { eventManager } from "./managers/EventManager";
import { userManager } from "./managers/UserManager";
import { sportManager } from "./managers/SportManager";
import { accessManager } from "./managers/AccessManager";
import { referralManager } from "./managers/ReferralManager";
import { notificationManager } from "./managers/NotificationManager";
import { reportManager } from "./managers/ReportManager";
import { feedManager } from "./managers/FeedManager";
import { gameEventManager } from "./managers/GameEventManager";
import { LeagueManager } from "./managers/LeagueManager";
import { tournamentManager } from "./managers/TournamentManager";

const leagueManager = new LeagueManager();
import { 
  Organization, Site, Facility, Team, TeamMembership, TeamMember, 
  OrgMembership, OrgMember, OrgProfile, Event, Game, GameEvent,
  Report, User, UserBadge, Notification, UserEmail,
  AddOrgPayload, UpdateOrgPayload, AddTeamPayload, UpdateTeamPayload,
  AddSitePayload, UpdateSitePayload, AddFacilityPayload, UpdateFacilityPayload,
  AddEventPayload, UpdateEventPayload, AddGamePayload, UpdateGamePayload,
  AddOrgProfilePayload, UpdateOrgProfilePayload, AddOrgMemberPayload,
  UpdateOrgMemberPayload, AddTeamMemberPayload, UpdateTeamMemberPayload,
  SubmitReportPayload, FeedHomeResponse
} from "@sk/shared";

export class DataManager {
  constructor() {
    console.log("DataManager initialized (Modular Facade)");
  }

  // Permissions
  isAppAdmin = (userId: string) => accessManager.isAppAdmin(userId);
  isOrganizationAdmin = (userId: string, orgId: string) => accessManager.isOrganizationAdmin(userId, orgId);
  canManageTeam = (userId: string, teamId: string) => accessManager.canManageTeam(userId, teamId);
  canEditEventOrGame = (userId: string, requestingOrgId: string, eventId?: string, gameId?: string) => accessManager.canEditEventOrGame(userId, requestingOrgId, eventId, gameId);
  canScoreGame = (userId: string, gameId: string) => accessManager.canScoreGame(userId, gameId);
  isOrgMember = (userId: string, orgId: string) => accessManager.isOrgMember(userId, orgId);
  canOrganizeDivision = (userId: string, divisionId: string) => accessManager.canOrganizeDivision(userId, divisionId);
  getEventCapabilities = (userId: string, eventId: string) => accessManager.getEventCapabilities(userId, eventId);
  getMyGrants = (userId: string) => accessManager.getMyGrants(userId);
  getEventGrants = (userId: string, eventId: string) => accessManager.getEventGrants(userId, eventId);
  getUserIdsForOrgProfile = (orgProfileId: string) => accessManager.getUserIdsForOrgProfile(orgProfileId);
  getEventOrgIds = (eventId: string) => accessManager.getEventOrgIds(eventId);
  resolveGrantingProfile = (userId: string, eventId: string, divisionId?: string) =>
    accessManager.resolveGrantingProfile(userId, eventId, divisionId);
  ownsOrgProfile = (userId: string, orgProfileId: string) => accessManager.ownsOrgProfile(userId, orgProfileId);
  getGameOrgId = (gameId: string) => accessManager.getGameOrgId(gameId);

  // Sports
  getSports = () => sportManager.getSports();
  getSport = (id: string) => sportManager.getSport(id);

  // Organizations
  getOrganizations = (params?: any) => organizationManager.getOrganizations(params);
  getOrganization = (id?: string) => organizationManager.getOrganization(id);
  searchSimilarOrganizations = (name: string) => organizationManager.searchSimilarOrganizations(name);
  addOrganization = async (org: AddOrgPayload): Promise<Organization> => {
    const creatorId = org.creatorId;
    const { creatorId: _, ...orgData } = org;
    // Set isClaimed to true if we have a creatorId (placeholder orgs are unclaimed)
    const isClaimed = !!creatorId || orgData.isClaimed;
    const newOrg = await organizationManager.addOrganization({ ...orgData, creatorId, isClaimed });
    
    if (creatorId) {
      const user = await userManager.getUser(creatorId);
      // Only add as Org Admin if they are NOT a Global Admin
      if (user && user.globalRole !== 'admin' && newOrg.id) {
        const orgProfileId = await userManager.ensureProfileForUserInOrg(user.id, newOrg.id);
        await userManager.addOrganizationMember(orgProfileId, newOrg.id, 'role-org-admin');
      }
    }
    return newOrg;
  };

  updateOrganization = (id: string, data: Partial<Organization>) => organizationManager.updateOrganization(id, data);
  claimOrganization = async (id: string, userId: string) => {
    const org = await organizationManager.getOrganization(id);
    if (!org) throw new Error("Organization not found.");
    if (org.isClaimed) throw new Error("Organization is already claimed.");
    await organizationManager.updateOrganization(id, { isClaimed: true, creatorId: userId });
    
    const user = await userManager.getUser(userId);
    if (user && user.globalRole !== 'admin') {
      const orgProfileId = await userManager.ensureProfileForUserInOrg(userId, id);
      await userManager.addOrganizationMember(orgProfileId, id, 'role-org-admin');
    }
    return organizationManager.getOrganization(id);
  };

  getOrganizationRoles = () => organizationManager.getOrganizationRoles();
  getOrganizationRole = (id: string) => organizationManager.getOrganizationRole(id);
  getOrgSummary = (id: string) => organizationManager.getOrgSummary(id);
  deleteOrganization = (id: string) => organizationManager.deleteOrganization(id);

  // Sites
  getSites = (orgId?: string) => siteManager.getSites(orgId);
  getSite = (id: string) => siteManager.getSite(id);
  addSite = (site: AddSitePayload) => siteManager.addSite(site);
  updateSite = (id: string, data: Partial<Site>) => siteManager.updateSite(id, data);
  deleteSite = (id: string) => siteManager.deleteSite(id);

  // Facilities
  getFacilities = (siteId?: string) => facilityManager.getFacilities(siteId);
  getFacilitiesByOrg = (orgId: string) => facilityManager.getFacilitiesByOrg(orgId);
  getFacility = (id: string) => facilityManager.getFacility(id);
  addFacility = (facility: AddFacilityPayload) => facilityManager.addFacility(facility);
  updateFacility = (id: string, data: Partial<Facility>) => facilityManager.updateFacility(id, data);
  deleteFacility = (id: string) => facilityManager.deleteFacility(id);

  // Teams
  getTeams = (orgId?: string) => teamManager.getTeams(orgId);
  getTeam = (id: string) => teamManager.getTeam(id);
  addTeam = (team: AddTeamPayload) => teamManager.addTeam(team);
  updateTeam = (id: string, data: Partial<Team>) => teamManager.updateTeam(id, data);
  deleteTeam = (id: string) => teamManager.deleteTeam(id);
  getTeamRoles = () => teamManager.getTeamRoles();
  getTeamRole = (id: string) => teamManager.getTeamRole(id);

  // Memberships
  getTeamMembers = (teamId: string) => teamManager.getTeamMembers(teamId);
  getTeamMembership = (id: string) => teamManager.getTeamMembership(id);
  addTeamMember = (membership: TeamMembership) => teamManager.addTeamMember(membership);
  updateTeamMember = (id: string, data: Partial<TeamMembership>) => teamManager.updateTeamMember(id, data);
  removeTeamMember = (membershipId: string) => teamManager.removeTeamMember(membershipId);

  getOrganizationMembers = (orgId: string) => userManager.getOrganizationMembers(orgId);
  getOrgMembership = (id: string) => userManager.getOrgMembership(id);
  addOrganizationMember = (orgProfileId: string, orgId: string, roleId: string, id?: string) => 
    userManager.addOrganizationMember(orgProfileId, orgId, roleId, id);
  updateOrganizationMember = (membershipId: string, roleId: string) => 
    userManager.updateOrganizationMember(membershipId, roleId);
  removeOrganizationMember = (membershipId: string) => 
    userManager.removeOrganizationMember(membershipId);

  getUserOrgMemberships = (userId: string) => userManager.getUserOrgMemberships(userId);
  getUserTeamMemberships = (userId: string) => userManager.getUserTeamMemberships(userId);

  // Org Profiles
  getOrgProfile = (id: string) => userManager.getOrgProfile(id);
  addOrgProfile = (profile: AddOrgProfilePayload) => userManager.addOrgProfile(profile);
  updateOrgProfile = (id: string, data: Partial<OrgProfile>) => userManager.updateOrgProfile(id, data);
  deleteOrgProfile = (id: string) => userManager.deleteOrgProfile(id);

  // Events
  getEvents = (orgId?: string) => eventManager.getEvents(orgId);
  getEvent = (id: string) => eventManager.getEvent(id);
  addEvent = (event: AddEventPayload) => eventManager.addEvent(event);
  updateEvent = (id: string, data: Partial<Event>) => eventManager.updateEvent(id, data);
  deleteEvent = (id: string) => eventManager.deleteEvent(id);

  // Games
  getGames = (orgId?: string) => eventManager.getGames(orgId);
  getGamesByTeam = (teamId: string) => eventManager.getGamesByTeam(teamId);
  getGame = (id: string) => eventManager.getGame(id);
  getGameSummaries = (orgId?: string) => eventManager.getGameSummaries(orgId);
  getGameSummary = (id: string) => eventManager.getGameSummary(id);
  getGameSummariesByEvent = (eventId: string) => eventManager.getGameSummariesByEvent(eventId);
  addGame = (game: AddGamePayload) => eventManager.addGame(game);
  updateGameStatus = (id: string, status: Game['status']) => eventManager.updateGameStatus(id, status);
  updateGameClock = (id: string, action: any) => eventManager.updateGameClock(id, action);
  updateGame = (id: string, data: UpdateGamePayload['data']) => eventManager.updateGame(id, data);
  deleteGame = (id: string) => eventManager.deleteGame(id);
  getLiveGames = () => eventManager.getLiveGames();
  resetGame = (id: string) => eventManager.resetGame(id);
  getGameEvents = (gameId: string, fromSequence?: number, limit?: number) => gameEventManager.getGameEvents(gameId, fromSequence, limit);
  getGameRoster = (participantId: string) => eventManager.getGameRoster(participantId);
  getGameIdForParticipant = (participantId: string) => eventManager.getGameIdForParticipant(participantId);
  saveGameRoster = (gameId: string, participantId: string, items: Array<{ orgProfileId: string, position?: string, isReserve: boolean }>) => eventManager.saveGameRoster(gameId, participantId, items);

  // Search
  /**
   * `lean` defaults to true, and the caller has to *decide* to pass false — the projection is an
   * authorization decision, not a formatting one (`PEOPLE-1`). The socket handler passes false
   * only when the search is scoped to an org the caller belongs to.
   */
  searchProfiles = async (query: string, orgId?: string, options?: { lean?: boolean }) => {
    let orgDomain = "";
    if (orgId) {
      const org = await organizationManager.getOrganization(orgId);
      if (org) {
        orgDomain = org.shortName || org.name.split(" ")[0].toLowerCase();
      }
    }
    return userManager.searchProfiles(query, orgId, orgDomain, { lean: options?.lean !== false });
  };

  searchOrganizerCandidates = (query: string, orgIds?: string[]) =>
    userManager.searchOrganizerCandidates(query, orgIds);
  
  searchPeople = this.searchProfiles;
  findMatchingUser = (email?: string, name?: string, birthdate?: string) => 
    userManager.findMatchingUser(email, name, birthdate);
  linkUserToProfile = (email: string, orgProfileId: string) => userManager.linkUserToProfile(email, orgProfileId);

  // Referrals
  referOrgContact = (orgId: string, contactEmails: string[], referredByUserId: string) => 
    referralManager.createReferrals(orgId, contactEmails, referredByUserId);
  getReferralsForOrg = (orgId: string) => referralManager.getReferralsForOrg(orgId);
  getOrgClaimStatus = (orgId: string, userId: string) => referralManager.getClaimStatus(orgId, userId);
  getReferralsByUser = (userId: string) => referralManager.getReferralsByUser(userId);
  getPendingClaimForUser = (email: string) => referralManager.getPendingClaimForUser(email);
  getClaimInfo = (token: string) => referralManager.getClaimInfo(token);
  claimOrgViaToken = (token: string, userId: string) => referralManager.claimOrgViaToken(token, userId);
  declineClaim = (token: string) => referralManager.declineClaim(token);
  referOrgContactViaToken = (token: string, contactEmails: string[]) => referralManager.referOrgContactViaToken(token, contactEmails);
  getUserBadges = (userId: string) => referralManager.getUserBadges(userId);

  // Notifications
  syncReferralNotifications = async (userId: string) => {
    const emails = await userManager.getVerifiedEmails(userId);
    console.log(`DataManager: Syncing for ${userId}, emails: ${emails.join(', ')}`);
    if (emails.length === 0) return;

    const pendingReferrals = await referralManager.getPendingReferralsByEmails(emails);
    console.log(`DataManager: Found ${pendingReferrals.length} pending referrals`);
    if (pendingReferrals.length === 0) return;

    const existingNotifs = await notificationManager.getNotifications(userId);
    
    for (const ref of pendingReferrals) {
      const link = `/claim?token=${ref.claimToken}`;
      const exists = existingNotifs.some(n => n.type === 'claim_invitation' && n.link === link);
      
      if (!exists) {
        console.log(`DataManager: Creating claim invitation for ${ref.organizationName}`);
        await notificationManager.createNotification(
          userId,
          'Organization Claim Invitation',
          `You have been invited to manage ${ref.organizationName}.`,
          'claim_invitation',
          link
        );
      }
    }
  };

  getNotifications = async (userId: string) => {
    await this.syncReferralNotifications(userId);
    return notificationManager.getNotifications(userId);
  };

  markNotificationAsRead = (id: string) => notificationManager.markAsRead(id);
  markAllNotificationsAsRead = (userId: string) => notificationManager.markAllAsRead(userId);
  deleteNotification = (id: string) => notificationManager.deleteNotification(id);
  createNotification = (userId: string, title: string, message: string, type: string, link?: string) => 
    notificationManager.createNotification(userId, title, message, type, link);

  // Reports
  submitReport = (data: SubmitReportPayload) => reportManager.submitReport(data);
  getReportsForEntity = (entityType: string, entityId: string) => reportManager.getReportsForEntity(entityType, entityId);
  getReports = (type?: string) => reportManager.getReports(type);

  // Feed
  getHomeFeed = (userId?: string, timezone?: string) => feedManager.getHomeFeed(userId, timezone);

  // Cache Invalidation
  invalidateCache = () => {
    organizationManager.invalidateCache();
    console.log("DataManager: All caches invalidated.");
  };

  // Leagues
  getLeagues = (orgId?: string) => leagueManager.getLeagues(orgId);
  getLeague = (id: string) => leagueManager.getLeague(id);
  createLeague = (data: any) => leagueManager.createLeague(data);
  updateLeague = (id: string, data: any) => leagueManager.updateLeague(id, data);
  deleteLeague = (id: string) => leagueManager.deleteLeague(id);

  // Seasons
  getSeasons = (leagueId: string) => leagueManager.getSeasons(leagueId);
  getSeason = (id: string) => leagueManager.getSeason(id);
  createSeason = (data: any) => leagueManager.createSeason(data);
  updateSeason = (id: string, data: any) => leagueManager.updateSeason(id, data);
  deleteSeason = (id: string) => leagueManager.deleteSeason(id);
  getSeasonTeams = (seasonId: string) => leagueManager.getSeasonTeams(seasonId);
  addTeamToSeason = (seasonId: string, teamId: string, status?: any) => leagueManager.addTeamToSeason(seasonId, teamId, status);
  removeTeamFromSeason = (seasonId: string, teamId: string) => leagueManager.removeTeamFromSeason(seasonId, teamId);
  
  // Game Seasons
  addGameToSeason = (gameId: string, seasonId: string) => leagueManager.addGameToSeason(gameId, seasonId);
  removeGameFromSeason = (gameId: string, seasonId: string) => leagueManager.removeGameFromSeason(gameId, seasonId);
  getSeasonGames = (seasonId: string) => leagueManager.getSeasonGames(seasonId);
  getGameSeasons = (gameId: string) => leagueManager.getGameSeasons(gameId);
  recalculateSeasonStandings = (seasonId: string) => leagueManager.recalculateSeasonStandings(seasonId);

  // Tournaments
  getDivisions = (eventId: string) => tournamentManager.getDivisions(eventId);
  getDivision = (id: string) => tournamentManager.getDivision(id);
  getDivisionDetail = (id: string) => tournamentManager.getDivisionDetail(id);
  getDivisionEventId = (id: string) => tournamentManager.getDivisionEventId(id);
  addDivision = (data: any) => tournamentManager.addDivision(data);
  updateDivision = (id: string, data: any) => tournamentManager.updateDivision(id, data);
  deleteDivision = (id: string) => tournamentManager.deleteDivision(id);

  getStages = (divisionId: string) => tournamentManager.getStages(divisionId);
  getStage = (id: string) => tournamentManager.getStage(id);
  getStageEventId = (id: string) => tournamentManager.getStageEventId(id);
  addStage = (data: any) => tournamentManager.addStage(data);
  updateStage = (id: string, data: any) => tournamentManager.updateStage(id, data);
  deleteStage = (id: string) => tournamentManager.deleteStage(id);

  getDivisionEntrants = (divisionId: string) => tournamentManager.getEntrants(divisionId);
  getEventEntrants = (eventId: string) => tournamentManager.getEventEntrants(eventId);
  getEventCandidateTeams = (eventId: string) => tournamentManager.getEventCandidateTeams(eventId);
  setDivisionEntrants = (divisionId: string, entrants: any[]) => tournamentManager.setDivisionEntrants(divisionId, entrants);
  getStageEntrants = (stageId: string) => tournamentManager.getStageEntrants(stageId);
  setStageEntrants = (stageId: string, entrants: any[]) => tournamentManager.setStageEntrants(stageId, entrants);

  generateStageFixtures = (stageId: string, mode: 'create' | 'regenerate', deleteResults?: boolean) =>
    tournamentManager.generateStageFixtures(stageId, mode, deleteResults);
  scheduleStage = (payload: any) => tournamentManager.scheduleStage(payload);
  getStageGames = (stageId: string) => tournamentManager.getStageGames(stageId);
  getDivisionGames = (divisionId: string) => tournamentManager.getDivisionGames(divisionId);

  getDivisionAdjustments = (divisionId: string) => tournamentManager.getAdjustments(divisionId);
  addAdjustment = (data: any) => tournamentManager.addAdjustment(data);
  deleteAdjustment = (id: string) => tournamentManager.deleteAdjustment(id);

  getEventFacilities = (eventId: string) => tournamentManager.getEventFacilities(eventId);
  setEventFacilities = (eventId: string, facilityIds: string[]) => tournamentManager.setEventFacilities(eventId, facilityIds);
  getDivisionFacilities = (divisionId: string) => tournamentManager.getDivisionFacilities(divisionId);
  getEventOrganizers = (eventId: string) => tournamentManager.getEventOrganizers(eventId);
  getDivisionOrganizers = (divisionId: string) => tournamentManager.getDivisionOrganizers(divisionId);
  getEventDivisionOrganizers = (eventId: string) => tournamentManager.getEventDivisionOrganizers(eventId);
  appointOrganizer = (data: any) => tournamentManager.appointOrganizer(data);
  withdrawOrganizer = (data: any) => tournamentManager.withdrawOrganizer(data);
  setDivisionFacilities = (divisionId: string, facilityIds: string[]) =>
    tournamentManager.setDivisionFacilities(divisionId, facilityIds);

  /** The choke point (D30). Every path that changes a result goes through this one function. */
  recalculateForGame = (gameId: string, context?: { stageId?: string | null; eventId?: string | null }) =>
    tournamentManager.recalculateForGame(gameId, context);
  recalculateStandingsForGame = (gameId: string, context?: { stageId?: string | null; eventId?: string | null }) =>
    eventManager.recalculateStandingsForGame(gameId, context);
  getGameStageContext = (gameId: string) => eventManager.getGameStageContext(gameId);
  getDivisionOrgIds = (divisionId: string) => accessManager.getDivisionOrgIds(divisionId);
}

export const dataManager = new DataManager();
