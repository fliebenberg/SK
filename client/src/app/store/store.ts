import { Organization, Team, Venue, Person, Event, Game, ScoreLog, TeamMembership, Sport, OrganizationMembership, TeamRole, OrganizationRole } from "@sk/types";
import { socket, socketService } from "../../lib/socketService";

  const MOCK_ORG_ID = "org-1";

  class Store {
    sports: Sport[] = [];
    teamRoles: TeamRole[] = [];
    organizationRoles: OrganizationRole[] = [];
    organizations: Organization[] = [];
    venues: Venue[] = [];
    teams: Team[] = [];
    // These now act as a cache for subscribed data, not global state
    persons: Person[] = [];
    teamMemberships: TeamMembership[] = [];
    organizationMemberships: OrganizationMembership[] = [];
    events: Event[] = [];
    games: Game[] = [];
    scoreLogs: ScoreLog[] = [];
    loaded: boolean = false;
    connected: boolean = false;
    listeners: (() => void)[] = [];
    
    // Track active subscriptions to avoid duplicates
    activeTeamSubscriptions: Set<string> = new Set();
    activeOrgSubscriptions: Set<string> = new Set();
    activeEventSubscriptions: Set<string> = new Set();
    activeVenueSubscriptions: Set<string> = new Set();
    activeGameSubscriptions: Set<string> = new Set();

    constructor() {
        console.log("Store initialized, connecting socket...");
        socketService.connect();

        this.setupListeners();
    }

    isLoaded = () => this.loaded;
    isConnected = () => this.connected;

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
    subscribeToTeam(teamId: string) {
        if (this.activeTeamSubscriptions.has(teamId)) return;
        
        console.log(`Store: Subscribing to team ${teamId}`);
        this.activeTeamSubscriptions.add(teamId);
        socket.emit('join_room', `team:${teamId}`);
        
        // Fetch initial data for this team
        socket.emit('get_data', { type: 'team_members', teamId }, (data: any[]) => {
            if (data) {
                // expecting data to be enriched memberships with person info, 
                // OR we need to handle plain memberships and fetching persons?
                // The server 'getTeamMembers' returns enriched objects:
                // { ...person, roleId, membershipId, startDate, endDate }
                
                // We need to deconstruct this back into our normalized store structure
                // or just store them as is?
                // Our `getTeamMembers` getter expects normalized `teamMemberships` and `persons`.
                
                // Let's unpack the enriched data from server into our local store
                data.forEach((item: any) => {
                    // Extract Person
                    const person: Person = {
                        id: item.id,
                        name: item.name,
                        // other person fields if any
                    };
                    this.mergePerson(person);
                    
                    // Extract Membership
                    const membership: TeamMembership = {
                        id: item.membershipId,
                        personId: item.id,
                        teamId: teamId,
                        roleId: item.roleId,
                        startDate: item.startDate,
                        endDate: item.endDate,
                    };
                    this.mergeTeamMembership(membership);
                });
                
                this.notifyListeners();
            }
        });
    }
    
    unsubscribeFromTeam(teamId: string) {
        if (!this.activeTeamSubscriptions.has(teamId)) return;
        
        console.log(`Store: Unsubscribing from team ${teamId}`);
        this.activeTeamSubscriptions.delete(teamId);
        socket.emit('leave_room', `team:${teamId}`);
        
        // Optional: Clean up cache? 
        // For now, we prefer to keep it in case they navigate back quickly.
    }

    subscribeToOrganization(organizationId: string) {
        if (this.activeOrgSubscriptions.has(organizationId)) return;

        console.log(`Store: Subscribing to organization ${organizationId} members`);
        this.activeOrgSubscriptions.add(organizationId);
        socket.emit('join_room', `org:${organizationId}:members`);

        socket.emit('get_data', { type: 'organization_members', organizationId }, (data: any[]) => {
            if (data) {
                data.forEach((item: any) => {
                    this.mergePerson({ id: item.id, name: item.name });
                    this.mergeOrganizationMembership({
                        id: item.membershipId,
                        personId: item.id,
                        organizationId: organizationId,
                        roleId: item.roleId,
                        startDate: item.startDate,
                        endDate: item.endDate
                    });
                });
                this.notifyListeners();
            }
        });
    }

    unsubscribeFromOrganization(organizationId: string) {
        if (!this.activeOrgSubscriptions.has(organizationId)) return;

        console.log(`Store: Unsubscribing from organization ${organizationId} members`);
        this.activeOrgSubscriptions.delete(organizationId);
        socket.emit('leave_room', `org:${organizationId}:members`);
    }

    subscribeToOrganizationData(organizationId: string) {
        if (!organizationId) return;
        // Check if we are already subscribed to this org's data rooms? 
        // We track members separately. Let's assume we can track generic org data too or reuse a set.
        // For simplicity, we'll emit every time as safe-guard, or add a new set if needed. 
        // But activeOrgSubscriptions is for MEMBERS. Let's just emit join_room.
        // The server handles duplicate joins gracefully usually.
        
        console.log(`Store: Subscribing to organization ${organizationId} data (teams/venues)`);
        socket.emit('join_room', `org:${organizationId}:teams`);
        socket.emit('join_room', `org:${organizationId}:venues`);

        // Also fetch latest to be sure
        socket.emit('get_data', { type: 'teams', organizationId }, (data: Team[]) => {
            if(data) {
                data.forEach(t => this.mergeTeam(t));
                this.notifyListeners();
            }
        });
        socket.emit('get_data', { type: 'venues', organizationId }, (data: Venue[]) => {
            if(data) {
                data.forEach(v => this.mergeVenue(v));
                this.notifyListeners();
            }
        });
    }

    unsubscribeFromOrganizationData(organizationId: string) {
        if (!organizationId) return;
        console.log(`Store: Unsubscribing from organization ${organizationId} data`);
        socket.emit('leave_room', `org:${organizationId}:teams`);
        socket.emit('leave_room', `org:${organizationId}:venues`);
    }

    subscribeToVenue(venueId: string) {
        if (!venueId || venueId === 'default' || this.activeVenueSubscriptions.has(venueId)) return;
        this.activeVenueSubscriptions.add(venueId);
        socket.emit('join_room', `venue:${venueId}`);
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

    unsubscribeFromVenue(venueId: string) {
        if (!this.activeVenueSubscriptions.has(venueId)) return;
        this.activeVenueSubscriptions.delete(venueId);
        socket.emit('leave_room', `venue:${venueId}`);
    }

    unsubscribeFromGame(gameId: string) {
        if (!this.activeGameSubscriptions.has(gameId)) return;
        this.activeGameSubscriptions.delete(gameId);
        socket.emit('leave_room', `game:${gameId}`);
    }


    private setupListeners() {
        const onConnect = () => {
            console.log("Store connected to server");
            this.connected = true;
            
            // Subscribe to GLOBAL configuration channels only
            // socket.emit('subscribe', 'teams'); // Moved to per-org subscription
            // socket.emit('subscribe', 'venues'); // Moved to per-org subscription
            socket.emit('subscribe', 'games');
            // socket.emit('subscribe', 'persons'); // Removed Global Subs
            // socket.emit('subscribe', 'team_memberships'); // Removed Global Subs
            socket.emit('subscribe', 'organization_memberships');
            socket.emit('subscribe', 'organizations');
            
            // Re-subscribe to active entities if re-connecting
            this.activeTeamSubscriptions.forEach(id => socket.emit('join_room', `team:${id}`));
            this.activeOrgSubscriptions.forEach(id => socket.emit('join_room', `org:${id}:members`));
            this.activeEventSubscriptions.forEach(id => socket.emit('join_room', `event:${id}`));
            this.activeVenueSubscriptions.forEach(id => socket.emit('join_room', `venue:${id}`));
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
        // Removed 'persons' and 'team_memberships' from global fetch
        const types = ['sports', 'roles', 'organizations', 'teams', 'venues', 'games', 'organization_memberships'];
        
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
        socket.emit('get_data', { type: 'organizations' }, (data: Organization[]) => { 
            if(data) {
                this.organizations = data;
                
                // Subscribe to each organization's team and venue rooms
                this.organizations.forEach(org => {
                    console.log(`Store: Subscribing to org ${org.id} channels`);
                    socket.emit('join_room', `org:${org.id}:teams`);
                    socket.emit('join_room', `org:${org.id}:venues`);
                    socket.emit('join_room', `org:${org.id}:events`);
                });

                this.loaded = true;
                this.notifyListeners();
            }
        });
        socket.emit('get_data', { type: 'teams' }, (data: Team[]) => { 
            if(data) {
                 this.teams = data;
                 this.notifyListeners();
            }
        });
        socket.emit('get_data', { type: 'venues' }, (data: Venue[]) => { 
            if(data) {
                this.venues = data;
                this.notifyListeners();
            }
        });
        socket.emit('get_data', { type: 'games' }, (data: Game[]) => { 
            if(data) {
                this.games = data;
                this.notifyListeners();
            }
        });
        socket.emit('get_data', { type: 'events' }, (data: Event[]) => { 
            if(data) {
                data.forEach(e => this.mergeEvent(e));
                this.notifyListeners();
            }
        });
        // Persons and TeamMemberships are now fetched on demand
        
        socket.emit('get_data', { type: 'organization_memberships' }, (data: OrganizationMembership[]) => { 
            if(data) {
                this.organizationMemberships = data;
                this.notifyListeners();
            }
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
            case 'VENUE_ADDED':
                this.mergeVenue(event.data as Venue);
                break;
            case 'VENUES_UPDATED': // Keep for compatibility if needed, using mergeVenue
            case 'VENUE_UPDATED': // If we add this logic later
                this.mergeVenue(event.data as Venue);
                break;
            case 'VENUE_DELETED':
                this.venues = this.venues.filter(v => v.id !== event.data.id);
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
                     // 1. Merge the Person data
                     this.mergePerson({ id: raw.id, name: raw.name });
                     
                     // 2. Merge the Membership data
                     if (raw.membershipId) {
                         this.mergeTeamMembership({
                             id: raw.membershipId,
                             personId: raw.id,
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
                console.log(`Store: Received ORG_MEMBERS_UPDATED for person ${rawOrg.id} (${rawOrg.name}) in org ${rawOrg.organizationId}`);
                if (rawOrg.name) {
                    this.mergePerson({ id: rawOrg.id, name: rawOrg.name });
                    if (rawOrg.membershipId) {
                        this.mergeOrganizationMembership({
                            id: rawOrg.membershipId,
                            personId: rawOrg.id,
                            organizationId: rawOrg.organizationId,
                            roleId: rawOrg.roleId,
                            startDate: rawOrg.startDate,
                            endDate: rawOrg.endDate
                        });
                    }
                } else {
                    this.mergeOrganizationMembership(rawOrg as OrganizationMembership);
                }
                break;
            case 'BOARD_UPDATED': // example placeholder
                break;
        }
        this.notifyListeners();
    }
    
    // ... helpers ...



    private mergeSport(sport: Sport) {
        const index = this.sports.findIndex(s => s.id === sport.id);
        if (index > -1) this.sports[index] = sport;
        else this.sports.push(sport);
        this.notifyListeners();
    }
    
    private mergeTeam(team: Team) {
        const index = this.teams.findIndex(t => t.id === team.id);
        if (index > -1) this.teams[index] = team;
        else this.teams.push(team);

        this.subscribeToTeam(team.id);
        this.notifyListeners();
    }
    
    private mergeVenue(venue: Venue) {
        const index = this.venues.findIndex(v => v.id === venue.id);
        if (index > -1) this.venues[index] = venue;
        else this.venues.push(venue);

        this.notifyListeners();
    }
    private mergeGame(game: Game) {
        const index = this.games.findIndex(g => g.id === game.id);
        if (index > -1) this.games[index] = game;
        else this.games.push(game);

        this.notifyListeners();
        
        // Discover teams if unknown
        if (!this.getTeam(game.homeTeamId)) {
            // Team might be foreign, we'll fetch its org if needed but teams are usually in org rooms
            // Actually, with granular rooms, we don't need to join the org room to get updates.
        }
    }
    private mergePerson(person: Person) {
        const index = this.persons.findIndex(p => p.id === person.id);
        if (index > -1) this.persons[index] = person;
        else this.persons.push(person);
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
            this.organizations[index] = org;
        } else {
            this.organizations.push(org);
            // Proactively subscribe to organization updates (members, etc.)
            // Removed: this.subscribeToOrganization(org.id);
        }
        this.notifyListeners();
    }
    private mergeOrganizationMembership(membership: OrganizationMembership) {
        const index = this.organizationMemberships.findIndex(m => m.id === membership.id);
        if (index > -1) this.organizationMemberships[index] = membership;
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
    getTeams = (organizationId?: string) => organizationId ? this.teams.filter(t => t.organizationId === organizationId) : this.teams;
    getTeam = (id: string) => this.teams.find((t) => t.id === id);
    getVenues = (organizationId?: string) => organizationId ? this.venues.filter(v => v.organizationId === organizationId) : this.venues;
    getVenue = (id: string) => this.venues.find(v => v.id === id);
    getGames = (organizationId?: string) => {
        if (!organizationId) return this.games;
        // Filter games where either team belongs to this organization
        return this.games.filter(g => {
            const homeTeam = this.getTeam(g.homeTeamId);
            const awayTeam = this.getTeam(g.awayTeamId);
            return homeTeam?.organizationId === organizationId || awayTeam?.organizationId === organizationId;
        });
    }; 
    getGame = (id: string) => this.games.find((g) => g.id === id);
    getPersons = () => this.persons;
    
    // Complex getter
    getTeamMembers = (teamId: string) => {
        const memberships = this.teamMemberships.filter(m => m.teamId === teamId && !m.endDate);
        return memberships.map(m => {
          const person = this.persons.find(p => p.id === m.personId);
          return {
            ...person!,
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
                 socket.emit('action', { type: 'UPDATE_ORG', payload: { id, data } }, (response: any) => {
                     if (response.status === 'ok') resolve(response.data);
                     else reject(new Error(response.message || 'Failed to update organization'));
                 });
             });
        }
        return Promise.reject(new Error('Organization not found'));
    };

    addOrganization = (org: Omit<Organization, "id">) => {
        return new Promise<Organization>((resolve, reject) => {
            socket.emit('action', { type: 'ADD_ORG', payload: org }, (response: any) => {
                if (response.status === 'ok') {
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to add organization'));
                }
            });
        });
    };

    addTeam = (team: Omit<Team, "id">) => {
        return new Promise<Team>((resolve, reject) => {
            socket.emit('action', { type: 'ADD_TEAM', payload: team }, (response: any) => {
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
                socket.emit('action', { type: 'UPDATE_TEAM', payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update team'));
                });
            });
        }
        return Promise.reject(new Error('Team not found'));
    };
    
    addVenue = (venue: Omit<Venue, "id">) => {
         return new Promise<Venue>((resolve, reject) => {
             socket.emit('action', { type: 'ADD_VENUE', payload: venue }, (response: any) => {
                 if (response.status === 'ok') {
                     resolve(response.data);
                 } else {
                     reject(new Error(response.message || 'Failed to add venue'));
                 }
             });
         });
    };
    
    addGame = (game: Omit<Game, "id" | "status" | "homeScore" | "awayScore">) => {
        return new Promise<Game>((resolve, reject) => {
            socket.emit('action', { type: 'ADD_GAME', payload: game }, (response: any) => {
                if (response.status === 'ok') {
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
          socket.emit('action', { type: 'UPDATE_GAME_STATUS', payload: { id, status } });
        }
    };

    updateScore = (id: string, homeScore: number, awayScore: number) => {
        const game = this.games.find(g => g.id === id);
        if (game) {
          game.homeScore = homeScore;
          game.awayScore = awayScore;
          socket.emit('action', { type: 'UPDATE_SCORE', payload: { id, homeScore, awayScore } });
        }
    };

    updateGame = (id: string, data: Partial<Game>) => {
        const index = this.games.findIndex(g => g.id === id);
        if (index > -1) {
            this.games[index] = { ...this.games[index], ...data };
            this.notifyListeners();
        }

        return new Promise<Game>((resolve, reject) => {
            socket.emit('action', { type: 'UPDATE_GAME', payload: { id, data } }, (response: any) => {
                if (response.status === 'ok') resolve(response.data);
                else reject(new Error(response.message || 'Failed to update game'));
            });
        });
    };
    
    addPerson = (person: Omit<Person, "id">) => {
        return new Promise<Person>((resolve, reject) => {
            socket.emit('action', { type: 'ADD_PERSON', payload: person }, (response: any) => {
                if (response.status === 'ok') {
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to add person'));
                }
            });
        });
    };

    addTeamMember = (personId: string, teamId: string, roleId: string) => {
        const payload = {
            personId,
            teamId,
            roleId,
            startDate: new Date().toISOString()
        };
        return new Promise<TeamMembership>((resolve, reject) => {
            socket.emit('action', { type: 'ADD_TEAM_MEMBER', payload }, (response: any) => {
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
                socket.emit('action', { type: 'UPDATE_TEAM_MEMBER', payload: { id, data } }, (response: any) => {
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
                socket.emit('action', { type: 'REMOVE_TEAM_MEMBER', payload: { id: membershipId } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to remove team member'));
                });
            });
        }
        return Promise.reject(new Error('Membership not found'));
    };

    getOrganizationMembers = (organizationId: string) => {
         // This is a complex getter similar to getTeamMembers
         const memberships = this.organizationMemberships.filter(m => m.organizationId === organizationId && !m.endDate);
         const result = memberships.map(m => {
           const person = this.persons.find(p => p.id === m.personId);
           if (!person) {
               console.warn(`Store: Person ${m.personId} not found for membership ${m.id}`);
           }
           return {
             ...person!,
             roleId: m.roleId,
             roleName: this.getOrganizationRole(m.roleId)?.name,
             membershipId: m.id,
             startDate: m.startDate,
             endDate: m.endDate
           };
         }).filter(p => p.id);
         console.log(`Store: Returning ${result.length} members for org ${organizationId}`);
         return result;
    };

    addOrganizationMember = (personId: string, organizationId: string, roleId: string) => {
        const payload = {
            personId,
            organizationId,
            roleId,
            startDate: new Date().toISOString()
        };
        return new Promise<OrganizationMembership>((resolve, reject) => {
            socket.emit('action', { type: 'ADD_ORG_MEMBER', payload }, (response: any) => {
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
                socket.emit('action', { type: 'REMOVE_ORG_MEMBER', payload: { id: membershipId } }, (response: any) => {
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

            return new Promise<OrganizationMembership>((resolve, reject) => {
                socket.emit('action', { type: 'UPDATE_ORG_MEMBER', payload: { id: membershipId, roleId } }, (response: any) => {
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
            socket.emit('action', { type: 'DELETE_TEAM', payload: { id } }, (response: any) => {
                if (response.status === 'ok') resolve();
                else reject(new Error(response.message || 'Failed to delete team'));
            });
        });
    }; 

    deletePerson = (id: string) => {
        const person = this.persons.find(p => p.id === id);
        if (person) {
            this.persons = this.persons.filter(p => p.id !== id);
            this.teamMemberships = this.teamMemberships.filter(m => m.personId !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: 'DELETE_PERSON', payload: { id } }, (response: any) => {
                    if (response.status === 'ok') resolve();
                    else reject(new Error(response.message || 'Failed to delete person'));
                });
            });
        }
        return Promise.reject(new Error('Person not found'));
    };

    updatePerson = (id: string, data: Partial<Person>) => {
        const index = this.persons.findIndex(p => p.id === id);
        if (index > -1) {
            this.persons[index] = { ...this.persons[index], ...data };
            this.notifyListeners();

            return new Promise<Person>((resolve, reject) => {
                socket.emit('action', { type: 'UPDATE_PERSON', payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') resolve(response.data);
                    else reject(new Error(response.message || 'Failed to update person'));
                });
            });
        }
        return Promise.reject(new Error('Person not found'));
    };

    updateVenue = (id: string, data: Partial<Venue>) => {
        const index = this.venues.findIndex(v => v.id === id);
        if (index > -1) {
            const updated = { ...this.venues[index], ...data };
            this.venues[index] = updated;
            this.notifyListeners();

            return new Promise<Venue>((resolve, reject) => {
                socket.emit('action', { type: 'UPDATE_VENUE', payload: { id, data } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.message || 'Failed to update venue'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Venue not found'));
    };

    deleteVenue = (id: string) => {
        const venue = this.venues.find(v => v.id === id);
        if (venue) {
            this.venues = this.venues.filter(v => v.id !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: 'DELETE_VENUE', payload: { id } }, (response: any) => {
                    if (response.status === 'ok') {
                        resolve();
                    } else {
                        reject(new Error(response.message || 'Failed to delete venue'));
                    }
                });
            });
        }
        return Promise.reject(new Error('Venue not found'));
    };
    addEvent = (event: Omit<Event, "id">) => {
        return new Promise<Event>((resolve, reject) => {
            socket.emit('action', { type: 'ADD_EVENT', payload: event }, (response: any) => {
                if (response.status === 'ok') {
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
            socket.emit('action', { type: 'UPDATE_EVENT', payload: { id, data } }, (response: any) => {
                if (response.status === 'ok') {
                    resolve(response.data);
                } else {
                    reject(new Error(response.message || 'Failed to update event'));
                }
            });
        });
    };

    deleteEvent = (id: string) => {
        const event = this.events.find(e => e.id === id);
        if (event) {
            this.events = this.events.filter(e => e.id !== id);
            this.notifyListeners();

            return new Promise<void>((resolve, reject) => {
                socket.emit('action', { type: 'DELETE_EVENT', payload: { id } }, (response: any) => {
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
    
    getEvents = (organizationId?: string) => organizationId 
        ? this.events.filter(e => e.organizationId === organizationId || e.participatingOrgIds?.includes(organizationId)) 
        : this.events;
    getEvent = (id: string) => this.events.find(e => e.id === id);

    
    mergeEvent(event: Event) {
        const index = this.events.findIndex(e => e.id === event.id);
        if (index > -1) this.events[index] = event;
        else this.events.push(event);

        // Subscriptions are now handled explicitly by UI components (lazy loading)
        // this.subscribeToEvent(event.id);
        // if (event.venueId) this.subscribeToVenue(event.venueId);


        // Discovery Logic: fetch details for involved organizations if unknown
        const orgIds = [event.organizationId, ...(event.participatingOrgIds || [])];
        orgIds.forEach(orgId => {
            if (!this.getOrganization(orgId)) {
                this.fetchOrganization(orgId);
            }
        });
        
        this.notifyListeners();
    }

    fetchOrganization(id: string) {
        socket.emit('get_data', { type: 'organization', id }, (data: Organization) => {
            if (data) {
                this.mergeOrganization(data);
                this.notifyListeners(); // Ensure listeners are notified
            }
        });
    }

    fetchEvent(id: string) {
        socket.emit('get_data', { type: 'event', id }, (data: Event) => {
            if (data) this.mergeEvent(data);
        });
    }
}

  const globalForStore = globalThis as unknown as { store_v8: Store };
  export const store = globalForStore.store_v8 || new Store();
  if (process.env.NODE_ENV !== "production") globalForStore.store_v8 = store;

