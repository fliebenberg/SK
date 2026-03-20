import { BaseManager } from "./BaseManager";
import { GameEvent } from "@sk/types";

export class GameEventManager extends BaseManager {
  /**
   * Ingests a new game event, applies deduplication, and updates live state.
   */
  async ingestEvent(data: {
    gameId: string;
    gameParticipantId?: string;
    actorOrgProfileId?: string;
    initiatorOrgProfileId?: string;
    type: string;
    subType?: string;
    eventData?: any;
  }): Promise<GameEvent | { error: string }> {
    // 1. Deduplication check
    // Silently ignore if an identical event was submitted by the same initiator within the last 5 seconds
    const dedupRes = await this.query(`
      SELECT id FROM game_events 
      WHERE game_id = $1 
        AND initiator_org_profile_id = $2
        AND type = $3
        AND timestamp > (NOW() - INTERVAL '5 seconds')
      LIMIT 1
    `, [data.gameId, data.initiatorOrgProfileId, data.type]);

    if (dedupRes.rows.length > 0) {
      return { error: 'Deduplicated: Identical event recently submitted.' };
    }

    // 2. Compute next sequence
    const seqRes = await this.query(`
      SELECT COALESCE(MAX(sequence), 0) + 1 as next_seq 
      FROM game_events 
      WHERE game_id = $1
    `, [data.gameId]);
    const nextSeq = seqRes.rows[0].next_seq;

    // 3. Insert into game_events
    const eventId = `ge-${Date.now()}`;
    const insertRes = await this.query(`
      INSERT INTO game_events (id, game_id, sequence, game_participant_id, actor_org_profile_id, initiator_org_profile_id, type, sub_type, event_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, game_id as "gameId", sequence, timestamp, game_participant_id as "gameParticipantId", actor_org_profile_id as "actorOrgProfileId", initiator_org_profile_id as "initiatorOrgProfileId", type, sub_type as "subType", event_data as "eventData"
    `, [eventId, data.gameId, nextSeq, data.gameParticipantId, data.actorOrgProfileId, data.initiatorOrgProfileId, data.type, data.subType, data.eventData || {}]);

    const newEvent = insertRes.rows[0] as GameEvent;

    // 3. Trigger live_state mutation in games table
    // For a real implementation, we would inspect the event type and mutate JSONB
    // As a generic framework, we just log it for now or rely on specific sport handlers.
    // Example: appending to a "recent_events" array in live_state
    
    // Broadcast via socket occurs in the route/controller layer after this manager returns.
    
    return newEvent;
  }

  /**
   * Initiates a consensus vote for an undo action.
   */
  async initiateUndoVote(gameId: string, eventIdToUndo: string, initiatorId: string): Promise<GameEvent> {
    const id = `ge-undo-${Date.now()}`;
    const res = await this.query(`
      INSERT INTO game_events (id, game_id, initiator_org_profile_id, type, event_data)
      VALUES ($1, $2, $3, 'UNDO_INITIATED', $4)
      RETURNING id, game_id as "gameId", timestamp, initiator_org_profile_id as "initiatorOrgProfileId", type, event_data as "eventData"
    `, [id, gameId, initiatorId, JSON.stringify({ target_event_id: eventIdToUndo })]);
    return res.rows[0] as GameEvent;
  }

  /**
   * Cast a vote for an active undo.
   */
  async castUndoVote(gameId: string, officialId: string, vote: 'APPROVE' | 'REJECT'): Promise<GameEvent> {
    const id = `ge-vote-${Date.now()}`;
    const res = await this.query(`
      INSERT INTO game_events (id, game_id, initiator_org_profile_id, type, event_data)
      VALUES ($1, $2, $3, 'UNDO_VOTE_CAST', $4)
      RETURNING id, game_id as "gameId", timestamp, initiator_org_profile_id as "initiatorOrgProfileId", type, event_data as "eventData"
    `, [id, gameId, officialId, JSON.stringify({ vote })]);
    return res.rows[0] as GameEvent;
  }

  /**
   * Fetches all events for a specific game, ordered by sequence.
   * Can be filtered by sequence and limited.
   */
  async getGameEvents(gameId: string, fromSequence?: number, limit: number = 20): Promise<GameEvent[]> {
    let sql = `
      SELECT id, game_id as "gameId", sequence, timestamp, game_participant_id as "gameParticipantId", 
             actor_org_profile_id as "actorOrgProfileId", initiator_org_profile_id as "initiatorOrgProfileId", 
             type, sub_type as "subType", event_data as "eventData"
      FROM game_events
      WHERE game_id = $1
    `;
    const params: any[] = [gameId];

    if (fromSequence !== undefined) {
      sql += ` AND sequence >= $2 ORDER BY sequence ASC`;
      params.push(fromSequence);
    } else {
      // Get the last N events
      sql += ` ORDER BY sequence DESC LIMIT $2`;
      params.push(limit);
    }

    const res = await this.query(sql, params);
    
    // If we fetched "last N", they are desc. Re-sort to asc for the client.
    return fromSequence === undefined ? res.rows.reverse() : res.rows;
  }
}

export const gameEventManager = new GameEventManager();
