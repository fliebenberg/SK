import { Organization, Team, Site, Facility, OrgProfile, Event, Game, ScoreLog, TeamMembership, Sport, OrgMembership, TeamRole, OrganizationRole, Notification } from "@sk/types";
import { BaseStore } from "./BaseStore";

export class StateStore extends BaseStore {
    sports: Sport[] = [];
    teamRoles: TeamRole[] = [];
    organizationRoles: OrganizationRole[] = [];
    organizations: Organization[] = [];
    sites: Site[] = [];
    facilities: Facility[] = [];
    teams: Team[] = [];
    orgProfiles: OrgProfile[] = [];
    teamMemberships: TeamMembership[] = [];
    organizationMemberships: OrgMembership[] = [];
    events: Event[] = [];
    games: Game[] = [];
    scoreLogs: ScoreLog[] = [];
    userOrgMemberships: OrgMembership[] = [];
    userTeamMemberships: any[] = [];
    notifications: Notification[] = [];
    unreadCount: number = 0;
    orgReferrals: any[] = [];
    currentUserId: string | null = null;
    globalRole: string | null = null;
    totalOrganizations: number = 0;
    reports: any[] = [];
    
    protected localOrganizationCache: Organization[] = [];
    protected readonly MAX_LOCAL_ORGS = 1000;

    // Track explicitly missing entities (e.g. 404s)
    missingOrganizations: Set<string> = new Set();
    isOrganizationMissing = (id: string) => this.missingOrganizations.has(id);

    getSports = () => this.sports;
    getSport = (id: string) => this.sports.find(s => s.id === id);
    getTeamRoles = () => this.teamRoles;
    getTeamRole = (id: string) => this.teamRoles.find(r => r.id === id);
    getOrganizationRoles = () => this.organizationRoles;
    getOrganizationRole = (id: string) => this.organizationRoles.find(r => r.id === id);
}
