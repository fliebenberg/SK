import { Team, TeamRole, TeamMembership } from "@sk/types";
import { BaseManager } from "./BaseManager";
import { organizationManager } from "./OrganizationManager";

export class TeamManager extends BaseManager {
  teamRoles: TeamRole[] = [
    { id: "role-player", name: "Player" },
    { id: "role-coach", name: "Coach" },
    { id: "role-staff", name: "Staff" },
    { id: "role-medic", name: "Medic" },
  ];

  async getTeams(orgId?: string): Promise<Team[]> {
    let queryText = 'SELECT id, name, age_group as "ageGroup", sport_id as "sportId", org_id as "orgId", is_active as "isActive", creator_id as "creatorId" FROM teams';
    const params: any[] = [];
    if (orgId) {
        queryText += ' WHERE org_id = $1';
        params.push(orgId);
    }
    const res = await this.query(queryText, params);
    
    const teams: Team[] = [];
    for (const t of res.rows) {
        teams.push(await this.enrichTeam(t));
    }
    return teams;
  }

  async enrichTeam(team: Team): Promise<Team> {
    const pCountRes = await this.query(`
        SELECT COUNT(*) as count FROM team_memberships 
        WHERE team_id = $1 AND role_id = 'role-player' AND (end_date IS NULL OR end_date > NOW())
    `, [team.id]);
    
    const sCountRes = await this.query(`
        SELECT COUNT(*) as count FROM team_memberships 
        WHERE team_id = $1 AND role_id != 'role-player' AND (end_date IS NULL OR end_date > NOW())
    `, [team.id]);

    return { 
        ...team, 
        playerCount: parseInt(pCountRes.rows[0].count), 
        staffCount: parseInt(sCountRes.rows[0].count) 
    };
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const res = await this.query('SELECT id, name, age_group as "ageGroup", sport_id as "sportId", org_id as "orgId", is_active as "isActive", creator_id as "creatorId" FROM teams WHERE id = $1', [id]);
    if (!res.rows[0]) return undefined;
    return this.enrichTeam(res.rows[0]);
  }

  async addTeam(team: Omit<Team, "id"> & { id?: string }): Promise<Team> {
    const id = team.id || `team-${Date.now()}`;
    const res = await this.query(
        `INSERT INTO teams (id, name, age_group, sport_id, org_id, is_active, creator_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, age_group as "ageGroup", sport_id as "sportId", org_id as "orgId", is_active as "isActive", creator_id as "creatorId"`,
         [id, team.name, team.ageGroup, team.sportId, team.orgId, true, team.creatorId]
    );
    if (res.rows[0]) {
        await this.query(
            `UPDATE organizations SET team_count = team_count + 1 WHERE id = $1`,
            [team.orgId]
        );
    }
    organizationManager.invalidateCache();
    return res.rows[0];
  }

  async updateTeam(id: string, data: Partial<Team>): Promise<Team | null> {
    const keys = Object.keys(data).filter(k => k !== 'id');
    if (keys.length === 0) return this.getTeam(id).then(r => r || null);

    const map: Record<string, string> = {
        name: 'name', ageGroup: 'age_group', sportId: 'sport_id', orgId: 'org_id', isActive: 'is_active', creatorId: 'creator_id'
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
    
    const res = await this.query(
        `UPDATE teams SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, age_group as "ageGroup", sport_id as "sportId", org_id as "orgId", is_active as "isActive", creator_id as "creatorId"`,
        values
    );
    if (!res.rows[0]) return null;

    if (data.isActive !== undefined) {
        const team = res.rows[0];
        if (data.isActive) {
            await this.query(`UPDATE organizations SET team_count = team_count + 1 WHERE id = $1`, [team.orgId]);
        } else {
            await this.query(`UPDATE organizations SET team_count = team_count - 1 WHERE id = $1`, [team.orgId]);
        }
    }

    organizationManager.invalidateCache();
    return this.enrichTeam(res.rows[0]);
  }

  async deleteTeam(id: string): Promise<Team | null> {
     const gamesRes = await this.query('SELECT 1 FROM games WHERE home_team_id = $1 OR away_team_id = $1', [id]);
     if (gamesRes.rowCount! > 0) {
         throw new Error("Cannot delete team with linked games");
     }

     const team = await this.getTeam(id);
     if (!team) return null;

     await this.query('DELETE FROM teams WHERE id = $1', [id]);
     
     if (team.isActive) {
         await this.query(`UPDATE organizations SET team_count = team_count - 1 WHERE id = $1`, [team.orgId]);
     }

     organizationManager.invalidateCache();
    return team;
  }

  async getTeamRoles(): Promise<TeamRole[]> {
    return this.teamRoles;
  }

  getTeamRole(id: string) {
    return this.teamRoles.find(r => r.id === id);
  }

  async getTeamMembership(id: string): Promise<TeamMembership | undefined> {
    const res = await this.query('SELECT id, org_profile_id as "orgProfileId", team_id as "teamId", role_id as "roleId", start_date as "startDate", end_date as "endDate" FROM team_memberships WHERE id = $1', [id]);
    return res.rows[0];
  }

  async getTeamMembers(teamId: string): Promise<any[]> {
    const res = await this.query(`
        SELECT 
            tm.id as "membershipId", tm.role_id as "roleId", tm.start_date as "startDate", tm.end_date as "endDate",
            p.id, p.name,
            tm.team_id as "teamId"
        FROM team_memberships tm
        JOIN org_profiles p ON tm.org_profile_id = p.id
        WHERE tm.team_id = $1 AND (tm.end_date IS NULL OR tm.end_date > NOW())
    `, [teamId]);
    
    return res.rows.map(row => ({
        ...row,
        roleName: this.getTeamRole(row.roleId)?.name
    }));
  }

  async addTeamMember(membership: TeamMembership): Promise<TeamMembership> {
    await this.query(
        `INSERT INTO team_memberships (id, org_profile_id, team_id, role_id, start_date)
         VALUES ($1, $2, $3, $4, NOW())`,
         [membership.id, membership.orgProfileId, membership.teamId, membership.roleId]
    );

    const team = await this.getTeam(membership.teamId);
    if (team) {
        const orgMemRes = await this.query(
            `SELECT * FROM org_memberships WHERE org_profile_id = $1 AND org_id = $2 AND (end_date IS NULL OR end_date > NOW())`,
            [membership.orgProfileId, team.orgId]
        );
        if (orgMemRes.rowCount === 0) {
             await this.query(
               `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
                VALUES ($1, $2, $3, $4, NOW())`,
                [`org-mem-${Date.now()}`, membership.orgProfileId, team.orgId, 'role-org-member']
             );
        }
    }
    organizationManager.invalidateCache();
    return membership;
  }

  async updateTeamMember(id: string, data: Partial<TeamMembership>): Promise<TeamMembership | null> {
      const keys = Object.keys(data).filter(k => k !== 'id');
      if (keys.length === 0) return null; 
      
      const map: Record<string, string> = { roleId: 'role_id', startDate: 'start_date', endDate: 'end_date', orgProfileId: 'org_profile_id' };
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

      const res = await this.query(
          `UPDATE team_memberships SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, org_profile_id as "orgProfileId", team_id as "teamId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          values
      );
      return res.rows[0] || null;
  }

  async removeTeamMember(membershipId: string): Promise<TeamMembership | null> {
      const res = await this.query(
          `UPDATE team_memberships SET end_date = NOW() WHERE id = $1 RETURNING id, org_profile_id as "orgProfileId", team_id as "teamId", role_id as "roleId", start_date as "startDate", end_date as "endDate"`,
          [membershipId]
      );
      organizationManager.invalidateCache();
      return res.rows[0] || null;
  }
}

export const teamManager = new TeamManager();
