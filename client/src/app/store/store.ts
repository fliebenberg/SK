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
            
            // Re-subscribe to active teams and orgs if re-connecting
            this.activeTeamSubscriptions.forEach(teamId => {
                socket.emit('join_room', `team:${teamId}`);
            });
            this.activeOrgSubscriptions.forEach(orgId => {
                socket.emit('join_room', `org:${orgId}:members`);
            });
            
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
            case 'GAMES_UPDATED':
                this.mergeGame(event.data as Game);
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


    
    private mergeTeam(team: Team) {
        const index = this.teams.findIndex(t => t.id === team.id);
        if (index > -1) this.teams[index] = team;
        else this.teams.push(team);
    }
    private mergeVenue(venue: Venue) {
        const index = this.venues.findIndex(v => v.id === venue.id);
        if (index > -1) this.venues[index] = venue;
        else this.venues.push(venue);
    }
    private mergeGame(game: Game) {
        const index = this.games.findIndex(g => g.id === game.id);
        if (index > -1) this.games[index] = game;
        else this.games.push(game);
    }
    private mergePerson(person: Person) {
        const index = this.persons.findIndex(p => p.id === person.id);
        if (index > -1) this.persons[index] = person;
        else this.persons.push(person);
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
    }
    private mergeOrganization(org: Organization) {
        const index = this.organizations.findIndex(o => o.id === org.id);
        if (index > -1) this.organizations[index] = org;
        else this.organizations.push(org);
    }
    private mergeOrganizationMembership(membership: OrganizationMembership) {
        const index = this.organizationMemberships.findIndex(m => m.id === membership.id);
        if (index > -1) this.organizationMemberships[index] = membership;
        else this.organizationMemberships.push(membership);
    }

    private findTeamIdForMembership(membershipId: string): string | undefined {
        const membership = this.teamMemberships.find(m => m.id === membershipId);
        return membership?.teamId;
    }


    getOrganization = (id?: string) => id ? (this.organizations.find(o => o.id === id) || this.organizations[0]) : this.organizations[0];
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
    getGames = (organizationId?: string) => this.games; 
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
             socket.emit('action', { type: 'UPDATE_ORG', payload: { id, data } });
             return updated;
        }
        return null;
    };

    addOrganization = (org: Omit<Organization, "id">) => {
        const tempId = `org-${crypto.randomUUID()}`;
        const newOrg = { 
            ...org, 
            id: tempId,
            supportedRoleIds: org.supportedRoleIds || this.organizationRoles.map(r => r.id) // Default to all roles
        };
        this.organizations.push(newOrg);
        socket.emit('action', { type: 'ADD_ORG', payload: newOrg }); 
        this.notifyListeners();
        return newOrg;
    };

    addTeam = (team: Omit<Team, "id"> & { id?: string }) => {
        const newTeam = { ...team, id: team.id || `team-${crypto.randomUUID()}`, isActive: true };
        this.teams.push(newTeam as Team);
        socket.emit('action', { type: 'ADD_TEAM', payload: newTeam });
        this.notifyListeners();
        return newTeam;
    };
    
    updateTeam = (id: string, data: Partial<Team>) => {
        const index = this.teams.findIndex(t => t.id === id);
        if (index > -1) {
            this.teams[index] = { ...this.teams[index], ...data };
            socket.emit('action', { type: 'UPDATE_TEAM', payload: { id, data } });
            this.notifyListeners();
            return this.teams[index];
        }
        return null;
    };
    
    addVenue = (venue: Omit<Venue, "id"> & { id?: string }) => {
         const newVenue = { ...venue, id: `venue-${crypto.randomUUID()}` };
         this.venues.push(newVenue);
         socket.emit('action', { type: 'ADD_VENUE', payload: newVenue });
         this.notifyListeners();
         return newVenue;
    };

    addGame = (game: Omit<Game, "id" | "status" | "homeScore" | "awayScore">) => {
        const newGame: Game = {
          ...game,
          id: `game-${crypto.randomUUID()}`,
          status: 'Scheduled',
          homeScore: 0,
          awayScore: 0,
        };
        this.games.push(newGame);
        socket.emit('action', { type: 'ADD_GAME', payload: newGame });
        return newGame;
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
    
    addPerson = (person: Omit<Person, "id">) => {
        const newPerson = { ...person, id: `person-${crypto.randomUUID()}` };
        this.persons.push(newPerson);
        socket.emit('action', { type: 'ADD_PERSON', payload: newPerson });
        this.notifyListeners();
        return newPerson;
    };

    addTeamMember = (personId: string, teamId: string, roleId: string) => {
        const membership: TeamMembership = {
            id: `mem-${crypto.randomUUID()}`,
            personId,
            teamId,
            roleId,
            startDate: new Date().toISOString()
        };
        this.teamMemberships.push(membership);
        socket.emit('action', { type: 'ADD_TEAM_MEMBER', payload: membership });
        this.notifyListeners();
        return membership;
    };

    updateTeamMember = (id: string, data: Partial<TeamMembership>) => {
        const index = this.teamMemberships.findIndex(m => m.id === id);
        if (index > -1) {
            this.teamMemberships[index] = { ...this.teamMemberships[index], ...data };
            socket.emit('action', { type: 'UPDATE_TEAM_MEMBER', payload: { id, data } });
            this.notifyListeners();
            return this.teamMemberships[index];
        }
        return null;
    };

    removeTeamMember = (membershipId: string) => {
        const index = this.teamMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.teamMemberships[index].endDate = new Date().toISOString(); // Optimistic
            socket.emit('action', { type: 'REMOVE_TEAM_MEMBER', payload: { id: membershipId } });
            this.notifyListeners();
        }
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
        const membershipId = `org-mem-${crypto.randomUUID()}`;
        const membership: OrganizationMembership = {
            id: membershipId,
            personId,
            organizationId,
            roleId,
            startDate: new Date().toISOString()
        };
        this.organizationMemberships.push(membership);
        socket.emit('action', { type: 'ADD_ORG_MEMBER', payload: { id: membershipId, personId, organizationId, roleId } });
        this.notifyListeners();
        return membership;
    };

    removeOrganizationMember = (membershipId: string) => {
        const index = this.organizationMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.organizationMemberships[index].endDate = new Date().toISOString(); // Optimistic
            socket.emit('action', { type: 'REMOVE_ORG_MEMBER', payload: { id: membershipId } });
            this.notifyListeners();
        }
    };

    updateOrganizationMember = (membershipId: string, roleId: string) => {
        const index = this.organizationMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.organizationMemberships[index] = { ...this.organizationMemberships[index], roleId };
            socket.emit('action', { type: 'UPDATE_ORG_MEMBER', payload: { id: membershipId, roleId } });
            this.notifyListeners();
        }
    };

    deleteTeam = (id: string) => { 
        this.teams = this.teams.filter(t => t.id !== id);
        socket.emit('action', { type: 'DELETE_TEAM', payload: { id } });
        this.notifyListeners();
    }; 

    deletePerson = (id: string) => {
        this.persons = this.persons.filter(p => p.id !== id);
        this.teamMemberships = this.teamMemberships.filter(m => m.personId !== id);
        socket.emit('action', { type: 'DELETE_PERSON', payload: { id } });
        this.notifyListeners();
    };

    updatePerson = (id: string, data: Partial<Person>) => {
        const index = this.persons.findIndex(p => p.id === id);
        if (index > -1) {
            this.persons[index] = { ...this.persons[index], ...data };
            socket.emit('action', { type: 'UPDATE_PERSON', payload: { id, data } });
            this.notifyListeners();
            return this.persons[index];
        }
        return null;
    };

    updateVenue = (id: string, data: Partial<Venue>) => {
        const index = this.venues.findIndex(v => v.id === id);
        if (index > -1) {
            this.venues[index] = { ...this.venues[index], ...data };
            socket.emit('action', { type: 'UPDATE_VENUE', payload: { id, data } });
            this.notifyListeners();
            return this.venues[index];
        }
        return null;
    };

    deleteVenue = (id: string) => {
        this.venues = this.venues.filter(v => v.id !== id);
        socket.emit('action', { type: 'DELETE_VENUE', payload: { id } });
        this.notifyListeners();
    };
  }

  const globalForStore = globalThis as unknown as { store_v5: Store };
  export const store = globalForStore.store_v5 || new Store();
  if (process.env.NODE_ENV !== "production") globalForStore.store_v5 = store;
