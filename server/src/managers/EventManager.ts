import { Event, Game } from "@sk/types";
import { BaseManager } from "./BaseManager";
import { organizationManager } from "./OrganizationManager";

export class EventManager extends BaseManager {
  async getEvents(orgId?: string): Promise<Event[]> {
    let queryText = 'SELECT id, name, type, start_date as "startDate", end_date as "endDate", site_id as "siteId", facility_id as "facilityId", org_id as "orgId", participating_org_ids as "participatingOrgIds", sport_ids as "sportIds", settings, status FROM events';
    const params: any[] = [];
    if (orgId) {
        queryText += ' WHERE org_id = $1 OR $1 = ANY(participating_org_ids)';
        params.push(orgId);
    }
    const res = await this.query(queryText, params);
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
    if (!orgId) {
        const res = await this.query('SELECT id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, site_id as "siteId", facility_id as "facilityId", home_score as "homeScore", away_score as "awayScore" FROM games');
        return res.rows;
    }
    const res = await this.query(`
        SELECT g.id, g.event_id as "eventId", g.home_team_id as "homeTeamId", g.away_team_id as "awayTeamId", g.away_team_name as "awayTeamName", g.start_time as "startTime", g.status, g.site_id as "siteId", g.facility_id as "facilityId", g.home_score as "homeScore", g.away_score as "awayScore"
        FROM games g
        JOIN events e ON g.event_id = e.id
        WHERE e.org_id = $1 OR $1 = ANY(e.participating_org_ids)
    `, [orgId]);
    return res.rows;
  }

  async getLiveGames(): Promise<Game[]> {
    const res = await this.query(`
        SELECT id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, site_id as "siteId", facility_id as "facilityId", home_score as "homeScore", away_score as "awayScore"
        FROM games
        WHERE status = 'Live' 
           OR (status = 'Scheduled' AND start_time > (NOW() - INTERVAL '24 hours') AND start_time < (NOW() + INTERVAL '7 days'))
        ORDER BY status DESC, start_time ASC
    `);
    return res.rows;
  }

  async getGame(id: string): Promise<Game | undefined> {
    const res = await this.query('SELECT id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, site_id as "siteId", facility_id as "facilityId", home_score as "homeScore", away_score as "awayScore" FROM games WHERE id = $1', [id]);
    return res.rows[0];
  }

  async addGame(game: Omit<Game, "id" | "status" | "homeScore" | "awayScore"> & { id?: string }): Promise<Game> {
      const id = game.id || `game-${Date.now()}`;
      const res = await this.query(
          `INSERT INTO games (id, event_id, home_team_id, away_team_id, away_team_name, start_time, status, site_id, facility_id, home_score, away_score)
           VALUES ($1, $2, $3, $4, $5, $6, 'Scheduled', $7, $8, 0, 0)
           RETURNING id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, site_id as "siteId", facility_id as "facilityId", home_score as "homeScore", away_score as "awayScore"`,
           [id, game.eventId, game.homeTeamId, game.awayTeamId, game.awayTeamName, game.startTime, game.siteId, game.facilityId]
      );
      return res.rows[0];
  }

  async updateGameStatus(id: string, status: Game['status']): Promise<Game | null> {
      const res = await this.query(
          `UPDATE games SET status = $1 WHERE id = $2 RETURNING id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, site_id as "siteId", facility_id as "facilityId", home_score as "homeScore", away_score as "awayScore"`,
          [status, id]
      );
      return res.rows[0] || null;
  }

  async updateScore(id: string, homeScore: number, awayScore: number): Promise<Game | null> {
      const res = await this.query(
          `UPDATE games SET home_score = $1, away_score = $2 WHERE id = $3 RETURNING id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, site_id as "siteId", facility_id as "facilityId", home_score as "homeScore", away_score as "awayScore"`,
          [homeScore, awayScore, id]
      );
      return res.rows[0] || null;
  }

  async updateGame(id: string, data: Partial<Game>): Promise<Game | null> {
      const keys = Object.keys(data).filter(k => k !== 'id');
      if (keys.length === 0) return (await this.getGame(id)) || null;

      const fullMap: Record<string, string> = {
            homeTeamId: 'home_team_id', awayTeamId: 'away_team_id', awayTeamName: 'away_team_name', startTime: 'start_time', status: 'status', siteId: 'site_id', facilityId: 'facility_id', homeScore: 'home_score', awayScore: 'away_score'
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
      
      const res = await this.query(
          `UPDATE games SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, event_id as "eventId", home_team_id as "homeTeamId", away_team_id as "awayTeamId", away_team_name as "awayTeamName", start_time as "startTime", status, site_id as "siteId", facility_id as "facilityId", home_score as "homeScore", away_score as "awayScore"`,
          values
      );
      return res.rows[0] || null;
  }

  async deleteGame(id: string): Promise<Game | null> {
      const game = await this.getGame(id);
      if (!game) return null;

      await this.query('DELETE FROM games WHERE id = $1', [id]);
      return game;
  }
}

export const eventManager = new EventManager();
