import { Event, Game, GameClockState } from "@sk/types";
import { getPeriodLabel } from "@sk/types";
import { BaseManager } from "./BaseManager";
import { organizationManager } from "./OrganizationManager";

export class EventManager extends BaseManager {
  async getEvents(orgId?: string): Promise<Event[]> {
    console.log(`EventManager: getEvents called for org ${orgId}`);
    let queryText = 'SELECT id, name, type, start_date as "startDate", end_date as "endDate", site_id as "siteId", facility_id as "facilityId", org_id as "orgId", participating_org_ids as "participatingOrgIds", sport_ids as "sportIds", settings, status FROM events';
    const params: any[] = [];
    if (orgId) {
        queryText += ' WHERE org_id = $1 OR $1 = ANY(participating_org_ids)';
        params.push(orgId);
    }
    const res = await this.query(queryText, params);
    console.log(`EventManager: Found ${res.rows.length} events for org ${orgId}`);
    return res.rows;
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const res = await this.query('SELECT id, name, type, start_date as "startDate", end_date as "endDate", site_id as "siteId", facility_id as "facilityId", org_id as "orgId", participating_org_ids as "participatingOrgIds", sport_ids as "sportIds", settings, status FROM events WHERE id = $1', [id]);
    return res.rows[0];
  }

  async addEvent(event: Omit<Event, "id"> & { id?: string }): Promise<Event> {
    const id = event.id || `event-${Date.now()}`;
    const res = await this.query(
        `INSERT INTO events (id, name, type, start_date, end_date, site_id, facility_id, org_id, participating_org_ids, sport_ids, settings, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, name, type, start_date as "startDate", end_date as "endDate", site_id as "siteId", facility_id as "facilityId", org_id as "orgId", participating_org_ids as "participatingOrgIds", sport_ids as "sportIds", settings, status`,
         [id, event.name, event.type, event.startDate, event.endDate, event.siteId, event.facilityId, event.orgId, event.participatingOrgIds, event.sportIds, JSON.stringify(event.settings), event.status]
    );
    organizationManager.invalidateCache();
    return res.rows[0];
  }

  async updateEvent(id: string, data: Partial<Event>): Promise<Event | null> {
     const keys = Object.keys(data).filter(k => k !== 'id');
     if (keys.length === 0) return (await this.getEvent(id)) || null;

     const map: Record<string, string> = {
         name: 'name', type: 'type', startDate: 'start_date', endDate: 'end_date', siteId: 'site_id', facilityId: 'facility_id', orgId: 'org_id',
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
     
     const res = await this.query(
         `UPDATE events SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, name, type, start_date as "startDate", end_date as "endDate", site_id as "siteId", facility_id as "facilityId", org_id as "orgId", participating_org_ids as "participatingOrgIds", sport_ids as "sportIds", settings, status`,
         values
     );
     organizationManager.invalidateCache();
     return res.rows[0] || null;
  }

  async deleteEvent(id: string): Promise<Event | null> {
    const event = await this.getEvent(id);
    if (!event) return null;
    
    await this.query('DELETE FROM games WHERE event_id = $1', [id]);
    await this.query('DELETE FROM events WHERE id = $1', [id]);
    organizationManager.invalidateCache();
    return event;
  }

  async getGames(orgId?: string): Promise<Game[]> {
    const selectClause = `g.id, g.event_id as "eventId", g.start_time as "startTime", g.status, g.site_id as "siteId", g.facility_id as "facilityId", g.final_score_data as "finalScoreData", g.custom_settings as "customSettings", g.live_state as "liveState", g.updated_at as "updatedAt", g.finish_time as "finishTime", COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'gameId', p.game_id, 'teamId', p.team_id, 'orgProfileId', p.org_profile_id, 'status', p.status)) FROM game_participants p WHERE p.game_id = g.id), '[]'::jsonb) as participants`;
    if (!orgId) {
        const res = await this.query(`SELECT ${selectClause} FROM games g`);
        return res.rows;
    }
    const res = await this.query(`
        SELECT ${selectClause}
        FROM games g
        JOIN events e ON g.event_id = e.id
        WHERE e.org_id = $1 OR $1 = ANY(e.participating_org_ids)
    `, [orgId]);
    return res.rows;
  }

  async getLiveGames(): Promise<Game[]> {
    const selectClause = `g.id, g.event_id as "eventId", g.start_time as "startTime", g.status, g.site_id as "siteId", g.facility_id as "facilityId", g.final_score_data as "finalScoreData", g.custom_settings as "customSettings", g.live_state as "liveState", g.updated_at as "updatedAt", g.finish_time as "finishTime", COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'gameId', p.game_id, 'teamId', p.team_id, 'orgProfileId', p.org_profile_id, 'status', p.status)) FROM game_participants p WHERE p.game_id = g.id), '[]'::jsonb) as participants`;
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
    const selectClause = `g.id, g.event_id as "eventId", g.start_time as "startTime", g.status, g.site_id as "siteId", g.facility_id as "facilityId", g.final_score_data as "finalScoreData", g.custom_settings as "customSettings", g.live_state as "liveState", g.updated_at as "updatedAt", g.finish_time as "finishTime", COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'gameId', p.game_id, 'teamId', p.team_id, 'orgProfileId', p.org_profile_id, 'status', p.status)) FROM game_participants p WHERE p.game_id = g.id), '[]'::jsonb) as participants`;
    const res = await this.query(`SELECT ${selectClause} FROM games g WHERE g.id = $1`, [id]);
    return res.rows[0];
  }

  async addGame(game: Omit<Game, "id" | "status" | "finalScoreData" | "liveState"> & { id?: string }): Promise<Game> {
      const id = game.id || `game-${Date.now()}`;
      await this.query('BEGIN');
      try {
          await this.query(
              `INSERT INTO games (id, event_id, start_time, status, site_id, facility_id, custom_settings, live_state)
               VALUES ($1, $2, $3, 'Scheduled', $4, $5, $6, '{}'::jsonb)`,
               [id, game.eventId, game.startTime, game.siteId, game.facilityId, game.customSettings || {}]
          );

          if (game.participants && game.participants.length > 0) {
              for (const p of game.participants) {
                  const pid = p.id || `gp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                  await this.query(
                      `INSERT INTO game_participants (id, game_id, team_id, org_profile_id, status) VALUES ($1, $2, $3, $4, 'active')`,
                      [pid, id, p.teamId || null, p.orgProfileId || null]
                  );
              }
          }
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
          // Set startTime if it doesn't exist
          if (!game.startTime) {
              await this.query(`UPDATE games SET status = $1, start_time = NOW(), updated_at = NOW() WHERE id = $2`, [status, id]);
          } else {
              await this.query(`UPDATE games SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);
          }
      } else {
          await this.query(`UPDATE games SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);
      }
      return (await this.getGame(id)) || null;
  }

  async resetGame(id: string): Promise<Game | null> {
      await this.query('BEGIN');
      try {
          await this.query(`
              UPDATE games 
              SET status = 'Scheduled', 
                  start_time = NULL,
                  final_score_data = NULL, 
                  live_state = '{"home": 0, "away": 0, "clock": {"isRunning": false, "elapsedMS": 0, "isPeriodActive": false, "periodIndex": 0}}'::jsonb, 
                  finish_time = NULL, 
                  updated_at = NOW() 
              WHERE id = $1
          `, [id]);
          
          // Also delete all game events
          await this.query(`DELETE FROM game_events WHERE game_id = $1`, [id]);
          
          await this.query('COMMIT');
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
          const sportRes = await this.query('SELECT id, name, default_settings as "defaultSettings" FROM sports WHERE id = $1', [sportId]);
          sport = sportRes.rows[0];
      }

      // Resolve Configuration (Game > Event > Sport > Default)
      const periodLengthMS = game.customSettings?.periodLengthMS 
          || (event as any)?.settings?.periodLengthMS 
          || sport?.defaultSettings?.periodLengthMS 
          || 40 * 60 * 1000;
          
      const scheduledPeriods = game.customSettings?.scheduledPeriods 
          || (event as any)?.settings?.scheduledPeriods 
          || sport?.defaultSettings?.periods 
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
              if (!game.startTime) {
                  await this.query(`UPDATE games SET start_time = NOW() WHERE id = $1`, [id]);
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
      const periodTerm = (sport as any)?.periodTerm || 'Period';
      const periodLabel = getPeriodLabel(clock.periodIndex ?? 0, periodTerm);

      const liveState = { 
          ...(game.liveState || {}), 
          clock,
          periodLabel
      };
      return this.updateGame(id, { liveState });
  }

  async updateGame(id: string, data: Partial<Game>): Promise<Game | null> {
      console.log(`EventManager: updateGame called for ${id}`, data);
      const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'participants');
      
      await this.query('BEGIN');
      try {
          if (keys.length > 0) {
              const fullMap: Record<string, string> = {
                    startTime: 'start_time', status: 'status', siteId: 'site_id', facilityId: 'facility_id', finalScoreData: 'final_score_data', customSettings: 'custom_settings', liveState: 'live_state'
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
              console.log(`EventManager: Updating participants for game ${id}`);
              await this.query('DELETE FROM game_participants WHERE game_id = $1', [id]);
              for (const p of data.participants) {
                  const pid = p.id || `gp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                  await this.query(
                      `INSERT INTO game_participants (id, game_id, team_id, org_profile_id, status) VALUES ($1, $2, $3, $4, 'active')`,
                      [pid, id, p.teamId || null, p.orgProfileId || null]
                  );
              }
          }

          await this.query('COMMIT');
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

      await this.query('DELETE FROM games WHERE id = $1', [id]);
      return game;
  }
}

export const eventManager = new EventManager();
