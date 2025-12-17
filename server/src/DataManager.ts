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

  constructor() {
    console.log("DataManager initialized");
  }

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
      const updatedOrg = { ...this.organizations[orgIndex], ...data };
      this.organizations[orgIndex] = updatedOrg;
      return updatedOrg;
    }
    return null;
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

  getTeams = (organizationId?: string) => {
    if (organizationId) {
      return this.teams.filter(t => t.organizationId === organizationId);
    }
    return this.teams;
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
      const updatedTeam = { ...this.teams[index], ...data };
      this.teams[index] = updatedTeam;
      return updatedTeam;
    }
    return null;
  };

  deleteTeam = (id: string) => {
    this.teams = this.teams.filter(t => t.id !== id);
    return id;
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
  
  addPerson = (person: Omit<Person, "id"> & { id?: string }) => {
    let finalId = person.id;
    if (!finalId) {
         console.warn("DataManager: ID missing in addPerson, generating new one.");
         finalId = `person-${Date.now()}`;
    }
    const newPerson: Person = {
      ...person,
      id: finalId,
    };
    this.persons = [...this.persons, newPerson];
    return newPerson;
  };

  addTeamMember = (membershipData: { personId: string, teamId: string, roleId: string, id?: string }) => {
      // Check if already a member WITH THIS ROLE with no end date
      const existing = this.teamMemberships.find(m => 
        m.personId === membershipData.personId && 
        m.teamId === membershipData.teamId && 
        m.roleId === membershipData.roleId &&
        !m.endDate
      );

      if (existing) {
        return existing;
      }

      let finalId = membershipData.id;
      if (!finalId) {
           finalId = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }

      const membership: TeamMembership = {
          id: finalId,
          personId: membershipData.personId,
          teamId: membershipData.teamId,
          roleId: membershipData.roleId,
          startDate: new Date().toISOString(),
      };
      this.teamMemberships.push(membership);
      return membership;
  };

  removeTeamMember = (membershipId: string) => {
      const membership = this.teamMemberships.find(m => m.id === membershipId);
      if (membership) {
          membership.endDate = new Date().toISOString();
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
