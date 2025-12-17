import { Organization, Team, Venue, Person, Event, Game, ScoreLog, TeamMembership, Sport, OrganizationMembership, TeamRole, OrganizationRole } from "@/types";

  // Initial Mock Data
  const MOCK_ORG_ID = "org-1";

  // Singleton pattern to persist data across HMR in development
  class Store {
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
        { id: "role-org-manager", name: "Manager" },
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

  persons: Person[] = [];
  teamMemberships: TeamMembership[] = [];
  organizationMemberships: OrganizationMembership[] = [];
  events: Event[] = [];
  games: Game[] = [];
  scoreLogs: ScoreLog[] = [];

  getOrganization = (id?: string) => {
    if (id) {
      return this.organizations.find(o => o.id === id) || this.organizations[0];
    }
    return this.organizations[0];
  };

  getSports = () => this.sports;
  
  getSport = (id: string) => this.sports.find(s => s.id === id);

  getTeamRoles = () => this.teamRoles;
  getTeamRole = (id: string) => this.teamRoles.find(r => r.id === id);

  getOrganizationRoles = () => this.organizationRoles;
  getOrganizationRole = (id: string) => this.organizationRoles.find(r => r.id === id);

  getOrganizations = () => this.organizations;
  
  updateOrganization = (id: string, data: Partial<Organization>) => {
    const orgIndex = this.organizations.findIndex(o => o.id === id);
    if (orgIndex > -1) {
      this.organizations[orgIndex] = { ...this.organizations[orgIndex], ...data };
      return this.organizations[orgIndex];
    }
    return null;
  };

  addOrganization = (org: Omit<Organization, "id">) => {
    const newOrg: Organization = {
      ...org,
      id: `org-${Date.now()}`,
    };
    this.organizations = [...this.organizations, newOrg];
    return newOrg;
  };



  getTeams = (organizationId?: string) => {
    if (organizationId) {
      return this.teams.filter(t => t.organizationId === organizationId);
    }
    return this.teams;
  };

  addTeam = (team: Omit<Team, "id">) => {
    const newTeam: Team = {
      ...team,
      id: `team-${Date.now()}`,
      isActive: true,
    };
    this.teams = [...this.teams, newTeam];
    return newTeam;
  };

  addOrganizationMember = (personId: string, organizationId: string, roleId: string) => {
    const existing = this.organizationMemberships.find(m => 
      m.personId === personId && 
      m.organizationId === organizationId && 
      m.roleId === roleId &&
      !m.endDate
    );

    if (existing) return existing;

    const membership: OrganizationMembership = {
      id: `org-mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      personId,
      organizationId,
      roleId,
      startDate: new Date().toISOString(),
    };
    this.organizationMemberships.push(membership);
    return membership;
  };

  getOrganizationMembers = (organizationId: string) => {
    const memberships = this.organizationMemberships.filter(m => m.organizationId === organizationId && !m.endDate);
    return memberships.map(m => {
      const person = this.persons.find(p => p.id === m.personId);
      return {
        ...person!,
        roleId: m.roleId,
        roleName: this.getOrganizationRole(m.roleId)?.name,
        membershipId: m.id,
        startDate: m.startDate,
        endDate: m.endDate
      };
    }).filter(p => p.id);
  };

  updateTeam = (id: string, data: Partial<Team>) => {
    const index = this.teams.findIndex(t => t.id === id);
    if (index > -1) {
      this.teams[index] = { ...this.teams[index], ...data };
      return this.teams[index];
    }
    return null;
  };

  deleteTeam = (id: string) => {
    this.teams = this.teams.filter(t => t.id !== id);
  };
  
  getVenues = (organizationId?: string) => {
    if (organizationId) {
      return this.venues.filter(v => v.organizationId === organizationId);
    }
    return this.venues;
  };

  addVenue = (venue: Omit<Venue, "id" | "organizationId">) => {
    const newVenue: Venue = {
      ...venue,
      id: `venue-${Date.now()}`,
      organizationId: MOCK_ORG_ID, // TODO: Fix this hardcoded ID later
    };
    this.venues = [...this.venues, newVenue];
    return newVenue;
  };

  getTeam = (id: string) => this.teams.find((t) => t.id === id);
  

  
  getPersons = () => this.persons;
  
  getTeamMembers = (teamId: string) => {
    // Return people who are currently members of the team
    const memberships = this.teamMemberships.filter(m => m.teamId === teamId && !m.endDate);
    return memberships.map(m => {
      const person = this.persons.find(p => p.id === m.personId);
      return {
        ...person!,
        roleId: m.roleId,
        roleName: this.getTeamRole(m.roleId)?.name,
        membershipId: m.id
      };
    }).filter(p => p.id); // Valid persons only
  };
  
  addPerson = (person: Omit<Person, "id">) => {
    const newPerson: Person = {
      ...person,
      id: `person-${Date.now()}`,
    };
    this.persons = [...this.persons, newPerson];
    return newPerson;
  };

  addTeamMember = (personId: string, teamId: string, roleId: string) => {
      // Check if already a member WITH THIS ROLE with no end date
      const existing = this.teamMemberships.find(m => 
        m.personId === personId && 
        m.teamId === teamId && 
        m.roleId === roleId &&
        !m.endDate
      );

      if (existing) {
        return existing;
      }
      // Note: We deliberately allow multiple active memberships if the role is different
      // (e.g. Player AND Coach concurrently).

      const membership: TeamMembership = {
          id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          personId,
          teamId,
          roleId,
          startDate: new Date().toISOString(),
      };
      this.teamMemberships.push(membership);
      return membership;
  };

  removeTeamMember = (membershipId: string) => {
      const membership = this.teamMemberships.find(m => m.id === membershipId);
      if (membership) {
          membership.endDate = new Date().toISOString();
      }
  };

  updatePerson = (id: string, data: Partial<Person>) => {
    const index = this.persons.findIndex(p => p.id === id);
    if (index > -1) {
      this.persons[index] = { ...this.persons[index], ...data };
      return this.persons[index];
    }
    return null;
  };

  deletePerson = (id: string) => {
    // Soft delete or real delete? For now, we clean up memberships
    this.persons = this.persons.filter(p => p.id !== id);
    this.teamMemberships = this.teamMemberships.filter(m => m.personId !== id);
  };

  getGames = (organizationId?: string) => {
      // Games are a bit trickier as they might belong to a league or tournament, 
      // but for now let's assume we filter by teams in the org? 
      // Or maybe games should have an organizationId if they are internal?
      // For this mock, let's just return all for now as the data model for games/orgs isn't fully defined for filtering yet.
      // actually, let's just return all for now to avoid breaking things, but ideally we'd filter.
      // Wait, the user specifically complained about "new org shows teams from previous org".
      // So getTeams is the most critical one.
      return this.games; 
  };
  
  getGame = (id: string) => this.games.find((g) => g.id === id);
  
  addGame = (game: Omit<Game, "id" | "status" | "homeScore" | "awayScore">) => {
    const newGame: Game = {
      ...game,
      id: `game-${Date.now()}`,
      status: 'Scheduled',
      homeScore: 0,
      awayScore: 0,
    };
    this.games = [...this.games, newGame];
    return newGame;
  };

  updateGameStatus = (id: string, status: Game['status']) => {
    const game = this.games.find(g => g.id === id);
    if (game) {
      game.status = status;
    }
  };

  updateScore = (id: string, homeScore: number, awayScore: number) => {
    const game = this.games.find(g => g.id === id);
    if (game) {
      game.homeScore = homeScore;
      game.awayScore = awayScore;
    }
  };
}

const globalForStore = globalThis as unknown as { store_v4: Store };

export const store = globalForStore.store_v4 || new Store();

if (process.env.NODE_ENV !== "production") globalForStore.store_v4 = store;
