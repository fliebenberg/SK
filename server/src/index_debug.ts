import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import cors from 'cors';
import { dataManager } from './DataManager';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
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
      
      switch(type) {
          case 'organizations':
              callback((await dataManager.getOrganizations()).items);
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
          case 'facilities':
              callback(await dataManager.getFacilities(orgId));
              break;
          case 'games':
              callback(await dataManager.getGames(orgId));
              break;
          case 'events':
              callback(await dataManager.getEvents(orgId));
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
                    callback({ orgs, teams });
                } else {
                    callback({ orgs: [], teams: [] });
                }
                break;
          case 'person_identifiers':
                callback([]); // Deprecated
                break;
          case 'search_similar_orgs':
                if (request.name) {
                    callback(await dataManager.searchSimilarOrganizations(request.name));
                } else {
                    callback([]);
                }
                break;
          case 'search_profiles':
                if (request.query) {
                    callback(await dataManager.searchProfiles(request.query, request.orgId));
                } else {
                    callback([]);
                }
                break;
          case 'find_matching_user':
                callback(await dataManager.findMatchingUser(request.email, request.name, request.birthdate));
                break;
          default:
              callback(null);
      }
  });

  socket.on('join_room', async (room) => {
        socket.join(room);
        console.log(`Socket ${socket.id} joined room ${room}`);

        // Push-on-Join Logic
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
                    const facilities = await dataManager.getFacilities(orgId);
                    socket.emit('update', { type: 'FACILITIES_SYNC', data: facilities });
                } else if (type === 'events') {
                    const events = await dataManager.getEvents(orgId);
                    socket.emit('update', { type: 'EVENTS_SYNC', data: events });
                } else if (type === 'games') {
                     const games = await dataManager.getGames(orgId);
                     socket.emit('update', { type: 'GAMES_SYNC', data: games });
                } else if (type === 'summary') {
                    const org = await dataManager.getOrganization(orgId);
                    if (org) socket.emit('update', { type: 'ORGANIZATION_SYNC', data: org });
                }
            } else if (room.startsWith('team:')) {
                const teamId = room.split(':')[1];
                const team = await dataManager.getTeam(teamId);
                if (team) socket.emit('update', { type: 'TEAM_UPDATED', data: team });
                
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
                const gameId = room.split(':')[1];
                const game = await dataManager.getGame(gameId);
                if (game) socket.emit('update', { type: 'GAME_UPDATED', data: game });
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

  socket.on('action', async (action: { type: string, payload: any }, callback) => {
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
            const updatedOrg = await dataManager.getOrganization(orgId);
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
            case 'ADD_TEAM':
                result = await dataManager.addTeam(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:teams`, type: 'TEAM_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_ADDED', data: result });
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
            case 'UPDATE_TEAM':
                result = await dataManager.updateTeam(action.payload.id, action.payload.data);
                if (result) {
                    // Broadcast to the Organization's team list
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:teams`, type: 'TEAM_UPDATED', data: result });
                    // Broadcast to the specific team room
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_UPDATED', data: result });
                }
                break;
            case 'ADD_SITE':
                result = await dataManager.addSite(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:sites`, type: 'SITE_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `site:${result.id}`, type: 'SITE_ADDED', data: result });
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
            case 'UPDATE_SITE':
                result = await dataManager.updateSite(action.payload.id, action.payload.data);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:sites`, type: 'SITE_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `site:${result.id}`, type: 'SITE_UPDATED', data: result });
                }
                break;
            case 'DELETE_SITE':
                result = await dataManager.deleteSite(action.payload.id);
                if (result) {
                     additionalBroadcasts.push({ topic: `org:${result.orgId}:sites`, type: 'SITE_DELETED', data: { id: result.id } });
                     additionalBroadcasts.push({ topic: `site:${result.id}`, type: 'SITE_DELETED', data: { id: result.id } });
                     await broadcastOrgSummaries([result.orgId]);
                }
                break;
            case 'ADD_FACILITY':
                result = await dataManager.addFacility(action.payload);
                if (result) {
                    const parentSite = await dataManager.getSite(result.siteId);
                    if (parentSite && parentSite.orgId) {
                        additionalBroadcasts.push({ topic: `org:${parentSite.orgId}:facilities`, type: 'FACILITY_ADDED', data: result });
                    }
                    additionalBroadcasts.push({ topic: `site:${result.siteId}:facilities`, type: 'FACILITY_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `facility:${result.id}`, type: 'FACILITY_ADDED', data: result });
                }
                break;
            case 'UPDATE_FACILITY':
                result = await dataManager.updateFacility(action.payload.id, action.payload.data);
                if (result) {
                    const parentSite = await dataManager.getSite(result.siteId);
                    if (parentSite && parentSite.orgId) {
                        additionalBroadcasts.push({ topic: `org:${parentSite.orgId}:facilities`, type: 'FACILITY_UPDATED', data: result });
                    }
                    additionalBroadcasts.push({ topic: `site:${result.siteId}:facilities`, type: 'FACILITY_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `facility:${result.id}`, type: 'FACILITY_UPDATED', data: result });
                }
                break;
            case 'DELETE_FACILITY':
                result = await dataManager.deleteFacility(action.payload.id);
                if (result) {
                     const parentSite = await dataManager.getSite(result.siteId);
                     if (parentSite && parentSite.orgId) {
                         additionalBroadcasts.push({ topic: `org:${parentSite.orgId}:facilities`, type: 'FACILITY_DELETED', data: { id: result.id } });
                     }
                     additionalBroadcasts.push({ topic: `site:${result.siteId}:facilities`, type: 'FACILITY_DELETED', data: { id: result.id } });
                     additionalBroadcasts.push({ topic: `facility:${result.id}`, type: 'FACILITY_DELETED', data: { id: result.id } });
                }
                break;
            // ... (Games omitted for brevity, keeping as is)
             case 'ADD_GAME':
                result = await dataManager.addGame(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `games`, type: 'GAME_ADDED', data: result });
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
             case 'UPDATE_GAME_STATUS':
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
             case 'UPDATE_SCORE':
                result = await dataManager.updateGame(action.payload.id, { 
                    finalScoreData: { 
                        home: action.payload.homeScore, 
                        away: action.payload.awayScore 
                    } 
                });
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
             case 'UPDATE_GAME':
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
             case 'ADD_ORG_PROFILE':
                result = await dataManager.addOrgProfile(action.payload);
                break;
             case 'ADD_TEAM_MEMBER':
                result = await dataManager.addTeamMember(action.payload);
                // Broadcast ONLY to the team room
                updateTopic = `team:${result.teamId}`;
                updateType = 'TEAM_MEMBER_UPDATED';
                
                // ALSO Broadcast to the Org Team List (to update counts)
                // We need to fetch the team to get the orgId.
                const teamForAdd = await dataManager.getTeam(result.teamId);
                if (teamForAdd) {
                     // TODO: Ideally we send { id, playerCount: X }
                     // For now, I'll send the Team object (store will merge).
                     // But store needs logic to update count.
                     // Sending TEAM_UPDATED.
                     additionalBroadcasts.push({ 
                         topic: `org:${teamForAdd.orgId}:teams`, 
                         type: 'TEAM_UPDATED', 
                         data: { ...teamForAdd } // Send full team or just ID? Store expects data.
                     });
                }

                const richMember = (await dataManager.getTeamMembers(result.teamId)).find((m: any) => m.membershipId === result.id);
                if (richMember) result = richMember;
                if (teamForAdd) {
                    await broadcastOrgSummaries([teamForAdd.orgId]);
                }
                break;
             case 'REMOVE_TEAM_MEMBER':
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
            case 'DELETE_TEAM':
                result = await dataManager.deleteTeam(action.payload.id);
                if (result) {
                    // Update global org list
                    additionalBroadcasts.push({ topic: `org:${result.orgId}:teams`, type: 'TEAM_DELETED', data: { id: result.id } });
                    // Notify team room (optional, maybe force leave?)
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_DELETED', data: { id: result.id } });
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
             case 'UPDATE_TEAM_MEMBER':
                result = await dataManager.updateTeamMember(action.payload.id, action.payload.data);
                if (result) {
                    updateTopic = `team:${result.teamId}`;
                    updateType = 'TEAM_MEMBERS_UPDATED';
                    // Re-fetch rich member data for broadcast
                    const richMember = (await dataManager.getTeamMembers(result.teamId)).find((m: any) => m.membershipId === result.id);
                    if (richMember) result = richMember;
                }
                break;
             case 'ADD_ORG_MEMBER':
                console.log(`DataManager: Adding org member ${action.payload.orgProfileId} to ${action.payload.orgId}`);
                result = await dataManager.addOrganizationMember(action.payload.orgProfileId, action.payload.orgId, action.payload.roleId, action.payload.id);
                if (result) {
                    const richMember = (await dataManager.getOrganizationMembers(action.payload.orgId)).find((m: any) => m.membershipId === result.id);
                    if (richMember) {
                        result = richMember;
                        console.log(`DataManager: Rich member found for broadcast: ${richMember.name}`);
                    }
                    
                    updateTopic = `org:${action.payload.orgId}:members`;
                    updateType = 'ORG_MEMBER_UPDATED';
                    await broadcastOrgSummaries([action.payload.orgId]);
                }
                break;
             case 'REMOVE_ORG_MEMBER':
                console.log(`DataManager: Removing org member ${action.payload.id}`);
                result = await dataManager.removeOrganizationMember(action.payload.id);
                if (result) {
                    updateTopic = `org:${result.orgId}:members`;
                    updateType = 'ORG_MEMBER_UPDATED';
                    await broadcastOrgSummaries([result.orgId]);
                }
                break;
             case 'UPDATE_ORG_MEMBER':
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
            case 'ADD_ORG':
                result = await dataManager.addOrganization(action.payload);
                updateTopic = `organizations`;
                updateType = 'ORGANIZATION_UPDATED';
                break;
            case 'UPDATE_ORG':
                result = await dataManager.updateOrganization(action.payload.id, action.payload.data);
                if (result) {
                    updateTopic = `organizations`;
                    updateType = 'ORGANIZATION_UPDATED';
                }
                break;
            case 'CLAIM_ORG':
                result = await dataManager.claimOrganization(action.payload.id, action.payload.userId);
                if (result) {
                    updateTopic = `organizations`;
                    updateType = 'ORGANIZATION_UPDATED';
                }
                break;
            case 'ADD_EVENT':
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
            case 'UPDATE_EVENT':
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
            case 'DELETE_EVENT':
                result = await dataManager.deleteEvent(action.payload.id);
                if (result) {
                    const orgIds = [result.orgId, ...(result.participatingOrgIds || [])];
                    orgIds.forEach(orgId => {
                        additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'EVENT_DELETED', data: { id: result.id } });
                    });
                    await broadcastOrgSummaries([result.orgId, ...(result.participatingOrgIds || [])]);
                }
                break;
             case 'UPDATE_ORG_PROFILE':
                console.log(`DataManager: Updating profile ${action.payload.id}`, action.payload.data);
                result = await dataManager.updateOrgProfile(action.payload.id, action.payload.data);
                break;
             // Add other cases as needed
        }

        if (callback) callback({ status: 'ok', data: result });

        if (updateTopic && result) {
            io.to(updateTopic).emit('update', { type: updateType, data: result });
            console.log(`Broadcasted ${updateType} to ${updateTopic}`);
        }
        
        additionalBroadcasts.forEach(b => {
             io.to(b.topic).emit('update', { type: b.type, data: b.data });
             console.log(`Broadcasted ${b.type} to ${b.topic}`);
        });

    } catch (e: any) {
        console.error("Action failed", e);
        if (callback) callback({ status: 'error', message: e.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// --- Admin REST API ---
app.use(express.json());

// Middleware to check for App Admin (simplified for now, should verify session token)
const checkAppAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userId = req.headers['x-user-id'] as string; // Temporary: should use real session validation
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    
    if (await dataManager.isAppAdmin(userId)) {
        next();
    } else {
        res.status(403).json({ message: "Forbidden: Admin access required" });
    }
};

app.get('/api/admin/users', checkAppAdmin, async (req, res) => {
    // We need an "getAllUsers" method in UserManager/DataManager
    // Since it's not there yet, I'll add a quick query or update the manager
    const usersRes = await (dataManager as any).query('SELECT id, name, email, global_role as "globalRole", created_at as "createdAt" FROM users');
    res.json(usersRes.rows);
});

app.post('/api/admin/users/:id/role', checkAppAdmin, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    await (dataManager as any).query('UPDATE users SET global_role = $1 WHERE id = $2', [role, id]);
    res.json({ success: true });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
