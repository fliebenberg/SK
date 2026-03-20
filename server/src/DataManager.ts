import { organizationManager } from "./managers/OrganizationManager";
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

export class DataManager {
  constructor() {
    console.log("DataManager initialized (Modular Facade)");
  }

  // Permissions
  isAppAdmin = (userId: string) => accessManager.isAppAdmin(userId);
  isOrganizationAdmin = (userId: string, orgId: string) => accessManager.isOrganizationAdmin(userId, orgId);
  canManageTeam = (userId: string, teamId: string) => accessManager.canManageTeam(userId, teamId);

  // Sports
  getSports = () => sportManager.getSports();
  getSport = (id: string) => sportManager.getSport(id);

  // Organizations
  getOrganizations = (params?: any) => organizationManager.getOrganizations(params);
  getOrganization = (id?: string) => organizationManager.getOrganization(id);
  searchSimilarOrganizations = (name: string) => organizationManager.searchSimilarOrganizations(name);
  addOrganization = async (org: any) => {
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

  updateOrganization = (id: string, data: any) => organizationManager.updateOrganization(id, data);
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
  refreshOrgSummary = (id: string) => organizationManager.refreshOrgSummary(id);
  deleteOrganization = (id: string) => organizationManager.deleteOrganization(id);

  // Sites
  getSites = (orgId?: string) => siteManager.getSites(orgId);
  getSite = (id: string) => siteManager.getSite(id);
  addSite = (site: any) => siteManager.addSite(site);
  updateSite = (id: string, data: any) => siteManager.updateSite(id, data);
  deleteSite = (id: string) => siteManager.deleteSite(id);

  // Facilities
  getFacilities = (siteId?: string) => facilityManager.getFacilities(siteId);
  getFacilitiesByOrg = (orgId: string) => facilityManager.getFacilitiesByOrg(orgId);
  getFacility = (id: string) => facilityManager.getFacility(id);
  addFacility = (facility: any) => facilityManager.addFacility(facility);
  updateFacility = (id: string, data: any) => facilityManager.updateFacility(id, data);
  deleteFacility = (id: string) => facilityManager.deleteFacility(id);

  // Teams
  getTeams = (orgId?: string) => teamManager.getTeams(orgId);
  getTeam = (id: string) => teamManager.getTeam(id);
  addTeam = (team: any) => teamManager.addTeam(team);
  updateTeam = (id: string, data: any) => teamManager.updateTeam(id, data);
  deleteTeam = (id: string) => teamManager.deleteTeam(id);
  getTeamRoles = () => teamManager.getTeamRoles();
  getTeamRole = (id: string) => teamManager.getTeamRole(id);

  // Memberships
  getTeamMembers = (teamId: string) => teamManager.getTeamMembers(teamId);
  getTeamMembership = (id: string) => teamManager.getTeamMembership(id);
  addTeamMember = (membership: any) => teamManager.addTeamMember(membership);
  updateTeamMember = (id: string, data: any) => teamManager.updateTeamMember(id, data);
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
  addOrgProfile = (profile: any) => userManager.addOrgProfile(profile);
  updateOrgProfile = (id: string, data: any) => userManager.updateOrgProfile(id, data);
  deleteOrgProfile = (id: string) => userManager.deleteOrgProfile(id);

  // Events
  getEvents = (orgId?: string) => eventManager.getEvents(orgId);
  getEvent = (id: string) => eventManager.getEvent(id);
  addEvent = (event: any) => eventManager.addEvent(event);
  updateEvent = (id: string, data: any) => eventManager.updateEvent(id, data);
  deleteEvent = (id: string) => eventManager.deleteEvent(id);

  // Games
  getGames = (orgId?: string) => eventManager.getGames(orgId);
  getGame = (id: string) => eventManager.getGame(id);
  addGame = (game: any) => eventManager.addGame(game);
  updateGameStatus = (id: string, status: any) => eventManager.updateGameStatus(id, status);
  updateGameClock = (id: string, action: any) => eventManager.updateGameClock(id, action);
  updateGame = (id: string, data: any) => eventManager.updateGame(id, data);
  deleteGame = (id: string) => eventManager.deleteGame(id);
  getLiveGames = () => eventManager.getLiveGames();
  resetGame = (id: string) => eventManager.resetGame(id);
  getGameEvents = (gameId: string, fromSequence?: number, limit?: number) => gameEventManager.getGameEvents(gameId, fromSequence, limit);

  // Search
  searchProfiles = async (query: string, orgId?: string) => {
    let orgDomain = "";
    if (orgId) {
      const org = await organizationManager.getOrganization(orgId);
      if (org) {
        orgDomain = org.shortName || org.name.split(" ")[0].toLowerCase();
      }
    }
    return userManager.searchProfiles(query, orgId, orgDomain);
  };
  
  searchPeople = this.searchProfiles;
  findMatchingUser = (email?: string, name?: string, birthdate?: string) => 
    userManager.findMatchingUser(email, name, birthdate);
  linkUserToProfile = (email: string, orgProfileId: string) => userManager.linkUserToProfile(email, orgProfileId);

  // Referrals
  referOrgContact = (orgId: string, contactEmails: string[], referredByUserId: string) => 
    referralManager.createReferrals(orgId, contactEmails, referredByUserId);
  getReferralsForOrg = (orgId: string) => referralManager.getReferralsForOrg(orgId);
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
  submitReport = (data: any) => reportManager.submitReport(data);
  getReportsForEntity = (entityType: string, entityId: string) => reportManager.getReportsForEntity(entityType, entityId);
  getReports = (type?: string) => reportManager.getReports(type);

  // Feed
  getHomeFeed = (userId?: string, timezone?: string) => feedManager.getHomeFeed(userId, timezone);

  // Cache Invalidation
  invalidateCache = () => {
    organizationManager.invalidateCache();
    console.log("DataManager: All caches invalidated.");
  };
}

export const dataManager = new DataManager();
