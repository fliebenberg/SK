import { v4 as uuidv4 } from "uuid";
import { Event, Game, GameParticipant, GameClockState, GameEvent, GameSummary, AddGamePayload, UpdateGamePayload } from "@sk/shared";
import { getPeriodLabel } from "@sk/shared";
import { BaseManager } from "./BaseManager";
import { organizationManager } from "./OrganizationManager";
import { sportManager } from "./SportManager";

export class EventManager extends BaseManager {
  private EVENT_COLUMNS = 'id, name, type, format, start_date as "startDate", end_date as "endDate", site_id as "siteId", facility_id as "facilityId", org_id as "orgId", ARRAY(SELECT org_id FROM event_organizations WHERE event_id = events.id) as "participatingOrgIds", COALESCE((SELECT jsonb_agg(jsonb_build_object(\'id\', o.id, \'name\', o.name, \'shortName\', o.short_name, \'logo\', o.logo, \'logoConfig\', o.settings->\'logoConfig\', \'primaryColor\', o.primary_color, \'isClaimed\', o.is_claimed) ORDER BY o.name) FROM event_organizations eo JOIN organizations o ON o.id = eo.org_id WHERE eo.event_id = events.id), \'[]\'::jsonb) as "participatingOrgs", ARRAY(SELECT sport_id FROM event_sports WHERE event_id = events.id) as "sportIds", settings, status';
  private GAME_COLUMNS = 'g.id, g.event_id as "eventId", g.sport_id as "sportId", g.stage_id as "stageId", (SELECT ds.division_id FROM division_stages ds WHERE ds.id = g.stage_id) as "divisionId", g.start_time as "startTime", g.scheduled_start_time as "scheduledStartTime", g.status, g.site_id as "siteId", g.facility_id as "facilityId", g.final_score_data as "finalScoreData", g.custom_settings as "customSettings", g.live_state as "liveState", g.updated_at as "updatedAt", g.finish_time as "finishTime", COALESCE((SELECT jsonb_agg(jsonb_build_object(\'id\', p.id, \'gameId\', p.game_id, \'teamId\', p.team_id, \'name\', t.name, \'orgProfileId\', p.org_profile_id, \'status\', p.status, \'sortOrder\', p.sort_order, \'entrantId\', p.entrant_id, \'sourceGameId\', p.source_game_id, \'sourceStageId\', p.source_stage_id, \'sourceRule\', p.source_rule) ORDER BY p.sort_order, p.id) FROM game_participants p LEFT JOIN teams t ON t.id = p.team_id WHERE p.game_id = g.id), \'[]\'::jsonb) as participants';

  /**
   * The summary projection: what a fixtures list, match card or scoreboard
   * header needs, and nothing more. Narrower than `GAME_COLUMNS` on purpose —
   * it takes only `scores`, `clock` and `periodLabel` out of `live_state`,
   * leaving sin bins and the `final_score_data` blob behind, and it resolves
   * each participant's org so a client never has to fetch teams and orgs
   * separately just to print "SBHS 1st XV".
   */
  private GAME_SUMMARY_COLUMNS = `
      g.id, g.event_id as "eventId", g.sport_id as "sportId", g.stage_id as "stageId",
      (SELECT ds.division_id FROM division_stages ds WHERE ds.id = g.stage_id) as "divisionId",
      g.start_time as "startTime", g.scheduled_start_time as "scheduledStartTime",
      g.finish_time as "finishTime", g.status,
      g.site_id as "siteId", g.facility_id as "facilityId",
      (g.custom_settings->>'timeTbd')::boolean as "timeTbd",
      g.live_state->'scores' as "scores",
      g.live_state->'clock' as "clock",
      g.live_state->>'periodLabel' as "periodLabel",
      g.updated_at as "updatedAt",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', p.id,
          'teamId', p.team_id,
          'name', COALESCE(t.name, op.name),
          'orgId', COALESCE(t.org_id, e.org_id),
          'orgShortName', o.short_name,
          'status', p.status,
          'sortOrder', p.sort_order,
          -- A tournament side nobody is playing yet (data model §2.0). All null on a single
          -- match and on any fixture whose sides are known. Carried here for the same reason
          -- orgShortName is: resolveFixtureSide prints "TBC — awaiting confirmation" or
          -- "Winner QF1" from the broadcast alone, and a freshly generated knockout is exactly
          -- the screen where every slot is unfilled — so resolving them client-side would be a
          -- lookup per row, on every row.
          'entrantId', p.entrant_id,
          'entrantLabel', e.label,
          'sourceGameId', p.source_game_id,
          'sourceStageId', p.source_stage_id,
          'sourceRule', p.source_rule
        ) ORDER BY p.sort_order, p.id)
        FROM game_participants p
        LEFT JOIN teams t ON t.id = p.team_id
        LEFT JOIN org_profiles op ON op.id = p.org_profile_id
        LEFT JOIN division_entrants e ON e.id = p.entrant_id
        LEFT JOIN organizations o ON o.id = COALESCE(t.org_id, e.org_id)
        WHERE p.game_id = g.id
      ), '[]'::jsonb) as participants`;

  /**
   * Every game an org has a stake in, as summaries. Matches `getGames`'s
   * reach exactly — host org, registered participant orgs, and any game whose
   * participating team belongs to the org.
   */
  async getGameSummaries(orgId?: string): Promise<GameSummary[]> {
    if (!orgId) {
      const res = await this.query(`SELECT ${this.GAME_SUMMARY_COLUMNS} FROM games g`);
      return res.rows;
    }
    const res = await this.query(`
        SELECT ${this.GAME_SUMMARY_COLUMNS}
        FROM games g
        JOIN events e ON g.event_id = e.id
        WHERE e.org_id = $1
           OR EXISTS (SELECT 1 FROM event_organizations eo WHERE eo.event_id = e.id AND eo.org_id = $1)
           OR EXISTS (
               SELECT 1 FROM game_participants gp
               JOIN teams t ON gp.team_id = t.id
               WHERE gp.game_id = g.id AND t.org_id = $1
           )
    `, [orgId]);
    return res.rows;
  }

  async getGameSummary(gameId: string): Promise<GameSummary | undefined> {
    const res = await this.query(`SELECT ${this.GAME_SUMMARY_COLUMNS} FROM games g WHERE g.id = $1`, [gameId]);
    return res.rows[0];
  }

  async getGameSummariesByEvent(eventId: string): Promise<GameSummary[]> {
    const res = await this.query(`SELECT ${this.GAME_SUMMARY_COLUMNS} FROM games g WHERE g.event_id = $1`, [eventId]);
    return res.rows;
  }

  /**
   * One stage's fixtures, in generated order — round, then position in the round.
   *
   * Ordering by `custom_settings.tournament` rather than by kick-off, because a bracket is
   * meaningful before it is scheduled: an unscheduled knockout should still read QF1, QF2, QF3,
   * QF4 rather than falling back to id order.
   */
  async getGameSummariesByStage(stageId: string): Promise<GameSummary[]> {
    const res = await this.query(
      `SELECT ${this.GAME_SUMMARY_COLUMNS} FROM games g
        WHERE g.stage_id = $1
        ORDER BY (g.custom_settings->'tournament'->>'round')::int NULLS LAST,
                 (g.custom_settings->'tournament'->>'matchIndex')::int NULLS LAST,
                 g.start_time NULLS LAST, g.id`,
      [stageId]
    );
    return res.rows;
  }

  /** Every fixture under a division, across all of its stages. */
  async getGameSummariesByDivision(divisionId: string): Promise<GameSummary[]> {
    const res = await this.query(
      `SELECT ${this.GAME_SUMMARY_COLUMNS} FROM games g
         JOIN division_stages s ON s.id = g.stage_id
        WHERE s.division_id = $1
        ORDER BY s.sequence,
                 (g.custom_settings->'tournament'->>'round')::int NULLS LAST,
                 (g.custom_settings->'tournament'->>'matchIndex')::int NULLS LAST,
                 g.start_time NULLS LAST, g.id`,
      [divisionId]
    );
    return res.rows;
  }

  /** What the choke point needs about a fixture *before* it is deleted. */
  async getGameStageContext(gameId: string): Promise<{ stageId: string | null; eventId: string | null }> {
    const res = await this.query(
      `SELECT stage_id as "stageId", event_id as "eventId" FROM games WHERE id = $1`,
      [gameId]
    );
    return { stageId: res.rows[0]?.stageId ?? null, eventId: res.rows[0]?.eventId ?? null };
  }

  async getEvents(orgId?: string): Promise<Event[]> {
    console.log(`EventManager: getEvents called for org ${orgId}`);
    let queryText = `SELECT ${this.EVENT_COLUMNS} FROM events`;
    const params: any[] = [];
    if (orgId) {
        queryText += ` WHERE org_id = $1 
                       OR EXISTS (SELECT 1 FROM event_organizations eo WHERE eo.event_id = events.id AND eo.org_id = $1)
                       OR EXISTS (
                           SELECT 1 FROM games g 
                           JOIN game_participants gp ON gp.game_id = g.id 
                           JOIN teams t ON gp.team_id = t.id 
                           WHERE g.event_id = events.id AND t.org_id = $1
                       )`;
        params.push(orgId);
    }
    const res = await this.query(queryText, params);
    console.log(`EventManager: Found ${res.rows.length} events for org ${orgId}`);
    return res.rows;
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const res = await this.query(`SELECT ${this.EVENT_COLUMNS} FROM events WHERE id = $1`, [id]);
    return res.rows[0];
  }

  async addEvent(event: Omit<Event, "id"> & { id?: string }): Promise<Event> {
    const id = event.id || `event-${Date.now()}`;
    const sportIds = event.sportIds || [];
    const participatingOrgIds = [...new Set(event.participatingOrgIds || [])];

    await this.query('BEGIN');
    try {
        await this.query(
            `INSERT INTO events (id, name, type, format, start_date, end_date, site_id, facility_id, org_id, settings, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
             [id, event.name, event.type, event.format ?? null, event.startDate, event.endDate, event.siteId, event.facilityId, event.orgId, JSON.stringify(event.settings), event.status]
        );

        for (const sportId of sportIds) {
            await this.query('INSERT INTO event_sports (event_id, sport_id) VALUES ($1, $2)', [id, sportId]);
        }

        /*
          The host takes part unless somebody says otherwise, and that is recorded as a row rather
          than assumed by every reader (2026-09-21). Hosting and competing are different things —
          a school can run a tournament it does not play in — and while participation was implicit
          for the host there was nowhere for the difference to live: an absent row could not mean
          "removed", because it already meant "never added".
        */
        for (const orgId of new Set([event.orgId, ...participatingOrgIds].filter(Boolean))) {
            await this.query(
                'INSERT INTO event_organizations (event_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [id, orgId]
            );
        }

        await this.query('COMMIT');
    } catch (error) {
        await this.query('ROLLBACK');
        throw error;
    }

    organizationManager.invalidateCache();
    return (await this.getEvent(id))!;
  }

  async updateEvent(id: string, data: Partial<Event>): Promise<Event | null> {
     const keys = Object.keys(data).filter(k => k !== 'id');
     if (keys.length === 0) return (await this.getEvent(id)) || null;

     await this.query('BEGIN');
     try {
         const sportIds = data.sportIds;
         const participatingOrgIds = data.participatingOrgIds;
         delete data.sportIds;
         delete data.participatingOrgIds;

         const map: Record<string, string> = {
             name: 'name', type: 'type', format: 'format', startDate: 'start_date', endDate: 'end_date', siteId: 'site_id', facilityId: 'facility_id', orgId: 'org_id',
             settings: 'settings', status: 'status'
         };

         const setClauses: string[] = [];
         const values: any[] = [];
         let idx = 1;

         keys.forEach(key => {
            if (map[key]) {
                setClauses.push(`${map[key]} = $${idx}`);
                values.push(key === 'settings' ? JSON.stringify((data as any)[key]) : (data as any)[key]);
                idx++;
            }
         });

         if (setClauses.length > 0) {
             values.push(id);
             await this.query(
                 `UPDATE events SET ${setClauses.join(', ')} WHERE id = $${idx}`,
                 values
             );
         }

         if (sportIds !== undefined) {
             await this.query('DELETE FROM event_sports WHERE event_id = $1', [id]);
             for (const sportId of sportIds) {
                 await this.query('INSERT INTO event_sports (event_id, sport_id) VALUES ($1, $2)', [id, sportId]);
             }
         }

          if (participatingOrgIds !== undefined) {
              const uniqueParticipatingOrgIds = [...new Set(participatingOrgIds)];
              await this.query('DELETE FROM event_organizations WHERE event_id = $1', [id]);
              for (const orgId of uniqueParticipatingOrgIds) {
                  await this.query('INSERT INTO event_organizations (event_id, org_id) VALUES ($1, $2)', [id, orgId]);
              }
          }

         await this.query('COMMIT');
     } catch (error) {
         await this.query('ROLLBACK');
         throw error;
     }

     organizationManager.invalidateCache();
     return (await this.getEvent(id)) || null;
  }

  async deleteEvent(id: string): Promise<Event | null> {
    const event = await this.getEvent(id);
    if (!event) return null;

    // Found by the Phase 3 audit of every `DELETE FROM games`, and it is the older half of what
    // `deleteGame` was missing: deleting an event removes every fixture under it, and a tournament
    // fixture can also count toward a **league season** (D21, `game_seasons`). Nothing recalculated
    // afterwards, so every such season's cached table went on counting matches that no longer
    // existed. The event's own standings need no rebuilding — they go with the row — but the
    // seasons do, and they have to be captured before the delete, since `game_seasons` cascades.
    const affectedSeasons = await this.query(
      `SELECT DISTINCT gs.season_id AS "seasonId"
         FROM game_seasons gs JOIN games g ON g.id = gs.game_id
        WHERE g.event_id = $1`,
      [id]
    );

    await this.query('BEGIN');
    try {
        await this.query('DELETE FROM games WHERE event_id = $1', [id]);
        await this.query('DELETE FROM event_sports WHERE event_id = $1', [id]);
        await this.query('DELETE FROM event_organizations WHERE event_id = $1', [id]);
        await this.query('DELETE FROM events WHERE id = $1', [id]);
        await this.query('COMMIT');
    } catch (error) {
        await this.query('ROLLBACK');
        throw error;
    }

    await this.recalculateSeasons(affectedSeasons.rows.map(r => r.seasonId));
    organizationManager.invalidateCache();
    return event;
  }

  /**
   * Rebuild these league seasons.
   *
   * For the paths that delete fixtures wholesale — an event going, a stage being regenerated —
   * where the choke point cannot help: it resolves a game's seasons from `game_seasons`, and by
   * then those rows have cascaded away with the fixtures. So the seasons are captured first and
   * rebuilt here. Failures are logged rather than thrown; the delete has already happened.
   */
  async recalculateSeasons(seasonIds: string[]): Promise<void> {
    if (!seasonIds.length) return;
    const { LeagueManager } = require("./LeagueManager");
    const leagueManager = new LeagueManager();
    for (const seasonId of seasonIds) {
      try {
        await leagueManager.recalculateSeasonStandings(seasonId);
      } catch (err) {
        console.error(`EventManager: Season recalculation failed for ${seasonId}:`, err);
      }
    }
  }

  async getGames(orgId?: string): Promise<Game[]> {
    const selectClause = this.GAME_COLUMNS;
    if (!orgId) {
        const res = await this.query(`SELECT ${selectClause} FROM games g`);
        return res.rows;
    }
    const res = await this.query(`
        SELECT ${selectClause}
        FROM games g
        JOIN events e ON g.event_id = e.id
        WHERE e.org_id = $1 
           OR EXISTS (SELECT 1 FROM event_organizations eo WHERE eo.event_id = e.id AND eo.org_id = $1)
           OR EXISTS (
               SELECT 1 FROM game_participants gp 
               JOIN teams t ON gp.team_id = t.id 
               WHERE gp.game_id = g.id AND t.org_id = $1
           )
    `, [orgId]);
    return res.rows;
  }

  async getGamesByTeam(teamId: string): Promise<Game[]> {
    const selectClause = this.GAME_COLUMNS;
    const res = await this.query(`
        SELECT ${selectClause}
        FROM games g
        WHERE EXISTS (
            SELECT 1 FROM game_participants gp 
            WHERE gp.game_id = g.id AND gp.team_id = $1
        )
        ORDER BY g.start_time DESC
    `, [teamId]);
    return res.rows;
  }


  async getLiveGames(): Promise<Game[]> {
    const selectClause = this.GAME_COLUMNS;
    const res = await this.query(`
        SELECT ${selectClause}
        FROM games g
        WHERE status = 'Live' 
           OR (status = 'Scheduled' AND start_time > (NOW() - INTERVAL '24 hours') AND start_time < (NOW() + INTERVAL '7 days'))
        ORDER BY status DESC, start_time ASC
    `);
    return res.rows;
  }

  async getGame(id: string): Promise<Game | undefined> {
    const selectClause = this.GAME_COLUMNS;
    const res = await this.query(`SELECT ${selectClause} FROM games g WHERE g.id = $1`, [id]);
    return res.rows[0];
  }

  async addGame(game: AddGamePayload): Promise<Game> {
      // `game-${Date.now()}` collides when several fixtures are created in the same millisecond,
      // which a batch of ninety does routinely — so ids that must be distinct are random, not
      // timestamped. The timestamp form is kept as the fallback for a single hand-added fixture
      // only because existing ids are already in that shape.
      const id = game.id || `game-${uuidv4()}`;
      await this.query('BEGIN');
      try {
          await this.query(
              `INSERT INTO games (id, event_id, sport_id, stage_id, start_time, scheduled_start_time, status, site_id, facility_id, custom_settings, live_state)
               VALUES ($1, $2, $3, $4, $5, $6, 'Scheduled', $7, $8, $9, '{"scores": {}, "sinBins": [], "periodLabel": "1st Period", "clock": {"isRunning": false, "elapsedMS": 0, "isPeriodActive": false, "periodIndex": 0}}'::jsonb)`,
               [id, game.eventId, game.sportId, game.stageId || null, game.startTime, game.scheduledStartTime || game.startTime, game.siteId, game.facilityId, game.customSettings || {}]
          );

          if (game.participants && game.participants.length > 0) {
              let orderIdx = 0;
              for (const p of game.participants) {
                  const pid = p.id || `gp-${uuidv4()}`;
                  await this.query(
                      `INSERT INTO game_participants (id, game_id, team_id, org_profile_id, status, sort_order, entrant_id, source_game_id, source_stage_id, source_rule)
                       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9)`,
                      [
                        pid, id, p.teamId || null, p.orgProfileId || null, p.sortOrder ?? orderIdx++,
                        p.entrantId || null, p.sourceGameId || null, p.sourceStageId || null,
                        p.sourceRule ? JSON.stringify(p.sourceRule) : null,
                      ]
                  );
              }
          }
          await this.syncEventOrganizationsFromGames(game.eventId);
          await this.query('COMMIT');
          return await this.getGame(id) as Game;
      } catch (e) {
          await this.query('ROLLBACK');
          throw e;
      }
  }

  async updateGameStatus(id: string, status: Game['status']): Promise<Game | null> {
      const game = await this.getGame(id);
      if (!game) return null;

      if (status === 'Finished') {
          await this.query(`UPDATE games SET status = $1, finish_time = NOW(), updated_at = NOW() WHERE id = $2`, [status, id]);
      } else if (status === 'Live') {
          // If moving to Live, preserve current start_time as scheduled if not already set
          await this.query(`
            UPDATE games 
            SET status = $1, 
                scheduled_start_time = COALESCE(scheduled_start_time, start_time),
                start_time = NOW(), 
                updated_at = NOW() 
            WHERE id = $2
          `, [status, id]);
      } else {
          await this.query(`UPDATE games SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);
      }
      await this.recalculateStandingsForGame(id);
      return (await this.getGame(id)) || null;
  }

  async resetGame(id: string): Promise<Game | null> {
      await this.query('BEGIN');
      try {
          await this.query(`
              UPDATE games 
              SET status = 'Scheduled', 
                  start_time = COALESCE(scheduled_start_time, start_time),
                  scheduled_start_time = NULL,
                  final_score_data = NULL, 
                  live_state = '{"scores": {}, "sinBins": [], "clock": {"isRunning": false, "elapsedMS": 0, "isPeriodActive": false, "periodIndex": 0}}'::jsonb, 
                  finish_time = NULL, 
                  updated_at = NOW() 
              WHERE id = $1
          `, [id]);
          
          // Also delete all game events and disputes
          await this.query(`DELETE FROM game_disputes WHERE game_id = $1`, [id]);
          await this.query(`DELETE FROM game_events WHERE game_id = $1`, [id]);
          
          await this.query('COMMIT');
          await this.recalculateStandingsForGame(id);
          return (await this.getGame(id)) || null;
      } catch (e) {
          await this.query('ROLLBACK');
          throw e;
      }
  }

  async updateGameClock(id: string, action: 'START' | 'PAUSE' | 'RESUME' | 'RESET' | 'SET_PERIOD' | 'END_PERIOD' | 'START_PERIOD'): Promise<Game | null> {
      const game = await this.getGame(id);
      if (!game) return null;

      const event = await this.getEvent(game.eventId);
      const sportId = event?.sportIds?.[0]; // Assuming single sport for simple lookup
      let sport = null;
      if (sportId) {
          sport = await sportManager.getSport(sportId);
      }

      // Resolve Configuration (Game > Event > Sport > Default)
      const periodLengthMS = game.customSettings?.periodLengthMS 
          || (event as any)?.settings?.periodLengthMS 
          || sport?.defaultSettings?.periodLengthMS 
          || 40 * 60 * 1000;
          
      const scheduledPeriods = game.customSettings?.scheduledPeriods 
          || (event as any)?.settings?.scheduledPeriods 
          || sport?.defaultSettings?.scheduledPeriods 
          || 2;

      const clock: GameClockState = game.liveState?.clock || {
          isRunning: false,
          elapsedMS: 0,
          periodLengthMS,
          isPeriodActive: false,
          lastStartedAt: undefined,
          periodIndex: 0,
          scheduledPeriods,
          totalActualElapsedMS: 0
      };

      const now = new Date().toISOString();
      const nowMS = new Date(now).getTime();
      switch (action) {
          case 'START':
              if (!game.startTime || game.status === 'Scheduled') {
                  await this.query(`
                    UPDATE games 
                    SET scheduled_start_time = COALESCE(scheduled_start_time, start_time),
                        start_time = NOW() 
                    WHERE id = $1
                  `, [id]);
              }
              if (!clock.isRunning) {
                  clock.isRunning = true;
                  clock.lastStartedAt = now;
              }
              clock.isPeriodActive = true;
              clock.periodIndex = 0;
              clock.elapsedMS = 0;
              clock.totalActualElapsedMS = 0;
              break;
          case 'START_PERIOD':
              if (!clock.isRunning) {
                  clock.periodIndex = (clock.periodIndex ?? 0) + 1;
                  clock.elapsedMS = (clock.periodIndex ?? 0) * clock.periodLengthMS;
                  clock.isRunning = true;
                  clock.lastStartedAt = now;
                  clock.isPeriodActive = true;
              }
              break;
          case 'RESUME':
              if (!clock.isRunning) {
                  clock.isRunning = true;
                  clock.lastStartedAt = now;
              }
              clock.isPeriodActive = true;
              break;
          case 'PAUSE':
          case 'END_PERIOD':
              if (clock.isRunning && clock.lastStartedAt) {
                  const startedAtMS = new Date(clock.lastStartedAt).getTime();
                  const delta = (nowMS - startedAtMS);
                  clock.elapsedMS += delta;
                  clock.totalActualElapsedMS = (clock.totalActualElapsedMS ?? 0) + delta;
                  clock.isRunning = false;
                  clock.lastStartedAt = undefined;
              }
              if (action === 'END_PERIOD') {
                  clock.isPeriodActive = false;
              }
              break;
          case 'RESET':
              clock.isRunning = false;
              clock.elapsedMS = 0;
              clock.lastStartedAt = undefined;
              clock.isPeriodActive = false;
              clock.periodIndex = 0;
              clock.totalActualElapsedMS = 0;
              break;
      }
      
      // Update periodLabel in liveState
      const periodTerm = game.customSettings?.periodTerm 
          || (event as any)?.settings?.periodTerm 
          || (sport as any)?.periodTerm 
          || 'Period';
      const periodLabel = getPeriodLabel(clock.periodIndex ?? 0, periodTerm);

      const liveState = { 
          ...(game.liveState || {}), 
          clock,
          periodLabel
      };
      return this.updateGame(id, { liveState });
  }

  async updateGame(id: string, data: UpdateGamePayload['data']): Promise<Game | null> {
      console.log(`EventManager: updateGame called for ${id}`, data);
      const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'participants');
      
      await this.query('BEGIN');
      try {
          if (keys.length > 0) {
              const fullMap: Record<string, string> = {
                    sportId: 'sport_id', stageId: 'stage_id', startTime: 'start_time', scheduledStartTime: 'scheduled_start_time', status: 'status', siteId: 'site_id', facilityId: 'facility_id', finalScoreData: 'final_score_data', customSettings: 'custom_settings', liveState: 'live_state'
              };

              const setClauses: string[] = [];
              const values: any[] = [];
              let idx = 1;

              keys.forEach(key => {
                if (fullMap[key]) {
                    setClauses.push(`${fullMap[key]} = $${idx}`);
                    values.push((data as any)[key]);
                    idx++;
                }
              });
              values.push(id);
              
              const updateQuery = `UPDATE games SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx}`;
              console.log(`EventManager: Executing update: ${updateQuery} with values:`, values);
              await this.query(updateQuery, values);
          }

          if (data.participants) {
              console.log(`EventManager: Reconciling participants for game ${id}`);
              
              // 1. Get existing participants
              const existingRes = await this.query('SELECT id, team_id as "teamId", org_profile_id as "orgProfileId", status, sort_order as "sortOrder" FROM game_participants WHERE game_id = $1', [id]);
              const existing = existingRes.rows;
              
              const claimedExistingIds = new Set<string>();
              const toAdd: any[] = [];

              // 2. Match existing with new
              for (const p of data.participants) {
                  const match = existing.find(e => 
                      !claimedExistingIds.has(e.id) &&
                      (e.teamId === (p.teamId || null)) && 
                      (e.orgProfileId === (p.orgProfileId || null))
                  );
                  
                  if (match) {
                      claimedExistingIds.add(match.id);
                      // Update sort order if provided and changed
                      if (p.sortOrder !== undefined && p.sortOrder !== match.sortOrder) {
                          await this.query('UPDATE game_participants SET sort_order = $1 WHERE id = $2', [p.sortOrder, match.id]);
                      }
                  } else {
                      toAdd.push(p);
                  }
              }

              // 3. Delete those that were not matched
              const toDeleteIds = existing.filter(e => !claimedExistingIds.has(e.id)).map(e => e.id);
              if (toDeleteIds.length > 0) {
                  await this.query('DELETE FROM game_participants WHERE game_id = $1 AND id = ANY($2)', [id, toDeleteIds]);
              }

              // 4. Add new ones
              let orderIdx = existing.length;
              for (const p of toAdd) {
                  const pid = p.id || `gp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                  await this.query(
                      `INSERT INTO game_participants (id, game_id, team_id, org_profile_id, status, sort_order) VALUES ($1, $2, $3, $4, 'active', $5)`,
                      [pid, id, p.teamId || null, p.orgProfileId || null, p.sortOrder ?? orderIdx++]
                  );
              }
          }

          const gameObj = await this.getGame(id);
          if (gameObj) {
              await this.syncEventOrganizationsFromGames(gameObj.eventId);
          }

          await this.query('COMMIT');
          await this.recalculateStandingsForGame(id);
          console.log(`EventManager: updateGame successful for ${id}`);
          return (await this.getGame(id)) || null;
      } catch (e) {
          await this.query('ROLLBACK');
          console.error(`EventManager: Error updating game ${id}:`, e);
          throw e;
      }
  }

  async deleteGame(id: string): Promise<Game | null> {
      const game = await this.getGame(id);
      if (!game) return null;

      // The stage and event have to be captured *before* the row goes, because afterwards there
      // is nothing left to resolve them from — the same reasoning as `captureFixtureRooms`. This
      // path recalculated nothing at all before Phase 3: deleting a finished fixture left every
      // table that had counted it standing, which is exactly the kind of invalidation path the
      // choke point exists to stop anybody forgetting.
      const context = await this.getGameStageContext(id);

      await this.query('DELETE FROM games WHERE id = $1', [id]);
      await this.recalculateStandingsForGame(id, context);
      return game;
  }

  /** The game a participant row belongs to, for authorizing roster reads. */
  async getGameIdForParticipant(participantId: string): Promise<string | null> {
    if (!participantId) return null;
    const res = await this.query('SELECT game_id as "gameId" FROM game_participants WHERE id = $1', [participantId]);
    return res.rows[0]?.gameId || null;
  }

  async getGameRoster(participantId: string): Promise<any[]> {
    const res = await this.query(
        `SELECT gr.id, gr.game_participant_id as "participantId", gr.org_profile_id as "orgProfileId", gr.position, gr.jersey_number as "jerseyNumber", gr.is_reserve as "isReserve", op.name as "name", op.name as "orgProfileName"
         FROM game_rosters gr
         LEFT JOIN org_profiles op ON gr.org_profile_id = op.id
         WHERE gr.game_participant_id = $1`, 
        [participantId]
    );
    return res.rows;
  }

  async saveGameRoster(gameId: string, participantId: string, items: { orgProfileId: string, position?: string, jerseyNumber?: string, isReserve: boolean }[]): Promise<boolean> {
    await this.query('BEGIN');
    try {
        // Clear existing roster for this participant
        await this.query('DELETE FROM game_rosters WHERE game_participant_id = $1', [participantId]);

        // Insert new items
        for (const item of items) {
            const id = `gr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
            await this.query(
                `INSERT INTO game_rosters (id, game_participant_id, org_profile_id, position, jersey_number, is_reserve)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [id, participantId, item.orgProfileId, item.position || null, item.jerseyNumber || null, item.isReserve]
            );
        }

        await this.query('COMMIT');
        return true;
    } catch (e) {
        await this.query('ROLLBACK');
        console.error('Error saving game roster:', e);
        throw e;
    }
  }

  /**
   * Route a changed result through the one function that rewrites a standings table (D30).
   *
   * This used to be `triggerLeagueRecalculations`, which knew about seasons and nothing else. It
   * now defers to `TournamentManager.recalculateForGame`, which does the seasons *and* the stage
   * table, the event roll-up and progression — because a cache is only as good as the paths that
   * invalidate it, and having two of them was how a tournament table would have gone stale while
   * a league table did not.
   *
   * `require` rather than `import` for the same reason the season recalculation always did:
   * `TournamentManager` imports this module for its fixture projections, so a static import here
   * would close the cycle.
   *
   * It **publishes** as well as recalculating, and deliberately so. Every caller of this — a game
   * finishing, a score override, dispute resolution, an undo, a deletion — has to tell the same
   * rooms the same thing, and leaving that to each of them is precisely how `FIX-3` and `FIX-6`
   * happened: three actions that changed a fixture and told nobody's list. One door in, one
   * audience out.
   *
   * Errors are logged, never thrown: a standings cache failing to rebuild must not roll back the
   * result that was just recorded.
   */
  async recalculateStandingsForGame(
    gameId: string,
    context?: { stageId?: string | null; eventId?: string | null }
  ): Promise<{ divisionId: string | null; eventId: string | null; changedGameIds: string[] }> {
    try {
      const { tournamentManager } = require("./TournamentManager");
      const outcome = await tournamentManager.recalculateForGame(gameId, context);
      const { publishRecalculation } = require("../wss/tournaments");
      await publishRecalculation(outcome);
      return outcome;
    } catch (err) {
      console.error(`EventManager: Error recalculating standings for game ${gameId}:`, err);
      return { divisionId: null, eventId: null, changedGameIds: [] };
    }
  }

  async syncEventOrganizationsFromGames(eventId: string): Promise<void> {
      const eventRes = await this.query('SELECT org_id FROM events WHERE id = $1', [eventId]);
      const hostOrgId = eventRes.rows[0]?.org_id;
      if (!hostOrgId) return;

      const orgsRes = await this.query(`
          SELECT DISTINCT t.org_id 
          FROM game_participants gp
          JOIN games g ON gp.game_id = g.id
          JOIN teams t ON gp.team_id = t.id
          WHERE g.event_id = $1 AND t.org_id IS NOT NULL AND t.org_id != $2
      `, [eventId, hostOrgId]);

      const playingOrgIds = orgsRes.rows.map(r => r.org_id);

      for (const orgId of playingOrgIds) {
          await this.query(
              'INSERT INTO event_organizations (event_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [eventId, orgId]
          );
      }
  }
}

export const eventManager = new EventManager();
