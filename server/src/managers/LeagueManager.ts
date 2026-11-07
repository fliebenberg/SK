import { BaseManager } from "./BaseManager";
import { assertSeasonKeepsPrivateOrgsApart } from "./privateOrgs";
import { League, Season, SeasonTeam, LeagueStandingRow, Game, Team, ScoringSystem, calculateStandings, assertCalendarDates } from "@sk/shared";
import { SEASON_EDIT_LABELS, SeasonEditFields, UpdateSeasonPayload, clashingFields, listInWords, seasonEditFields } from "@sk/shared";
import { EditConflictError, nameForUser } from "../utils/editConflict";

import { v4 as uuidv4 } from "uuid";
import { imageService } from "../services/ImageService";

/** Calendar dates, never timestamps (date-formatting skill). */
const SEASON_DATE_FIELDS = { startDate: 'Start date', endDate: 'End date' };

export class LeagueManager extends BaseManager {
  // --- Leagues CRUD ---
  async getLeagues(orgId?: string): Promise<League[]> {
    if (orgId) {
      const res = await this.query(
        `SELECT l.id, l.name, l.org_id as "orgId", l.sport_id as "sportId", l.age_group_id as "ageGroupId", ag.name as "ageGroup", l.join_policy as "joinPolicy", l.criteria, l.logo FROM leagues l LEFT JOIN sport_age_groups ag ON ag.id = l.age_group_id WHERE l.org_id = $1 ORDER BY l.created_at DESC`,
        [orgId]
      );
      return res.rows;
    } else {
      const res = await this.query(
        `SELECT l.id, l.name, l.org_id as "orgId", l.sport_id as "sportId", l.age_group_id as "ageGroupId", ag.name as "ageGroup", l.join_policy as "joinPolicy", l.criteria, l.logo FROM leagues l LEFT JOIN sport_age_groups ag ON ag.id = l.age_group_id ORDER BY l.created_at DESC`
      );
      return res.rows;
    }
  }

  async getLeague(id: string): Promise<League | null> {
    const res = await this.query(
      `SELECT l.id, l.name, l.org_id as "orgId", l.sport_id as "sportId", l.age_group_id as "ageGroupId", ag.name as "ageGroup", l.join_policy as "joinPolicy", l.criteria, l.logo FROM leagues l LEFT JOIN sport_age_groups ag ON ag.id = l.age_group_id WHERE l.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async createLeague(data: Omit<League, "id"> & { id?: string }): Promise<League> {
    const id = data.id || `lg-${uuidv4()}`;
    
    const image = await imageService.stage('logos', data.logo);
    const logo = image.value;

    try {
      await this.query(
        `INSERT INTO leagues (id, name, org_id, sport_id, age_group_id, join_policy, criteria, logo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          data.name,
          data.orgId,
          data.sportId,
          data.ageGroupId || null,
          data.joinPolicy || 'CLOSED',
          JSON.stringify(data.criteria || {}),
          logo || null
        ]
      );
    } catch (error) {
      await image.discard();
      throw error;
    }
    return (await this.getLeague(id))!;
  }

  async updateLeague(id: string, data: Partial<League>): Promise<League | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const previousLogo = data.logo !== undefined ? (await this.getLeague(id))?.logo : undefined;
    const image = await imageService.stage('logos', data.logo);
    if (image.value !== undefined) {
      fields.push(`logo = $${idx++}`);
      values.push(image.value);
    }

    if (data.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.ageGroupId !== undefined) {
      fields.push(`age_group_id = $${idx++}`);
      values.push(data.ageGroupId || null);
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
    try {
      await this.query(`UPDATE leagues SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    } catch (error) {
      await image.discard();
      throw error;
    }
    await image.commit(previousLogo);
    return this.getLeague(id);
  }

  async deleteLeague(id: string): Promise<boolean> {
    const league = await this.getLeague(id);
    const res = await this.query(`DELETE FROM leagues WHERE id = $1`, [id]);
    // Only once the row is gone, so a failed delete leaves the logo it still shows.
    await imageService.release('logos', league?.logo);
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
    assertCalendarDates(data as Record<string, unknown>, SEASON_DATE_FIELDS);
    const id = data.id || `sn-${uuidv4()}`;

    const image = await imageService.stage('logos', data.logo);
    const logo = image.value;

    try {
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
    } catch (error) {
      await image.discard();
      throw error;
    }
    return (await this.getSeason(id))!;
  }

  /**
   * Save a season's settings. Only the fields in `data` are written, and `settings` is merged into
   * what is stored, so a save of the points for a win leaves the other points as they are.
   *
   * `was` (`SYNC-11`): the values the form was opened on, for the fields it changes. When one of
   * them is no longer what is saved, nothing is written and an `EditConflictError` says who last
   * saved the season and what those fields hold now. Checked and written under a row lock, so two
   * saves cannot both pass the check.
   */
  async updateSeason(id: string, data: UpdateSeasonPayload["data"], options: { was?: Partial<SeasonEditFields>; userId?: string | null } = {}): Promise<Season | null> {
    assertCalendarDates(data as Record<string, unknown>, SEASON_DATE_FIELDS);
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const image = await imageService.stage('logos', data.logo);
    if (image.value !== undefined) {
      fields.push(`logo = $${idx++}`);
      values.push(image.value);
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
      fields.push(`settings = COALESCE(settings, '{}'::jsonb) || $${idx++}::jsonb`);
      values.push(JSON.stringify(data.settings ?? {}));
    }

    if (fields.length === 0) return this.getSeason(id);

    fields.push(`updated_by = $${idx++}`);
    values.push(options.userId ?? null);
    values.push(id);
    let previousLogo: string | null | undefined;
    try {
      const found = await this.transaction(async (tx) => {
        const locked = await tx(
          `SELECT s.name, s.start_date AS "startDate", s.end_date AS "endDate", s.settings, s.logo,
                  s.updated_by AS "updatedBy", l.org_id AS "orgId"
             FROM seasons s JOIN leagues l ON l.id = s.league_id
            WHERE s.id = $1
              FOR UPDATE OF s`,
          [id]
        );
        const row = locked.rows[0];
        if (!row) return false;
        previousLogo = row.logo;

        const now = seasonEditFields(row);
        const clashes = clashingFields(options.was, now as unknown as Record<string, unknown>);
        if (clashes.length) {
          const changedBy = await nameForUser(tx, row.updatedBy, row.orgId);
          const what = listInWords(clashes.map(key => SEASON_EDIT_LABELS[key as keyof SeasonEditFields] ?? key));
          throw new EditConflictError(
            `${changedBy ?? 'Someone else'} changed the ${what} after you opened this season. Nothing was saved.`,
            {
              changedBy,
              fields: clashes,
              current: Object.fromEntries(clashes.map(key => [key, (now as unknown as Record<string, unknown>)[key] ?? null])),
            }
          );
        }

        await tx(`UPDATE seasons SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);
        return true;
      });
      if (!found) {
        await image.discard();
        return null;
      }
    } catch (error) {
      await image.discard();
      throw error;
    }
    await image.commit(data.logo !== undefined ? previousLogo : undefined);
    return this.getSeason(id);
  }

  async deleteSeason(id: string): Promise<boolean> {
    const season = await this.getSeason(id);
    const res = await this.query(`DELETE FROM seasons WHERE id = $1`, [id]);
    // Only once the row is gone, so a failed delete leaves the logo it still shows.
    await imageService.release('logos', season?.logo);
    return (res.rowCount ?? 0) > 0;
  }

  // --- Season Teams (Participants) ---
  async getSeasonTeams(seasonId: string): Promise<(Team & { status: string })[]> {
    const res = await this.query(
      `SELECT t.id, t.name, t.age_group_id as "ageGroupId", ag.name as "ageGroup", t.sport_id as "sportId", t.org_id as "orgId", t.is_active as "isActive", t.creator_id as "creatorId", t.short_name as "shortName", st.status as "status" 
       FROM teams t 
       JOIN season_teams st ON t.id = st.team_id 
       LEFT JOIN sport_age_groups ag ON ag.id = t.age_group_id
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

    await this.transaction(async (tx) => {
      await tx(
        `INSERT INTO season_teams (season_id, team_id, status) VALUES ($1, $2, $3) ON CONFLICT (season_id, team_id) DO UPDATE SET status = EXCLUDED.status`,
        [seasonId, teamId, status]
      );
      // A private organisation's seasons hold only its own teams, and its teams join no one else's (`ORG-14`).
      await assertSeasonKeepsPrivateOrgsApart(tx, seasonId);
    });

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
  //
  // Data model §7 lists "a game being attached to or detached from a season" among the paths that
  // must invalidate a cache, and these two deliberately do **not** go through
  // `TournamentManager.recalculateForGame`. Attaching changes a season's membership, not a result:
  // no stage table and no event roll-up moves, so the season is the only thing to rebuild. And
  // detaching *cannot* use the choke point — it resolves its seasons from `game_seasons`, and by
  // then the row is gone, so the season it just left would never be recalculated at all.
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

    // Fetch all finished games associated with this season.
    //
    // `status` and `live_state` are in the projection because the engine needs both, and leaving
    // them out is what `SCORE-14` was: the WHERE clause filtered on `g.status` without selecting
    // it, so every row arrived with `status` undefined and was dropped by the engine's "only
    // finished fixtures count" guard - every season table was zeros. `live_state` is where a score
    // actually lives (`liveState.scores[gameParticipantId]`); `final_score_data` is only written by
    // the event screen's quick-score modal, so without it only quick-scored games would have
    // counted even once the status was there.
    const gamesRes = await this.query(
      `SELECT g.id, g.status, g.final_score_data as "finalScoreData",
              g.live_state as "liveState",
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

    // D19 - a season and a tournament division configure scoring the same way and are ranked by
    // the same engine. A stored season keeps whatever it was created with; 3/1/0 is the default
    // for new ones (D17), and these fallbacks predate that decision.
    const scoring: ScoringSystem = {
      mode: 'byResult',
      pointsPerWin: season.settings.pointsPerWin ?? 4,
      pointsPerDraw: season.settings.pointsPerDraw ?? 2,
      pointsPerLoss: season.settings.pointsPerLoss ?? 0,
    };

    const sortedStandings = calculateStandings(games, teams, { scoring });

    // Save standings to DB
    await this.query(
      `UPDATE seasons SET cached_standings = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(sortedStandings), seasonId]
    );

    return sortedStandings;
  }
}
