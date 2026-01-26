import { Organization, Team, Venue, Person, Event, Game, ScoreLog, TeamMembership, Sport, OrganizationMembership, TeamRole, OrganizationRole } from "@sk/types";

// Initial Mock Data
const MOCK_ORG_ID = "org-1";

export class DataManager {
  sports: Sport[] = [
    { id: "sport-soccer", name: "Soccer" },
    { id: "sport-rugby", name: "Rugby" },
    { id: "sport-netball", name: "Netball" },
    { id: "sport-hockey", name: "Hockey" },
    { id: "sport-cricket", name: "Cricket" },
    { id: "sport-basketball", name: "Basketball" },
  ];

  teamRoles: TeamRole[] = [
    { id: "role-player", name: "Player" },
    { id: "role-coach", name: "Coach" },
    { id: "role-staff", name: "Staff" },
    { id: "role-medic", name: "Medic" },
  ];

  organizationRoles: OrganizationRole[] = [
    { id: "role-org-admin", name: "Admin" },
    { id: "role-org-member", name: "Member" },
  ];

  organizations: Organization[] = [
    {
      id: MOCK_ORG_ID,
      name: "Springfield High School",
      supportedSportIds: ["sport-soccer", "sport-rugby", "sport-netball"],
      primaryColor: "#00ff00",
      secondaryColor: "#000000",
      logo: "https://api.dicebear.com/7.x/initials/svg?seed=SHS&backgroundColor=00ff00&textColor=000000",
      shortName: "SHS",
      supportedRoleIds: ["role-org-admin", "role-org-member"],
    },
  ];

  venues: Venue[] = [
    {
      id: "venue-1",
      name: "Main Field",
      address: "123 School Lane",
      organizationId: MOCK_ORG_ID,
    },
  ];

  teams: Team[] = [
    {
      id: "team-1",
      name: "First XI",
      ageGroup: "U19",
      sportId: "sport-soccer",
      organizationId: MOCK_ORG_ID,
    },
    {
      id: "team-2",
      name: "U16 A",
      ageGroup: "U16",
      sportId: "sport-rugby",
      organizationId: MOCK_ORG_ID,
    },
  ];

  persons: Person[] = [
    { id: "p1", name: "Sarah Connor" },
    { id: "p2", name: "Kyle Reese" },
    { id: "p3", name: "John Connor" },
  ];
  teamMemberships: TeamMembership[] = [];
  organizationMemberships: OrganizationMembership[] = [
    { 
        id: "om1", 
        personId: "p1", 
        organizationId: MOCK_ORG_ID, 
        roleId: "role-org-admin", 
        startDate: new Date().toISOString() 
    },
    { 
        id: "om2", 
        personId: "p2", 
        organizationId: MOCK_ORG_ID, 
        roleId: "role-org-member", 
        startDate: new Date().toISOString() 
    },
    { 
        id: "om3", 
        personId: "p3", 
        organizationId: MOCK_ORG_ID, 
        roleId: "role-org-member", 
        startDate: new Date().toISOString() 
    },
  ];
  events: Event[] = [];
  games: Game[] = [];
  scoreLogs: ScoreLog[] = [];

  constructor() {
    console.log("DataManager initialized");
    console.log(`- Sports: ${this.sports.length}`);
    console.log(`- Teams: ${this.teams.length}`);
    console.log(`- Persons: ${this.persons.length}`);
    console.log(`- Org Memberships: ${this.organizationMemberships.length}`);
  }

  getOrganizations = () => this.organizations;

  getOrganization = (id?: string) => {
    if (id) {
      return this.organizations.find(o => o.id === id);
    }
    return undefined;
  };

  addOrganization = (org: Omit<Organization, "id"> & { id?: string }) => {
    let finalId = org.id;
    if (!finalId) {
        console.warn("DataManager: ID missing in addOrganization, generating new one.");
        finalId = `org-${Date.now()}`;
    }
    const newOrg: Organization = {
      ...org,
      id: finalId,
    };
    this.organizations = [...this.organizations, newOrg];
    return newOrg;
  };

  updateOrganization = (id: string, data: Partial<Organization>) => {
    const orgIndex = this.organizations.findIndex(o => o.id === id);
    if (orgIndex > -1) {
      const updatedOrg = { ...this.organizations[orgIndex], ...data };
      this.organizations[orgIndex] = updatedOrg;
      return updatedOrg;
    }
    return null;
  };

  getSports = () => this.sports;
  
  getSport = (id: string) => this.sports.find(s => s.id === id);

  getTeamRoles = () => this.teamRoles;
  getTeamRole = (id: string) => this.teamRoles.find(r => r.id === id);

  getOrganizationRoles = () => this.organizationRoles;
  getOrganizationRole = (id: string) => this.organizationRoles.find(r => r.id === id);

  
  
  getTeams = (organizationId?: string) => {
    const teams = organizationId ? this.teams.filter(t => t.organizationId === organizationId) : this.teams;
    return teams.map(t => this.enrichTeam(t));
  };

  enrichTeam = (team: Team): Team => {
    const roster = this.teamMemberships.filter(m => m.teamId === team.id && !m.endDate);
    const playerCount = roster.filter(m => m.roleId === 'role-player').length;
    const staffCount = roster.length - playerCount;
    return { ...team, playerCount, staffCount };
  };

  getTeam = (id: string) => {
    const team = this.teams.find(t => t.id === id);
    return team ? this.enrichTeam(team) : undefined;
  };

  addTeam = (team: Omit<Team, "id"> & { id?: string }) => {
    // console.log("DataManager.addTeam called with:", team);
    let finalId = team.id;
    if (!finalId) {
        console.warn("DataManager: ID missing in addTeam payload, generating new one.");
        finalId = `team-${Date.now()}`;
    }

    const newTeam: Team = {
      ...team,
      id: finalId,
      isActive: true,
    };
    // console.log("DataManager.addTeam created:", newTeam);
    this.teams = [...this.teams, newTeam];
    return newTeam;
  };

  addPerson = (person: Person) => {
    this.persons.push(person);
    return person;
  };

  addTeamMember = (membership: TeamMembership) => {
    this.teamMemberships.push(membership);

    // Auto-add to organization if not already a member
    const team = this.teams.find(t => t.id === membership.teamId);
    if (team) {
      const isOrgMember = this.organizationMemberships.some(m => 
        m.personId === membership.personId && 
        m.organizationId === team.organizationId &&
        !m.endDate
      );
      
      if (!isOrgMember) {
           // Default to a basic member role
           this.addOrganizationMember(membership.personId, team.organizationId, 'role-org-member');
      }
    }

    return membership;
  };

  addOrganizationMember = (personId: string, organizationId: string, roleId: string, id?: string) => {
    const existing = this.organizationMemberships.find(m => 
      m.personId === personId && 
      m.organizationId === organizationId && 
      !m.endDate
    );

    if (existing) {
        existing.roleId = roleId;
        return existing;
    }

    const membership: OrganizationMembership = {
      id: id || `org-mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      personId,
      organizationId,
      roleId,
      startDate: new Date().toISOString(),
    };
    this.organizationMemberships.push(membership);
    return membership;
  };

  getTeamMembers = (teamId: string) => {
    const memberships = this.teamMemberships.filter(m => m.teamId === teamId && !m.endDate);
    return memberships.map(m => {
      const person = this.persons.find(p => p.id === m.personId);
      return {
        ...person!,
        teamId, // Include teamId for easier client-side routing
        roleId: m.roleId,
        roleName: this.getTeamRole(m.roleId)?.name,
        membershipId: m.id,
        startDate: m.startDate,
        endDate: m.endDate
      };
    }).filter(p => p.id);
  };

  getOrganizationMembers = (organizationId: string) => {
    const memberships = this.organizationMemberships.filter(m => m.organizationId === organizationId && !m.endDate);
    console.log(`DataManager: Found ${memberships.length} memberships for org ${organizationId}`);
    return memberships.map(m => {
      const person = this.persons.find(p => p.id === m.personId);
      if (!person) console.warn(`DataManager: Person ${m.personId} not found in persons array!`);
      return {
        ...person!,
        roleId: m.roleId,
        roleName: this.getOrganizationRole(m.roleId)?.name,
        membershipId: m.id,
        organizationId: m.organizationId,
        startDate: m.startDate,
        endDate: m.endDate
      };
    }).filter(p => p.id);
  };

  updateTeam = (id: string, data: Partial<Team>) => {
    const index = this.teams.findIndex(t => t.id === id);
    if (index > -1) {
      const updatedTeam = { ...this.teams[index], ...data };
      this.teams[index] = updatedTeam;
      return updatedTeam;
    }
    return null;
  };

  deleteTeam = (id: string) => {
    const team = this.teams.find(t => t.id === id);
    if (!team) return null;
    
    this.teams = this.teams.filter(t => t.id !== id);
    return team; // Return the team so we know orgId to broadcast
  };
  
  updateTeamMember = (id: string, data: Partial<TeamMembership>) => {
      const index = this.teamMemberships.findIndex(m => m.id === id);
      if (index > -1) {
          this.teamMemberships[index] = { ...this.teamMemberships[index], ...data };
          return this.teamMemberships[index];
      }
      return null;
  };

  removeTeamMember = (membershipId: string) => {
      const membership = this.teamMemberships.find(m => m.id === membershipId);
      if (membership) {
          membership.endDate = new Date().toISOString();
          return membership;
      }
      return null;
  };

  removeOrganizationMember = (membershipId: string) => {
      const membership = this.organizationMemberships.find(m => m.id === membershipId);
      if (membership) {
          membership.endDate = new Date().toISOString();
          return membership;
      }
      return null;
  };

  updateOrganizationMember = (membershipId: string, roleId: string) => {
      const membership = this.organizationMemberships.find(m => m.id === membershipId);
      if (membership) {
          membership.roleId = roleId;
          return membership;
      }
      return null;
  };

  updatePerson = (id: string, data: Partial<Person>) => {
    const index = this.persons.findIndex(p => p.id === id);
    if (index > -1) {
      const updatedPerson = { ...this.persons[index], ...data };
      this.persons[index] = updatedPerson;
      return updatedPerson;
    }
    return null;
  };

  deletePerson = (id: string) => {
    // Soft delete or real delete? For now, we clean up memberships
    this.persons = this.persons.filter(p => p.id !== id);
    this.teamMemberships = this.teamMemberships.filter(m => m.personId !== id);
    return id;
  };

  getGames = (organizationId?: string) => {
      return this.games; 
  };

  getVenues = (organizationId?: string) => {
    if (organizationId) {
      return this.venues.filter(v => v.organizationId === organizationId);
    }
    return this.venues;
  };
  
  getGame = (id: string) => this.games.find((g) => g.id === id);
  
  addGame = (game: Omit<Game, "id" | "status" | "homeScore" | "awayScore"> & { id?: string }) => {
    const newGame: Game = {
      ...game,
      id: game.id || `game-${Date.now()}`,
      status: 'Scheduled',
      homeScore: 0,
      awayScore: 0,
    };
    this.games = [...this.games, newGame];
    return newGame;
  };

  addVenue = (venue: Omit<Venue, "id" | "organizationId"> & { organizationId: string, id?: string }) => {
    // Note: Ensuring organizationId is passed or we default (MOCK_ORG_ID logic should be removed ideally)
    const newVenue: Venue = {
      ...venue,
      id: venue.id || `venue-${Date.now()}`,
    };
    this.venues = [...this.venues, newVenue];
    return newVenue;
  };
  
  updateVenue = (id: string, data: Partial<Venue>) => {
      const index = this.venues.findIndex(v => v.id === id);
      if (index > -1) {
          const updated = { ...this.venues[index], ...data };
          this.venues[index] = updated;
          return updated;
      }
      return null;
  };

  deleteVenue = (id: string) => {
      const venue = this.venues.find(v => v.id === id);
      if (!venue) return null;
      
      this.venues = this.venues.filter(v => v.id !== id);
      return venue; // Return venue to know orgId
  };

  updateGameStatus = (id: string, status: Game['status']) => {
    const game = this.games.find(g => g.id === id);
    if (game) {
      game.status = status;
      return game;
    }
    return null;
  };

  updateScore = (id: string, homeScore: number, awayScore: number) => {
    const game = this.games.find(g => g.id === id);
    if (game) {
      game.homeScore = homeScore;
      game.awayScore = awayScore;
      return game;
    }
    return null;
  };
}

export const dataManager = new DataManager();
