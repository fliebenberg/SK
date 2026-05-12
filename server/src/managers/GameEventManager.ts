import { BaseManager } from "./BaseManager";
import { GameEvent } from "@sk/types";
import { Server } from "socket.io";
import { dataManager } from "../DataManager";
import { DisputeResolutionHandler, DisputeConfig } from "../sports/core/SportDisputeHandler";
import { sportManager } from "./SportManager";
import { EventTemplate, ActionStep, Outcome } from "@sk/types";

const SPORT_MODULES: Record<string, string> = {};
export class GameEventManager extends BaseManager {
  private activeTimers = new Map<string, NodeJS.Timeout>();
  public io: Server | null = null;
  private GAME_EVENT_COLUMNS = 'id, game_id as "gameId", sequence, timestamp, game_participant_id as "gameParticipantId", actor_org_profile_id as "actorOrgProfileId", initiator_org_profile_id as "initiatorOrgProfileId", type, sub_type as "subType", event_data as "eventData"';
  private DISPUTE_COLUMNS = 'id, game_id as "gameId", game_event_id as "gameEventId", type, initiator_org_profile_id as "initiatorOrgProfileId", status, expires_at as "expiresAt", created_at as "createdAt", resolved_at as "resolvedAt", update_data as "updateData", dispute_config as "disputeConfig"';

  private async getGameSportId(gameId: string): Promise<string | null> {
      try {
          const res = await this.query(`
              SELECT COALESCE(
                 g.custom_settings->>'sportId', 
                 (e.sport_ids)[1]
              ) as "sportId"
              FROM games g
              JOIN events e ON g.event_id = e.id
              WHERE g.id = $1
          `, [gameId]);
          return res.rows[0]?.sportId || null;
      } catch (err) {
          console.error('[Dispute Handlers] Failed to fetch game sportId:', err);
          return null;
      }
  }

  private async getCustomHandler(gameId: string, subType: string): Promise<DisputeResolutionHandler | null> {
      const sportId = await this.getGameSportId(gameId);
      if (!sportId) return null;
      
      const path = SPORT_MODULES[sportId];
      if (!path) return null;
      try {
          // console.log(`[Dispute Handlers] Attempting to load module from ${path} for sport: ${sportId}`);
          const module = await import(path);
          const handlers = module.default;
          
          if (!handlers) return null;
          
          // Case A: Map of handlers (Preferred)
          if (handlers[subType]) {
              return handlers[subType];
          }
          
          // Case B: Single handler (Fallback for simpler sports)
          if (handlers.getDisputeConfig || handlers.handleApprovedDispute) {
              return handlers;
          }
          
          return null;
      } catch (e) {
          console.error(`[Dispute Handlers] Failed to lazy load handler for sport: ${sportId} at path: ${path}`, e);
          return null;
      }
  }

  setIo(io: Server) {
    this.io = io;
  }
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
    // Silently ignore if an identical event was submitted within the last 5 seconds
    const dedupRes = await this.query(`
      SELECT id FROM game_events 
      WHERE game_id = $1 
        AND type = $2
        AND (sub_type = $3 OR (sub_type IS NULL AND $3 IS NULL))
        AND (game_participant_id = $4 OR (game_participant_id IS NULL AND $4 IS NULL))
        AND timestamp > (NOW() - INTERVAL '5 seconds')
      LIMIT 1
    `, [data.gameId, data.type, data.subType, data.gameParticipantId]);

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

    const newEventId = `ge-${Date.now()}`;

    // 3. Rugby-specific check: Prevent double conversions
    if (data.type === 'SCORE' && data.subType === 'Conversion' && data.eventData?.linkedEventId) {
      const existingConv = await this.query(`
        SELECT id FROM game_events 
        WHERE game_id = $1 
          AND type = 'SCORE'
          AND sub_type = 'Conversion'
          AND event_data->>'linkedEventId' = $2
          AND (event_data->>'status' IS NULL OR event_data->>'status' != 'REMOVED')
        LIMIT 1
      `, [data.gameId, data.eventData.linkedEventId]);

      if (existingConv.rows.length > 0) {
        return { error: 'Validation failed: A conversion already exists for this try.' };
      }
    }

    // 4. Insert into game_events
    const insertRes = await this.query(`
      INSERT INTO game_events (id, game_id, sequence, game_participant_id, actor_org_profile_id, initiator_org_profile_id, type, sub_type, event_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${this.GAME_EVENT_COLUMNS}
    `, [newEventId, data.gameId, nextSeq, data.gameParticipantId, data.actorOrgProfileId, data.initiatorOrgProfileId, data.type, data.subType, data.eventData || {}]);

    const newEvent = insertRes.rows[0] as GameEvent;

    // 4. Trigger live_state mutation in games table for scoring
    if (data.type === 'SCORE') {
      let latestScores = null;

      if (data.gameParticipantId) {
        // Individual participant score increment
        const points = data.eventData?.pointsDelta || 0;
        if (points !== 0) {
          const updateRes = await this.query(`
            UPDATE games 
            SET live_state = jsonb_set(
              live_state, 
              '{scores}', 
              COALESCE(live_state->'scores', '{}'::jsonb) || jsonb_build_object($1::text, (COALESCE((live_state->'scores'->$1)::numeric, 0) + $2)::numeric)
            ),
            updated_at = NOW()
            WHERE id = $3
            RETURNING live_state
          `, [data.gameParticipantId, points, data.gameId]);

          if (updateRes.rows.length > 0) {
            latestScores = updateRes.rows[0].live_state.scores;
          }
        } else {
          const gameRes = await this.query(`SELECT live_state->'scores' as scores FROM games WHERE id = $1`, [data.gameId]);
          if (gameRes.rows.length > 0) {
            latestScores = gameRes.rows[0].scores || {};
          }
        }
      } else if (data.eventData?.scores) {
        // Total score override (e.g. Final Score)
        // Use the scores provided in the event data to avoid race conditions with the DB update
        latestScores = data.eventData.scores;
      }

      if (latestScores) {
        await this.query(`
          UPDATE game_events 
          SET event_data = jsonb_set(COALESCE(event_data, '{}'::jsonb), '{scoreSnapshot}', $1::jsonb)
          WHERE id = $2
        `, [JSON.stringify(latestScores), newEvent.id]);
        
        if (!newEvent.eventData) newEvent.eventData = {};
        newEvent.eventData.scoreSnapshot = latestScores;
      }
    }
    
    // 5. Trigger live_state mutation for cards (Sin Bin)
    if (data.subType === 'yellow_card' || data.subType === 'red_card') {
      const sportId = await this.getGameSportId(data.gameId);
      const sport = sportId ? await sportManager.getSport(sportId) : null;
      
      // Fetch game to get custom settings and current state
      const gameRes = await this.query(`
        SELECT live_state->'clock' as clock, 
               custom_settings as "customSettings",
               (SELECT team_id FROM game_participants WHERE id = $1) as "teamId"
        FROM games WHERE id = $2
      `, [data.gameParticipantId, data.gameId]);

      if (gameRes.rows.length > 0) {
        const customSettings = gameRes.rows[0].customSettings || {};
        const defaultSettings = sport?.defaultSettings || {};
        const settings = { ...defaultSettings, ...customSettings };
        
        const type = data.subType === 'yellow_card' ? 'yellow' : 'red';
        const durationMS = type === 'yellow' ? (settings.yellowCardDurationMS || 600000) : (settings.redCardDurationMS || 0);
        const isPermanent = type === 'red' && (settings.isRedCardPermanent ?? true);

        const clock = gameRes.rows[0].clock;
        const teamId = gameRes.rows[0].teamId;
        // Use elapsedMS from eventData if available (captured on client), otherwise fallback to DB clock
        const awardedAtMS = data.eventData?.elapsedMS ?? clock?.elapsedMS ?? 0;

        const sinBinEntry = {
          id: newEvent.id,
          playerId: data.gameParticipantId,
          teamId: teamId,
          awardedAtMS: awardedAtMS,
          durationMS: isPermanent ? 0 : durationMS,
          type: type,
          reason: data.eventData?.reason
        };

        await this.query(`
          UPDATE games 
          SET live_state = jsonb_set(
            live_state, 
            '{sinBins}', 
            COALESCE(live_state->'sinBins', '[]'::jsonb) || $1::jsonb
          ),
          updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(sinBinEntry), data.gameId]);
      }
    }
    
    // Broadcast via socket occurs in the route/controller layer after this manager returns.
    
    return newEvent;
  }

  /**
   * Initiates a consensus vote for an undo action.
   */
  async initiateUndoVote(gameId: string, eventIdToUndo: string, initiatorId: string): Promise<{ success: boolean; dispute?: any; resolved?: boolean; error?: string }> {
    return this.initiateDispute(gameId, eventIdToUndo, initiatorId);
  }

  /**
   * Initiates a consensus vote for an update/correction.
   */
  async initiateUpdateVote(gameId: string, eventId: string, initiatorId: string, updateData: any): Promise<{ success: boolean; dispute?: any; resolved?: boolean; error?: string }> {
    return this.initiateDispute(gameId, eventId, initiatorId, updateData);
  }

  /**
   * Internal helper to initiate a dispute (either undo or update).
   */
  private async initiateDispute(gameId: string, eventId: string, initiatorId: string, updateData?: any): Promise<{ success: boolean; dispute?: any; resolved?: boolean; error?: string }> {
    // Check if an open dispute already exists for this event
    const existingRes = await this.query(`
      SELECT id FROM game_disputes 
      WHERE game_id = $1 AND game_event_id = $2 AND status = 'OPEN'
    `, [gameId, eventId]);

    if ((existingRes.rowCount ?? 0) > 0) {
      return { success: false, error: 'A dispute is already active for this event.' };
    }

    // --- GUARD LOGIC ---
    // Fetch event and template to check if this action is allowed
    const eventRes = await this.query(`SELECT type, sub_type as "subType", event_data as "eventData" FROM game_events WHERE id = $1`, [eventId]);
    const evt = eventRes.rows[0];
    if (!evt) return { success: false, error: 'Event not found.' };

    const sportId = await this.getGameSportId(gameId);
    const sport = sportId ? await sportManager.getSport(sportId) : null;
    const templateId = evt.eventData?.templateId || evt.subType;
    const template = sport?.eventTemplates?.find((t: EventTemplate) => t.id === templateId);
    
    if (!template && templateId) {
        console.warn(`[Dispute Guard] Could not find template for ID: "${templateId}" in sport: ${sportId}`);
    }
    
    const isUndo = !updateData;
    
    if (isUndo) {
        // Structural Guard: Cannot undo a child event directly
        if (evt.eventData?.linkedEventId) {
            return { success: false, error: 'Cannot remove a linked event directly. Please remove the parent event instead.' };
        }
        // Template Guard: check allowUndo
        if (template?.disputeConfig?.allowUndo === false) {
            return { success: false, error: 'This event type is marked as non-removable.' };
        }
    } else {
        // Update Guard: check allowUpdate
        if (template?.disputeConfig?.allowUpdate === false) {
            return { success: false, error: 'This event type is marked as non-modifiable.' };
        }
    }
    // -------------------
    
    const id = `gd-${Date.now()}`;
    
    let durationMinutes = 5; // Default
    try {
        const settingsRes = await this.query(`SELECT value FROM system_settings WHERE key = 'dispute_duration_minutes'`);
        if (settingsRes.rows.length > 0) {
            durationMinutes = parseInt(settingsRes.rows[0].value) || 5;
        }
    } catch (e) {
        console.error("Failed to read dispute_duration_minutes from settings", e);
    }
    
    // TEMPORARY OVERRIDE FOR TESTING (1 MINUTE):
    durationMinutes = 1; 

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

    let res;
    try {
      res = await this.query(`
        INSERT INTO game_disputes (id, game_id, game_event_id, initiator_org_profile_id, expires_at, status, update_data, type)
        VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, $7)
        RETURNING id
      `, [id, gameId, eventId, initiatorId, expiresAt, updateData ? JSON.stringify(updateData) : null, updateData ? 'UPDATE' : 'UNDO']);
      console.log(`[Dispute] DB expires_at set to: ${expiresAt.toISOString()} for ${updateData ? 'UPDATE' : 'UNDO'}`);
    } catch (err: any) {
      console.error(`[Dispute] SQL Error during initiation:`, err.message);
      return { success: false, error: `Database error: ${err.message}` };
    }

    if((res.rowCount ?? 0) === 0) {
      console.error(`[Dispute] Failed to insert dispute row for game ${gameId}`);
      return { success: false, error: 'Failed to initiate dispute.'};
    }
    console.log(`[Dispute] Created dispute ${id} for game ${gameId}, updateData: ${updateData ? 'present' : 'absent'}`);

    // Auto-cast APPROVE vote for the initiator
    const castRes = await this.castVote(gameId, id, initiatorId, 'APPROVE');
    
    // Schedule proactive resolution timer
    this.scheduleResolution(id, expiresAt);
    
    return { success: true, dispute: castRes.dispute, resolved: castRes.resolved };
  }

  /**
   * Recalculates the running score for all events in a game, updating the scoreSnapshot
   * for any event where it has changed, from `fromSequence` onwards.
   * Returns an array of the modified events.
   */
  async recalculateEventScores(gameId: string, fromSequence: number): Promise<{ modifiedEvents: GameEvent[], finalScores: Record<string, number> }> {
      const allEventsRes = await this.query(`
          SELECT id, sequence, type, sub_type as "subType", event_data as "eventData", game_participant_id as "gameParticipantId"
          FROM game_events
          WHERE game_id = $1 AND (type = 'SCORE' OR type = 'GAME_EVENT')
          ORDER BY sequence ASC
      `, [gameId]);

      const scores: Record<string, number> = {};
      const modifiedEvents: GameEvent[] = [];

      for (const row of allEventsRes.rows) {
          const isScoringEvent = row.type === 'SCORE';
          const pointsDelta = Number(row.eventData?.pointsDelta || 0);
          const isRemoved = row.eventData?.status === 'REMOVED';

          if (isScoringEvent && !isRemoved && row.gameParticipantId && pointsDelta !== 0) {
              scores[row.gameParticipantId] = (scores[row.gameParticipantId] || 0) + pointsDelta;
          }

          if (row.eventData?.scores && !isRemoved) {
              Object.assign(scores, row.eventData.scores);
          }

          if (isScoringEvent && row.sequence >= fromSequence) {
              const currentSnapshot = row.eventData?.scoreSnapshot || {};
              // Order-independent JSON stringify for comparison
              const currentSnapshotStr = JSON.stringify(currentSnapshot, Object.keys(currentSnapshot).sort());
              const newScoresStr = JSON.stringify(scores, Object.keys(scores).sort());

              if (currentSnapshotStr !== newScoresStr) {
                  const newEventData = { ...row.eventData, scoreSnapshot: { ...scores } };
                  await this.query(`
                      UPDATE game_events
                      SET event_data = $1::jsonb
                      WHERE id = $2
                  `, [JSON.stringify(newEventData), row.id]);

                  const updatedRes = await this.query(`
                      SELECT ${this.GAME_EVENT_COLUMNS}
                      FROM game_events
                      WHERE id = $1
                  `, [row.id]);
                  if (updatedRes.rows.length > 0) {
                      modifiedEvents.push(updatedRes.rows[0]);
                  }
              }
          }
      }

      return { modifiedEvents, finalScores: scores };
  }

  private scheduleResolution(disputeId: string, expiresAt: Date) {
    // Prevent duplicate timers
    if (this.activeTimers.has(disputeId)) {
        return;
    }

    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    console.log(`[Dispute] Scheduling resolution for ${disputeId} in ${Math.round(delay/1000)}s`);

    const timer = setTimeout(async () => {
        console.log(`[Dispute] Timer fired for ${disputeId}`);
        this.activeTimers.delete(disputeId);
        const result = await this.checkDisputeResolution(disputeId);
        
        if (result.resolved && this.io) {
            this.io.to(`game:${result.dispute.gameId}:events`).emit('update', { 
                type: 'DISPUTE_RESOLVED', 
                data: { dispute: result.dispute } 
            });
            console.log(`[Dispute] Timer-based resolution broadcasted for ${disputeId}`);
        }
    }, delay);

    this.activeTimers.set(disputeId, timer);
  }

  /**
   * Updates an existing game event's data.
   */
  async updateEvent(gameId: string, eventId: string, data: { actorOrgProfileId?: string; gameParticipantId?: string; eventData?: any }): Promise<GameEvent | { error: string }> {
    try {
        // 1. Fetch current state to check for actual changes
        const eventRes = await this.query(`
            SELECT id, sequence, type, sub_type as "subType", actor_org_profile_id as "actorId", 
                   game_participant_id as "gameParticipantId", event_data as "eventData"
            FROM game_events WHERE id = $1
        `, [eventId]);
        
        const current = eventRes.rows[0];
        if (!current) return { error: 'Event not found' };

        // 2. Intelligence: Check if anything actually changed
        let hasChanges = false;
        if (data.actorOrgProfileId !== undefined && data.actorOrgProfileId !== current.actorId) hasChanges = true;
        if (data.gameParticipantId !== undefined && data.gameParticipantId !== current.gameParticipantId) hasChanges = true;
        
        if (data.eventData) {
            for (const key of Object.keys(data.eventData)) {
                if (data.eventData[key] !== current.eventData[key]) {
                    hasChanges = true;
                    break;
                }
            }
        }

        if (!hasChanges) {
            console.log(`[Direct Update] No changes detected for event ${eventId}, skipping mutation.`);
            // Return current state mapped to GameEvent interface
            return {
                id: current.id,
                gameId,
                sequence: current.sequence,
                type: current.type,
                subType: current.subType,
                actorOrgProfileId: current.actorId,
                gameParticipantId: current.gameParticipantId,
                eventData: current.eventData,
                timestamp: current.timestamp // Note: will be added by DB if we fetch again, but for now we just want to avoid the update
            } as any;
        }

        console.log(`[Direct Update] Applying mutation to event ${eventId}`);
        const modifiedEvents = await this.applyMutation(gameId, eventId, data, data.actorOrgProfileId);
        
        if (modifiedEvents.length === 0) return { error: 'Event not found' };

        const mainEvent = modifiedEvents[0];
        const minSequence = Math.min(...modifiedEvents.map(e => e.sequence || 0));
        
        // 3. Fetch current scores to detect changes
        const gameRes = await this.query(`SELECT live_state->'scores' as scores FROM games WHERE id = $1`, [gameId]);
        const previousScores = gameRes.rows[0]?.scores || {};

        const { modifiedEvents: recalculatedEvents, finalScores } = await this.recalculateEventScores(gameId, minSequence);

        // Merge recalculated events into modifiedEvents, preferring recalculated versions
        const allModified = [...modifiedEvents];
        for (const re of recalculatedEvents) {
            const idx = allModified.findIndex(m => m.id === re.id);
            if (idx > -1) {
                allModified[idx] = re;
            } else {
                allModified.push(re);
            }
        }

        // 4. Check if scores actually changed (order-independent comparison)
        const scoresChanged = JSON.stringify(previousScores, Object.keys(previousScores).sort()) !== 
                             JSON.stringify(finalScores, Object.keys(finalScores).sort());

        if (scoresChanged) {
            // Update the game scoreboard in DB
            await this.query(`UPDATE games SET live_state = jsonb_set(live_state, '{scores}', $1::jsonb) WHERE id = $2`, [JSON.stringify(finalScores), gameId]);
        }

        // 5. Broadcast
        if (this.io) {
            this.io.to(`game:${gameId}:events`).emit('update', { type: 'GAME_EVENTS_BATCH_UPDATED', data: allModified });
            
            // Also broadcast individual updates for the main entities
            for (const me of allModified) {
                this.io.to(`game:${gameId}`).emit('update', { type: 'GAME_EVENT_UPDATED', data: me });
            }

            if (scoresChanged) {
                const updatedGame = await dataManager.getGame(gameId);
                if (updatedGame) {
                    this.io.to(`game:${gameId}`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                    this.io.to(`game:${gameId}:detail`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                }
            }
        }

        return allModified.find(e => e.id === eventId) || mainEvent;
    } catch (err: any) {
        console.error(`[Direct Update Error] Failed to update event:`, err);
        return { error: err.message };
    }
  }

  async rehydrateDisputes(): Promise<number> {
    console.log(`[Dispute System] Rehydrating disputes from database...`);
    const expiredRes = await this.query(`
        SELECT id, game_id as "gameId", expires_at as "expiresAt" 
        FROM game_disputes 
        WHERE status = 'OPEN' OR status IS NULL
    `);
    
    let resolvedCount = 0;
    for (const row of expiredRes.rows) {
        const expiresAt = new Date(row.expiresAt);
        if (expiresAt.getTime() <= Date.now()) {
            console.log(`[Dispute System] Resolving expired dispute ${row.id} found at startup/sweep`);
            const result = await this.checkDisputeResolution(row.id);
            if (result.resolved && this.io) {
                this.io.to(`game:${row.gameId}:events`).emit('update', { 
                    type: 'DISPUTE_RESOLVED', 
                    data: { dispute: result.dispute } 
                });
                resolvedCount++;
            }
        } else {
            // Still active, schedule it
            this.scheduleResolution(row.id, expiresAt);
        }
    }
    return resolvedCount;
  }

  /**
   * Cast a vote for an active dispute.
   */
  async castUndoVote(gameId: string, disputeId: string, officialId: string, vote: 'APPROVE' | 'REJECT'): Promise<{ success: boolean; dispute?: any; resolved?: boolean; error?: string }> {
    return this.castVote(gameId, disputeId, officialId, vote);
  }

  async castUpdateVote(gameId: string, disputeId: string, officialId: string, vote: 'APPROVE' | 'REJECT'): Promise<{ success: boolean; dispute?: any; resolved?: boolean; error?: string }> {
    return this.castVote(gameId, disputeId, officialId, vote);
  }

  private async castVote(gameId: string, disputeId: string, officialId: string, vote: 'APPROVE' | 'REJECT'): Promise<{ success: boolean; dispute?: any; resolved?: boolean; error?: string }> {
    const id = `gdv-${Date.now()}`;
    
    // Upsert the vote (so they can change it if they want)
    await this.query(`
      INSERT INTO game_dispute_votes (id, dispute_id, voter_org_profile_id, vote)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (dispute_id, voter_org_profile_id) 
      DO UPDATE SET vote = EXCLUDED.vote, updated_at = NOW()
    `, [id, disputeId, officialId, vote]);

    // Check tally for early resolution
    return await this.checkDisputeResolution(disputeId);
  }

  /**
   * Checks the current tally of a dispute and resolves it if criteria are met.
   */

  /**
   * Internal helper to calculate the tally and categorize votes for a dispute.
   */
  private async calculateTally(gameId: string, disputeId: string, rawDispute: any): Promise<any> {
     // 1. Fetch participants and officials to determine fixed eligible slots
     const gamePartsRes = await this.query(`SELECT team_id as "teamId" FROM game_participants WHERE game_id = $1`, [gameId]);
     const participantTeamIds = gamePartsRes.rows.map(r => r.teamId);

     const neutralsRes = await this.query(`
        SELECT op.id as "profileId", go.role 
        FROM game_officials go
        JOIN org_profiles op ON go.org_profile_id = op.id
        WHERE go.game_id = $1
     `, [gameId]);
     const neutralOfficials = neutralsRes.rows;

     // 2. Determine which teams have coaches/scorers assigned
     const staffRes = await this.query(`
        SELECT tm.team_id as "teamId", tm.role_id as "roleId", tm.org_profile_id as "profileId"
        FROM team_memberships tm
        WHERE tm.team_id = ANY($1) AND (tm.end_date IS NULL OR tm.end_date > NOW())
          AND tm.role_id IN ('role-coach', 'role-assistant-coach', 'role-scorer')
     `, [participantTeamIds]);
     const teamStaff = staffRes.rows;

     // 3. Fetch all votes with voter categorization data
     const votesRes = await this.query(`
        SELECT 
          v.voter_org_profile_id as "voterId", 
          v.vote, 
          v.updated_at as "updatedAt",
          COALESCE(op.name, u_direct.name, 'Admin') as "voterName",
          COALESCE(u.global_role, u_direct.global_role) as "globalRole"
        FROM game_dispute_votes v
        LEFT JOIN org_profiles op ON v.voter_org_profile_id = op.id
        LEFT JOIN users u ON op.user_id = u.id
        LEFT JOIN users u_direct ON v.voter_org_profile_id = u_direct.id
        WHERE v.dispute_id = $1
        ORDER BY v.updated_at ASC
     `, [disputeId]);
     const rawVotes = votesRes.rows;

     // 4. Calculate Tally
     const slots: Record<string, { vote: string, voterName: string, voterId?: string }> = {};
     let adminApprove = 0;
     let adminReject = 0;
     let adminVoterCount = 0;

     for (const v of rawVotes) {
        // A. Is App Admin? (Special dynamic category)
        if (v.globalRole === 'admin') {
            if (v.vote === 'APPROVE') adminApprove++; else adminReject++;
            adminVoterCount++;
            // Include admin votes in the flattened list so the client can identify them
            slots[`admin-${v.voterId}`] = { vote: v.vote, voterName: v.voterName, voterId: v.voterId };
            continue; 
        }

         // B. Is Neutral Official? (Individual slots)
         const neutral = neutralOfficials.find(n => n.profileId === v.voterId);
         if (neutral) {
             slots[`neutral-${v.voterId}`] = { vote: v.vote, voterName: v.voterName };
         }

         // C. Is Team Staff? (Grouped slots: 1 per team/role)
         const staffPositions = teamStaff.filter(s => s.profileId === v.voterId);
         for (const pos of staffPositions) {
             const isCoach = ['role-coach', 'role-assistant-coach'].includes(pos.roleId);
             const type = isCoach ? 'coach' : 'scorer';
             const slotKey = `team-${pos.teamId}-${type}`;
             slots[slotKey] = { vote: v.vote, voterName: v.voterName };
         }
     }

     let approveCount = adminApprove;
     let rejectCount = adminReject;
     Object.entries(slots).forEach(([key, s]) => {
         if (key.startsWith('admin-')) return; // already counted in adminApprove/adminReject
         if (s.vote === 'APPROVE') approveCount++; else rejectCount++;
     });

     const teamsWithCoaches = new Set(teamStaff.filter(s => ['role-coach', 'role-assistant-coach'].includes(s.roleId)).map(s => s.teamId));
     const teamsWithScorers = new Set(teamStaff.filter(s => s.roleId === 'role-scorer').map(s => s.teamId));
     
     const totalEligible = neutralOfficials.length + teamsWithCoaches.size + teamsWithScorers.size + adminVoterCount;

     // Fetch target event to compute dispute display config
     let disputeConfig: DisputeConfig = { heading: 'Remove Event', approveLabel: 'Approve', rejectLabel: 'Reject' };
     try {
         const targetEvtRes = await this.query(
             `SELECT type, sub_type as "subType", event_data as "eventData" FROM game_events WHERE id = $1`,
             [rawDispute.gameEventId]
         );
         if (targetEvtRes.rows.length > 0) {
             const evtRow = targetEvtRes.rows[0];
             
             // 1. Try Template Config (Preferred)
             const sportId = await this.getGameSportId(rawDispute.gameId);
             const sport = sportId ? await sportManager.getSport(sportId) : null;
             const templateId = evtRow.eventData?.templateId || evtRow.subType;
             const template = sport?.eventTemplates?.find((t: EventTemplate) => t.id === templateId);

             if (!template && templateId) {
                 console.warn(`[Dispute Tally] Template not found for ID: "${templateId}" in sport: ${sportId}`);
             }
             
             if (template?.disputeConfig) {
                 disputeConfig = {
                     ...disputeConfig,
                     ...template.disputeConfig,
                     heading: template.disputeConfig.heading || (rawDispute.type === 'UPDATE' ? 'Update Event' : 'Remove Event')
                 } as any;
             } else {
                 // 2. Fallback to Legacy Custom Handler
                 const customHandler = await this.getCustomHandler(rawDispute.gameId, evtRow.subType);
                 if (customHandler && customHandler.getDisputeConfig) {
                     const customConfig = customHandler.getDisputeConfig(evtRow.eventData, evtRow.subType);
                     if (customConfig) disputeConfig = customConfig;
                 }
             }

             // 3. Intelligence: Dynamic Outcome Labels for Updates
             if (rawDispute.type === 'UPDATE' && rawDispute.updateData) {
                 const currentOutcome = evtRow.eventData?.outcome;
                 const suggestedOutcome = rawDispute.updateData.newOutcome || rawDispute.updateData.eventData?.outcome;
                 
                 if (currentOutcome && suggestedOutcome && currentOutcome !== suggestedOutcome) {
                     disputeConfig.rejectLabel = currentOutcome.toUpperCase();
                     disputeConfig.approveLabel = suggestedOutcome.toUpperCase();
                     disputeConfig.rejectSublabel = 'CURRENT';
                     disputeConfig.approveSublabel = 'NEW';
                 }
             }
         }
     } catch (e) {
         console.error('[Dispute Tally] Failed to fetch target event for disputeConfig:', e);
     }

     const tally = {
          ...rawDispute,
          votes: Object.values(slots),
          adminVotes: { approve: adminApprove, reject: adminReject },
          totalEligibleVoters: Math.max(totalEligible, 1),
          approveCount,
          rejectCount,
          disputeConfig,
      };
      
      console.log(`[Dispute Tally] Dispute: ${disputeId}, gameEventId: ${tally.gameEventId}, totalEligible: ${tally.totalEligibleVoters}, adminVotes: ${JSON.stringify(tally.adminVotes)}`);
      return tally;
  }

  /**
   * Checks the current tally of a dispute and resolves it if criteria are met.
   */
  async checkDisputeResolution(disputeId: string): Promise<{ success: boolean; dispute?: any; resolved?: boolean; error?: string }> {
     const disputeGet = await this.query(`
        SELECT 
          id, 
          game_id as "gameId", 
          game_event_id as "gameEventId", 
          type,
          initiator_org_profile_id as "initiatorOrgProfileId", 
          status, 
          expires_at as "expiresAt", 
          created_at as "createdAt", 
          resolved_at as "resolvedAt",
          update_data as "updateData",
          dispute_config as "disputeConfig"
        FROM game_disputes 
        WHERE id = $1
     `, [disputeId]);
     if ((disputeGet.rowCount ?? 0) === 0) return { success: false, error: 'Dispute not found' };
     let dispute = disputeGet.rows[0];

     if (dispute.status !== 'OPEN') return { success: true, dispute, resolved: true };

     dispute = await this.calculateTally(dispute.gameId, dispute.id, dispute);
     
     const majorityThreshold = Math.floor(dispute.totalEligibleVoters / 2) + 1;
     const { approveCount, rejectCount } = dispute;


     const isExpired = Date.now() > new Date(dispute.expiresAt).getTime();

     let outcome: string | null = null;

     // Early Resolution Condition
     // We only resolve early if there's more than 1 eligible voter to avoid instant-locking in single-admin test scenarios
     if (dispute.totalEligibleVoters > 1) {
         if (approveCount >= majorityThreshold) outcome = 'RESOLVED_APPROVED';
         else if (rejectCount >= majorityThreshold) outcome = 'RESOLVED_REJECTED';
     }
     
     // Expiry Resolution Condition
     if (!outcome && isExpired) {
         if (approveCount > rejectCount) outcome = 'RESOLVED_APPROVED';
         else outcome = 'RESOLVED_REJECTED'; // Tie = reject
     }

     if (outcome) {
         // Clear active timer if it exists
         const timer = this.activeTimers.get(disputeId);
         if (timer) {
             clearTimeout(timer);
             this.activeTimers.delete(disputeId);
             console.log(`[Dispute] Cleared resolution timer for ${disputeId} (early resolution)`);
         }

         await this.query(`UPDATE game_disputes SET status = $1, resolved_at = NOW() WHERE id = $2`, [outcome, disputeId]);
         dispute.status = outcome;

         if (outcome === 'RESOLVED_APPROVED') {
             try {
                  console.log(`[Dispute Engine] Applying approved mutation to event ${dispute.gameEventId}`);
                  const modifiedEvents = await this.applyMutation(dispute.gameId, dispute.gameEventId, dispute.updateData);
                  
                  if (modifiedEvents.length > 0) {
                      // Unified Post-Mutation Flow: Recalculate, Sync Scoreboard, and Broadcast
                      const minSequence = Math.min(...modifiedEvents.map(e => e.sequence || 0));
                      
                      // Fetch current scores to detect changes
                      const gameRes = await this.query(`SELECT live_state->'scores' as scores FROM games WHERE id = $1`, [dispute.gameId]);
                      const previousScores = gameRes.rows[0]?.scores || {};
                      const { modifiedEvents: recalculatedEvents, finalScores } = await this.recalculateEventScores(dispute.gameId, minSequence);
                      
                      // Merge all modified events (from mutation + recalculation)
                      // Prefer recalculated versions as they contain the updated snapshots
                      const allModified = [...modifiedEvents];
                      for (const re of recalculatedEvents) {
                          const idx = allModified.findIndex(m => m.id === re.id);
                          if (idx > -1) {
                              allModified[idx] = re;
                          } else {
                              allModified.push(re);
                          }
                      }

                       // Check if scores actually changed
                       const scoresChanged = JSON.stringify(previousScores, Object.keys(previousScores).sort()) !== 
                                            JSON.stringify(finalScores, Object.keys(finalScores).sort());

                       if (scoresChanged) {
                           // Update the game scoreboard in DB
                           await this.query(`UPDATE games SET live_state = jsonb_set(live_state, '{scores}', $1::jsonb) WHERE id = $2`, [JSON.stringify(finalScores), dispute.gameId]);
                       }

                      if (this.io) {
                          // Broadcast removals and updates
                          for (const me of allModified) {
                              if (me.eventData?.status === 'REMOVED') {
                                  this.io.to(`game:${dispute.gameId}:events`).emit('update', { type: 'GAME_EVENT_REMOVED', data: { id: me.id } });
                              } else {
                                  this.io.to(`game:${dispute.gameId}`).emit('update', { type: 'GAME_EVENT_UPDATED', data: me });
                              }
                          }
                          
                          this.io.to(`game:${dispute.gameId}:events`).emit('update', { type: 'GAME_EVENTS_BATCH_UPDATED', data: allModified });
                          
                          if (scoresChanged) {
                              const updatedGame = await dataManager.getGame(dispute.gameId);
                              if (updatedGame) {
                                  this.io.to(`game:${dispute.gameId}`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                                  this.io.to(`game:${dispute.gameId}:detail`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                              }
                          }
                      }
                  }
             } catch (err: any) {
                  console.error(`[Dispute Engine Error] Failed to apply mutation:`, err);
                  return { success: false, dispute, resolved: false, error: err.message };
             }
         }
         return { success: true, dispute, resolved: true };
     }

     // Still OPEN
     return { success: true, dispute, resolved: false };
  }

  /**
   * Applies a mutation (undo or update) to an event and its children.
   * This is the core of the Template-Driven Mutation Engine.
   */
  private async applyMutation(
    gameId: string, 
    eventId: string, 
    updateData: any, // null for undo
    actorId?: string
  ): Promise<GameEvent[]> {
    const modifiedEvents: GameEvent[] = [];
    
    // 1. Fetch current event state
    const eventRes = await this.query(`
        SELECT id, sequence, sub_type as "subType", event_data as "eventData", 
               actor_org_profile_id as "actorId", game_participant_id as "gameParticipantId"
        FROM game_events WHERE id = $1
    `, [eventId]);
    const evt = eventRes.rows[0];
    if (!evt) return [];

    // 2. Resolve template
    const sportId = await this.getGameSportId(gameId);
    const sport = sportId ? await sportManager.getSport(sportId) : null;
    const templateId = evt.eventData?.templateId || evt.subType;
    const template = sport?.eventTemplates?.find((t: EventTemplate) => t.id === templateId);

    if (!template && templateId) {
        console.warn(`[Mutation Engine] Template not found for ID: "${templateId}" in sport: ${sportId}`);
    }

    const isUndo = !updateData;
    const isAlreadyRemoved = evt.eventData?.status === 'REMOVED';

    if (isUndo) {
        if (!isAlreadyRemoved) {
            console.log(`[Mutation Engine] Undoing event: ${eventId}`);
            await this.query(`
               UPDATE game_events 
               SET event_data = jsonb_set(COALESCE(event_data, '{}'::jsonb), '{status}', '"REMOVED"'::jsonb)
               WHERE id = $1
            `, [eventId]);
            console.log(`[Mutation Engine] Event ${eventId} marked as REMOVED in DB`);

            // If it's a card event, remove from live_state.sinBins
            if (evt.subType === 'yellow_card' || evt.subType === 'red_card') {
              await this.query(`
                UPDATE games 
                SET live_state = jsonb_set(
                  live_state, 
                  '{sinBins}', 
                  COALESCE((
                    SELECT jsonb_agg(elem)
                    FROM jsonb_array_elements(live_state->'sinBins') AS elem
                    WHERE elem->>'id' != $1
                  ), '[]'::jsonb)
                ),
                updated_at = NOW()
                WHERE id = $2
              `, [eventId, gameId]);
            }
        }
    } else {
        console.log(`[Mutation Engine] Updating event: ${eventId}`);
        // Merge strategy: Start with template-derived values if outcome changed
        let finalEventData = { ...evt.eventData, ...updateData.eventData };
        
        const newOutcomeName = updateData.newOutcome || updateData.eventData?.outcome;
        if (template && newOutcomeName && newOutcomeName !== evt.eventData?.outcome) {
            const outcomeStep = template.steps.find((s: ActionStep) => s.type === 'OUTCOME_SELECTION');
            const newOutcome = outcomeStep?.outcomes?.find((o: Outcome) => o.name === newOutcomeName);
            if (newOutcome) {
                finalEventData = {
                    ...finalEventData,
                    ...newOutcome.eventData,
                    outcome: newOutcomeName,
                    pointsDelta: newOutcome.points || 0
                };
            }
        }

        // INTELLIGENCE: Does the reason require a player?
        const reasonName = finalEventData.reason;
        let forcedActorId: string | null | undefined = undefined;

        if (template && reasonName) {
            const reasonStep = template.steps.find((s: ActionStep) => s.type === 'REASON_SELECTION');
            const reasonOpt = reasonStep?.reasons?.flatMap(g => g.options).find(o => (o.id || o.name) === reasonName);
            // Default to TRUE (requires player) if specifyPlayer is undefined
            if (reasonOpt && reasonOpt.specifyPlayer === false) {
                console.log(`[Mutation Engine] Reason "${reasonName}" does not require a player. Clearing actorId.`);
                forcedActorId = null;
            }
        }

        // Resolve final values, respecting null for explicit clearing
        const finalActorId = forcedActorId !== undefined ? forcedActorId : 
                           (updateData.actorOrgProfileId !== undefined ? updateData.actorOrgProfileId : (actorId !== undefined ? actorId : evt.actorId));
        
        const finalParticipantId = updateData.gameParticipantId !== undefined ? updateData.gameParticipantId : evt.gameParticipantId;

        await this.query(`
           UPDATE game_events 
           SET actor_org_profile_id = $1,
               game_participant_id = $2,
               event_data = $3::jsonb
           WHERE id = $4
        `, [
            finalActorId,
            finalParticipantId,
            JSON.stringify(finalEventData), 
            eventId
        ]);
    }

    // 3. Fetch the finalized state of the main event
    const finalizedRes = await this.query(`
        SELECT ${this.GAME_EVENT_COLUMNS}
        FROM game_events WHERE id = $1
    `, [eventId]);
    const finalizedEvt = finalizedRes.rows[0];
    modifiedEvents.push(finalizedEvt);

    // 4. CASCADE LOGIC
    // Find any events linked to this one
    const childRes = await this.query(`
        SELECT id FROM game_events 
        WHERE game_id = $1 AND event_data->>'linkedEventId' = $2
    `, [gameId, eventId]);

    for (const childRow of childRes.rows) {
        let childMutationData = updateData; // Default: propagate same update/undo

        // SPECIAL CASE: If parent changed to an outcome that doesn't trigger the child, remove the child
        if (updateData && template && finalizedEvt.eventData?.outcome) {
             const outcomeStep = template.steps.find((s: ActionStep) => s.type === 'OUTCOME_SELECTION');
             const outcomeDef = outcomeStep?.outcomes?.find((o: Outcome) => o.name === finalizedEvt.eventData.outcome);
             
             // Fetch child to see its type
             const childEvtRes = await this.query(`SELECT sub_type FROM game_events WHERE id = $1`, [childRow.id]);
             const childSubType = childEvtRes.rows[0]?.sub_type;
             
             // If the new outcome doesn't trigger this specific child type anymore, undo the child
             if (outcomeDef && outcomeDef.triggerEventId !== childSubType) {
                 console.log(`[Mutation Engine] Cascading UNDO to orphan child: ${childRow.id} (Parent ${eventId} changed outcome)`);
                 childMutationData = null;
             }
        }

        const childModified = await this.applyMutation(gameId, childRow.id, childMutationData, actorId);
        modifiedEvents.push(...childModified);
    }

    return modifiedEvents;
  }

  /**
   * Fetches active disputes for a specific game.
   */
   async getActiveDisputes(gameId: string): Promise<any[]> {
      const res = await this.query(`
         SELECT ${this.DISPUTE_COLUMNS}
         FROM game_disputes
         WHERE game_id = $1 AND (status = 'OPEN' OR status IS NULL)
      `, [gameId]);
      
       const disputes = [];
        for (const d of res.rows) {
            const expTime = new Date(d.expiresAt).getTime();
            const nowTime = Date.now();
            console.log(`[Dispute Fetch] Processing ${d.id}. Now: ${nowTime}, Exp: ${expTime}, Diff: ${expTime - nowTime}ms`);
            
            // JIT (Just-In-Time) Check
            if (expTime < nowTime) {
               console.log(`[Dispute JIT] Resolving expired dispute ${d.id} on fetch`);
               const checkRes = await this.checkDisputeResolution(d.id);
               if (checkRes.success && checkRes.dispute.status === 'OPEN') {
                  disputes.push(checkRes.dispute);
               }
           } else {
              // Not expired, ensure a timer is running
              if (!this.activeTimers.has(d.id)) {
                  console.log(`[Dispute JIT] Rehydrating timer for active dispute ${d.id}`);
                  this.scheduleResolution(d.id, new Date(d.expiresAt));
              }
              const enriched = await this.calculateTally(d.gameId, d.id, d);
              disputes.push(enriched);
           }
       }

      console.log(`[Dispute Fetch] Game: ${gameId}, found ${disputes.length} active disputes.`);
      if (disputes.length > 0) {
          console.log(`[Dispute Fetch] IDs: ${disputes.map(d => d.id).join(', ')}`);
      }
      return disputes;
   }

  /**
   * Fetches all events for a specific game, ordered by sequence.
   * Can be filtered by sequence and limited.
   */
  async getGameEvents(gameId: string, fromSequence?: number, limit: number = 20): Promise<GameEvent[]> {
    let sql = `
      SELECT ${this.GAME_EVENT_COLUMNS}
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

  /**
   * Undoes a game event by reversing its effects and deleting it.
   * Currently only supports SCORE events.
   */
  async undoEvent(gameId: string, eventId: string, initiatorId: string): Promise<{ success: boolean; error?: string }> {
    // 1. Fetch the event to undo
    const eventRes = await this.query(`
      SELECT id, type, sub_type as "subType", initiator_org_profile_id as "initiatorId", timestamp, event_data as "eventData", game_participant_id as "gameParticipantId", sequence
      FROM game_events
      WHERE id = $1 AND game_id = $2
    `, [eventId, gameId]);

    if (eventRes.rows.length === 0) {
      return { success: false, error: 'Event not found.' };
    }

    const event = eventRes.rows[0];

    // 2. Structural & Config Guard (Same logic as initiateDispute)
    if (event.eventData?.linkedEventId) {
        return { success: false, error: 'Cannot remove a linked event directly. Please remove the parent event instead.' };
    }
    
    const sportId = await this.getGameSportId(gameId);
    const sport = sportId ? await sportManager.getSport(sportId) : null;
    const templateId = event.eventData?.templateId || event.subType;
    const template = sport?.eventTemplates?.find((t: EventTemplate) => t.id === templateId);

    if (!template && templateId) {
        console.warn(`[Direct Undo] Template not found for ID: "${templateId}" in sport: ${sportId}`);
    }
    if (template?.disputeConfig?.allowUndo === false) {
        return { success: false, error: 'This event type is marked as non-removable.' };
    }

    // 3. Verify Permission (Initiator or Match Official / Admin)
    let isAuthorized = event.initiatorId === initiatorId;
    let isOfficial = false;
    
    if (initiatorId) {
        const officialRes = await this.query(`SELECT 1 FROM game_officials WHERE game_id = $1 AND org_profile_id = $2`, [gameId, initiatorId]);
        if (officialRes.rows.length > 0) {
            isAuthorized = true;
            isOfficial = true;
        }
        if (!isAuthorized) {
            const isAdmin = await dataManager.isAppAdmin(initiatorId);
            if (isAdmin) {
                isAuthorized = true;
                isOfficial = true; 
            }
        }
    }

    if (!isAuthorized) {
      return { success: false, error: 'Only the initiator or a match official can remove this event.' };
    }

    // 4. Verify age (Only for non-officials)
    if (!isOfficial) {
        const settingsRes = await this.query(`SELECT value FROM system_settings WHERE key = 'undo_delay_ms'`);
        const delayMs = settingsRes.rows[0]?.value || 15000;
        const eventTime = new Date(event.timestamp).getTime();
        if (Date.now() - eventTime > delayMs) {
          return { success: false, error: 'Undo window has expired.' };
        }
    }

    // 5. Apply Mutation
    try {
        console.log(`[Direct Undo] Applying mutation to event ${eventId}`);
        const modifiedEvents = await this.applyMutation(gameId, eventId, null, initiatorId);
        
        if (modifiedEvents.length > 0) {
            const minSequence = Math.min(...modifiedEvents.map(e => e.sequence || 0));
            
            // Fetch current scores to detect changes
            const gameRes = await this.query(`SELECT live_state->'scores' as scores FROM games WHERE id = $1`, [gameId]);
            const previousScores = gameRes.rows[0]?.scores || {};

            const { modifiedEvents: recalculatedEvents, finalScores } = await this.recalculateEventScores(gameId, minSequence);

            // Check if scores actually changed
            const scoresChanged = JSON.stringify(previousScores, Object.keys(previousScores).sort()) !== 
                                 JSON.stringify(finalScores, Object.keys(finalScores).sort());

            if (scoresChanged) {
                // Update the game scoreboard in DB
                await this.query(`UPDATE games SET live_state = jsonb_set(live_state, '{scores}', $1::jsonb) WHERE id = $2`, [JSON.stringify(finalScores), gameId]);
            }

            if (this.io) {
                // Merge recalculated events into modifiedEvents, preferring recalculated versions
                const allModified = [...modifiedEvents];
                for (const re of recalculatedEvents) {
                    const idx = allModified.findIndex(m => m.id === re.id);
                    if (idx > -1) {
                        allModified[idx] = re;
                    } else {
                        allModified.push(re);
                    }
                }

                for (const me of allModified) {
                    if (me.eventData?.status === 'REMOVED') {
                        console.log(`[Undo Broadcast] Emitting GAME_EVENT_REMOVED for ${me.id}`);
                        this.io.to(`game:${gameId}:events`).emit('update', { type: 'GAME_EVENT_REMOVED', data: { id: me.id } });
                    }
                }
                console.log(`[Undo Broadcast] Emitting GAME_EVENTS_BATCH_UPDATED for ${allModified.length} events`);
                this.io.to(`game:${gameId}:events`).emit('update', { type: 'GAME_EVENTS_BATCH_UPDATED', data: allModified });
                
                if (scoresChanged) {
                    const updatedGame = await dataManager.getGame(gameId);
                    if (updatedGame) {
                        this.io.to(`game:${gameId}`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                        this.io.to(`game:${gameId}:detail`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                    }
                }
            }
        }
        return { success: true };
    } catch (err: any) {
        console.error(`[Direct Undo Error] Failed to undo event:`, err);
        return { success: false, error: err.message };
    }
  }
}

export const gameEventManager = new GameEventManager();
