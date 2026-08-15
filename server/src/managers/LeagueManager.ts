import { BaseManager } from "./BaseManager";
import { League, Season, SeasonTeam, LeagueStandingRow, Game, Team, calculateStandings } from "@sk/shared";
import { v4 as uuidv4 } from "uuid";
import { imageService } from "../services/ImageService";

export class LeagueManager extends BaseManager {
  // --- Leagues CRUD ---
  async getLeagues(orgId?: string): Promise<League[]> {
    if (orgId) {
      const res = await this.query(
        `SELECT id, name, org_id as "orgId", sport_id as "sportId", age_group as "ageGroup", join_policy as "joinPolicy", criteria, logo FROM leagues WHERE org_id = $1 ORDER BY created_at DESC`,
        [orgId]
      );
      return res.rows;
    } else {
      const res = await this.query(
        `SELECT id, name, org_id as "orgId", sport_id as "sportId", age_group as "ageGroup", join_policy as "joinPolicy", criteria, logo FROM leagues ORDER BY created_at DESC`
      );
      return res.rows;
    }
  }

  async getLeague(id: string): Promise<League | null> {
    const res = await this.query(
      `SELECT id, name, org_id as "orgId", sport_id as "sportId", age_group as "ageGroup", join_policy as "joinPolicy", criteria, logo FROM leagues WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  private cleanLogoField(logo?: string): string {
    if (!logo) return "";
    if (logo.includes('/uploads/logos/')) {
      const parts = logo.split('/uploads/logos/');
      const filenameWithSuffix = parts[parts.length - 1];
      return filenameWithSuffix.replace(/_(large|medium|thumb)\.\w+$/, '');
    }
    return logo;
  }

  async createLeague(data: Omit<League, "id"> & { id?: string }): Promise<League> {
    const id = data.id || `lg-${uuidv4()}`;
    
    let logo = data.logo;
    if (logo) {
      if (logo.startsWith('data:image')) {
        logo = await imageService.processLogo(logo, id);
      } else {
        logo = this.cleanLogoField(logo);
      }
    }

    await this.query(
      `INSERT INTO leagues (id, name, org_id, sport_id, age_group, join_policy, criteria, logo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        data.name,
        data.orgId,
        data.sportId,
        data.ageGroup || null,
        data.joinPolicy || 'CLOSED',
        JSON.stringify(data.criteria || {}),
        logo || null
      ]
    );
    return (await this.getLeague(id))!;
  }

  async updateLeague(id: string, data: Partial<League>): Promise<League | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.logo !== undefined) {
      let logo = data.logo;
      if (logo) {
        if (logo.startsWith('data:image')) {
          const oldLeague = await this.getLeague(id);
          if (oldLeague && oldLeague.logo) {
            await imageService.deleteLogo(oldLeague.logo);
          }
          logo = await imageService.processLogo(logo, id);
        } else {
          logo = this.cleanLogoField(logo);
        }
      }
      fields.push(`logo = $${idx++}`);
      values.push(logo || null);
    }

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.ageGroup !== undefined) {
      fields.push(`age_group = $${idx++}`);
      values.push(data.ageGroup || null);
    }
    if (data.joinPolicy !== undefined) {
      fields.push(`join_policy = $${idx++}`);
      values.push(data.joinPolicy);
    }
    if (data.criteria !== undefined) {
      fields.push(`criteria = $${idx++}`);
      values.push(JSON.stringify(data.criteria));
    }

    if (fields.length === 0) return this.getLeague(id);

    values.push(id);
    await this.query(`UPDATE leagues SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return this.getLeague(id);
  }

  async deleteLeague(id: string): Promise<boolean> {
    const league = await this.getLeague(id);
    if (league && league.logo) {
      await imageService.deleteLogo(league.logo);
    }
    const res = await this.query(`DELETE FROM leagues WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Seasons CRUD ---
  async getSeasons(leagueId: string): Promise<Season[]> {
    const res = await this.query(
      `SELECT id, league_id as "leagueId", name, start_date as "startDate", end_date as "endDate", status, settings, cached_standings as "cachedStandings", created_at as "createdAt", updated_at as "updatedAt", logo FROM seasons WHERE league_id = $1 ORDER BY start_date DESC`,
      [leagueId]
    );
    return res.rows;
  }

  async getSeason(id: string): Promise<Season | null> {
    const res = await this.query(
      `SELECT id, league_id as "leagueId", name, start_date as "startDate", end_date as "endDate", status, settings, cached_standings as "cachedStandings", created_at as "createdAt", updated_at as "updatedAt", logo FROM seasons WHERE id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async createSeason(data: Omit<Season, "id" | "cachedStandings" | "createdAt" | "updatedAt"> & { id?: string }): Promise<Season> {
    const id = data.id || `sn-${uuidv4()}`;

    let logo = data.logo;
    if (logo) {
      if (logo.startsWith('data:image')) {
        logo = await imageService.processLogo(logo, id);
      } else {
        logo = this.cleanLogoField(logo);
      }
    }

    await this.query(
      `INSERT INTO seasons (id, league_id, name, start_date, end_date, status, settings, logo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        data.leagueId,
        data.name,
        data.startDate,
        data.endDate,
        data.status || 'UPCOMING',
        JSON.stringify(data.settings || { pointsPerWin: 4, pointsPerDraw: 2, pointsPerLoss: 0 }),
        logo || null
      ]
    );
    return (await this.getSeason(id))!;
  }

  async updateSeason(id: string, data: Partial<Season>): Promise<Season | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.logo !== undefined) {
      let logo = data.logo;
      if (logo) {
        if (logo.startsWith('data:image')) {
          const oldSeason = await this.getSeason(id);
          if (oldSeason && oldSeason.logo) {
            await imageService.deleteLogo(oldSeason.logo);
          }
          logo = await imageService.processLogo(logo, id);
        } else {
          logo = this.cleanLogoField(logo);
        }
      }
      fields.push(`logo = $${idx++}`);
      values.push(logo || null);
    }

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.startDate !== undefined) {
      fields.push(`start_date = $${idx++}`);
      values.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      fields.push(`end_date = $${idx++}`);
      values.push(data.endDate);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(data.status);
    }
    if (data.settings !== undefined) {
      fields.push(`settings = $${idx++}`);
      values.push(JSON.stringify(data.settings));
    }

    if (fields.length === 0) return this.getSeason(id);

    values.push(id);
    await this.query(`UPDATE seasons SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);
    return this.getSeason(id);
  }

  async deleteSeason(id: string): Promise<boolean> {
    const season = await this.getSeason(id);
    if (season && season.logo) {
      await imageService.deleteLogo(season.logo);
    }
    const res = await this.query(`DELETE FROM seasons WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Season Teams (Participants) ---
  async getSeasonTeams(seasonId: string): Promise<(Team & { status: string })[]> {
    const res = await this.query(
      `SELECT t.id, t.name, t.age_group as "ageGroup", t.sport_id as "sportId", t.org_id as "orgId", t.is_active as "isActive", t.creator_id as "creatorId", t.short_name as "shortName", st.status as "status" 
       FROM teams t 
       JOIN season_teams st ON t.id = st.team_id 
       WHERE st.season_id = $1`,
      [seasonId]
    );
    return res.rows;
  }

  async addTeamToSeason(seasonId: string, teamId: string, status: 'approved' | 'pending' = 'approved'): Promise<boolean> {
    // Check if team meets the league's criteria before joining
    const season = await this.getSeason(seasonId);
    if (!season) throw new Error("Season not found");
    const league = await this.getLeague(season.leagueId);
    if (!league) throw new Error("League not found");

    // Fetch team details
    const teamRes = await this.query(`SELECT sport_id as "sportId" FROM teams WHERE id = $1`, [teamId]);
    const team = teamRes.rows[0];
    if (!team) throw new Error("Team not found");

    if (team.sportId !== league.sportId) {
      throw new Error(`Team's sport does not match the league's sport (${league.sportId})`);
    }

    await this.query(
      `INSERT INTO season_teams (season_id, team_id, status) VALUES ($1, $2, $3) ON CONFLICT (season_id, team_id) DO UPDATE SET status = EXCLUDED.status`,
      [seasonId, teamId, status]
    );

    // Recalculate standings because a new team has been registered
    await this.recalculateSeasonStandings(seasonId);
    return true;
  }

  async removeTeamFromSeason(seasonId: string, teamId: string): Promise<boolean> {
    const res = await this.query(`DELETE FROM season_teams WHERE season_id = $1 AND team_id = $2`, [seasonId, teamId]);
    const affected = (res.rowCount ?? 0) > 0;
    if (affected) {
      // Recalculate standings because team is removed
      await this.recalculateSeasonStandings(seasonId);
    }
    return affected;
  }

  // --- Game Seasons Linkage ---
  async addGameToSeason(gameId: string, seasonId: string): Promise<boolean> {
    await this.query(
      `INSERT INTO game_seasons (game_id, season_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [gameId, seasonId]
    );
    // Recalculate standings because game is added
    await this.recalculateSeasonStandings(seasonId);
    return true;
  }

  async removeGameFromSeason(gameId: string, seasonId: string): Promise<boolean> {
    const res = await this.query(`DELETE FROM game_seasons WHERE game_id = $1 AND season_id = $2`, [gameId, seasonId]);
    const affected = (res.rowCount ?? 0) > 0;
    if (affected) {
      await this.recalculateSeasonStandings(seasonId);
    }
    return affected;
  }

  async getSeasonGames(seasonId: string): Promise<string[]> {
    const res = await this.query(`SELECT game_id as "gameId" FROM game_seasons WHERE season_id = $1`, [seasonId]);
    return res.rows.map(r => r.gameId);
  }

  async getGameSeasons(gameId: string): Promise<string[]> {
    const res = await this.query(`SELECT season_id as "seasonId" FROM game_seasons WHERE game_id = $1`, [gameId]);
    return res.rows.map(r => r.seasonId);
  }

  // --- Standings Engine ---
  async recalculateSeasonStandings(seasonId: string): Promise<LeagueStandingRow[]> {
    console.log(`Recalculating standings for season: ${seasonId}`);
    const season = await this.getSeason(seasonId);
    if (!season) throw new Error("Season not found");

    // Fetch approved teams in this season
    const teamsRes = await this.query(
      `SELECT t.id, t.name 
       FROM teams t 
       JOIN season_teams st ON t.id = st.team_id 
       WHERE st.season_id = $1 AND st.status = 'approved'`,
      [seasonId]
    );
    const teams = teamsRes.rows;

    // Fetch all finished games associated with this season
    const gamesRes = await this.query(
      `SELECT g.id, g.final_score_data as "finalScoreData",
              COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                  'id', gp.id, 
                  'teamId', gp.team_id, 
                  'sortOrder', gp.sort_order
                 ) ORDER BY gp.sort_order, gp.id) 
                 FROM game_participants gp 
                 WHERE gp.game_id = g.id), 
                '[]'::jsonb
              ) as participants
       FROM games g
       JOIN game_seasons gs ON g.id = gs.game_id
       WHERE gs.season_id = $1 AND g.status = 'Finished'`,
      [seasonId]
    );
    const games = gamesRes.rows;

    const config = {
      pointsPerWin: season.settings.pointsPerWin ?? 4,
      pointsPerDraw: season.settings.pointsPerDraw ?? 2,
      pointsPerLoss: season.settings.pointsPerLoss ?? 0,
    };

    const sortedStandings = calculateStandings(games, teams, config);

    // Save standings to DB
    await this.query(
      `UPDATE seasons SET cached_standings = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(sortedStandings), seasonId]
    );

    return sortedStandings;
  }
}
