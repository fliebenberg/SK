import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { dataManager } from './DataManager';
import { gameEventManager } from './managers/GameEventManager';
import { SocketAction } from '@sk/types';
import { jobManager } from './jobs/JobManager';
import { membershipExpiryJob } from './jobs/handlers/MembershipExpiryJob';
import { accuracyAuditJob } from './jobs/handlers/AccuracyAuditJob';
import pool from './db';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // allow all for now
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial data state?
  // Or client requests it?
  // For now, let's treat it as "pull on subscribe" or "push updates".
  // Client will likely fetch initial data via HTTP or a specific "get" event.
  // Let's support a "get" event.
  
    socket.on('get_live_games', async (data, callback) => {
        try {
            const games = await dataManager.getLiveGames();
            callback(games);
        } catch (error) {
            console.error('Error fetching live games:', error);
            callback([]);
        }
    });

    socket.on('get_data', async (request, callback) => {
      const { type, orgId, id, teamId } = request;
      console.log(`Server: get_data requested. Type: ${type}, OrgId: ${orgId}, Id: ${id}`);
      
      try {
        switch(type) {
            case 'organizations':
                callback(await dataManager.getOrganizations(request));
                break;
            case 'reports':
                // Check if user is app admin
                if (id && await dataManager.isAppAdmin(id)) {
                    callback(await dataManager.getReports(request.entityType));
                } else {
                    callback([]);
                }
                break;
            case 'organization':
            case 'org_summary':
                callback(await dataManager.getOrganization(id));
                break;
            case 'teams':
                callback(await dataManager.getTeams(orgId));
                break;
            case 'team':
                callback(await dataManager.getTeam(id) || await dataManager.getTeam(teamId));
                break;
            case 'sites':
                callback(await dataManager.getSites(orgId));
                break;
            case 'site':
                callback(await dataManager.getSite(id));
                break;
            case 'facilities':
                callback(await dataManager.getFacilities(id || request.siteId));
                break;
            case 'facility':
                callback(await dataManager.getFacility(id));
                break;
            case 'games':
                callback(await dataManager.getGames(orgId));
                break;
            case 'game':
                callback(await dataManager.getGame(id));
                break;
            case 'game_events':
                callback(await dataManager.getGameEvents(id, request.fromSequence, request.limit));
                break;
            case 'game_roster':
                callback(await dataManager.getGameRoster(id));
                break;
            case 'events':
                callback(await dataManager.getEvents(orgId));
                break;
            case 'event':
                callback(await dataManager.getEvent(id));
                break;
            case 'sports':
                callback(await dataManager.getSports());
                break;
            case 'roles':
                callback({
                    team: await dataManager.getTeamRoles(),
                    org: await dataManager.getOrganizationRoles()
                });
                break;
            case 'org_profiles':
                // Avoid sending ALL profiles. 
                callback([]); 
                break;
            case 'org_members':
                if (orgId) {
                    const members = await dataManager.getOrganizationMembers(orgId);
                    console.log(`Server: Returning ${members.length} members for org ${orgId}`);
                    callback(members);
                } else {
                    console.warn("Server: org_members requested without orgId");
                    callback([]);
                }
                break;
            case 'team_members':
                // Fetch members for a specific team
                if (teamId) {
                    callback(await dataManager.getTeamMembers(teamId));
                } else {
                    callback([]);
                }
                break;
            case 'team_memberships':
                // Deprecated global fetch
                callback([]);
                break;
            case 'org_memberships':
                callback([]); // Deprecated global fetch
                break;
            case 'user_memberships':
                if (id) {
                    const [orgs, teams] = await Promise.all([
                        dataManager.getUserOrgMemberships(id),
                        dataManager.getUserTeamMemberships(id)
                    ]);
                    // Combine into unified list or send separate?
                    // Let's assume client expects list of memberships
                    // Wait, getUserOrgMemberships returns OrgMembership[]
                    callback({ orgs, teams }); 
                } else {
                    callback({});
                }
                break;

            case 'search_similar_orgs':
                if (request.name) {
                    callback(await dataManager.searchSimilarOrganizations(request.name));
                } else {
                    callback([]);
                }
                break;
            case 'search_people':
                if (request.query) {
                    callback(await dataManager.searchPeople(request.query, request.orgId));
                } else {
                    callback([]);
                }
                break;
            case 'find_matching_user':
                callback(await dataManager.findMatchingUser(request.email, request.name, request.birthdate));
                break;
            case 'pending_claims':
                // Check for pending claims for the user's email(s)
                // Using request.email for now, assuming client sends it
                if (request.email) {
                    callback(await dataManager.getPendingClaimForUser(request.email));
                } else {
                    callback([]);
                }
                break;
            case 'claim_info':
                if (request.token) {
                    callback(await dataManager.getClaimInfo(request.token));
                } else {
                    callback(null);
                }
                break;
            case 'notifications':
                if (id) { // assuming id is userId
                    callback(await dataManager.getNotifications(id));
                } else {
                    callback([]);
                }
                break;
            case 'org_referrals':
                console.log(`Server: Processing org_referrals for ${orgId}`);
                if (orgId) {
                    const result = await dataManager.getReferralsForOrg(orgId);
                    console.log(`Server: Found ${result.length} referrals`);
                    callback(result);
                } else {
                    console.warn(`Server: Missing orgId for org_referrals`);
                    callback([]);
                }
                break;
            default:
                console.error(`[get_data] ⚠️  UNHANDLED type: "${type}" — no case exists for this request. Full request:`, JSON.stringify(request));
                callback(null);
        }
        console.log(`Server: get_data completed. Type: ${type}`);
      } catch (error) {
        console.error(`Server: Error in get_data handler (${type}):`, error);
        callback(null);
      }
    });

  socket.on('join_room', async (room: string) => {
    // console.log(`Socket ${socket.id} joining room ${room}`);
    socket.join(room);

    // Push latest state immediately on join
    try {
        if (room.startsWith('org:')) {
            const parts = room.split(':');
            const orgId = parts[1];
            const type = parts[2]; // members, teams, venues, events, games, summary

            if (type === 'members') {
                const members = await dataManager.getOrganizationMembers(orgId);
                socket.emit('update', { type: 'ORG_MEMBERS_SYNC', data: members });
            } else if (type === 'teams') {
                const teams = await dataManager.getTeams(orgId);
                socket.emit('update', { type: 'TEAMS_SYNC', data: teams });
            } else if (type === 'sites') {
                const sites = await dataManager.getSites(orgId);
                socket.emit('update', { type: 'SITES_SYNC', data: sites }); 
            } else if (type === 'facilities') {
                const facilities = await dataManager.getFacilitiesByOrg(orgId);
                socket.emit('update', { type: 'FACILITIES_SYNC', data: facilities });
            } else if (type === 'events') {
                const events = await dataManager.getEvents(orgId);
                socket.emit('update', { type: 'EVENTS_SYNC', data: events });
            } else if (type === 'games') {
                const games = await dataManager.getGames(orgId);
                socket.emit('update', { type: 'GAMES_SYNC', data: games });
            } else if (type === 'summary') {
                const org = await dataManager.getOrganization(orgId);
                if (org) {
                    socket.emit('update', { type: 'ORGANIZATIONS_UPDATED', data: org });
                } else {
                    socket.emit('update', { type: 'ENTITY_NOT_FOUND', data: { id: orgId, type: 'organization' } });
                }
            } else if (type === 'referrals') {
                const referrals = await dataManager.getReferralsForOrg(orgId);
                socket.emit('update', { type: 'ORG_REFERRALS_SYNC', data: referrals });
            }

        } else if (room.startsWith('team:')) {
            const teamId = room.split(':')[1];
            // Push team details
            const team = await dataManager.getTeam(teamId);
            if (team) socket.emit('update', { type: 'TEAM_UPDATED', data: team });
            
            // Push members
            const members = await dataManager.getTeamMembers(teamId);
            socket.emit('update', { type: 'TEAM_MEMBERS_SYNC', data: members });

        } else if (room.startsWith('event:')) {
            const eventId = room.split(':')[1];
            const event = await dataManager.getEvent(eventId);
            if (event) socket.emit('update', { type: 'EVENT_UPDATED', data: event });
        } else if (room.startsWith('site:')) {
            const siteId = room.split(':')[1];
            const site = await dataManager.getSite(siteId);
            if (site) socket.emit('update', { type: 'SITE_UPDATED', data: site });
        } else if (room.startsWith('facility:')) {
            const facilityId = room.split(':')[1];
            const facility = await dataManager.getFacility(facilityId);
            if (facility) socket.emit('update', { type: 'FACILITY_UPDATED', data: facility });
        } else if (room.startsWith('game:')) {
            const parts = room.split(':');
            const gameId = parts[1];
            // If room is game:123:detail or game:123:events, we can send initial data
            const game = await dataManager.getGame(gameId);
            if (game) {
                socket.emit('update', { type: 'GAME_UPDATED', data: game });
                const events = await dataManager.getGameEvents(gameId); 
                socket.emit('update', { type: 'GAME_EVENTS_SYNC', data: events });
            }
        } else if (room.startsWith('user:')) {
            const userId = room.split(':')[1];
            console.log(`Server: User ${userId} joined their notification room`);
            // 1. Sync any new referral notifications
            // 2. Push all existing notifications
            const notifications = await dataManager.getNotifications(userId);
            socket.emit('update', { type: 'NOTIFICATIONS_SYNC', data: notifications });
        }
    } catch (error) {
        console.error(`Error pushing data for room ${room}:`, error);
    }
  });

  socket.on('leave_room', (room: string) => {
    // console.log(`Socket ${socket.id} leaving room ${room}`);
    socket.leave(room);
  });

  socket.on('subscribe', async (channel) => {
        socket.join(channel);
        console.log(`Socket ${socket.id} subscribed to ${channel}`);
        
        // Push-on-Subscribe Logic for global channels
        try {
            if (channel === 'games') {
                // No longer pushing all games on subscribe. 
                // Client must request via 'get_live_games' or 'join_room' for specific game updates.
            } else if (channel === 'organizations') {
                // No longer pushing all organizations on subscribe.
                // Client requests via 'get_data' type: 'organizations'.
            }
        } catch (error) {
             console.error(`Error pushing data for channel ${channel}:`, error);
        }
    });

  socket.on('unsubscribe', (topic: string) => {
    console.log(`Socket ${socket.id} unsubscribed from ${topic}`);
    socket.leave(topic);
  });

  socket.on('action', async (action: { type: SocketAction, payload: any }, callback) => {
    console.log(`Action received: ${action.type}`, action.payload);
    let result: any = null;
    let updateTopic = '';
    let updateType = '';
    
    // Some actions might need multiple broadcasts (e.g. to team room AND global list)
    let additionalBroadcasts: { topic: string, type: string, data: any }[] = [];

    const broadcastOrgSummaries = async (orgIds: (string | undefined)[]) => {
        const uniqueOrgIds = [...new Set(orgIds.filter((id): id is string => !!id))];
        console.log(`Server: Requesting summary broadcast for orgs: ${uniqueOrgIds.join(', ')}`);
        for (const orgId of uniqueOrgIds) {
            const updatedOrg = await dataManager.refreshOrgSummary(orgId);
            if (updatedOrg) {
                // Emit to the specific organization summary room (for dashboards)
                const room = `org:${orgId}:summary`;
                io.to(room).emit('update', { type: 'ORGANIZATION_UPDATED', data: updatedOrg });
                // Also emit to the global organizations list room (for admin overview)
                io.to('organizations').emit('update', { type: 'ORGANIZATION_UPDATED', data: updatedOrg });
                console.log(`Server: Broadcasted ORGANIZATION_UPDATED for ${orgId} to ${room} and global`);
            } else {
                console.warn(`Server: Could not find organization ${orgId} for summary broadcast`);
            }
        }
    };

    try {
        switch(action.type) {
            case SocketAction.DELETE_ORG:
                result = await dataManager.deleteOrganization(action.payload.id);
                // Broadcast to room that the org is gone
                io.to(`org:${action.payload.id}:summary`).emit('update', { type: 'ORGANIZATION_UPDATED', data: { id: action.payload.id, deleted: true } });
                break;
            case SocketAction.ADD_TEAM:
                result = await dataManager.addTeam(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:teams`, type: 'TEAM_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_ADDED', data: result });
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
            case SocketAction.UPDATE_TEAM:
                result = await dataManager.updateTeam(action.payload.id, action.payload.data);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:teams`, type: 'TEAM_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_UPDATED', data: result });
                }
                break;
            case SocketAction.DELETE_TEAM:
                const teamToDelete = await dataManager.getTeam(action.payload.id);
                result = await dataManager.deleteTeam(action.payload.id);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:teams`, type: 'TEAM_DELETED', data: { id: result.id } });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_DELETED', data: { id: result.id } });
                    if (teamToDelete) await broadcastOrgSummaries([teamToDelete.orgId]);
                }
                break;

            case SocketAction.REFER_ORG_CONTACT:
                const { orgId, contactEmails, referredByUserId } = action.payload;
                result = await dataManager.referOrgContact(orgId, contactEmails, referredByUserId);
                if (Array.isArray(result)) {
                    result.forEach(ref => {
                        additionalBroadcasts.push({ 
                            topic: `org:${orgId}:referrals`, 
                            type: 'ORG_REFERRAL_ADDED', 
                            data: ref 
                        });
                    });
                }
                break;

            case SocketAction.ADD_SITE:
                result = await dataManager.addSite(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:sites`, type: 'SITE_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `site:${result.id}`, type: 'SITE_ADDED', data: result });
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
            case SocketAction.UPDATE_SITE:
                result = await dataManager.updateSite(action.payload.id, action.payload.data);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:sites`, type: 'SITE_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `site:${result.id}`, type: 'SITE_UPDATED', data: result });
                }
                break;
            case SocketAction.DELETE_SITE:
                result = await dataManager.deleteSite(action.payload.id);
                if (result) {
                     additionalBroadcasts.push({ topic: `org:${result.orgId}:sites`, type: 'SITE_DELETED', data: { id: result.id } });
                     additionalBroadcasts.push({ topic: `site:${result.id}`, type: 'SITE_DELETED', data: { id: result.id } });
                     await broadcastOrgSummaries([result.orgId]);
                }
                break;

            case SocketAction.ADD_FACILITY:
                result = await dataManager.addFacility(action.payload);
                if (result) {
                    const parentSite = await dataManager.getSite(result.siteId);
                    if (parentSite) {
                        additionalBroadcasts.push({ topic: `org:${parentSite.orgId}:facilities`, type: 'FACILITY_ADDED', data: result });
                    }
                    additionalBroadcasts.push({ topic: `site:${result.siteId}:facilities`, type: 'FACILITY_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `facility:${result.id}`, type: 'FACILITY_ADDED', data: result });
                }
                break;
            case SocketAction.UPDATE_FACILITY:
                result = await dataManager.updateFacility(action.payload.id, action.payload.data);
                if (result) {
                    const parentSite = await dataManager.getSite(result.siteId);
                    if (parentSite) {
                        additionalBroadcasts.push({ topic: `org:${parentSite.orgId}:facilities`, type: 'FACILITY_UPDATED', data: result });
                    }
                    additionalBroadcasts.push({ topic: `site:${result.siteId}:facilities`, type: 'FACILITY_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `facility:${result.id}`, type: 'FACILITY_UPDATED', data: result });
                }
                break;
            case SocketAction.DELETE_FACILITY:
                result = await dataManager.deleteFacility(action.payload.id);
                if (result) {
                     const parentSite = await dataManager.getSite(result.siteId);
                     if (parentSite) {
                         additionalBroadcasts.push({ topic: `org:${parentSite.orgId}:facilities`, type: 'FACILITY_DELETED', data: { id: result.id } });
                     }
                     additionalBroadcasts.push({ topic: `site:${result.siteId}:facilities`, type: 'FACILITY_DELETED', data: { id: result.id } });
                     additionalBroadcasts.push({ topic: `facility:${result.id}`, type: 'FACILITY_DELETED', data: { id: result.id } });
                }
                break;

            case SocketAction.ADD_GAME:
                result = await dataManager.addGame(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `event:${result.eventId}`, type: 'GAME_ADDED', data: result });
                    
                    const parentEvent = await dataManager.getEvent(result.eventId);
                    if (parentEvent) {
                         const orgIds = [parentEvent.orgId, ...(parentEvent.participatingOrgIds || [])];
                         orgIds.forEach(orgId => {
                             additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'GAME_ADDED', data: result });
                         });
                    }
                }
                break;
            case SocketAction.UPDATE_GAME_STATUS:
                result = await dataManager.updateGameStatus(action.payload.id, action.payload.status);
                if (result) {
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `event:${result.eventId}`, type: 'GAME_UPDATED', data: result });
                    
                    const parentEvent = await dataManager.getEvent(result.eventId);
                    if (parentEvent) {
                        const orgIds = [parentEvent.orgId, ...(parentEvent.participatingOrgIds || [])];
                        orgIds.forEach(orgId => {
                            additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'GAME_UPDATED', data: result });
                        });
                    }
                }
                break;
            case SocketAction.UPDATE_GAME_CLOCK:
                result = await dataManager.updateGameClock(action.payload.id, action.payload.action);
                if (result) {
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_UPDATED', data: result });
                    
                    const parentEvent = await dataManager.getEvent(result.eventId);
                    if (parentEvent) {
                        const orgIds = [parentEvent.orgId, ...(parentEvent.participatingOrgIds || [])];
                        orgIds.forEach(orgId => {
                            additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'GAME_UPDATED', data: result });
                        });
                    }
                }
                break;
            case SocketAction.ADD_GAME_EVENT:
                const eventRes = await gameEventManager.ingestEvent(action.payload);
                if (!('error' in eventRes)) {
                    // Broadcast the granular event to the base game room and detail room
                    io.to(`game:${action.payload.gameId}`).emit('update', { type: 'GAME_EVENT_ADDED', data: eventRes });
                    io.to(`game:${action.payload.gameId}:events`).emit('update', { type: 'GAME_EVENT_ADDED', data: eventRes });
                    
                    // Broadcast updated game state to the detail room and base game room
                    const updatedGame = await dataManager.getGame(action.payload.gameId);
                    if (updatedGame) {
                        io.to(`game:${action.payload.gameId}`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                        io.to(`game:${action.payload.gameId}:detail`).emit('update', { type: 'GAME_UPDATED', data: updatedGame });
                    }
                } else {
                    console.error('Server: Failed to ingest game event:', eventRes.error);
                }
                break;
            case SocketAction.INITIATE_UNDO_VOTE:
                const voteInitRes = await gameEventManager.initiateUndoVote(action.payload.gameId, action.payload.eventIdToUndo, action.payload.initiatorId);
                io.to(`game:${action.payload.gameId}:detail`).emit('update', { type: 'VOTE_STARTED', data: { eventId: action.payload.eventIdToUndo, ttl: 15 } });
                break;
            case SocketAction.CAST_UNDO_VOTE:
                const castRes = await gameEventManager.castUndoVote(action.payload.gameId, action.payload.officialId, action.payload.vote);
                // Fully tallying logic would execute after TTL.
                break;
            case SocketAction.UPDATE_GAME:
                result = await dataManager.updateGame(action.payload.id, action.payload.data);
                if (result) {
                    const parentEvent = await dataManager.getEvent(result.eventId);
                    if (parentEvent) {
                        const orgIds = [parentEvent.orgId, ...(parentEvent.participatingOrgIds || [])];
                        orgIds.forEach(orgId => {
                            additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'GAME_UPDATED', data: result });
                        });
                    }
                }
                break;
            case SocketAction.UPDATE_GAME_SCORE:
                const gameToUpdate = await dataManager.getGame(action.payload.id);
                if (gameToUpdate) {
                    const updatedLiveState = { ...(gameToUpdate.liveState || {}), scores: action.payload.scores };
                    result = await dataManager.updateGame(action.payload.id, { liveState: updatedLiveState });
                    if (result) {
                        // Broadcast update to game rooms
                        io.to(`game:${result.id}`).emit('update', { type: 'GAME_UPDATED', data: result });
                        io.to(`game:${result.id}:detail`).emit('update', { type: 'GAME_UPDATED', data: result });
                    }
                }
                break;
            case SocketAction.RESET_GAME:
                await dataManager.resetGame(action.payload.id);
                // Also clear all game events (redundant if EventManager does it, but safe)
                await pool.query('DELETE FROM game_events WHERE game_id = $1', [action.payload.id]);
                result = await dataManager.getGame(action.payload.id);
                if (result) {
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_RESET', data: { gameId: result.id } });
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `event:${result.eventId}`, type: 'GAME_UPDATED', data: result });
                    
                    const parentEvent = await dataManager.getEvent(result.eventId);
                    if (parentEvent) {
                        const orgIds = [parentEvent.orgId, ...(parentEvent.participatingOrgIds || [])];
                        orgIds.forEach(orgId => {
                            additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'GAME_UPDATED', data: result });
                        });
                    }
                }
                break;

            case SocketAction.SAVE_GAME_ROSTER:
                const { gameId, participantId, items } = action.payload;
                result = await dataManager.saveGameRoster(gameId, participantId, items);
                if (result) {
                    // Broadcast update to the game rooms
                    io.to(`game:${gameId}`).emit('update', { type: 'GAME_UPDATED', data: await dataManager.getGame(gameId) });
                }
                break;
            case SocketAction.DELETE_GAME:
                result = await dataManager.deleteGame(action.payload.id);
                if (result) {
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_DELETED', data: { id: result.id } });
                    additionalBroadcasts.push({ topic: `event:${result.eventId}`, type: 'GAME_UPDATED', data: result });
                }
                break;
            case SocketAction.UNDO_GAME_EVENT:
                const undoRes = await gameEventManager.undoEvent(action.payload.gameId, action.payload.eventId, action.payload.initiatorId);
                if (undoRes.success) {
                    // Broadcast removal
                    io.to(`game:${action.payload.gameId}`).emit('update', { type: 'GAME_EVENT_REMOVED', data: { id: action.payload.eventId } });
                    io.to(`game:${action.payload.gameId}:events`).emit('update', { type: 'GAME_EVENT_REMOVED', data: { id: action.payload.eventId } });
                    
                    // Broadcast updated game state
                    const updatedGameAfterUndo = await dataManager.getGame(action.payload.gameId);
                    if (updatedGameAfterUndo) {
                        io.to(`game:${action.payload.gameId}`).emit('update', { type: 'GAME_UPDATED', data: updatedGameAfterUndo });
                        io.to(`game:${action.payload.gameId}:detail`).emit('update', { type: 'GAME_UPDATED', data: updatedGameAfterUndo });
                    }
                    result = { success: true };
                } else {
                    result = { error: undoRes.error };
                }
                break;
            case SocketAction.GET_SYSTEM_SETTINGS:
                const sysSettingsRes = await pool.query('SELECT key, value FROM system_settings');
                const settings: Record<string, any> = {};
                sysSettingsRes.rows.forEach(row => {
                    settings[row.key] = row.value;
                });
                result = settings;
                break;

            case SocketAction.ADD_EVENT:
                result = await dataManager.addEvent(action.payload);
                if (result) {
                    console.log("Server: Event Added, processing broadcasts. Participating:", result.participatingOrgIds);
                    const orgIds = [result.orgId, ...(result.participatingOrgIds || [])];
                    orgIds.forEach(orgId => {
                        additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'EVENT_ADDED', data: result });
                    });
                    additionalBroadcasts.push({ topic: `event:${result.id}`, type: 'EVENT_ADDED', data: result });
                    await broadcastOrgSummaries([result.orgId, ...(result.participatingOrgIds || [])]);
                }
                break;
            case SocketAction.UPDATE_EVENT:
                // Fetch current event to know who might be removed
                const oldEvent = await dataManager.getEvent(action.payload.id);
                result = await dataManager.updateEvent(action.payload.id, action.payload.data);
                if (result) {
                    const oldOrgIds = oldEvent ? [oldEvent.orgId, ...(oldEvent.participatingOrgIds || [])] : [];
                    const newOrgIds = [result.orgId, ...(result.participatingOrgIds || [])];
                    const allAffectedOrgs = [...new Set([...oldOrgIds, ...newOrgIds])];

                    newOrgIds.forEach(orgId => {
                        additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'EVENT_UPDATED', data: result });
                    });
                    
                    // Also notify removed orgs that the event is gone for them
                    const removedOrgs = oldOrgIds.filter(id => !newOrgIds.includes(id));
                    removedOrgs.forEach(orgId => {
                        additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'EVENT_DELETED', data: { id: result.id } });
                    });

                    await broadcastOrgSummaries(allAffectedOrgs);
                }
                break;
            case SocketAction.DELETE_EVENT:
                const eventToDelete = await dataManager.getEvent(action.payload.id); 
                result = await dataManager.deleteEvent(action.payload.id);
                if (result) {
                    const orgIds = [result.orgId, ...(result.participatingOrgIds || [])];
                    orgIds.forEach(orgId => {
                        additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'EVENT_DELETED', data: { id: result.id } });
                    });
                    await broadcastOrgSummaries([result.orgId, ...(result.participatingOrgIds || [])]);
                }
                break;

            case SocketAction.ADD_ORG:
                result = await dataManager.addOrganization(action.payload);
                if (result) {
                    if (action.payload.creatorId) {
                        additionalBroadcasts.push({ topic: `user:${action.payload.creatorId}`, type: 'USER_MEMBERSHIPS_UPDATED', data: {} });
                    }
                    await broadcastOrgSummaries([result.id]);
                }
                break;
            case SocketAction.UPDATE_ORG:
                result = await dataManager.updateOrganization(action.payload.id, action.payload.data);
                if (result) {
                    await broadcastOrgSummaries([result.id]);
                }
                break;

            case SocketAction.ADD_TEAM_MEMBER:
                result = await dataManager.addTeamMember(action.payload);
                // Broadcast ONLY to the team room
                updateTopic = `team:${result.teamId}`;
                updateType = 'TEAM_MEMBER_UPDATED';
                
                // ALSO Broadcast to the Org Team List (to update counts)
                // We need to fetch the team to get the orgId.
                const teamForAdd = await dataManager.getTeam(result.teamId);
                if (teamForAdd) {
                     additionalBroadcasts.push({ 
                         topic: `org:${teamForAdd.orgId}:teams`, 
                         type: 'TEAM_UPDATED', 
                         data: { ...teamForAdd } 
                     });
                }

                const richMemberAdd = (await dataManager.getTeamMembers(result.teamId)).find((m: any) => m.membershipId === result.id);
                if (richMemberAdd) {
                    result = richMemberAdd;
                    
                    // Refresh memberships for the affected user
                    if (richMemberAdd.userId) {
                        additionalBroadcasts.push({ topic: `user:${richMemberAdd.userId}`, type: 'USER_MEMBERSHIPS_UPDATED', data: {} });
                    }
                }
                if (teamForAdd) {
                    await broadcastOrgSummaries([teamForAdd.orgId]);
                }
                break;
            case SocketAction.UPDATE_TEAM_MEMBER:
                result = await dataManager.updateTeamMember(action.payload.id, action.payload.data);
                if (result) {
                    updateTopic = `team:${result.teamId}`;
                    updateType = 'TEAM_MEMBER_UPDATED';
                    // Re-fetch rich member data for broadcast
                    const richMemberUpd = (await dataManager.getTeamMembers(result.teamId)).find((m: any) => m.membershipId === result.id);
                    if (richMemberUpd) result = richMemberUpd;
                }
                break;
            case SocketAction.REMOVE_TEAM_MEMBER:
                result = await dataManager.removeTeamMember(action.payload.id); 
                if (result) {
                    updateTopic = `team:${result.teamId}`;
                    updateType = 'TEAM_MEMBER_UPDATED';
                    
                    // ALSO Broadcast to the Org Team List (to update counts)
                    const teamForRem = await dataManager.getTeam(result.teamId);
                    if (teamForRem) {
                         additionalBroadcasts.push({ 
                             topic: `org:${teamForRem.orgId}:teams`, 
                             type: 'TEAM_UPDATED', 
                             data: { ...teamForRem } 
                         });
                         await broadcastOrgSummaries([teamForRem.orgId]);
                    }
                }
                break;
            case SocketAction.ADD_ORG_MEMBER:
                console.log(`DataManager: Adding org member ${action.payload.orgProfileId} to ${action.payload.orgId}`);
                result = await dataManager.addOrganizationMember(action.payload.orgProfileId, action.payload.orgId, action.payload.roleId, action.payload.id);
                if (result) {
                    const richMember = (await dataManager.getOrganizationMembers(action.payload.orgId)).find((m: any) => m.membershipId === result.id);
                    if (richMember) {
                        result = richMember;
                        
                        // Broadcast to user room if linked to an account
                        if (richMember.userId) {
                            additionalBroadcasts.push({ topic: `user:${richMember.userId}`, type: 'USER_MEMBERSHIPS_UPDATED', data: {} });
                            
                            // Send notification
                            const org = await dataManager.getOrganization(action.payload.orgId);
                            const role = await dataManager.getOrganizationRole(action.payload.roleId);
                            if (org && role) {
                                const notification = await dataManager.createNotification(
                                    richMember.userId,
                                    'New Organization Added',
                                    `You have been added to ${org.name} as a ${role.name}.`,
                                    'org_added',
                                    `/admin/organizations/${org.id}`
                                );
                                if (notification) {
                                    io.to(`user:${richMember.userId}`).emit('update', { type: 'NOTIFICATION_ADDED', data: notification });
                                }
                            }
                        }
                    }
                    
                    updateTopic = `org:${action.payload.orgId}:members`;
                    updateType = 'ORG_MEMBER_UPDATED';
                    await broadcastOrgSummaries([action.payload.orgId]);
                }
                break;
            case SocketAction.UPDATE_ORG_MEMBER:
                console.log(`DataManager: Updating org member role ${action.payload.id} to ${action.payload.roleId}`);
                result = await dataManager.updateOrganizationMember(action.payload.id, action.payload.roleId);
                if (result) {
                    updateTopic = `org:${result.orgId}:members`;
                    updateType = 'ORG_MEMBER_UPDATED';
                    // Re-fetch rich member data for broadcast
                    const richMember = (await dataManager.getOrganizationMembers(result.orgId)).find((m: any) => m.membershipId === result.id);
                    if (richMember) result = richMember;
                }
                break;
            case SocketAction.REMOVE_ORG_MEMBER:
                console.log(`DataManager: Removing org member ${action.payload.id}`);
                const orgMembershipToRem = await dataManager.getOrgMembership(action.payload.id);
                result = await dataManager.removeOrganizationMember(action.payload.id);
                if (orgMembershipToRem) {
                    // Refresh memberships for the affected user
                    const profile = await dataManager.getOrgProfile(orgMembershipToRem.orgProfileId);
                    if (profile && profile.userId) {
                        additionalBroadcasts.push({ topic: `user:${profile.userId}`, type: 'USER_MEMBERSHIPS_UPDATED', data: {} });
                    }

                    updateTopic = `org:${orgMembershipToRem.orgId}:members`;
                    updateType = 'ORG_MEMBER_UPDATED';
                    await broadcastOrgSummaries([orgMembershipToRem.orgId]);
                }
                break;
            case SocketAction.ADD_ORG_PROFILE:
                result = await dataManager.addOrgProfile(action.payload);
                break;
            case SocketAction.UPDATE_ORG_PROFILE:
                console.log(`DataManager: Updating org profile ${action.payload.id}`, action.payload.data);
                result = await dataManager.updateOrgProfile(action.payload.id, action.payload.data);
                break;
            case SocketAction.DELETE_ORG_PROFILE:
                console.log(`DataManager: Deleting org profile ${action.payload.id}`);
                result = await dataManager.deleteOrgProfile(action.payload.id);
                break;
            case SocketAction.LINK_USER_PROFILE:
                result = await dataManager.linkUserToProfile(action.payload.email, action.payload.orgProfileId);
                break;
            case SocketAction.CLAIM_ORG:
                result = await dataManager.claimOrganization(action.payload.id, action.payload.userId);
                 if (result) {
                    additionalBroadcasts.push({ topic: `user:${action.payload.userId}`, type: 'USER_MEMBERSHIPS_UPDATED', data: {} });
                    
                    const role = await dataManager.getOrganizationRole('role-org-admin');
                    const notification = await dataManager.createNotification(
                        action.payload.userId,
                        'Organization Claimed',
                        `You have successfully claimed ${result.name} and are now an ${role?.name || 'Administrator'}.`,
                        'org_added',
                        `/admin/organizations/${result.id}`
                    );
                    if (notification) {
                        io.to(`user:${action.payload.userId}`).emit('update', { type: 'NOTIFICATION_ADDED', data: notification });
                    }

                    await broadcastOrgSummaries([result.id]);
                 }
                break;
            case SocketAction.CLAIM_ORG_VIA_TOKEN:
                result = await dataManager.claimOrgViaToken(action.payload.token, action.payload.userId);
                if (result) {
                    additionalBroadcasts.push({ topic: `user:${action.payload.userId}`, type: 'USER_MEMBERSHIPS_UPDATED', data: {} });
                    
                    const role = await dataManager.getOrganizationRole('role-org-admin');
                    const notification = await dataManager.createNotification(
                        action.payload.userId,
                        'Organization Claimed',
                        `You have successfully claimed ${result.name} and are now an ${role?.name || 'Administrator'}.`,
                        'org_added',
                        `/admin/organizations/${result.id}`
                    );
                    if (notification) {
                        io.to(`user:${action.payload.userId}`).emit('update', { type: 'NOTIFICATION_ADDED', data: notification });
                    }

                    await broadcastOrgSummaries([result.id]);
                }
                break;
            case SocketAction.DECLINE_CLAIM:
                result = await dataManager.declineClaim(action.payload.token);
                // No broadcast needed, just confirmation
                break;
            case SocketAction.REFER_ORG_CONTACT_VIA_TOKEN:
                result = await dataManager.referOrgContactViaToken(action.payload.token, action.payload.contactEmails);
                // No broadcast needed, returns referrals
                break;

            case SocketAction.MARK_NOTIFICATION_READ:
                result = await dataManager.markNotificationAsRead(action.payload.id);
                break;
            case SocketAction.MARK_ALL_NOTIFICATIONS_READ:
                await dataManager.markAllNotificationsAsRead(action.payload.userId);
                result = { status: 'ok' };
                break;
            case SocketAction.DELETE_NOTIFICATION:
                result = await dataManager.deleteNotification(action.payload.id);
                break;
            case SocketAction.SUBMIT_REPORT:
                result = await dataManager.submitReport(action.payload);
                break;
            case SocketAction.GET_USER_BADGES:
                result = await dataManager.getUserBadges(action.payload.userId);
                break;
            case SocketAction.FEED_GET_HOME:
                result = await dataManager.getHomeFeed(action.payload.userId, action.payload.timezone);
                break;
            case SocketAction.RESET_CACHE:
            case SocketAction.GLOBAL_CACHE_REFRESH:
                dataManager.invalidateCache();
                // Signal all clients to refresh their local organization state
                io.emit('update', { type: 'GLOBAL_CACHE_REFRESH', data: {} });
                result = { message: 'Cache invalidated and refresh signal sent' };
                break;

            default:
                console.warn('Unknown action type:', action.type);
        }

        if (updateTopic && result) {
            io.to(updateTopic).emit('update', { type: updateType, data: result });
            console.log(`Broadcasted ${updateType} to ${updateTopic}`);
        }
        
        additionalBroadcasts.forEach(b => {
             io.to(b.topic).emit('update', { type: b.type, data: b.data });
             console.log(`Broadcasted ${b.type} to ${b.topic}`);
        });

        if (callback) callback({ status: 'ok', data: result });

    } catch (error: any) {
        console.error(`Server: Error handling action ${action.type}:`, error);
        if (callback) callback({ status: 'error', message: error.message || 'Internal server error' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start Jobs
  jobManager.registerJob({
      name: 'membership-expiry',
      intervalMs: 60 * 60 * 1000, // 1 hour
      handler: membershipExpiryJob
  });
  
  jobManager.registerJob({
      name: 'accuracy-audit',
      intervalMs: 24 * 60 * 60 * 1000, // 24 hours
      handler: accuracyAuditJob
  });
  
  jobManager.start();
});
