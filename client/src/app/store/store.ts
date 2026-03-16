import { Organization, Team, Site, Facility, OrgProfile, User, Event, Game, ScoreLog, TeamMembership, Sport, OrgMembership, TeamRole, OrganizationRole, SocketAction, Notification, UserBadge, levenshtein } from "@sk/types";
import { socket, socketService } from "../../lib/socketService";

  const MOCK_ORG_ID = "org-1";

  class Store {
    sports: Sport[] = [];
    teamRoles: TeamRole[] = [];
    organizationRoles: OrganizationRole[] = [];
    organizations: Organization[] = [];
    sites: Site[] = [];
    facilities: Facility[] = [];
    teams: Team[] = [];
    // These now act as a cache for subscribed data, not global state
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
    totalOrganizations: number = 0;
    reports: any[] = [];
    
    private localOrganizationCache: Organization[] = [];
    private readonly MAX_LOCAL_ORGS = 1000;
    loaded: boolean = false;
    connected: boolean = false;
    listeners: (() => void)[] = [];
    
    // Track active subscriptions to avoid duplicates
    activeTeamSubscriptions: Set<string> = new Set();
    activeOrgSubscriptions: Set<string> = new Set();
    activeOrgDataSubscriptions: Set<string> = new Set(); // New set for data
    activeOrgSummarySubscriptions: Set<string> = new Set(); // New set for lightweight summaries
    activeEventSubscriptions: Set<string> = new Set();
    activeSiteSubscriptions: Set<string> = new Set();
    activeFacilitySubscriptions: Set<string> = new Set();
    activeGameSubscriptions: Set<string> = new Set();
    activeOrgReferralSubscriptions: Set<string> = new Set();

    // Track explicitly missing entities (e.g. 404s)
    missingOrganizations: Set<string> = new Set();

    constructor() {
        if (typeof window !== 'undefined') {
            console.log("Store initialized, connecting socket...");
            socketService.connect();

            this.setupListeners();
        }
    }

    isLoaded = () => this.loaded;
    isConnected = () => this.connected;
    isOrganizationMissing = (id: string) => this.missingOrganizations.has(id);

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => this.unsubscribe(listener);
    }

    unsubscribe(listener: () => void) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    private notifyListeners() {
        this.listeners.forEach(l => l());
    }
    
    // NEW: Granular Subscription Methods
    subscribeToTeamData(teamId: string) {
        const key = `team:${teamId}`;
        if (this.cancelUnsubscribe(key)) return;

        if (this.activeTeamSubscriptions.has(teamId)) return;
        
        console.log(`Store: Subscribing to team ${teamId}`);
        this.activeTeamSubscriptions.add(teamId);
        socket.emit('join_room', `team:${teamId}`);
        
        // Removed manual data fetch, server pushes TEAMS_SYNC and TEAM_MEMBERS_SYNC
    }
    
    unsubscribeFromTeamData(teamId: string) {
        const key = `team:${teamId}`;
        this.scheduleUnsubscribe(key, () => {
            if (!this.activeTeamSubscriptions.has(teamId)) return;
            
            console.log(`Store: Unsubscribing from team ${teamId}`);
            this.activeTeamSubscriptions.delete(teamId);
            socket.emit('leave_room', `team:${teamId}`);
        });
    }

    subscribeToOrganization(orgId: string) {
        const key = `org:${orgId}:members`;
        if (this.cancelUnsubscribe(key)) return;

        if (this.activeOrgSubscriptions.has(orgId)) return;

        console.log(`Store: Subscribing to organization ${orgId} members`);
        this.activeOrgSubscriptions.add(orgId);
        socket.emit('join_room', `org:${orgId}:members`);

        socket.emit('get_data', { type: 'org_members', orgId }, (data: any[]) => {
            // Deprecated: Server now pushes ORG_MEMBERS_SYNC on join
            if (data) {
                 // Open to keeping this as a fallback or removing entirely. 
                 // Removing the logic body to rely on push.
                 console.log(`Store: (Deprecated) Manual fetch for org ${orgId} members returned ${data.length} items.`);
            }
        });
    }

    subscribeToNotifications(userId: string) {
        if (!userId) return;
        const key = `user:${userId}:notifications`;
        if (this.cancelUnsubscribe(key)) return;

        console.log(`Store: Subscribing to notifications for user ${userId}`);
        socket.emit('join_room', `user:${userId}`);
    }

    unsubscribeFromNotifications(userId: string) {
        if (!userId) return;
        const key = `user:${userId}:notifications`;
        this.scheduleUnsubscribe(key, () => {
            console.log(`Store: Unsubscribing from notifications for user ${userId}`);
            socket.emit('leave_room', `user:${userId}`);
        });
    }

    subscribeToOrgReferrals(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:referrals`;
        if (this.cancelUnsubscribe(key)) return;

        if (this.activeOrgReferralSubscriptions.has(orgId)) return;

        console.log(`Store: Subscribing to organization ${orgId} referrals`);
        this.activeOrgReferralSubscriptions.add(orgId);
        socket.emit('join_room', `org:${orgId}:referrals`);
    }

    unsubscribeFromOrgReferrals(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:referrals`;
        this.scheduleUnsubscribe(key, () => {
            if (!this.activeOrgReferralSubscriptions.has(orgId)) return;

            console.log(`Store: Unsubscribing from organization ${orgId} referrals`);
            this.activeOrgReferralSubscriptions.delete(orgId);
            socket.emit('leave_room', `org:${orgId}:referrals`);
        });
    }

    unsubscribeFromOrganization(orgId: string) {
        const key = `org:${orgId}:members`;
        this.scheduleUnsubscribe(key, () => {
            if (!this.activeOrgSubscriptions.has(orgId)) return;

            console.log(`Store: Unsubscribing from organization ${orgId} members`);
            this.activeOrgSubscriptions.delete(orgId);
            socket.emit('leave_room', `org:${orgId}:members`);
        });
    }

    // Subscription Timer Management
    private unsubscribeTimers: Map<string, NodeJS.Timeout> = new Map();
    private readonly DEBOUNCE_MS = 2 * 60 * 1000; // 2 minutes

    private cancelUnsubscribe(key: string) {
        if (this.unsubscribeTimers.has(key)) {
            console.log(`Store: Cancelling pending unsubscribe for ${key}`);
            clearTimeout(this.unsubscribeTimers.get(key));
            this.unsubscribeTimers.delete(key);
            return true;
        }
        return false;
    }

    private scheduleUnsubscribe(key: string, callback: () => void) {
        // Clear existing if any (refresh timer)
        this.cancelUnsubscribe(key);
        
        console.log(`Store: Scheduling unsubscribe for ${key} in ${this.DEBOUNCE_MS/1000}s`);
        const timer = setTimeout(() => {
            console.log(`Store: Executing unsubscribe for ${key}`);
            callback();
            this.unsubscribeTimers.delete(key);
        }, this.DEBOUNCE_MS);
        
        this.unsubscribeTimers.set(key, timer);
    }

    subscribeToOrganizationData(orgId: string) {
        if (!orgId) return;
        
        const key = `org:${orgId}:data`;
        
        // If we were about to unsubscribe, just cancel it and we are done.
        // We are already subscribed and data is in store.
        if (this.cancelUnsubscribe(key)) {
             return;
        }

        // Sentinel check: If we are already subscribed (and no timer was running), do nothing.
        // We need a way to track "data" subscription specifically if it differs from other sets.
        // We reused activeOrgSubscriptions for members? No, activeOrgSubscriptions is for MEMBERS.
        // Let's rely on checking the socket rooms? No, store doesn't know.
        // Let's add a set for data.
        if (this.activeOrgDataSubscriptions.has(orgId)) return;

        console.log(`Store: Subscribing to organization ${orgId} data (teams/sites)`);
        this.activeOrgDataSubscriptions.add(orgId);
        
        socket.emit('join_room', `org:${orgId}:teams`);
        socket.emit('join_room', `org:${orgId}:sites`);
        socket.emit('join_room', `org:${orgId}:facilities`);
        socket.emit('join_room', `org:${orgId}:events`);
        socket.emit('join_room', `org:${orgId}:games`);

        // Removed manual fetches as server now pushes data on join
    }

    unsubscribeFromOrganizationData(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:data`;

        this.scheduleUnsubscribe(key, () => {
            if (!this.activeOrgDataSubscriptions.has(orgId)) return;

            console.log(`Store: Unsubscribing from organization ${orgId} data`);
            this.activeOrgDataSubscriptions.delete(orgId);
            socket.emit('leave_room', `org:${orgId}:teams`);
            socket.emit('leave_room', `org:${orgId}:sites`);
            socket.emit('leave_room', `org:${orgId}:facilities`);
            socket.emit('leave_room', `org:${orgId}:events`);
            socket.emit('leave_room', `org:${orgId}:games`);
        });
    }

    subscribeToOrganizationSummary(orgId: string) {
        if (!orgId) return;
        
        const key = `org:${orgId}:summary`;
        if (this.cancelUnsubscribe(key)) return;

        if (this.activeOrgSummarySubscriptions.has(orgId)) return;

        console.log(`Store: Subscribing to organization ${orgId} summary (lightweight)`);
        this.activeOrgSummarySubscriptions.add(orgId);
        
        socket.emit('join_room', `org:${orgId}:summary`);

        // Fetch just the organization metadata initially -> Handled by ORGANIZATION_SYNC on join
    }

    subscribeToOrganizationSummaries(orgIds: string[]) {
        if (!orgIds || orgIds.length === 0) return;
        console.log(`Store: Batch subscribing to ${orgIds.length} organization summaries`);
        
        const newIds = orgIds.filter(id => !this.activeOrgSummarySubscriptions.has(id));
        if (newIds.length === 0) return;

        newIds.forEach(id => {
            this.activeOrgSummarySubscriptions.add(id);
        });

        // Use a single emit for batch join if the server supported it, 
        // but for now we'll just loop join_room to stay compatible with the current server logic
        // which handles join_room string by string.
        newIds.forEach(id => socket.emit('join_room', `org:${id}:summary`));
    }

    unsubscribeFromOrganizationSummary(orgId: string) {
        if (!orgId) return;
        const key = `org:${orgId}:summary`;

        this.scheduleUnsubscribe(key, () => {
            if (!this.activeOrgSummarySubscriptions.has(orgId)) return;

            console.log(`Store: Unsubscribing from organization ${orgId} summary`);
            this.activeOrgSummarySubscriptions.delete(orgId);
            socket.emit('leave_room', `org:${orgId}:summary`);
        });
    }

    unsubscribeFromOrganizationSummaries(orgIds: string[]) {
        if (!orgIds || orgIds.length === 0) return;
        console.log(`Store: Batch unsubscribing from ${orgIds.length} organization summaries`);
        
        orgIds.forEach(id => {
            const key = `org:${id}:summary`;
            this.scheduleUnsubscribe(key, () => {
                if (!this.activeOrgSummarySubscriptions.has(id)) return;
                this.activeOrgSummarySubscriptions.delete(id);
                socket.emit('leave_room', `org:${id}:summary`);
            });
        });
    }

    unsubscribeFromAllOrganizationSummaries() {
        console.log("Store: Unsubscribing from all organization summaries");
        this.unsubscribeFromOrganizationSummaries(Array.from(this.activeOrgSummarySubscriptions));
    }

    subscribeToSite(siteId: string) {
        if (!siteId || siteId === 'default' || this.activeSiteSubscriptions.has(siteId)) return;
        this.activeSiteSubscriptions.add(siteId);
        socket.emit('join_room', `site:${siteId}`);
    }
    subscribeToFacility(facilityId: string) {
        if (!facilityId || facilityId === 'default' || this.activeFacilitySubscriptions.has(facilityId)) return;
        this.activeFacilitySubscriptions.add(facilityId);
        socket.emit('join_room', `facility:${facilityId}`);
    }

    subscribeToEvent(eventId: string) {
        if (!eventId || this.activeEventSubscriptions.has(eventId)) return;
        this.activeEventSubscriptions.add(eventId);
        socket.emit('join_room', `event:${eventId}`);
    }

    subscribeToGame(gameId: string) {
        if (!gameId || this.activeGameSubscriptions.has(gameId)) return;
        this.activeGameSubscriptions.add(gameId);
        socket.emit('join_room', `game:${gameId}`);
    }

    unsubscribeFromEvent(eventId: string) {
        if (!this.activeEventSubscriptions.has(eventId)) return;
        this.activeEventSubscriptions.delete(eventId);
        socket.emit('leave_room', `event:${eventId}`);
    }

    unsubscribeFromSite(siteId: string) {
        if (!this.activeSiteSubscriptions.has(siteId)) return;
        this.activeSiteSubscriptions.delete(siteId);
        socket.emit('leave_room', `site:${siteId}`);
    }
    unsubscribeFromFacility(facilityId: string) {
        if (!this.activeFacilitySubscriptions.has(facilityId)) return;
        this.activeFacilitySubscriptions.delete(facilityId);
        socket.emit('leave_room', `facility:${facilityId}`);
    }

    unsubscribeFromGame(gameId: string) {
        if (!this.activeGameSubscriptions.has(gameId)) return;
        this.activeGameSubscriptions.delete(gameId);
        socket.emit('leave_room', `game:${gameId}`);
    }

    subscribeToLiveGames() {
        // We track a "live games" view subscription
        const key = 'view:live_games';
        if (this.cancelUnsubscribe(key)) return;
        
        console.log("Store: Subscribing to Live Games View");
        this.fetchLiveGames();
    }

    unsubscribeFromLiveGames() {
        const key = 'view:live_games';
        this.scheduleUnsubscribe(key, () => {
             console.log("Store: Unsubscribing from Live Games View");
             // Leave all currently tracked game rooms? 
             // Or just let them be cleaned up if we track them individually?
             // Ideally we should leave them to save resources.
             this.games.forEach(g => {
                 socket.emit('leave_room', `game:${g.id}`);
                 this.activeGameSubscriptions.delete(g.id);
             });
             // We keep the data in store, but stop listening for updates
        });
    }

    fetchLiveGames() {
        socket.emit('get_live_games', {}, (games: Game[]) => {
            if (games) {
                console.log(`Store: Fetched ${games.length} live/upcoming games`);
                this.games = games; // Replace current cache or merge? Replace for "Live View" context.
                // Subscribe to each game for updates
                games.forEach(g => {
                    this.mergeGame(g);
                    if (!this.activeGameSubscriptions.has(g.id)) {
                        this.activeGameSubscriptions.add(g.id);
                        socket.emit('join_room', `game:${g.id}`);
                    }
                });
                this.notifyListeners();
            }
        });
    }

    fetchOrganizations(page = 1, limit = 10, search = '', isClaimed?: boolean) {
        console.log(`Store: Fetching organizations (page: ${page}, limit: ${limit}, search: ${search}, isClaimed: ${isClaimed})`);
        socket.emit('get_data', { type: 'organizations', page, limit, search, isClaimed }, (res: any) => { 
            if(res && res.items) {
                // Determine which orgs we are leaving (the ones on the previous page that aren't on this page)
                const currentIds = new Set(this.organizations.map(o => o.id));
                const nextIds = new Set(res.items.map((o: any) => o.id));
                const toLeave = Array.from(currentIds).filter(id => !nextIds.has(id));
                
                this.unsubscribeFromOrganizationSummaries(toLeave);

                this.organizations = res.items;
                this.totalOrganizations = res.total;
                
                // Automatically subscribe to summaries for currently visible orgs
                this.subscribeToOrganizationSummaries(res.items.map((org: any) => org.id));
                this.notifyListeners();
            }
        });
    }

    fetchReports(entityType?: string) {
        if (!this.currentUserId) return;
        socket.emit('get_data', { type: 'reports', id: this.currentUserId, entityType }, (data: any[]) => {
            if (data) {
                this.reports = data;
                this.notifyListeners();
            }
        });
    }


    private setupListeners() {
        const onConnect = () => {
            console.log("Store connected to server");
            this.connected = true;
            
            // Subscribe to GLOBAL configuration channels only
            // socket.emit('subscribe', 'teams'); // Moved to per-org subscription
            // socket.emit('subscribe', 'venues'); // Moved to per-org subscription
            // socket.emit('subscribe', 'games'); // Moved to on-demand (Live Page)
            // socket.emit('subscribe', 'persons'); // Removed Global Subs
            // socket.emit('subscribe', 'team_memberships'); // Removed Global Subs
            socket.emit('subscribe', 'org_memberships');
            // socket.emit('subscribe', 'organizations'); // Moved to on-demand (Organizations Page)
            
            // Re-subscribe to active entities if re-connecting
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
            
            // Note: Org subscriptions will be re-established by fetchAllData which is called below

            this.notifyListeners();
            this.fetchAllData();
        };

        if (socket.connected) {
            onConnect();
        }

        socket.on('connect', onConnect);

        socket.on('disconnect', () => {
            console.log("Store disconnected");
            this.connected = false;
            this.notifyListeners();
        });

        socket.on('connect_error', (err) => {
            console.log("Store connection error", err);
            this.connected = false;
            this.notifyListeners();
        });

        socket.on('update', (event: { type: string, data: any }) => {
            console.log("Store received update:", event.type, event.data);
            this.handleUpdate(event);
        });
    }

    private fetchAllData() {
        // Fetch static metadata that doesn't track real-time rooms (yet)
        
        socket.emit('get_data', { type: 'sports' }, (data: Sport[]) => { 
            if(data) {
                 this.sports = data;
                 this.notifyListeners();
            }
        });
        socket.emit('get_data', { type: 'roles' }, (data: any) => { 
            if(data) {
                this.teamRoles = data.team;
                this.organizationRoles = data.org;
                this.notifyListeners();
            }
        });

        // Dynamic data (organizations, games, etc.) is now handled by 
        // explicit subscriptions in onConnect -> socket.emit('subscribe', ...)
        // which triggers Push-on-Subscribe logic.

        // After initial metadata is fetched, mark the store as loaded
        Promise.all([
            new Promise(res => socket.emit('get_data', { type: 'sports' }, res)),
            new Promise(res => socket.emit('get_data', { type: 'roles' }, res)),
        ]).then(() => {
            console.log("Store: Initial metadata loaded");
            this.loaded = true;
            this.notifyListeners();
        });
    }

    private handleUpdate(event: { type: string, data: any }) {
        switch(event.type) {
            case 'TEAM_ADDED':
                this.mergeTeam(event.data as Team);
                break;
            case 'TEAM_UPDATED': 
                this.mergeTeam(event.data as Team);
                break;
            case 'SITE_ADDED':
                this.mergeSite(event.data as Site);
                break;
            case 'FACILITY_ADDED':
                this.mergeFacility(event.data as Facility);
                break;
            case 'NOTIFICATION_ADDED':
                this.mergeNotification(event.data as Notification);
                break;
            case 'NOTIFICATION_UPDATED':
                this.mergeNotification(event.data as Notification);
                break;
            case 'NOTIFICATION_DELETED':
                this.notifications = this.notifications.filter(n => n.id !== event.data.id);
                this.updateUnreadCount();
                this.notifyListeners();
                break;
            case 'NOTIFICATIONS_SYNC':
                console.log(`Store: Received NOTIFICATIONS_SYNC with ${event.data.length} notifications`);
                this.updateUnreadCount();
                break;
            case 'ORG_REFERRALS_SYNC':
                console.log(`Store: Received ORG_REFERRALS_SYNC with ${event.data.length} referrals`);
                this.orgReferrals = event.data;
                this.notifyListeners();
                break;
            case 'ORG_REFERRAL_ADDED':
                console.log(`Store: Received ORG_REFERRAL_ADDED for org ${event.data.orgId}`);
                this.mergeReferral(event.data);
                break;
            case 'SITE_UPDATED':
                this.mergeSite(event.data as Site);
                break;
            case 'SITE_DELETED':
                this.sites = this.sites.filter(s => s.id !== event.data.id);
                break;
            case 'FACILITY_UPDATED':
                this.mergeFacility(event.data as Facility);
                break;
            case 'FACILITY_DELETED':
                this.facilities = this.facilities.filter(f => f.id !== event.data.id);
                break;
            case 'GAMES_UPDATED':
                this.mergeGame(event.data as Game);
                break;
            case 'EVENT_ADDED':
            case 'EVENT_UPDATED':
                this.mergeEvent(event.data as Event);
                break;
            case 'EVENT_DELETED':
                this.events = this.events.filter(e => e.id !== event.data.id);
                break;
            // PERSONS_UPDATED removed
            case 'TEAM_MEMBERS_UPDATED':
                const raw = event.data;
                // Check if this is an enriched object (contains Person fields) or standard membership
                if (raw.name) {
                     // 1. Merge the OrgProfile data
                     this.mergeOrgProfile({ id: raw.id, name: raw.name });
                     
                     // 2. Merge the Membership data
                     if (raw.membershipId) {
                         this.mergeTeamMembership({
                             id: raw.membershipId,
                             orgProfileId: raw.id,
                             roleId: raw.roleId,
                             teamId: raw.teamId || this.findTeamIdForMembership(raw.membershipId), // Fallback?
                             startDate: raw.startDate,
                             endDate: raw.endDate
                         });
                     }
                } else {
                    // Standard membership object
                    this.mergeTeamMembership(raw as TeamMembership);
                }
                break;
            case 'ORGANIZATIONS_UPDATED':
                this.mergeOrganization(event.data as Organization);
                break;
            case 'TEAM_DELETED':
                this.teams = this.teams.filter(t => t.id !== event.data.id);
                this.teamMemberships = this.teamMemberships.filter(m => m.teamId !== event.data.id);
                break;
            case 'ORG_MEMBERS_UPDATED':
                const rawOrg = event.data;
                console.log(`Store: Received ORG_MEMBERS_UPDATED for person ${rawOrg.id} (${rawOrg.name}) in org ${rawOrg.orgId}`);
                if (rawOrg.name) {
                    this.mergeOrgProfile({ id: rawOrg.id, name: rawOrg.name, orgId: rawOrg.orgId });
                    if (rawOrg.membershipId) {
                        this.mergeOrgMembership({
                            id: rawOrg.membershipId,
                            orgProfileId: rawOrg.id,
                            orgId: rawOrg.orgId,
                            roleId: rawOrg.roleId,
                            startDate: rawOrg.startDate,
                            endDate: rawOrg.endDate
                        });
                    }
                } else {
                    this.mergeOrgMembership(rawOrg as OrgMembership);
                }
                break;
            case 'USER_MEMBERSHIPS_UPDATED':
                console.log(`Store: Received USER_MEMBERSHIPS_UPDATED broadcast`);
                if (this.currentUserId) {
                    this.fetchUserMemberships(this.currentUserId);
                }
                break;
            case 'ENTITY_NOT_FOUND':
                if (event.data && event.data.type === 'organization') {
                    console.log(`Store: Explicitly marking organization ${event.data.id} as missing.`);
                    this.missingOrganizations.add(event.data.id);
                    this.notifyListeners(); // Crucial: trigger re-test by the hook
                }
                break;
            case 'BOARD_UPDATED': // example placeholder
                break;
            
            // --- Push-on-Join SYNC Events ---
            case 'ORG_MEMBERS_SYNC':
                console.log(`Store: Received ORG_MEMBERS_SYNC with ${event.data.length} members`);
                event.data.forEach((item: any) => {
                    this.mergeOrgProfile({ id: item.id, name: item.name, orgId: item.orgId });
                    this.mergeOrgMembership({
                        id: item.membershipId,
                        orgProfileId: item.id,
                        orgId: item.orgId,
                        roleId: item.roleId,
                        startDate: item.startDate,
                        endDate: item.endDate
                    });
                });
                break;
            case 'TEAMS_SYNC':
                console.log(`Store: Received TEAMS_SYNC with ${event.data.length} teams`);
                event.data.forEach((t: Team) => this.mergeTeam(t));
                break;
            case 'SITES_SYNC':
                console.log(`Store: Received SITES_SYNC with ${event.data.length} sites`);
                event.data.forEach((s: Site) => this.mergeSite(s));
                break;
            case 'FACILITIES_SYNC':
                console.log(`Store: Received FACILITIES_SYNC with ${event.data.length} facilities`);
                event.data.forEach((f: Facility) => this.mergeFacility(f));
                break;
            case 'EVENTS_SYNC':
                console.log(`Store: Received EVENTS_SYNC with ${event.data.length} events`);
                event.data.forEach((e: Event) => this.mergeEvent(e));
                break;
            case 'GAMES_SYNC':
                console.log(`Store: Received GAMES_SYNC with ${event.data.length} games`);
                event.data.forEach((g: Game) => this.mergeGame(g));
                break;
            case 'ORGANIZATION_SYNC':
                console.log(`Store: Received ORGANIZATION_SYNC for ${event.data.id}`);
                this.mergeOrganization(event.data);
                break;
            case 'ORGANIZATIONS_SYNC':
                console.log(`Store: Received ORGANIZATIONS_SYNC with ${event.data.length} orgs`);
                this.organizations = event.data;
                break;
            case 'TEAM_MEMBERS_SYNC':
                console.log(`Store: Received TEAM_MEMBERS_SYNC with ${event.data.length} members`);
                event.data.forEach((item: any) => {
                    this.mergeOrgProfile({ id: item.id, name: item.name });
                    this.mergeTeamMembership({
                        id: item.membershipId,
                        orgProfileId: item.id,
                        teamId: item.teamId,
                        roleId: item.roleId,
                        startDate: item.startDate,
                        endDate: item.endDate,
                    });
                });
                break;
            case 'GLOBAL_CACHE_REFRESH':
                console.log("Store: Received GLOBAL_CACHE_REFRESH. Clearing local organization state.");
                this.organizations = [];
                this.localOrganizationCache = [];
                this.totalOrganizations = 0;
                // Client pages will likely re-fetch on notifyListeners
                this.notifyListeners();
                break;
        }
        this.notifyListeners();
    }

    fetchUserMemberships(userId: string) {
        if (!userId) return;
        this.currentUserId = userId;
        console.log(`Store: Fetching memberships for user ${userId}`);
        socket.emit('get_data', { type: 'user_memberships', id: userId }, (data: { orgs: OrgMembership[], teams: any[] }) => {
            if (data) {
                this.userOrgMemberships = data.orgs;
                this.userTeamMemberships = data.teams;
                
                // Automatically subscribe to summary rooms for user's organizations
                const orgIds = new Set<string>();
                data.orgs.forEach(m => orgIds.add(m.orgId));
                data.teams.forEach(m => orgIds.add(m.orgId));

                this.subscribeToOrganizationSummaries(Array.from(orgIds));

                this.notifyListeners();
            }
        });
    }

    getUserOrganizations() {
        const orgIds = new Set([
            ...this.userOrgMemberships.map(m => m.orgId),
            ...this.userTeamMemberships.map(m => m.orgId)
        ]);
        return this.organizations.filter(o => orgIds.has(o.id));
    }

    canSeeAdmin(userId: string, globalRole?: string) {
        if (globalRole === 'admin') return true;
        
        const hasOrgAdmin = this.userOrgMemberships.some(m => m.roleId === 'role-org-admin');
        const hasCoach = this.userTeamMemberships.some(m => m.roleId === 'role-coach');
        
        return hasOrgAdmin || hasCoach;
    }

    getAdminOrgIds(userId: string, globalRole?: string) {
        if (globalRole === 'admin') return this.organizations.map(o => o.id);
        
        const orgIds = new Set<string>();
        this.userOrgMemberships.forEach(m => {
            if (m.roleId === 'role-org-admin') orgIds.add(m.orgId);
        });
        this.userTeamMemberships.forEach(m => {
            if (m.roleId === 'role-coach') orgIds.add(m.orgId);
        });
        
        return Array.from(orgIds);
    }
    
    // ... helpers ...



    private mergeSport(sport: Sport) {
        const index = this.sports.findIndex(s => s.id === sport.id);
        if (index > -1) this.sports[index] = { ...this.sports[index], ...sport };
        else this.sports.push(sport);
        this.notifyListeners();
    }
    
    private mergeTeam(team: Team) {
        const index = this.teams.findIndex(t => t.id === team.id);
        if (index > -1) this.teams[index] = { ...this.teams[index], ...team };
        else this.teams.push(team);

        this.subscribeToTeamData(team.id);
        this.notifyListeners();
    }
    
    private mergeSite(site: Site) {
        const index = this.sites.findIndex(s => s.id === site.id);
        if (index > -1) this.sites[index] = { ...this.sites[index], ...site };
        else this.sites.push(site);
        this.notifyListeners();
    }
    private mergeFacility(facility: Facility) {
        const index = this.facilities.findIndex(f => f.id === facility.id);
        if (index > -1) this.facilities[index] = { ...this.facilities[index], ...facility };
        else this.facilities.push(facility);
        this.notifyListeners();
    }
    private mergeGame(game: Game) {
        const index = this.games.findIndex(g => g.id === game.id);
        let mergedGame: Game;
        if (index > -1) {
            mergedGame = { ...this.games[index], ...game };
            this.games[index] = mergedGame;
        } else {
            mergedGame = game;
            this.games.push(game);
        }

        this.notifyListeners();
        
        // Auto-fetch missing teams 
        if (mergedGame.participants) {
            mergedGame.participants.forEach(p => {
                if (p.teamId && !this.getTeam(p.teamId)) {
                    this.fetchTeam(p.teamId);
                }
            });
        }
    }
    private mergeOrgProfile(profile: Partial<OrgProfile>) {
        if (!profile.id) return;
        const index = this.orgProfiles.findIndex(p => p.id === profile.id);
        if (index > -1) this.orgProfiles[index] = { ...this.orgProfiles[index], ...profile } as OrgProfile;
        else this.orgProfiles.push(profile as OrgProfile);
        this.notifyListeners();
    }
    private mergeTeamMembership(membership: TeamMembership) {
        if (!membership.teamId && !membership.id) return; // invalid
        
        const index = this.teamMemberships.findIndex(m => m.id === membership.id);
        if (index > -1) {
             // Merge updates (like endDate)
             this.teamMemberships[index] = { ...this.teamMemberships[index], ...membership };
        }
        else {
            this.teamMemberships.push(membership);
        }
        this.notifyListeners();
    }
    private mergeOrganization(org: Organization) {
        const index = this.organizations.findIndex(o => o.id === org.id);
        if (index > -1) {
            this.organizations[index] = { ...this.organizations[index], ...org };
        } else {
            this.organizations.push(org);
        }

        // Maintain local fuzzy search cache (up to 1000 orgs)
        const cacheIndex = this.localOrganizationCache.findIndex(o => o.id === org.id);
        if (cacheIndex > -1) {
            this.localOrganizationCache[cacheIndex] = org;
        } else {
            this.localOrganizationCache.unshift(org); // Add to front (most recent)
            if (this.localOrganizationCache.length > this.MAX_LOCAL_ORGS) {
                this.localOrganizationCache.pop(); // Remove oldest
            }
        }

        this.notifyListeners();
    }
    private mergeOrgMembership(membership: OrgMembership) {
        const index = this.organizationMemberships.findIndex(m => m.id === membership.id);
        if (index > -1) this.organizationMemberships[index] = { ...this.organizationMemberships[index], ...membership };
        else this.organizationMemberships.push(membership);
        this.notifyListeners();
    }

    private findTeamIdForMembership(membershipId: string): string | undefined {
        const membership = this.teamMemberships.find(m => m.id === membershipId);
        return membership?.teamId;
    }


    getOrganization = (id?: string) => id ? this.organizations.find(o => o.id === id) : this.organizations[0];
    getSports = () => this.sports;
    getSport = (id: string) => this.sports.find(s => s.id === id);
    getTeamRoles = () => this.teamRoles;
    getTeamRole = (id: string) => this.teamRoles.find(r => r.id === id);
    getOrganizationRoles = () => this.organizationRoles;
    getOrganizationRole = (id: string) => this.organizationRoles.find(r => r.id === id);
    getOrganizations = () => this.organizations;
    getTeams = (orgId?: string) => orgId ? this.teams.filter(t => t.orgId === orgId) : this.teams;
    getTeam = (id: string) => this.teams.find((t) => t.id === id);
    getSites = (orgId?: string) => orgId ? this.sites.filter(s => s.orgId === orgId) : this.sites;
    getSite = (id: string) => this.sites.find(s => s.id === id);
    getFacilities = (siteId?: string) => siteId ? this.facilities.filter(f => f.siteId === siteId) : this.facilities;
    getFacility = (id: string) => this.facilities.find(f => f.id === id);
    getGames = (orgId?: string) => {
        if (!orgId) return this.games;
        return this.games.filter(g => {
            if (!g.participants) return false;
            return g.participants.some(p => {
                if (p.teamId) {
                    const team = this.getTeam(p.teamId);
                    return team?.orgId === orgId;
                }
                return false;
            });
        });
    }; 
    getGame = (id: string) => this.games.find((g) => g.id === id);
    getOrgProfiles = () => this.orgProfiles;
    
    // Complex getter
    getTeamMembers = (teamId: string) => {
        const memberships = this.teamMemberships.filter(m => m.teamId === teamId && !m.endDate);
        return memberships.map(m => {
          const profile = this.orgProfiles.find(p => p.id === m.orgProfileId);
          return {
            ...profile!,
            roleId: m.roleId,
            roleName: this.getTeamRole(m.roleId)?.name,
            membershipId: m.id
          };
        }).filter(p => p.id);
    };

    updateOrganization = (id: string, data: Partial<Organization>) => {
        const orgIndex = this.organizations.findIndex(o => o.id === id);
        if (orgIndex > -1) {
             const updated = { ...this.organizations[orgIndex], ...data };
             this.organizations[orgIndex] = updated;
             this.notifyListeners();

             return new Promise<Organization>((resolve, reject) => {
                 socket.emit('action', { type: SocketAction.UPDATE_ORG, payload: { id, data } }, (response: any) => {
                     if (response.status === 'ok') resolve(response.data);
                     else reject(new Error(response.message || 'Failed to update organization'));
                 });
             });
        }
        return Promise.reject(new Error('Organization not found'));
    };

    addOrganization = (org: Omit<Organization, "id"> & { creatorId?: string }) => {
        return new Promise<Organization>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_ORG, payload: org }, (response: any) => {
                if (response.status === 'ok') {
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to add organization'));
                }
            });
        });
    };

    deleteOrganization = (id: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.DELETE_ORG, payload: { id } }, (response: any) => {
                if (response.status === 'ok') {
                    this.organizations = this.organizations.filter(o => o.id !== id);
                    this.notifyListeners();
                    resolve();
                } else {
                    reject(new Error(response.message || 'Failed to delete organization'));
                }
            });
        });
    };

    declineClaim = (token: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.DECLINE_CLAIM, payload: { token } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to decline claim'));
            });
        });
    };

    referOrgContactViaToken = (token: string, contactEmails: string[]) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.REFER_ORG_CONTACT_VIA_TOKEN, payload: { token, contactEmails } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to refer contact'));
            });
        });
    };
    
    referOrgContact = (orgId: string, contactEmails: string[], referredByUserId: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.REFER_ORG_CONTACT, payload: { orgId, contactEmails, referredByUserId } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to nominate contact'));
            });
        });
    };

    fetchOrgReferrals = (orgId: string) => {
        return new Promise<any[]>((resolve, reject) => {
            console.log(`Store: Requesting org_referrals for ${orgId}`);
            socket.emit('get_data', { type: 'org_referrals', orgId }, (data: any[]) => {
                console.log(`Store: Received org_referrals data:`, data);
                if (data) resolve(data);
                else reject(new Error('Failed to fetch organization referrals'));
            });
        });
    };

    submitReport = (data: { entityType: string; entityId: string; reason: string; description?: string; reporterUserId: string }) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.SUBMIT_REPORT, payload: data }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to submit report'));
            });
        });
    };

    getUserBadges = (userId: string) => {
        return new Promise<UserBadge[]>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.GET_USER_BADGES, payload: { userId } }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to fetch badges'));
            });
        });
    };

    getHomeFeed = (userId: string | undefined, timezone: string) => {
        return new Promise<any>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.FEED_GET_HOME, payload: { userId, timezone } }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to fetch home feed'));
            });
        });
    };

    searchSimilarOrganizations = (name: string): Promise<Organization[]> => {
        const query = name.trim().toLowerCase();
        if (!query) return Promise.resolve([]);

        // 1. Instant Local Search
        const localResults = this.searchOrganizationsLocal(query);

        // 2. Backend Augmentation
        return new Promise((resolve) => {
            // Initiate backend search to fetch potentially unknown orgs
            socket.emit('get_data', { type: 'search_similar_orgs', name }, (backendData: Organization[]) => {
                if (backendData) {
                    backendData.forEach(org => this.mergeOrganization(org));
                }
                // Return merged results (local logic will now include the new ones)
                resolve(this.searchOrganizationsLocal(query));
            });

            // Fast resolve with local results to keep UI responsive
            setTimeout(() => {
                resolve(localResults);
            }, 50); 
        });
    };

    searchOrganizationsLocal = (query: string): Organization[] => {
        const queryParts = query.split(/\s+/).filter(p => p.length > 0);
        
        const scored = this.localOrganizationCache.map(org => {
            const orgName = org.name.toLowerCase();
            const shortName = (org.shortName || "").toLowerCase();
            const orgParts = orgName.split(/\s+/).concat(shortName ? [shortName] : []);

            let score = 0;
            
            // 1. Exact / StartsWith Bonus
            if (orgName === query) score += 100;
            else if (orgName.startsWith(query)) score += 20;
            if (shortName === query) score += 50;

            // 2. Word Matching with Fuzzy Logic
            queryParts.forEach(qPart => {
                let bestWordScore = 0;
                for (const oPart of orgParts) {
                    if (oPart === qPart) {
                        bestWordScore = 10;
                        break; 
                    }
                    if (oPart.startsWith(qPart)) {
                        bestWordScore = Math.max(bestWordScore, 5);
                    }
                    if (qPart.length > 2 && oPart.length > 2) {
                         const dist = levenshtein(qPart, oPart);
                         const maxErrors = qPart.length > 5 ? 2 : 1;
                         if (dist <= maxErrors) {
                             bestWordScore = Math.max(bestWordScore, 3);
                         }
                    }
                }
                score += bestWordScore;
            });

            return { org, score };
        });

        return scored
            .filter(item => item.score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.org.name.length - b.org.name.length;
            })
            .map(item => item.org)
            .slice(0, 10); 
    }

    getPendingClaims = (email: string): Promise<any[]> => {
        return new Promise((resolve) => {
            socket.emit('get_data', { type: 'pending_claims', email }, (data: any[]) => {
                resolve(data || []);
            });
        });
    };

    getClaimInfo = (token: string): Promise<any> => {
        return new Promise((resolve) => {
            socket.emit('get_data', { type: 'claim_info', token }, (data: any) => {
                resolve(data);
            });
        });
    };

    claimOrgViaToken = (token: string, userId: string) => {
        return new Promise<Organization>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.CLAIM_ORG_VIA_TOKEN, payload: { token, userId } }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeOrganization(response.data);
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to claim organization via token'));
                }
            });
        });
    };

    claimOrganization = (id: string, userId: string) => {
        return new Promise<Organization>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.CLAIM_ORG, payload: { id, userId } }, (response: any) => {
                if (response.status === 'ok') {
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to claim organization'));
                }
            });
        });
    };

    addTeam = (team: Omit<Team, "id">) => {
        return new Promise<Team>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_TEAM, payload: team }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeTeam(response.data);
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to add team'));
                }
            });
        });
    };
    
    updateTeam = (id: string, data: Partial<Team>) => {
        const index = this.teams.findIndex(t => t.id === id);
        if (index > -1) {
            this.teams[index] = { ...this.teams[index], ...data };
            this.notifyListeners();

            return new Promise<Team>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_TEAM, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update team'));
                });
            });
        }
        return Promise.reject(new Error('Team not found'));
    };
    
    addSite = (site: Omit<Site, "id">) => {
         return new Promise<Site>((resolve, reject) => {
             socket.emit('action', { type: SocketAction.ADD_SITE, payload: site }, (response: any) => {
                 if (response.status === 'ok') {
                     this.mergeSite(response.data);
                     resolve(response.data);
                 } else {
                     reject(new Error(response.message || 'Failed to add site'));
                 }
             });
         });
    };
    addFacility = (facility: Omit<Facility, "id">) => {
         return new Promise<Facility>((resolve, reject) => {
             socket.emit('action', { type: SocketAction.ADD_FACILITY, payload: facility }, (response: any) => {
                 if (response.status === 'ok') {
                     this.mergeFacility(response.data);
                     resolve(response.data);
                 } else {
                     reject(new Error(response.message || 'Failed to add facility'));
                 }
             });
         });
    };
    
    addGame = (game: Omit<Game, "id" | "status" | "homeScore" | "awayScore">) => {
        return new Promise<Game>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_GAME, payload: game }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeGame(response.data);
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to add game'));
                }
            });
        });
    };

    updateGameStatus = (id: string, status: Game['status']) => {
        const game = this.games.find(g => g.id === id);
        if (game) {
          game.status = status;
          socket.emit('action', { type: SocketAction.UPDATE_GAME_STATUS, payload: { id, status } });
        }
    };

    updateScore = (id: string, homeScore: number, awayScore: number) => {
        const game = this.games.find(g => g.id === id);
        if (game) {
          game.liveState = { ...(game.liveState || {}), home: homeScore, away: awayScore };
          socket.emit('action', { type: SocketAction.UPDATE_GAME_SCORE, payload: { id, homeScore, awayScore } });
        }
    };

    updateGame = (id: string, data: Partial<Game>) => {
        const index = this.games.findIndex(g => g.id === id);
        if (index > -1) {
            this.games[index] = { ...this.games[index], ...data };
            this.notifyListeners();
        }

        return new Promise<Game>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.UPDATE_GAME, payload: { id, data } }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to update game'));
            });
        });
    };
    
    // addPerson removed in favor of addOrgProfile
    addTeamMember = (orgProfileId: string, teamId: string, roleId: string) => {
        const payload = {
            orgProfileId,
            teamId,
            roleId,
            startDate: new Date().toISOString()
        };
        return new Promise<TeamMembership>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_TEAM_MEMBER, payload }, (response: any) => {
                if (response.status === 'ok') {
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to add team member'));
                }
            });
        });
    };

    updateTeamMember = (id: string, data: Partial<TeamMembership>) => {
        const index = this.teamMemberships.findIndex(m => m.id === id);
        if (index > -1) {
            this.teamMemberships[index] = { ...this.teamMemberships[index], ...data };
            this.notifyListeners();

            return new Promise<TeamMembership>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_TEAM_MEMBER, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update team member'));
                });
            });
        }
        return Promise.reject(new Error('Membership not found'));
    };

    removeTeamMember = (membershipId: string) => {
        const index = this.teamMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.teamMemberships[index].endDate = new Date().toISOString(); // Optimistic
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.REMOVE_TEAM_MEMBER, payload: { id: membershipId } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to remove team member'));
                });
            });
        }
        return Promise.reject(new Error('Membership not found'));
    };

    getOrganizationMembers = (orgId: string) => {
         // This is a complex getter similar to getTeamMembers
         const memberships = this.organizationMemberships.filter(m => m.orgId === orgId && !m.endDate);
          const result = memberships.map(m => {
            const profile = this.orgProfiles.find(p => p.id === m.orgProfileId);
            if (!profile) {
                console.warn(`Store: Profile ${m.orgProfileId} not found for membership ${m.id} in org ${orgId}`);
                console.log("Current profiles in store:", this.orgProfiles.map(p => p.id));
            }
            return {
              ...profile!,
              roleId: m.roleId,
              roleName: this.getOrganizationRole(m.roleId)?.name,
              membershipId: m.id,
              startDate: m.startDate,
              endDate: m.endDate
            };
          }).filter(p => p && p.id);
          console.log(`Store: Returning ${result.length} members for org ${orgId}`);
          return result;
    };

    addOrganizationMember = (orgProfileId: string, orgId: string, roleId: string) => {
        const payload = {
            orgProfileId,
            orgId,
            roleId,
            startDate: new Date().toISOString()
        };
        return new Promise<OrgMembership>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_ORG_MEMBER, payload }, (response: any) => {
                if (response.status === 'ok') {
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to add organization member'));
                }
            });
        });
    };

    removeOrganizationMember = (membershipId: string) => {
        const index = this.organizationMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.organizationMemberships[index].endDate = new Date().toISOString(); // Optimistic
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.REMOVE_ORG_MEMBER, payload: { id: membershipId } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to remove organization member'));
                });
            });
        }
        return Promise.reject(new Error('Membership not found'));
    };

    updateOrganizationMember = (membershipId: string, roleId: string) => {
        const index = this.organizationMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.organizationMemberships[index] = { ...this.organizationMemberships[index], roleId };
            this.notifyListeners();

            return new Promise<OrgMembership>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_ORG_MEMBER, payload: { id: membershipId, roleId } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update organization member'));
                });
            });
        }
        return Promise.reject(new Error('Membership not found'));
    };

    deleteTeam = (id: string) => { 
        this.teams = this.teams.filter(t => t.id !== id);
        this.notifyListeners();

        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.DELETE_TEAM, payload: { id } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to delete team'));
            });
        });
    }; 

    addOrgProfile = (profile: Partial<OrgProfile>) => {
        return new Promise<OrgProfile>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_ORG_PROFILE, payload: profile }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeOrgProfile(response.data);
                    resolve(response.data);
                } else reject(new Error(response.message || 'Failed to add organization profile'));
            });
        });
    };

    deleteOrgProfile = (id: string) => {
        const profile = this.orgProfiles.find(p => p.id === id);
        if (profile) {
            this.orgProfiles = this.orgProfiles.filter(p => p.id !== id);
            this.teamMemberships = this.teamMemberships.filter(m => m.orgProfileId !== id);
            this.organizationMemberships = this.organizationMemberships.filter(m => m.orgProfileId !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_ORG_PROFILE, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to delete organization profile'));
                });
            });
        }
        return Promise.reject(new Error('Profile not found'));
    };

    updateOrgProfile = (id: string, data: Partial<OrgProfile>) => {
        const index = this.orgProfiles.findIndex(p => p.id === id);
        if (index > -1) {
            this.orgProfiles[index] = { ...this.orgProfiles[index], ...data };
            this.notifyListeners();

            return new Promise<OrgProfile>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_ORG_PROFILE, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') {
                        this.mergeOrgProfile(response.data);
                        resolve(response.data);
                    } else reject(new Error(response.message || 'Failed to update organization profile'));
                });
            });
        }

        // If not in cache, try updating directly via server
        return new Promise<OrgProfile>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.UPDATE_ORG_PROFILE, payload: { id, data } }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeOrgProfile(response.data);
                    resolve(response.data);
                } else reject(new Error(response.message || 'Failed to update organization profile'));
            });
        });
    };

    searchProfiles = (query: string, orgId?: string): Promise<OrgProfile[]> => {
        return new Promise((resolve) => {
            socket.emit('get_data', { type: 'search_people', query, orgId }, (data: OrgProfile[]) => {
                if (data) {
                    data.forEach(p => this.mergeOrgProfile(p));
                }
                resolve(data || []);
            });
        });
    };

    findMatchingUser = (email?: string, name?: string, birthdate?: string): Promise<User | null> => {
        return new Promise((resolve) => {
            socket.emit('get_data', { type: 'find_matching_user', email, name, birthdate }, (user: User | null) => {
                resolve(user);
            });
        });
    };

    updateSite = (id: string, data: Partial<Site>) => {
        const index = this.sites.findIndex(s => s.id === id);
        if (index > -1) {
            const updated = { ...this.sites[index], ...data };
            this.sites[index] = updated;
            this.notifyListeners();

            return new Promise<Site>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_SITE, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.message || 'Failed to update site'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Site not found'));
    };
    updateFacility = (id: string, data: Partial<Facility>) => {
        const index = this.facilities.findIndex(f => f.id === id);
        if (index > -1) {
            const updated = { ...this.facilities[index], ...data };
            this.facilities[index] = updated;
            this.notifyListeners();

            return new Promise<Facility>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.UPDATE_FACILITY, payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.message || 'Failed to update facility'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Facility not found'));
    };

    deleteSite = (id: string) => {
        const site = this.sites.find(s => s.id === id);
        if (site) {
            const previousSites = [...this.sites];
            this.sites = this.sites.filter(s => s.id !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_SITE, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve();
                    } else {
                        // Rollback
                        this.sites = previousSites;
                        this.notifyListeners();
                        reject(new Error(response.message || 'Failed to delete site'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Site not found'));
    };
    deleteFacility = (id: string) => {
        const facility = this.facilities.find(f => f.id === id);
        if (facility) {
            this.facilities = this.facilities.filter(f => f.id !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_FACILITY, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to delete facility'));
                });
            });
        }
        return Promise.reject(new Error('Facility not found'));
    };
    addEvent = (event: Omit<Event, "id">) => {
        return new Promise<Event>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.ADD_EVENT, payload: event }, (response: any) => {
                if (response.status === 'ok') {
                    this.mergeEvent(response.data);
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to add event'));
                }
            });
        });
    };

    updateEvent = (id: string, data: Partial<Event>) => {
        const index = this.events.findIndex(e => e.id === id);
        if (index > -1) {
            const updated = { ...this.events[index], ...data };
            this.events[index] = updated;
            this.notifyListeners();
        }

        return new Promise<Event>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.UPDATE_EVENT, payload: { id, data } }, (response: any) => {
                if (response.status === 'ok') {
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to update event'));
                }
            });
        });
    };

    deleteGame = (id: string) => {
        const game = this.games.find(g => g.id === id);
        if (game) {
            this.games = this.games.filter(g => g.id !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_GAME, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to delete game'));
                });
            });
        }
        return Promise.reject(new Error('Game not found'));
    };

    deleteEvent = (id: string) => {
        const event = this.events.find(e => e.id === id);
        if (event) {
            this.events = this.events.filter(e => e.id !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: SocketAction.DELETE_EVENT, payload: { id } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve();
                    } else {
                        reject(new Error(response.message || 'Failed to delete event'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Event not found'));
    };
    
    getEvents = (orgId?: string) => orgId 
        ? this.events.filter(e => e.orgId === orgId || e.participatingOrgIds?.includes(orgId)) 
        : this.events;
    getEvent = (id: string) => this.events.find(e => e.id === id);

    
    mergeEvent(event: Event) {
        const index = this.events.findIndex(e => e.id === event.id);
        if (index > -1) this.events[index] = event;
        else this.events.push(event);

        // Subscriptions are now handled explicitly by UI components (lazy loading)
        // this.subscribeToEvent(event.id);
        // if (event.siteId) this.subscribeToSite(event.siteId);


        // Discovery Logic: fetch details for involved organizations if unknown
        const orgIds = [event.orgId, ...(event.participatingOrgIds || [])];
        orgIds.forEach(orgId => {
            if (!this.getOrganization(orgId)) {
                this.fetchOrganization(orgId);
            }
        });
        
        this.notifyListeners();
    }

    fetchOrganization(id: string) {
        return new Promise<Organization | null>((resolve) => {
            socket.emit('get_data', { type: 'organization', id }, (data: Organization) => {
                if (data) {
                    this.mergeOrganization(data);
                    this.notifyListeners();
                }
                resolve(data || null);
            });
        });
    }

    fetchEvent(id: string) {
        return new Promise<Event | null>((resolve) => {
            socket.emit('get_data', { type: 'event', id }, (data: Event) => {
                if (data) this.mergeEvent(data);
                resolve(data || null);
            });
        });
    }

    fetchTeam(id: string) {
        socket.emit('get_data', { type: 'team', id }, (data: Team) => {
            if (data) {
                this.mergeTeam(data);
                if (!this.getOrganization(data.orgId)) {
                    this.fetchOrganization(data.orgId);
                }
            }
        });
    }

    fetchFacilitiesForSite(siteId: string) {
        socket.emit('get_data', { type: 'facilities', siteId }, (data: Facility[]) => {
            if (data && Array.isArray(data)) {
                data.forEach(f => this.mergeFacility(f));
            }
        });
    }

    // --- Notifications ---
    fetchNotifications = (userId: string) => {
        socket.emit('get_data', { type: 'notifications', id: userId }, (data: Notification[]) => {
            if (data) {
                this.notifications = data;
                this.updateUnreadCount();
            }
        });
    };

    markNotificationAsRead = (id: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.MARK_NOTIFICATION_READ, payload: { id } }, (response: any) => {
                if (response.status === 'ok') {
                    const index = this.notifications.findIndex(n => n.id === id);
                    if (index > -1) {
                        this.notifications[index].isRead = true;
                        this.updateUnreadCount();
                    }
                    resolve();
                } else {
                    reject(new Error(response.message || 'Failed to mark notification as read'));
                }
            });
        });
    };

    markAllNotificationsAsRead = (userId: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.MARK_ALL_NOTIFICATIONS_READ, payload: { userId } }, (response: any) => {
                if (response.status === 'ok') {
                    this.notifications.forEach(n => n.isRead = true);
                    this.updateUnreadCount();
                    resolve();
                } else {
                    reject(new Error(response.message || 'Failed to mark all as read'));
                }
            });
        });
    };

    deleteNotification = (id: string) => {
        return new Promise<void>((resolve, reject) => {
            socket.emit('action', { type: SocketAction.DELETE_NOTIFICATION, payload: { id } }, (response: any) => {
                if (response.status === 'ok') {
                    this.notifications = this.notifications.filter(n => n.id !== id);
                    this.updateUnreadCount();
                    resolve();
                } else {
                    reject(new Error(response.message || 'Failed to delete notification'));
                }
            });
        });
    };

    private mergeNotification(notification: Notification) {
        const index = this.notifications.findIndex(n => n.id === notification.id);
        if (index > -1) {
            this.notifications[index] = { ...this.notifications[index], ...notification };
        } else {
            this.notifications.unshift(notification); // Newest first
        }
        this.updateUnreadCount();
    }

    private mergeReferral(referral: any) {
        const index = this.orgReferrals.findIndex(r => r.id === referral.id);
        if (index > -1) {
            this.orgReferrals[index] = { ...this.orgReferrals[index], ...referral };
        } else {
            this.orgReferrals.unshift(referral); // Newest first
        }
        this.notifyListeners();
    }

    private updateUnreadCount() {
        this.unreadCount = this.notifications.filter(n => !n.isRead).length;
        this.notifyListeners();
    }
}

const globalForStore = globalThis as unknown as { store_v10: Store };
export const store = globalForStore.store_v10 || new Store();
if (process.env.NODE_ENV !== "production") globalForStore.store_v10 = store;

