import { Organization, Team, Venue, Person, Event, Game, ScoreLog, TeamMembership, Sport, OrganizationMembership, TeamRole, OrganizationRole } from "@sk/types";
import { query } from "./db";

export class DataManager {
  // Hardcoded for now, as they are static data or less likely to change dynamically in this iteration
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

  constructor() {
    console.log("DataManager initialized (Database Mode)");
  }

  getOrganizations = async (): Promise<Organization[]> => {
    const res = await query('SELECT id, name, logo, primary_color as "primaryColor", secondary_color as "secondaryColor", supported_sport_ids as "supportedSportIds", short_name as "shortName", supported_role_ids as "supportedRoleIds" FROM organizations');
    return res.rows;
  };

  getOrganization = async (id?: string): Promise<Organization | undefined> => {
    if (!id) return undefined;
    const res = await query('SELECT id, name, logo, primary_color as "primaryColor", secondary_color as "secondaryColor", supported_sport_ids as "supportedSportIds", short_name as "shortName", supported_role_ids as "supportedRoleIds" FROM organizations WHERE id = $1', [id]);
    return res.rows[0];
  };

  addOrganization = async (org: Omit<Organization, "id"> & { id?: string }): Promise<Organization> => {
    const id = org.id || `org-${Date.now()}`;
    // Defaults
    const supportedSportIds = org.supportedSportIds || [];
    const supportedRoleIds = org.supportedRoleIds || [];
    
    const res = await query(
      `INSERT INTO organizations (id, name, logo, primary_color, secondary_color, supported_sport_ids, short_name, supported_role_ids) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, name, logo, primary_color as "primaryColor", secondary_color as "secondaryColor", supported_sport_ids as "supportedSportIds", short_name as "shortName", supported_role_ids as "supportedRoleIds"`,
      [id, org.name, org.logo, org.primaryColor, org.secondaryColor, supportedSportIds, org.shortName, supportedRoleIds]
    );
    return res.rows[0];
  };

  updateOrganization = async (id: string, data: Partial<Organization>): Promise<Organization | null> => {
    // Dynamic query building could be better, but fixed for now or simple manual check
    // Actually, let's fetch first or just update fields present?
    // Implementing a simple dynamic update helper logic inline
    
    // NOTE: This implementation assumes we update known fields. 
    // For simplicity in this plan, I'll update key fields if provided.
    // A robust solution uses dynamic SET clause.
    
    const keys = Object.keys(data).filter(k => k !== 'id');
    if (keys.length === 0) return this.getOrganization(id).then(r => r || null);

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // Manual mapping for snake_case columns
    // This part is tricky without an ORM.
    const map: Record<string, string> = {
        name: 'name', logo: 'logo', primaryColor: 'primary_color', secondaryColor: 'secondary_color',
        supportedSportIds: 'supported_sport_ids', shortName: 'short_name', supportedRoleIds: 'supported_role_ids'
    };

    keys.forEach(key => {
        if (map[key]) {
            setClauses.push(`${map[key]} = $${idx}`);
            values.push((data as any)[key]);
            idx++;
        }
    });

    if (setClauses.length === 0) return this.getOrganization(id).then(r => r || null);
    values.push(id); // ID is strict
    
    const res = await query(
        `UPDATE organizations SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, logo, primary_color as "primaryColor", secondary_color as "secondaryColor", supported_sport_ids as "supportedSportIds", short_name as "shortName", supported_role_ids as "supportedRoleIds"`,
        values
    );
    return res.rows[0] || null;
  };

  getSports = async (): Promise<Sport[]> => {
    const res = await query('SELECT id, name FROM sports');
    return res.rows;
  };
  
  getSport = async (id: string): Promise<Sport | undefined> => {
      const res = await query('SELECT id, name FROM sports WHERE id = $1', [id]);
      return res.rows[0];
  };

  getTeamRoles = async (): Promise<TeamRole[]> => {
      return this.teamRoles; // Still static for now
  };
  getTeamRole = (id: string) => this.teamRoles.find(r => r.id === id); // Synchronous helper used below, keeping simplistic

  getOrganizationRoles = async (): Promise<OrganizationRole[]> => {
      return this.organizationRoles;
  };
  getOrganizationRole = (id: string) => this.organizationRoles.find(r => r.id === id);

  
  getTeams = async (organizationId?: string): Promise<Team[]> => {
    let queryText = 'SELECT id, name, age_group as "ageGroup", sport_id as "sportId", organization_id as "organizationId", is_active as "isActive" FROM teams';
    const params: any[] = [];
    if (organizationId) {
        queryText += ' WHERE organization_id = $1';
        params.push(organizationId);
    }
    const res = await query(queryText, params);
    
    // Enrich teams
    const teams: Team[] = [];
    for (const t of res.rows) {
        teams.push(await this.enrichTeam(t));
    }
    return teams;
  };

  enrichTeam = async (team: Team): Promise<Team> => {
    // Count players
    const pCountRes = await query(`
        SELECT COUNT(*) as count FROM team_memberships 
        WHERE team_id = $1 AND role_id = 'role-player' AND (end_date IS NULL OR end_date > NOW())
    `, [team.id]);
    
    // Count staff
    const sCountRes = await query(`
        SELECT COUNT(*) as count FROM team_memberships 
        WHERE team_id = $1 AND role_id != 'role-player' AND (end_date IS NULL OR end_date > NOW())
    `, [team.id]);

    return { 
        ...team, 
        playerCount: parseInt(pCountRes.rows[0].count), 
        staffCount: parseInt(sCountRes.rows[0].count) 
    };
  };

  getTeam = async (id: string): Promise<Team | undefined> => {
    const res = await query('SELECT id, name, age_group as "ageGroup", sport_id as "sportId", organization_id as "organizationId", is_active as "isActive" FROM teams WHERE id = $1', [id]);
    if (!res.rows[0]) return undefined;
    return this.enrichTeam(res.rows[0]);
  };

  addTeam = async (team: Omit<Team, "id"> & { id?: string }): Promise<Team> => {
    const id = team.id || `team-${Date.now()}`;
    const res = await query(
        `INSERT INTO teams (id, name, age_group, sport_id, organization_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, age_group as "ageGroup", sport_id as "sportId", organization_id as "organizationId", is_active as "isActive"`,
         [id, team.name, team.ageGroup, team.sportId, team.organizationId, true]
    );
    return res.rows[0];
  };

  addPerson = async (person: Person): Promise<Person> => {
    const res = await query('INSERT INTO persons (id, name) VALUES ($1, $2) RETURNING id, name', [person.id, person.name]);
    return res.rows[0];
  };

  addTeamMember = async (membership: TeamMembership): Promise<TeamMembership> => {
    await query(
        `INSERT INTO team_memberships (id, person_id, team_id, role_id, start_date)
         VALUES ($1, $2, $3, $4, NOW())`,
         [membership.id, membership.personId, membership.teamId, membership.roleId]
    );

    // Auto-add to organization checking
    const team = await this.getTeam(membership.teamId);
    if (team) {
        const orgMemRes = await query(
            `SELECT * FROM organization_memberships WHERE person_id = $1 AND organization_id = $2 AND (end_date IS NULL OR end_date > NOW())`,
            [membership.personId, team.organizationId]
        );
        if (orgMemRes.rowCount === 0) {
             await this.addOrganizationMember(membership.personId, team.organizationId, 'role-org-member');
        }
    }
    return membership;
  };

  addOrganizationMember = async (personId: string, organizationId: string, roleId: string, id?: string): Promise<OrganizationMembership> => {
    // Check existing
    const existing = await query(
       `SELECT * FROM organization_memberships WHERE person_id = $1 AND organization_id = $2 AND (end_date IS NULL OR end_date > NOW())`,
       [personId, organizationId]
    );
    if (existing.rowCount! > 0) {
        // Update role?
        const mId = existing.rows[0].id;
        await query('UPDATE organization_memberships SET role_id = $1 WHERE id = $2', [roleId, mId]);
        return { ...existing.rows[0], roleId };
    }

    const finalId = id || `org-mem-${Date.now()}`;
    const res = await query(
        `INSERT INTO organization_memberships (id, person_id, organization_id, role_id, start_date)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
         [finalId, personId, organizationId, roleId]
    );
    return res.rows[0];
  };

  getTeamMembers = async (teamId: string): Promise<any[]> => {
    const res = await query(`
        SELECT 
            tm.id as "membershipId", tm.role_id as "roleId", tm.start_date as "startDate", tm.end_date as "endDate",
            p.id, p.name,
            tm.team_id as "teamId"
        FROM team_memberships tm
        JOIN persons p ON tm.person_id = p.id
        WHERE tm.team_id = $1 AND (tm.end_date IS NULL OR tm.end_date > NOW())
    `, [teamId]);
    
    return res.rows.map(row => ({
        ...row,
        roleName: this.getTeamRole(row.roleId)?.name
    }));
  };

  getOrganizationMembers = async (organizationId: string): Promise<any[]> => {
    const res = await query(`
        SELECT 
            om.id as "membershipId", om.role_id as "roleId", om.start_date as "startDate", om.end_date as "endDate",
            p.id, p.name,
            om.organization_id as "organizationId"
        FROM organization_memberships om
        JOIN persons p ON om.person_id = p.id
        WHERE om.organization_id = $1 AND (om.end_date IS NULL OR om.end_date > NOW())
    `, [organizationId]);
    
    return res.rows.map(row => ({
        ...row,
        roleName: this.getOrganizationRole(row.roleId)?.name
    }));
  };

  updateTeam = async (id: string, data: Partial<Team>): Promise<Team | null> => {
    const keys = Object.keys(data).filter(k => k !== 'id');
    if (keys.length === 0) return this.getTeam(id).then(r => r || null);

    const map: Record<string, string> = {
        name: 'name', ageGroup: 'age_group', sportId: 'sport_id', organizationId: 'organization_id', isActive: 'is_active'
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    keys.forEach(key => {
        if (map[key]) {
            setClauses.push(`${map[key]} = $${idx}`);
            values.push((data as any)[key]);
            idx++;
        }
    });

    if (setClauses.length === 0) return this.getTeam(id).then(r => r || null);
    values.push(id);
    
    const res = await query(
        `UPDATE teams SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, age_group as "ageGroup", sport_id as "sportId", organization_id as "organizationId", is_active as "isActive"`,
        values
    );
    if (!res.rows[0]) return null;
    return this.enrichTeam(res.rows[0]);
  };

  deleteTeam = async (id: string): Promise<Team | null> => {
     // Check games
     const gamesRes = await query('SELECT 1 FROM games WHERE home_team_id = $1 OR away_team_id = $1', [id]);
     if (gamesRes.rowCount! > 0) {
         throw new Error("Cannot delete team with linked games");
     }

     const team = await this.getTeam(id);
     if (!team) return null;

     await query('DELETE FROM teams WHERE id = $1', [id]);
     return team;
  };
  
  updateTeamMember = async (id: string, data: Partial<TeamMembership>): Promise<TeamMembership | null> => {
      // Assuming we mostly update roles or dates?
      // Need implementations for keys
      const keys = Object.keys(data).filter(k => k !== 'id');
      if (keys.length === 0) return null; // Fetching existing might be hard without knowing keys? 
      
      const map: Record<string, string> = { roleId: 'role_id', startDate: 'start_date', endDate: 'end_date' };
      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;

      keys.forEach(key => {
        if (map[key]) {
            setClauses.push(`${map[key]} = $${idx}`);
            values.push((data as any)[key]);
            idx++;
        }
      });
      values.push(id);

      const res = await query(
          `UPDATE team_memberships SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, person_id as "personId", team_id as "teamId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          values
      );
      return res.rows[0] || null;
  };

  removeTeamMember = async (membershipId: string): Promise<TeamMembership | null> => {
      const res = await query(
          `UPDATE team_memberships SET end_date = NOW() WHERE id = $1 RETURNING id, person_id as "personId", team_id as "teamId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [membershipId]
      );
      return res.rows[0] || null;
  };

  removeOrganizationMember = async (membershipId: string): Promise<OrganizationMembership | null> => {
      const res = await query(
          `UPDATE organization_memberships SET end_date = NOW() WHERE id = $1 RETURNING id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [membershipId]
      );
      return res.rows[0] || null;
  };

  updateOrganizationMember = async (membershipId: string, roleId: string): Promise<OrganizationMembership | null> => {
      const res = await query(
          `UPDATE organization_memberships SET role_id = $1 WHERE id = $2 RETURNING id, person_id as "personId", organization_id as "organizationId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [roleId, membershipId]
      );
      return res.rows[0] || null;
  };

  updatePerson = async (id: string, data: Partial<Person>): Promise<Person | null> => {
     // Assuming name update
     if (data.name) {
         const res = await query('UPDATE persons SET name = $1 WHERE id = $2 RETURNING id, name', [data.name, id]);
         return res.rows[0] || null;
     }
     return null;
  };

  // Skip deletePerson logic for now or implement if critical
  
  getEvents = async (organizationId?: string): Promise<Event[]> => {
    let queryText = 'SELECT id, name, type, start_date as "startDate", end_date as "endDate", venue_id as "venueId", organization_id as "organizationId", participating_org_ids as "participatingOrgIds", sport_ids as "sportIds", settings, status FROM events';
    const params: any[] = [];
    if (organizationId) {
        queryText += ' WHERE organization_id = $1 OR $1 = ANY(participating_org_ids)';
        params.push(organizationId);
    }
    const res = await query(queryText, params);
    return res.rows;
  };

  addEvent = async (event: Omit<Event, "id"> & { id?: string }): Promise<Event> => {
    const id = event.id || `event-${Date.now()}`;
    const res = await query(
        `INSERT INTO events (id, name, type, start_date, end_date, venue_id, organization_id, participating_org_ids, sport_ids, settings, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, name, type, start_date as "startDate", end_date as "endDate", venue_id as "venueId", organization_id as "organizationId", participating_org_ids as "participatingOrgIds", sport_ids as "sportIds", settings, status`,
         [id, event.name, event.type, event.startDate, event.endDate, event.venueId, event.organizationId, event.participatingOrgIds, event.sportIds, JSON.stringify(event.settings), event.status]
    );
    return res.rows[0];
  };

  updateEvent = async (id: string, data: Partial<Event>): Promise<Event | null> => {
     // Similar dynamic update mapping
     const keys = Object.keys(data).filter(k => k !== 'id');
     if (keys.length === 0) return (await this.getEvent(id)) || null;

     const map: Record<string, string> = {
         name: 'name', type: 'type', startDate: 'start_date', endDate: 'end_date', venueId: 'venue_id', organizationId: 'organization_id',
         participatingOrgIds: 'participating_org_ids', sportIds: 'sport_ids', settings: 'settings', status: 'status'
     };

     const setClauses: string[] = [];
     const values: any[] = [];
     let idx = 1;

     keys.forEach(key => {
        if (map[key]) {
            setClauses.push(`${map[key]} = $${idx}`);
            values.push((data as any)[key]);
            idx++;
        }
     });
     values.push(id);
     
     const res = await query(
         `UPDATE events SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, type, start_date as "startDate", end_date as "endDate", venue_id as "venueId", organization_id as "organizationId", participating_org_ids as "participatingOrgIds", sport_ids as "sportIds", settings, status`,
         values
     );
     return res.rows[0] || null;
  };

  deleteEvent = async (id: string): Promise<Event | null> => {
    const event = await this.getEvent(id);
    if (!event) return null;
    
    // Cascade delete games (or define in DB schema cascade? Logic in DataManager said yes)
    await query('DELETE FROM games WHERE event_id = $1', [id]);
    await query('DELETE FROM events WHERE id = $1', [id]);
    return event;
  };

  getGames = async (organizationId?: string): Promise<Game[]> => {
    if (!organizationId) {
        const res = await query('SELECT id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, venue_id as "venueId", home_score as "homeScore", away_score as "awayScore" FROM games');
        return res.rows;
    }
    // Filter by org (host or participant of event)
    const res = await query(`
        SELECT g.id, g.event_id as "eventId", g.home_team_id as "homeTeamId", g.away_team_id as "awayTeamId", g.away_team_name as "awayTeamName", g.start_time as "startTime", g.status, g.venue_id as "venueId", g.home_score as "homeScore", g.away_score as "awayScore"
        FROM games g
        JOIN events e ON g.event_id = e.id
        WHERE e.organization_id = $1 OR $1 = ANY(e.participating_org_ids)
    `, [organizationId]);
    return res.rows;
  };

  getVenues = async (organizationId?: string): Promise<Venue[]> => {
      let queryText = 'SELECT id, name, address, organization_id as "organizationId" FROM venues';
      const params: any[] = [];
      if (organizationId) {
          queryText += ' WHERE organization_id = $1';
          params.push(organizationId);
      }
      const res = await query(queryText, params);
      return res.rows;
  };
  
  getEvent = async (id: string): Promise<Event | undefined> => {
      const res = await query('SELECT id, name, type, start_date as "startDate", end_date as "endDate", venue_id as "venueId", organization_id as "organizationId", participating_org_ids as "participatingOrgIds", sport_ids as "sportIds", settings, status FROM events WHERE id = $1', [id]);
      return res.rows[0];
  };
  
  getGame = async (id: string): Promise<Game | undefined> => {
      const res = await query('SELECT id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, venue_id as "venueId", home_score as "homeScore", away_score as "awayScore" FROM games WHERE id = $1', [id]);
      return res.rows[0];
  };
  
  addGame = async (game: Omit<Game, "id" | "status" | "homeScore" | "awayScore"> & { id?: string }): Promise<Game> => {
      const id = game.id || `game-${Date.now()}`;
      const res = await query(
          `INSERT INTO games (id, event_id, home_team_id, away_team_id, away_team_name, start_time, status, venue_id, home_score, away_score)
           VALUES ($1, $2, $3, $4, $5, $6, 'Scheduled', $7, 0, 0)
           RETURNING id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, venue_id as "venueId", home_score as "homeScore", away_score as "awayScore"`,
           [id, game.eventId, game.homeTeamId, game.awayTeamId, game.awayTeamName, game.startTime, game.venueId]
      );
      return res.rows[0];
  };

  addVenue = async (venue: Omit<Venue, "id" | "organizationId"> & { organizationId: string, id?: string }): Promise<Venue> => {
      const id = venue.id || `venue-${Date.now()}`;
      const res = await query(
          `INSERT INTO venues (id, name, address, organization_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, address, organization_id as "organizationId"`,
           [id, venue.name, venue.address, venue.organizationId]
      );
      return res.rows[0];
  };
  
  updateVenue = async (id: string, data: Partial<Venue>): Promise<Venue | null> => {
      if (data.name || data.address) {
           // Simpler update
           const res = await query(
               `UPDATE venues SET name = COALESCE($1, name), address = COALESCE($2, address) WHERE id = $3 RETURNING id, name, address, organization_id as "organizationId"`,
               [data.name, data.address, id]
           );
           return res.rows[0];
      }
      return (await this.getVenues()).find(v => v.id === id) || null;
  };

  deleteVenue = async (id: string): Promise<Venue | null> => {
      const venueRaw = await query('SELECT * FROM venues WHERE id = $1', [id]);
      if (venueRaw.rowCount === 0) return null;
      const venue = { ...venueRaw.rows[0], organizationId: venueRaw.rows[0].organization_id };
      
      await query('DELETE FROM venues WHERE id = $1', [id]);
      return venue;
  };

  updateGameStatus = async (id: string, status: Game['status']): Promise<Game | null> => {
      const res = await query(
          `UPDATE games SET status = $1 WHERE id = $2 RETURNING id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, venue_id as "venueId", home_score as "homeScore", away_score as "awayScore"`,
          [status, id]
      );
      return res.rows[0] || null;
  };

  updateScore = async (id: string, homeScore: number, awayScore: number): Promise<Game | null> => {
      const res = await query(
          `UPDATE games SET home_score = $1, away_score = $2 WHERE id = $3 RETURNING id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, venue_id as "venueId", home_score as "homeScore", away_score as "awayScore"`,
          [homeScore, awayScore, id]
      );
      return res.rows[0] || null;
  };

  updateGame = async (id: string, data: Partial<Game>): Promise<Game | null> => {
     const keys = Object.keys(data).filter(k => k !== 'id');
     if (keys.length === 0) return (await this.getGame(id)) || null;

     const map: Record<string, string> = {
         venueId: 'venue_id', startTime: 'start_time', status: 'status', homeScore: 'home_score', awayScore: 'away_score' // etc
     };
     // For game, standard map.
     // ... Implementation similar to others
     // Abbreviating for now, assuming standard update needed
     // Ideally we implement the `updateEntity` helper but here I'll just do a targeted update for likely fields if needed
     
     // Quick implementation:
      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;
      
      const fullMap: Record<string, string> = {
           homeTeamId: 'home_team_id', awayTeamId: 'away_team_id', awayTeamName: 'away_team_name', startTime: 'start_time', status: 'status', venueId: 'venue_id', homeScore: 'home_score', awayScore: 'away_score'
      };

      keys.forEach(key => {
        if (fullMap[key]) {
            setClauses.push(`${fullMap[key]} = $${idx}`);
            values.push((data as any)[key]);
            idx++;
        }
      });
      values.push(id);
      
      const res = await query(
          `UPDATE games SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, venue_id as "venueId", home_score as "homeScore", away_score as "awayScore"`,
          values
      );
      return res.rows[0] || null;
  };
}

export const dataManager = new DataManager();
