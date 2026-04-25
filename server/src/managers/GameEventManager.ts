import { BaseManager } from "./BaseManager";
import { GameEvent } from "@sk/types";
import { Server } from "socket.io";
import { dataManager } from "../DataManager";
import { DisputeResolutionHandler } from "../sports/core/SportDisputeHandler";

const SPORT_MODULES: Record<string, string> = {
  'sport-rugby': '../sports/rugby/rugbyDisputeHandlers',
};

export class GameEventManager extends BaseManager {
  private activeTimers = new Map<string, NodeJS.Timeout>();
  public io: Server | null = null;

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
      RETURNING id, game_id as "gameId", sequence, timestamp, game_participant_id as "gameParticipantId", actor_org_profile_id as "actorOrgProfileId", initiator_org_profile_id as "initiatorOrgProfileId", type, sub_type as "subType", event_data as "eventData"
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
    
    // Broadcast via socket occurs in the route/controller layer after this manager returns.
    
    return newEvent;
  }

  /**
   * Initiates a consensus vote for an undo action.
   */
  async initiateUndoVote(gameId: string, eventIdToUndo: string, initiatorId: string): Promise<{ success: boolean; dispute?: any; resolved?: boolean; error?: string }> {
    // Check if an open dispute already exists for this event
    const existingRes = await this.query(`
      SELECT id FROM game_disputes 
      WHERE game_id = $1 AND game_event_id = $2 AND status = 'OPEN'
    `, [gameId, eventIdToUndo]);

    if ((existingRes.rowCount ?? 0) > 0) {
      return { success: false, error: 'A dispute is already active for this event.' };
    }

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
        INSERT INTO game_disputes (id, game_id, game_event_id, initiator_org_profile_id, expires_at, status)
        VALUES ($1, $2, $3, $4, $5, 'OPEN')
        RETURNING id
      `, [id, gameId, eventIdToUndo, initiatorId, expiresAt]);
      console.log(`[Dispute] DB expires_at set to: ${expiresAt.toISOString()}`);
    } catch (err: any) {
      console.error(`[Dispute] SQL Error during initiation:`, err.message);
      return { success: false, error: `Database error: ${err.message}` };
    }

    if((res.rowCount ?? 0) === 0) {
      console.error(`[Dispute] Failed to insert dispute row for game ${gameId}`);
      return { success: false, error: 'Failed to initiate dispute.'};
    }
    console.log(`[Dispute] Created dispute ${id} for game ${gameId}`);

    // Auto-cast APPROVE vote for the initiator
    const castRes = await this.castUndoVote(gameId, id, initiatorId, 'APPROVE');
    
    // Schedule proactive resolution timer
    this.scheduleResolution(id, expiresAt);
    
    return { success: true, dispute: castRes.dispute, resolved: castRes.resolved };
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
    let updateSql = 'UPDATE game_events SET ';
    const params: any[] = [];
    let count = 1;

    if (data.actorOrgProfileId !== undefined) {
      updateSql += `actor_org_profile_id = $${count++}, `;
      params.push(data.actorOrgProfileId);
    }

    if (data.gameParticipantId !== undefined) {
      updateSql += `game_participant_id = $${count++}, `;
      params.push(data.gameParticipantId);
    }

    if (data.eventData !== undefined) {
      updateSql += `event_data = event_data || $${count++}::jsonb, `;
      params.push(JSON.stringify(data.eventData));
    }

    // Remove trailing comma and space
    updateSql = updateSql.slice(0, -2);
    
    updateSql += ` WHERE id = $${count++} AND game_id = $${count++}
      RETURNING id, game_id as "gameId", sequence, timestamp, game_participant_id as "gameParticipantId", actor_org_profile_id as "actorOrgProfileId", initiator_org_profile_id as "initiatorOrgProfileId", type, sub_type as "subType", event_data as "eventData"`;
    
    params.push(eventId, gameId);

    const res = await this.query(updateSql, params);

    if (res.rows.length === 0) {
      return { error: 'Event not found or not part of this game.' };
    }

    const updatedEvent = res.rows[0] as GameEvent;

    // Broadcast if IO is available
    if (this.io) {
        this.io.to(`game:${gameId}:events`).emit('update', { type: 'GAME_EVENT_UPDATED', data: updatedEvent });
    }

    return updatedEvent;
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
   * Cast a vote for an active undo.
   */
  async castUndoVote(gameId: string, disputeId: string, officialId: string, vote: 'APPROVE' | 'REJECT'): Promise<{ success: boolean; dispute?: any; resolved?: boolean; error?: string }> {
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
      let disputeConfig = { heading: 'Remove Event', approveLabel: 'Approve', rejectLabel: 'Reject' };
      try {
          const targetEvtRes = await this.query(
              `SELECT type, sub_type as "subType", event_data as "eventData" FROM game_events WHERE id = $1`,
              [rawDispute.gameEventId]
          );
          if (targetEvtRes.rows.length > 0) {
              const evtRow = targetEvtRes.rows[0];
              const customHandler = await this.getCustomHandler(rawDispute.gameId, evtRow.subType);
              if (customHandler && customHandler.getDisputeConfig) {
                  const customConfig = customHandler.getDisputeConfig(evtRow.eventData, evtRow.subType);
                  if (customConfig) disputeConfig = customConfig;
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
          initiator_org_profile_id as "initiatorOrgProfileId", 
          status, 
          expires_at as "expiresAt", 
          created_at as "createdAt", 
          resolved_at as "resolvedAt"
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
                 const eventRes = await this.query(`SELECT sub_type, game_participant_id, event_data FROM game_events WHERE id = $1`, [dispute.gameEventId]);
                 const evt = eventRes.rows[0];
                 
                 if (!evt) return { success: true, dispute, resolved: true, error: 'Target event not found' };

                 let childEventId: string | null = null;
                 
                 const customHandler = await this.getCustomHandler(dispute.gameId, evt.sub_type);
                 let handled = false;
                 
                 if (customHandler) {
                     handled = await customHandler.handleApprovedDispute(dispute, evt, this);
                 }
                 
                 if (handled) {
                     // Broadcasting logic for custom updates
                     if (this.io) {
                         const updatedEvtRes = await this.query(`SELECT id, type, sub_type as "subType", timestamp, game_id as "gameId", game_participant_id as "gameParticipantId", initiator_org_profile_id as "initiatorOrgProfileId", event_data as "eventData" FROM game_events WHERE id = $1`, [dispute.gameEventId]);
                         this.io.to(`game:${dispute.gameId}:events`).emit('update', { type: 'GAME_EVENT_UPDATED', data: updatedEvtRes.rows[0] });
                         
                         const updatedGame = await dataManager.getGame(dispute.gameId);
                         if (updatedGame) {
                             this.io.to(`game:${dispute.gameId}`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                             this.io.to(`game:${dispute.gameId}:detail`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                         }
                     }
                 } else {
                     // Standard Remove (with cascade for Tries)
                     let childPoints = 0;
                     
                     if (evt.sub_type === 'Try' || evt.sub_type === 'Penalty Try') {
                         const childRes = await this.query(`
                             SELECT id, event_data
                             FROM game_events
                             WHERE game_id = $1 AND event_data->>'linkedEventId' = $2
                         `, [dispute.gameId, dispute.gameEventId]);
                         
                         if (childRes.rows.length > 0) {
                             childEventId = childRes.rows[0].id;
                             childPoints = childRes.rows[0].event_data?.pointsDelta || 0;
                         }
                     }

                     // Soft-delete main event
                     await this.query(`
                        UPDATE game_events 
                        SET event_data = jsonb_set(COALESCE(event_data, '{}'::jsonb), '{status}', '"REMOVED"'::jsonb)
                        WHERE id = $1
                     `, [dispute.gameEventId]);

                     // Soft-delete child event if present
                     if (childEventId) {
                         await this.query(`
                            UPDATE game_events 
                            SET event_data = jsonb_set(COALESCE(event_data, '{}'::jsonb), '{status}', '"REMOVED"'::jsonb)
                            WHERE id = $1
                         `, [childEventId]);
                     }

                     // Reverse combined score
                     const pts = Number(evt.event_data?.pointsDelta || (evt.sub_type === 'Penalty Try' ? 7 : 0));
                     const totalPointsToReverse = pts + Number(childPoints);
                     
                     if (totalPointsToReverse !== 0 && evt.game_participant_id) {
                        await this.query(`
                            UPDATE games 
                            SET live_state = jsonb_set(
                              live_state, 
                              '{scores}', 
                              COALESCE(live_state->'scores', '{}'::jsonb) || jsonb_build_object($1::text, (COALESCE((live_state->'scores'->$1)::numeric, 0) - $2)::numeric)
                            ),
                            updated_at = NOW()
                            WHERE id = $3
                        `, [evt.game_participant_id, totalPointsToReverse, dispute.gameId]);
                     }
                     
                     // --- BROADCAST UPDATES ---
                     if (this.io) {
                         this.io.to(`game:${dispute.gameId}:events`).emit('update', { type: 'GAME_EVENT_REMOVED', data: { id: dispute.gameEventId } });
                         if (childEventId) {
                             this.io.to(`game:${dispute.gameId}:events`).emit('update', { type: 'GAME_EVENT_REMOVED', data: { id: childEventId } });
                         }
                         
                         const updatedGame = await dataManager.getGame(dispute.gameId);
                         if (updatedGame) {
                             this.io.to(`game:${dispute.gameId}`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                             this.io.to(`game:${dispute.gameId}:detail`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                         }
                     }
                 }
         } catch (err: any) {
             console.error(`[Dispute Sync Error] Failed to process database update during dispute resolution:`, err);
             // Return false so we don't accidentally broadcast a success
             return { success: false, dispute, resolved: false, error: err.message };
         }
         }
         return { success: true, dispute, resolved: true };
     }

     // Still OPEN
     return { success: true, dispute, resolved: false };
  }

  /**
   * Fetches active disputes for a specific game.
   */
   async getActiveDisputes(gameId: string): Promise<any[]> {
      const res = await this.query(`
         SELECT 
           id, 
           game_id as "gameId",
           game_event_id as "gameEventId", 
           initiator_org_profile_id as "initiatorOrgProfileId", 
           status, 
           expires_at as "expiresAt", 
           created_at as "createdAt", 
           resolved_at as "resolvedAt"
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

  /**
   * Undoes a game event by reversing its effects and deleting it.
   * Currently only supports SCORE events.
   */
  async undoEvent(gameId: string, eventId: string, initiatorId: string): Promise<{ success: boolean; error?: string }> {
    // 1. Fetch the event to undo
    const eventRes = await this.query(`
      SELECT id, type, sub_type as "subType", initiator_org_profile_id as "initiatorId", timestamp, event_data as "eventData", game_participant_id as "gameParticipantId"
      FROM game_events
      WHERE id = $1 AND game_id = $2
    `, [eventId, gameId]);

    if (eventRes.rows.length === 0) {
      console.log(`[Undo] Failed: Event not found (${eventId})`);
      return { success: false, error: 'Event not found.' };
    }

    const event = eventRes.rows[0];

    // 2. Verify it's a SCORE event
    if (event.type !== 'SCORE') {
      console.log(`[Undo] Failed: Not a SCORE event (${event.type})`);
      return { success: false, error: 'Only scoring events can be undone.' };
    }

    // 3. Verify initiator
    if (event.initiatorId !== initiatorId) {
      console.log(`[Undo] Failed: Initiator mismatch. DB: ${event.initiatorId}, Client: ${initiatorId}`);
      return { success: false, error: 'Only the initiator can undo this event.' };
    }

    // 4. Verify age (Fetch delay from settings)
    const settingsRes = await this.query(`SELECT value FROM system_settings WHERE key = 'undo_delay_ms'`);
    const delayMs = settingsRes.rows[0]?.value || 15000;
    const eventTime = new Date(event.timestamp).getTime();
    if (Date.now() - eventTime > delayMs) {
      console.log(`[Undo] Failed: Window expired. Age: ${Date.now() - eventTime}, Delay: ${delayMs}`);
      return { success: false, error: 'Undo window has expired.' };
    }

    // 5. Reverse Score Effect (including children)
    let childPoints = 0;
    let childEventId = null;
    if (event.subType === 'Try' || event.subType === 'Penalty Try') {
        const childRes = await this.query(`
            SELECT id, event_data
            FROM game_events
            WHERE game_id = $1 AND event_data->>'linkedEventId' = $2
        `, [gameId, eventId]);
        
        if (childRes.rows.length > 0) {
            const childEvt = childRes.rows[0];
            childEventId = childEvt.id;
            childPoints = childEvt.event_data?.pointsDelta || 0;
        }
    }

    const pointsDelta = event.eventData?.pointsDelta || 0;
    const totalPointsToReverse = pointsDelta + childPoints;
    
    if (totalPointsToReverse !== 0 && event.gameParticipantId) {
       await this.query(`
        UPDATE games 
        SET live_state = jsonb_set(
          live_state, 
          '{scores}', 
          COALESCE(live_state->'scores', '{}'::jsonb) || jsonb_build_object($1::text, (COALESCE((live_state->'scores'->$1)::numeric, 0) - $2)::numeric)
        ),
        updated_at = NOW()
        WHERE id = $3
      `, [event.gameParticipantId, totalPointsToReverse, gameId]);
    }

    // 6. Delete Event and linked child Event
    if (childEventId) {
        await this.query(`DELETE FROM game_events WHERE id = $1`, [childEventId]);
    }
    await this.query(`DELETE FROM game_events WHERE id = $1`, [eventId]);

    // 7. BROADCAST UPDATES
    if (this.io) {
        // Broadcast removals to :events
        this.io.to(`game:${gameId}:events`).emit('update', { type: 'GAME_EVENT_REMOVED', data: { id: eventId } });
        if (childEventId) {
            this.io.to(`game:${gameId}:events`).emit('update', { type: 'GAME_EVENT_REMOVED', data: { id: childEventId } });
        }

        // Broadcast score update to game summary/detail
        const updatedGame = await dataManager.getGame(gameId);
        if (updatedGame) {
            this.io.to(`game:${gameId}`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
            this.io.to(`game:${gameId}:detail`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
        }
    }

    return { success: true };
  }
}

export const gameEventManager = new GameEventManager();
