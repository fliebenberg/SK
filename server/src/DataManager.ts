import { organizationManager } from "./managers/OrganizationManager";
import { teamManager } from "./managers/TeamManager";
import { eventManager } from "./managers/EventManager";
import { userManager } from "./managers/UserManager";
import { sportManager } from "./managers/SportManager";
import { accessManager } from "./managers/AccessManager";

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
  addOrganization = (org: any) => organizationManager.addOrganization(org);
  updateOrganization = (id: string, data: any) => organizationManager.updateOrganization(id, data);
  getOrganizationRoles = () => organizationManager.getOrganizationRoles();
  getOrganizationRole = (id: string) => organizationManager.getOrganizationRole(id);

  // Venues
  getVenues = (organizationId?: string) => organizationManager.getVenues(organizationId);
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
  addTeamMember = (membership: any) => teamManager.addTeamMember(membership);
  updateTeamMember = (id: string, data: any) => teamManager.updateTeamMember(id, data);
  removeTeamMember = (membershipId: string) => teamManager.removeTeamMember(membershipId);

  getOrganizationMembers = (organizationId: string) => userManager.getOrganizationMembers(organizationId);
  addOrganizationMember = (personId: string, organizationId: string, roleId: string, id?: string) => 
    userManager.addOrganizationMember(personId, organizationId, roleId, id);
  updateOrganizationMember = (membershipId: string, roleId: string) => 
    userManager.updateOrganizationMember(membershipId, roleId);
  removeOrganizationMember = (membershipId: string) => 
    userManager.removeOrganizationMember(membershipId);

  // Persons
  addPerson = (person: any) => userManager.addPerson(person);
  updatePerson = (id: string, data: any) => userManager.updatePerson(id, data);

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
}

export const dataManager = new DataManager();
