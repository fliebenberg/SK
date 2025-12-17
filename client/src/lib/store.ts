import { Organization, Team, Venue, Person, Event, Game, ScoreLog, TeamMembership, Sport, OrganizationMembership, TeamRole, OrganizationRole } from "@sk/types";
import { socket, socketService } from "./socketService";

  const MOCK_ORG_ID = "org-1";

  class Store {
    sports: Sport[] = [];
    teamRoles: TeamRole[] = [];
    organizationRoles: OrganizationRole[] = [];
    organizations: Organization[] = [];
    venues: Venue[] = [];
    teams: Team[] = [];
    persons: Person[] = [];
    teamMemberships: TeamMembership[] = [];
    organizationMemberships: OrganizationMembership[] = [];
    events: Event[] = [];
    games: Game[] = [];
    scoreLogs: ScoreLog[] = [];
    loaded: boolean = false;
    connected: boolean = false;
    listeners: (() => void)[] = [];

    constructor() {
        console.log("Store initialized, connecting socket...");
        socketService.connect();

        this.setupListeners();
        this.fetchAllData();
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

    private setupListeners() {
        socket.on('connect', () => {
            console.log("Store connected to server");
            this.connected = true;
            
            // Subscribe to data channels
            socket.emit('subscribe', `org:${MOCK_ORG_ID}:teams`);
            socket.emit('subscribe', `org:${MOCK_ORG_ID}:venues`);
            socket.emit('subscribe', 'games');
            socket.emit('subscribe', 'persons');
            socket.emit('subscribe', 'team_memberships');
            socket.emit('subscribe', 'organization_memberships');

            this.notifyListeners();
            this.fetchAllData();
        });

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
        const types = ['sports', 'roles', 'organizations', 'teams', 'venues', 'games', 'persons', 'team_memberships', 'organization_memberships'];
        
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
        socket.emit('get_data', { type: 'persons' }, (data: Person[]) => { 
            if(data) {
                this.persons = data;
                this.notifyListeners();
            }
        });
        socket.emit('get_data', { type: 'team_memberships' }, (data: TeamMembership[]) => { 
            if(data) {
                this.teamMemberships = data;
                this.notifyListeners();
            }
        });
        socket.emit('get_data', { type: 'organization_memberships' }, (data: OrganizationMembership[]) => { 
            if(data) {
                this.organizationMemberships = data;
                this.notifyListeners();
            }
        });
    }

    private handleUpdate(event: { type: string, data: any }) {
        switch(event.type) {
            case 'TEAMS_UPDATED':
                this.mergeTeam(event.data as Team);
                break;
            case 'VENUES_UPDATED':
                this.mergeVenue(event.data as Venue);
                break;
            case 'GAMES_UPDATED':
                this.mergeGame(event.data as Game);
                break;
            case 'PERSONS_UPDATED':
                this.mergePerson(event.data as Person);
                break;
            case 'TEAM_MEMBERSHIPS_UPDATED':
                this.mergeTeamMembership(event.data as TeamMembership);
                break;
             // Add others as needed
        }
        this.notifyListeners();
    }
    
    // Merge helpers
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
        // If it has endDate, we update it. If it's a new one, we push.
        // Actually, if endDate is set, it might be an update to existing.
        const index = this.teamMemberships.findIndex(m => m.id === membership.id);
        if (index > -1) this.teamMemberships[index] = membership;
        else this.teamMemberships.push(membership);
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
        const newOrg = { ...org, id: tempId };
        this.organizations.push(newOrg);
        socket.emit('action', { type: 'ADD_ORG', payload: newOrg }); 
        this.notifyListeners();
        return newOrg;
    };

    addTeam = (team: Omit<Team, "id"> & { id?: string }) => {
        const newTeam = { ...team, id: team.id || `team-${crypto.randomUUID()}`, isActive: true };
        this.teams.push(newTeam as Team);
        socket.emit('action', { type: 'ADD_TEAM', payload: newTeam });
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
    
    addVenue = (venue: Omit<Venue, "id" | "organizationId">) => {
         const newVenue = { ...venue, id: `venue-${crypto.randomUUID()}`, organizationId: MOCK_ORG_ID };
         this.venues.push(newVenue);
         socket.emit('action', { type: 'ADD_VENUE', payload: newVenue });
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

    removeTeamMember = (membershipId: string) => {
        const index = this.teamMemberships.findIndex(m => m.id === membershipId);
        if (index > -1) {
            this.teamMemberships[index].endDate = new Date().toISOString(); // Optimistic
            socket.emit('action', { type: 'REMOVE_TEAM_MEMBER', payload: { id: membershipId } });
            this.notifyListeners();
        }
    };

    // Stubs for others
    getOrganizationMembers = (organizationId: string) => [];
    addOrganizationMember = (a: any, b: any, c: any) => ({}) as any;
    deleteTeam = (id: string) => { this.teams = this.teams.filter(t => t.id !== id); }; 
    deletePerson = (id: string) => {};
    updatePerson = (id: string, data: any) => {};
  }

  const globalForStore = globalThis as unknown as { store_v4: Store };
  export const store = globalForStore.store_v4 || new Store();
  if (process.env.NODE_ENV !== "production") globalForStore.store_v4 = store;
