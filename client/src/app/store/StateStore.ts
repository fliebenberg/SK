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
    myOrgProfileIds: Set<string> = new Set();
    notifications: Notification[] = [];
    unreadCount: number = 0;
    orgReferrals: any[] = [];
    currentUserId: string | null = null;
    globalRole: string | null = null;
    totalOrganizations: number = 0;
    reports: any[] = [];
    
    protected localOrganizationCache: Organization[] = [];
    protected readonly MAX_LOCAL_ORGS = 1000;

    // Track explicitly missing entities (e.g. 404s) by type
    missingEntities: Record<string, Set<string>> = {
        organization: new Set(),
        team: new Set(),
        event: new Set(),
        game: new Set(),
        site: new Set(),
        facility: new Set()
    };

    isMissing = (type: string, id: string) => this.missingEntities[type]?.has(id) || false;
    
    // Legacy helper for organization
    isOrganizationMissing = (id: string) => this.isMissing('organization', id);
    isTeamMissing = (id: string) => this.isMissing('team', id);
    isEventMissing = (id: string) => this.isMissing('event', id);

    clear = () => {
        this.sports = [];
        this.teamRoles = [];
        this.organizationRoles = [];
        this.organizations = [];
        this.sites = [];
        this.facilities = [];
        this.teams = [];
        this.orgProfiles = [];
        this.teamMemberships = [];
        this.organizationMemberships = [];
        this.events = [];
        this.games = [];
        this.scoreLogs = [];
        this.userOrgMemberships = [];
        this.userTeamMemberships = [];
        this.myOrgProfileIds = new Set();
        this.notifications = [];
        this.unreadCount = 0;
        this.orgReferrals = [];
        this.totalOrganizations = 0;
        this.reports = [];
        this.loaded = false;
        Object.keys(this.missingEntities).forEach(type => this.missingEntities[type].clear());
        this.notifyListeners();
    };

    getSports = () => this.sports;
    getSport = (id: string) => this.sports.find(s => s.id === id);
    getTeamRoles = () => this.teamRoles;
    getTeamRole = (id: string) => this.teamRoles.find(r => r.id === id);
    getOrganizationRoles = () => this.organizationRoles;
    getOrganizationRole = (id: string) => this.organizationRoles.find(r => r.id === id);
}
