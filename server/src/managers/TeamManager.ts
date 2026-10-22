import { Team, TeamRole, TeamMembership, TeamMember } from "@sk/shared";
import { BaseManager } from "./BaseManager";
import { organizationManager } from "./OrganizationManager";
import { restrictedReasonSql } from "./minorAccess";
import { withReason } from "./UserManager";

export class TeamManager extends BaseManager {
  teamRoles: TeamRole[] = [
    { id: "role-player", name: "Player" },
    { id: "role-coach", name: "Coach" },
    { id: "role-assistant-coach", name: "Assistant Coach" },
    { id: "role-manager", name: "Manager" },
    { id: "role-scorer", name: "Scorer" },
    { id: "role-staff", name: "Staff" },
    { id: "role-medic", name: "Medic" },
  ];

  async getTeams(orgId?: string): Promise<Team[]> {
    let queryText = `SELECT t.id, t.name, t.age_group_id as "ageGroupId", ag.name as "ageGroup", t.sport_id as "sportId", t.org_id as "orgId", t.is_active as "isActive", t.creator_id as "creatorId", t.short_name as "shortName" FROM teams t LEFT JOIN sport_age_groups ag ON ag.id = t.age_group_id`;
    const params: any[] = [];
    if (orgId) {
        queryText += ' WHERE t.org_id = $1';
        params.push(orgId);
    }
    const res = await this.query(queryText, params);
    
    const teams: Team[] = [];
    for (const t of res.rows) {
        teams.push(await this.enrichTeam(t));
    }
    return teams;
  }

  /**
   * A team's players over one season — a calendar year, for now (2026-10-22) — for the team page's
   * Players and Results tabs: each player's games (from the game team sheets), what they scored, by
   * the sport's own words ("Try", "Goal"), and their cards (from the match events), with the number
   * and position of their latest team sheet, since a squad keeps neither. `mainScore` is the scoring
   * kind worth the most points (a try, a goal), which names the top scorer; `gamesWithEvents` of
   * `gamesCounted` says what the scorers come from. Players are public by decision until `PEOPLE-4`
   * gives a way to hide them — names, numbers and positions only.
   */
  async getTeamSeasonStats(teamId: string, season: number) {
    const games = await this.query(
      `SELECT g.id AS "gameId", gp.id AS "participantId",
              EXISTS (SELECT 1 FROM game_events e WHERE e.game_id = g.id AND e.game_participant_id = gp.id
                        AND COALESCE(e.event_data->>'status', '') <> 'REMOVED') AS "hasEvents"
         FROM games g JOIN game_participants gp ON gp.game_id = g.id AND gp.team_id = $1
        WHERE g.status = 'Finished'
          AND EXTRACT(YEAR FROM COALESCE(g.start_time, g.scheduled_start_time)) = $2`,
      [teamId, season]
    );
    const participantIds = games.rows.map((r: any) => r.participantId);
    if (!participantIds.length) return { players: [], mainScore: null, gamesCounted: 0, gamesWithEvents: 0 };

    const sheets = await this.query(
      `SELECT r.org_profile_id AS "orgProfileId", COUNT(DISTINCT r.game_participant_id)::int AS played
         FROM game_rosters r WHERE r.game_participant_id = ANY($1::text[]) GROUP BY r.org_profile_id`,
      [participantIds]
    );
    const scores = await this.query(
      `SELECT e.actor_org_profile_id AS "orgProfileId", COALESCE(e.event_data->>'templateName', e.sub_type) AS kind,
              MAX(COALESCE((e.event_data->>'points')::numeric, 0)) AS points, COUNT(*)::int AS n
         FROM game_events e
        WHERE e.game_participant_id = ANY($1::text[]) AND e.type = 'SCORE' AND e.actor_org_profile_id IS NOT NULL
          AND COALESCE(e.event_data->>'status', '') <> 'REMOVED'
          -- A missed kick is a scoring event worth nothing: an attempt, not a score.
          AND COALESCE((e.event_data->>'points')::numeric, 0) > 0
        GROUP BY 1, 2`,
      [participantIds]
    );
    const cards = await this.query(
      `SELECT e.actor_org_profile_id AS "orgProfileId", COUNT(*)::int AS n
         FROM game_events e
        WHERE e.game_participant_id = ANY($1::text[]) AND e.sub_type ILIKE '%card%' AND e.actor_org_profile_id IS NOT NULL
          AND COALESCE(e.event_data->>'status', '') <> 'REMOVED'
        GROUP BY 1`,
      [participantIds]
    );
    const ids = [...new Set([...sheets.rows, ...scores.rows, ...cards.rows].map((r: any) => r.orgProfileId))];
    const people = ids.length
      ? await this.query(
          `SELECT p.id, p.name,
                  (SELECT r.jersey_number FROM game_rosters r JOIN game_participants gp ON gp.id = r.game_participant_id JOIN games g ON g.id = gp.game_id
                    WHERE r.org_profile_id = p.id AND gp.team_id = $2 ORDER BY COALESCE(g.start_time, g.scheduled_start_time) DESC NULLS LAST LIMIT 1) AS "jerseyNumber",
                  (SELECT r.position FROM game_rosters r JOIN game_participants gp ON gp.id = r.game_participant_id JOIN games g ON g.id = gp.game_id
                    WHERE r.org_profile_id = p.id AND gp.team_id = $2 ORDER BY COALESCE(g.start_time, g.scheduled_start_time) DESC NULLS LAST LIMIT 1) AS position
             FROM org_profiles p WHERE p.id = ANY($1::text[])`,
          [ids, teamId]
        )
      : { rows: [] };

    // A team sheet keeps a position's id ("10"); the sport names it ("Fly-half").
    const sport = await this.query(
      `SELECT s.default_settings->'positions' AS positions FROM teams t JOIN sports s ON s.id = t.sport_id WHERE t.id = $1`, [teamId]);
    const positionName = (id: string | null) => {
      if (!id) return null;
      const list = Array.isArray(sport.rows[0]?.positions) ? sport.rows[0].positions : [];
      return list.find((x: any) => String(x.id) === String(id))?.name || id;
    };

    let mainScore: string | null = null;
    let mainPoints = -1;
    for (const r of scores.rows) {
      const pts = Number(r.points) || 0;
      if (pts > mainPoints) { mainPoints = pts; mainScore = r.kind; }
    }
    const players = people.rows.map((p: any) => {
      const scored: Record<string, number> = {};
      for (const r of scores.rows) if (r.orgProfileId === p.id) scored[r.kind] = (scored[r.kind] || 0) + r.n;
      return {
        orgProfileId: p.id,
        name: p.name,
        jerseyNumber: p.jerseyNumber ?? null,
        position: positionName(p.position ?? null),
        played: sheets.rows.find((r: any) => r.orgProfileId === p.id)?.played || 0,
        scores: scored,
        cards: cards.rows.find((r: any) => r.orgProfileId === p.id)?.n || 0,
      };
    });
    return {
      players,
      mainScore,
      gamesCounted: games.rows.length,
      gamesWithEvents: games.rows.filter((r: any) => r.hasEvents).length,
    };
  }

  /**
   * Adds what a teams list row shows beyond the team itself: player and staff counts, and the head
   * coach — the longest-serving current Coach — by name (docs/teams.md). One query for all three.
   */
  async enrichTeam(team: Team): Promise<Team> {
    const res = await this.query(`
        SELECT
          COUNT(*) FILTER (WHERE tm.role_id = 'role-player') AS players,
          COUNT(*) FILTER (WHERE tm.role_id != 'role-player') AS staff,
          (SELECT p.name FROM team_memberships c JOIN org_profiles p ON p.id = c.org_profile_id
            WHERE c.team_id = $1 AND c.role_id = 'role-coach' AND (c.end_date IS NULL OR c.end_date > NOW())
            ORDER BY c.start_date, p.name LIMIT 1) AS coach
        FROM team_memberships tm
        WHERE tm.team_id = $1 AND (tm.end_date IS NULL OR tm.end_date > NOW())
    `, [team.id]);
    const row = res.rows[0];

    return {
        ...team,
        playerCount: parseInt(row.players),
        staffCount: parseInt(row.staff),
        coachName: row.coach ?? null,
    };
  }

  /** The teams a person currently coaches, whose list rows carry their name (`coachName`). */
  async teamIdsCoachedBy(orgProfileId: string): Promise<string[]> {
    const res = await this.query(
      `SELECT DISTINCT team_id FROM team_memberships
        WHERE org_profile_id = $1 AND role_id = 'role-coach' AND (end_date IS NULL OR end_date > NOW())`,
      [orgProfileId]
    );
    return res.rows.map((r: any) => r.team_id);
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const res = await this.query(`SELECT t.id, t.name, t.age_group_id as "ageGroupId", ag.name as "ageGroup", t.sport_id as "sportId", t.org_id as "orgId", t.is_active as "isActive", t.creator_id as "creatorId", t.short_name as "shortName" FROM teams t LEFT JOIN sport_age_groups ag ON ag.id = t.age_group_id WHERE t.id = $1`, [id]);
    if (!res.rows[0]) return undefined;
    return this.enrichTeam(res.rows[0]);
  }

  async addTeam(team: Omit<Team, "id"> & { id?: string }): Promise<Team> {
    const id = team.id || `team-${Date.now()}`;
    await this.query(
        `INSERT INTO teams (id, name, age_group_id, sport_id, org_id, is_active, creator_id, short_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
         [id, team.name, team.ageGroupId || null, team.sportId, team.orgId, true, team.creatorId, team.shortName]
    );
    organizationManager.invalidateCache();
    return (await this.getTeam(id))!;
  }

  async updateTeam(id: string, data: Partial<Team>): Promise<Team | null> {
    // An age group belongs to one sport, so a team that changes sport without naming a new age
    // group loses its old one — the foreign key would refuse the update otherwise.
    if (data.sportId !== undefined && data.ageGroupId === undefined) {
        const current = await this.getTeam(id);
        if (current && current.sportId !== data.sportId) data = { ...data, ageGroupId: null };
    }

    const keys = Object.keys(data).filter(k => k !== 'id');
    if (keys.length === 0) return this.getTeam(id).then(r => r || null);

    const map: Record<string, string> = {
        name: 'name', ageGroupId: 'age_group_id', sportId: 'sport_id', orgId: 'org_id', isActive: 'is_active', creatorId: 'creator_id', shortName: 'short_name'
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    keys.forEach(key => {
        if (map[key]) {
            setClauses.push(`${map[key]} = $${idx}`);
            values.push(key === 'ageGroupId' ? (data.ageGroupId || null) : (data as any)[key]);
            idx++;
        }
    });

    if (setClauses.length === 0) return this.getTeam(id).then(r => r || null);
    values.push(id);
    
    const res = await this.query(
        `UPDATE teams SET ${setClauses.join(', ')} WHERE id = $${idx}`,
        values
    );
    if (!res.rowCount) return null;

    // Org counts are computed live, so there is nothing to update here.
    organizationManager.invalidateCache();
    return this.getTeam(id).then(r => r || null);
  }

  async deleteTeam(id: string): Promise<Team | null> {
     const gamesRes = await this.query('SELECT 1 FROM game_participants WHERE team_id = $1', [id]);
     if (gamesRes.rowCount! > 0) {
         throw new Error("Cannot delete team with linked games");
     }

     const team = await this.getTeam(id);
     if (!team) return null;

     await this.query('DELETE FROM teams WHERE id = $1', [id]);
     
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

  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const res = await this.query(`
        SELECT 
            tm.id as "membershipId", tm.role_id as "roleId", tm.start_date as "startDate", tm.end_date as "endDate",
            p.id, p.name, p.email, p.cellphone, p.birthdate, p.national_id as "nationalId",
            p.identifier as "personOrgId",
            p.org_id as "orgId", p.user_id as "userId", p.image, p.primary_role_id as "primaryRoleId",
            p.last_invite_sent_at as "lastInviteSentAt", p.last_invite_email as "lastInviteEmail", p.image_config as "imageConfig",
            p.own_account_allowed as "ownAccountAllowed",
            ${restrictedReasonSql('p', 't.org_id')} as "restrictedReason",
            (
              p.user_id IS NOT NULL
              OR EXISTS (SELECT 1 FROM users u WHERE u.email = p.email)
              OR EXISTS (SELECT 1 FROM user_emails ue WHERE ue.email = p.email AND ue.verified_at IS NOT NULL)
            ) as "hasAccount",
            tm.team_id as "teamId"
        FROM team_memberships tm
        JOIN org_profiles p ON tm.org_profile_id = p.id
        JOIN teams t ON t.id = tm.team_id
        WHERE tm.team_id = $1 AND (tm.end_date IS NULL OR tm.end_date > NOW())
    `, [teamId]);

    return res.rows.map(row => withReason({
        ...row,
        roleName: this.getTeamRole(row.roleId)?.name
    }));
  }

  /**
   * Everyone on a team is one of its organisation's people, and a Member of it at least — coaches
   * included: there are no outside coaches (decided 2026-10-22, `MEMBER-4`). Someone from another
   * organisation is added as a new person here; their account links up by email.
   */
  async addTeamMember(membership: TeamMembership): Promise<TeamMembership> {
    await this.assertProfileInTeamOrg(membership.orgProfileId, membership.teamId);
    const finalId = membership.id || `tm-${Date.now()}`;
    await this.query(
        `INSERT INTO team_memberships (id, org_profile_id, team_id, role_id, start_date)
         VALUES ($1, $2, $3, $4, NOW())`,
         [finalId, membership.orgProfileId, membership.teamId, membership.roleId]
    );

    const team = await this.getTeam(membership.teamId);
    if (team) {
        const orgMemRes = await this.query(
            `SELECT id, org_profile_id as "orgProfileId", org_id as "orgId", role_id as "roleId", start_date as "startDate", end_date as "endDate" 
             FROM org_memberships 
             WHERE org_profile_id = $1 AND org_id = $2 AND (end_date IS NULL OR end_date > NOW())`,
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
    return { ...membership, id: finalId };
  }

  /** A profile from another organisation would otherwise be put on the team, with a membership here. */
  private async assertProfileInTeamOrg(orgProfileId: string, teamId: string): Promise<void> {
    const res = await this.query(
      `SELECT 1 FROM org_profiles p JOIN teams t ON t.org_id = p.org_id WHERE p.id = $1 AND t.id = $2`,
      [orgProfileId, teamId]
    );
    if (!res.rowCount) throw new Error("That person is not one of this organisation's people, so they cannot join its team.");
  }

  async updateTeamMember(id: string, data: Partial<TeamMembership>): Promise<TeamMembership | null> {
      const keys = Object.keys(data).filter(k => k !== 'id');
      if (keys.length === 0) return null;
      if (data.orgProfileId) {
          const current = await this.query(`SELECT team_id FROM team_memberships WHERE id = $1`, [id]);
          if (current.rows[0]) await this.assertProfileInTeamOrg(data.orgProfileId, current.rows[0].team_id);
      }
      
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
