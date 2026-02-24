import { organizationManager } from "./managers/OrganizationManager";
import { teamManager } from "./managers/TeamManager";
import { eventManager } from "./managers/EventManager";
import { userManager } from "./managers/UserManager";
import { sportManager } from "./managers/SportManager";
import { accessManager } from "./managers/AccessManager";
import { referralManager } from "./managers/ReferralManager";
import { notificationManager } from "./managers/NotificationManager";
import { reportManager } from "./managers/ReportManager";
import { feedManager } from "./managers/FeedManager";

export class DataManager {
  constructor() {
    console.log("DataManager initialized (Modular Facade)");
  }

  // Permissions
  isAppAdmin = (userId: string) => accessManager.isAppAdmin(userId);
  isOrganizationAdmin = (userId: string, organizationId: string) => accessManager.isOrganizationAdmin(userId, organizationId);
  canManageTeam = (userId: string, teamId: string) => accessManager.canManageTeam(userId, teamId);

  // Sports
  getSports = () => sportManager.getSports();
  getSport = (id: string) => sportManager.getSport(id);

  // Organizations
  getOrganizations = () => organizationManager.getOrganizations();
  getOrganization = (id?: string) => organizationManager.getOrganization(id);
  searchSimilarOrganizations = (name: string) => organizationManager.searchSimilarOrganizations(name);
  addOrganization = async (org: any) => {
    const creatorId = org.creatorId;
    const { creatorId: _, ...orgData } = org;
    const newOrg = await organizationManager.addOrganization({ ...orgData, creatorId });
    if (creatorId && org.isClaimed) {
      const user = await userManager.getUser(creatorId);
      if (user && newOrg.id) {
        const personId = await userManager.ensurePersonForUserInOrg(user.id, newOrg.id);
        await userManager.addOrganizationMember(personId, newOrg.id, 'role-org-admin');
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
    const personId = await userManager.ensurePersonForUserInOrg(userId, id);
    await userManager.addOrganizationMember(personId, id, 'role-org-admin');
    return organizationManager.getOrganization(id);
  };
  getOrganizationRoles = () => organizationManager.getOrganizationRoles();
  getOrganizationRole = (id: string) => organizationManager.getOrganizationRole(id);
  deleteOrganization = (id: string) => organizationManager.deleteOrganization(id);

  // Venues
  getVenues = (organizationId?: string) => organizationManager.getVenues(organizationId);
  getVenue = (id: string) => organizationManager.getVenue(id);
  addVenue = (venue: any) => organizationManager.addVenue(venue);
  updateVenue = (id: string, data: any) => organizationManager.updateVenue(id, data);
  deleteVenue = (id: string) => organizationManager.deleteVenue(id);

  // Teams
  getTeams = (organizationId?: string) => teamManager.getTeams(organizationId);
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

  getOrganizationMembers = (organizationId: string) => userManager.getOrganizationMembers(organizationId);
  getOrganizationMembership = (id: string) => userManager.getOrganizationMembership(id);
  addOrganizationMember = (personId: string, organizationId: string, roleId: string, id?: string) => 
    userManager.addOrganizationMember(personId, organizationId, roleId, id);
  updateOrganizationMember = (membershipId: string, roleId: string) => 
    userManager.updateOrganizationMember(membershipId, roleId);
  removeOrganizationMember = (membershipId: string) => 
    userManager.removeOrganizationMember(membershipId);

  getUserOrgMemberships = (userId: string) => userManager.getUserOrgMemberships(userId);
  getUserTeamMemberships = (userId: string) => userManager.getUserTeamMemberships(userId);

  // Persons
  addPerson = (person: any) => userManager.addPerson(person);
  updatePerson = (id: string, data: any) => userManager.updatePerson(id, data);
  deletePerson = (id: string) => userManager.deletePerson(id);
  getPersonIdentifiers = (personId: string) => userManager.getPersonIdentifiers(personId);
  setPersonIdentifier = (personId: string, orgId: string, identifier: string) => 
    userManager.setPersonIdentifier(personId, orgId, identifier);

  // Events
  getEvents = (organizationId?: string) => eventManager.getEvents(organizationId);
  getEvent = (id: string) => eventManager.getEvent(id);
  addEvent = (event: any) => eventManager.addEvent(event);
  updateEvent = (id: string, data: any) => eventManager.updateEvent(id, data);
  deleteEvent = (id: string) => eventManager.deleteEvent(id);

  // Games
  getGames = (organizationId?: string) => eventManager.getGames(organizationId);
  getGame = (id: string) => eventManager.getGame(id);
  addGame = (game: any) => eventManager.addGame(game);
  updateGameStatus = (id: string, status: any) => eventManager.updateGameStatus(id, status);
  updateScore = (id: string, homeScore: number, awayScore: number) => eventManager.updateScore(id, homeScore, awayScore);
  updateGame = (id: string, data: any) => eventManager.updateGame(id, data);
  deleteGame = (id: string) => eventManager.deleteGame(id);
  getLiveGames = () => eventManager.getLiveGames();

  // Search
  searchPeople = async (query: string, organizationId?: string) => {
    let orgDomain = "";
    if (organizationId) {
      const org = await organizationManager.getOrganization(organizationId);
      if (org) {
        orgDomain = org.shortName || org.name.split(" ")[0].toLowerCase();
      }
    }
    return userManager.searchPeople(query, organizationId, orgDomain);
  };
  findMatchingUser = (email?: string, name?: string, birthdate?: string) => 
    userManager.findMatchingUser(email, name, birthdate);
  linkUserToPerson = (email: string, personId: string) => userManager.linkUserToPerson(email, personId);

  // Referrals
  referOrgContact = (organizationId: string, contactEmails: string[], referredByUserId: string) => 
    referralManager.createReferrals(organizationId, contactEmails, referredByUserId);
  getReferralsForOrg = (organizationId: string) => referralManager.getReferralsForOrg(organizationId);
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
    if (emails.length === 0) return;

    const pendingReferrals = await referralManager.getPendingReferralsByEmails(emails);
    if (pendingReferrals.length === 0) return;

    const existingNotifs = await notificationManager.getNotifications(userId);
    
    for (const ref of pendingReferrals) {
      const link = `/claim?token=${ref.claimToken}`;
      const exists = existingNotifs.some(n => n.type === 'claim_invitation' && n.link === link);
      
      if (!exists) {
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

  // Feed
  getHomeFeed = (userId?: string, timezone?: string) => feedManager.getHomeFeed(userId, timezone);
}

export const dataManager = new DataManager();
