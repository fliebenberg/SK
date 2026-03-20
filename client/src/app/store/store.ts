import { Team, Site, Facility, Event, Game, SocketAction, Notification, Sport, OrgMembership, TeamMembership, Organization, GameEvent } from "@sk/types";
import { socket, socketService } from "../../lib/socketService";
import { UserStore } from "./UserStore";

class Store extends UserStore {
    constructor() {
        super();
        if (typeof window !== 'undefined') {
            console.log("Store initialized, connecting socket...");
            socketService.connect();
            this.setupListeners();
        }
    }

    private setupListeners() {
        const onConnect = () => {
            console.log("Store connected to server");
            this.connected = true;
            
            // Re-subscribe to active entities if re-connecting
            socket.emit('subscribe', 'org_memberships');
            this.activeTeamSubscriptions.forEach(id => socket.emit('join_room', `team:${id}`));
            this.activeOrgSubscriptions.forEach(id => socket.emit('join_room', `org:${id}:members`));
            this.activeOrgDataSubscriptions.forEach(id => {
                socket.emit('join_room', `org:${id}:teams`);
                socket.emit('join_room', `org:${id}:sites`);
                socket.emit('join_room', `org:${id}:events`);
            });
            this.activeOrgSummarySubscriptions.forEach(id => socket.emit('join_room', `org:${id}:summary`));
            this.activeEventSubscriptions.forEach(id => socket.emit('join_room', `event:${id}`));
            this.activeSiteSubscriptions.forEach(id => socket.emit('join_room', `site:${id}`));
            this.activeFacilitySubscriptions.forEach(id => socket.emit('join_room', `facility:${id}`));
            this.activeGameSubscriptions.forEach(id => socket.emit('join_room', `game:${id}`));
            
            this.notifyListeners();
            this.fetchAllData();
        };

        if (socket.connected) onConnect();
        socket.on('connect', onConnect);
        socket.on('disconnect', () => { this.connected = false; this.notifyListeners(); });
        socket.on('connect_error', (err) => { this.connected = false; this.notifyListeners(); });
        socket.on('update', (event: { type: string, data: any }) => this.handleUpdate(event));
    }

    private fetchAllData() {
        Promise.all([
            new Promise(res => socket.emit('get_data', { type: 'sports' }, (data: Sport[]) => { if(data) this.sports = data; res(data); })),
            new Promise(res => socket.emit('get_data', { type: 'roles' }, (data: any) => { 
                if(data) { this.teamRoles = data.team; this.organizationRoles = data.org; }
                res(data); 
            })),
        ]).then(() => {
            console.log("Store: Initial metadata loaded");
            this.loaded = true;
            this.notifyListeners();
        });
    }

    private handleUpdate(event: { type: string, data: any }) {
        switch(event.type) {
            case 'TEAM_ADDED':
            case 'TEAM_UPDATED': this.mergeTeam(event.data as Team); break;
            case 'TEAM_DELETED':
                this.teams = this.teams.filter(t => t.id !== event.data.id);
                this.teamMemberships = this.teamMemberships.filter(m => m.teamId !== event.data.id);
                break;
            case 'SITE_ADDED':
            case 'SITE_UPDATED': this.mergeSite(event.data as Site); break;
            case 'SITE_DELETED': this.sites = this.sites.filter(s => s.id !== event.data.id); break;
            case 'FACILITY_ADDED':
            case 'FACILITY_UPDATED': this.mergeFacility(event.data as Facility); break;
            case 'FACILITY_DELETED': this.facilities = this.facilities.filter(f => f.id !== event.data.id); break;
            case 'NOTIFICATION_ADDED':
            case 'NOTIFICATION_UPDATED': this.mergeNotification(event.data as Notification); break;
            case 'NOTIFICATION_DELETED':
                this.notifications = this.notifications.filter(n => n.id !== event.data.id);
                this.updateUnreadCount();
                break;
            case 'NOTIFICATIONS_SYNC': this.updateUnreadCount(); break;
            case 'ORG_REFERRALS_SYNC': this.orgReferrals = event.data; break;
            case 'ORG_REFERRAL_ADDED': this.mergeReferral(event.data); break;
            case 'GAME_ADDED':
            case 'GAME_UPDATED': this.mergeGame(event.data as Game); break;
            case 'GAME_EVENT_ADDED': this.mergeGameEvent(event.data as GameEvent); break;
            case 'GAME_EVENTS_SYNC': this.mergeEvents(event.data as GameEvent[]); break;
            case 'GAME_RESET': this.handleGameReset(event.data.gameId); break;
            case 'GAME_DELETED': this.games = this.games.filter(g => g.id !== event.data.id); break;
            case 'EVENT_ADDED':
            case 'EVENT_UPDATED': this.mergeEvent(event.data as Event); break;
            case 'EVENT_DELETED': this.events = this.events.filter(e => e.id !== event.data.id); break;
            case 'ORGANIZATION_UPDATED': this.mergeOrganization(event.data as Organization); break;
            case 'USER_MEMBERSHIPS_UPDATED': if (this.currentUserId) this.fetchUserMemberships(this.currentUserId); break;
            case 'ENTITY_NOT_FOUND':
                if (event.data && event.data.type === 'organization') {
                    this.missingOrganizations.add(event.data.id);
                }
                break;
            
            // --- SYNC Events ---
            case 'ORG_MEMBERS_SYNC':
                event.data.forEach((item: any) => {
                    this.mergeOrgProfile({ id: item.id, name: item.name, orgId: item.orgId });
                    this.mergeOrgMembership({ id: item.membershipId, orgProfileId: item.id, orgId: item.orgId, roleId: item.roleId, startDate: item.startDate, endDate: item.endDate });
                });
                break;
            case 'TEAMS_SYNC': event.data.forEach((t: Team) => this.mergeTeam(t)); break;
            case 'SITES_SYNC': event.data.forEach((s: Site) => this.mergeSite(s)); break;
            case 'FACILITIES_SYNC': event.data.forEach((f: Facility) => this.mergeFacility(f)); break;
            case 'EVENTS_SYNC': event.data.forEach((e: Event) => this.mergeEvent(e)); break;
            case 'GAMES_SYNC': event.data.forEach((g: Game) => this.mergeGame(g)); break;
            case 'ORGANIZATION_SYNC': this.mergeOrganization(event.data); break;
            case 'ORGANIZATIONS_SYNC': this.organizations = event.data; break;
            case 'TEAM_MEMBERS_SYNC':
                event.data.forEach((item: any) => {
                    this.mergeOrgProfile({ id: item.id, name: item.name });
                    this.mergeTeamMembership({ id: item.membershipId, orgProfileId: item.id, teamId: item.teamId, roleId: item.roleId, startDate: item.startDate, endDate: item.endDate });
                });
                break;
            case 'GLOBAL_CACHE_REFRESH':
                this.organizations = [];
                this.localOrganizationCache = [];
                this.totalOrganizations = 0;
                break;
            case 'ORG_MEMBER_UPDATED':
            case 'TEAM_MEMBER_UPDATED':
                const raw = event.data;
                if (raw.name) {
                     this.mergeOrgProfile({ id: raw.id, name: raw.name });
                     if (raw.membershipId) {
                         this.mergeTeamMembership({ id: raw.membershipId, orgProfileId: raw.id, roleId: raw.roleId, teamId: raw.teamId || this.findTeamIdForMembership(raw.membershipId), startDate: raw.startDate, endDate: raw.endDate });
                     } else if (raw.orgId) {
                         this.mergeOrgMembership({ id: raw.id, orgProfileId: raw.orgProfileId, roleId: raw.roleId, orgId: raw.orgId });
                     }
                } else if (raw.teamId) this.mergeTeamMembership(raw as TeamMembership);
                else if (raw.orgId) this.mergeOrgMembership(raw as OrgMembership);
                break;
            case 'ORG_MEMBERS_UPDATED':
                const rawOrg = event.data;
                if (rawOrg.name) {
                    this.mergeOrgProfile({ id: rawOrg.id, name: rawOrg.name, orgId: rawOrg.orgId });
                    if (rawOrg.membershipId) this.mergeOrgMembership({ id: rawOrg.membershipId, orgProfileId: rawOrg.id, orgId: rawOrg.orgId, roleId: rawOrg.roleId, startDate: rawOrg.startDate, endDate: rawOrg.endDate });
                } else this.mergeOrgMembership(rawOrg as OrgMembership);
                break;
        }
        this.notifyListeners();
    }
}

const globalForStore = globalThis as unknown as { store_v10: Store };
export const store = globalForStore.store_v10 || new Store();
if (process.env.NODE_ENV !== "production") globalForStore.store_v10 = store;
