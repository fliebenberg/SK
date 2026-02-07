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
  
    socket.on('get_data', async (request, callback) => {
      const { type, organizationId, id, teamId } = request;
      
      switch(type) {
          case 'organizations':
              callback(await dataManager.getOrganizations());
              break;
          case 'organization':
              callback(await dataManager.getOrganization(id));
              break;
          case 'teams':
              callback(await dataManager.getTeams(organizationId));
              break;
          case 'team':
              callback(await dataManager.getTeam(id) || await dataManager.getTeam(teamId));
              break;
          case 'venues':
              callback(await dataManager.getVenues(organizationId));
              break;
          case 'games':
              callback(await dataManager.getGames(organizationId));
              break;
          case 'events':
              callback(await dataManager.getEvents(organizationId));
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
          case 'persons':
              // Avoid sending ALL persons. 
              // Returns empty as we usually fetch via team or organization context
              callback([]); 
              break;
          case 'organization_members':
              if (organizationId) {
                  const members = await dataManager.getOrganizationMembers(organizationId);
                  console.log(`Server: Returning ${members.length} members for org ${organizationId}`);
                  callback(members);
              } else {
                  console.warn("Server: organization_members requested without organizationId");
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
          case 'organization_memberships':
                callback([]); // Deprecated global fetch
                break;
          default:
              callback(null);
      }
  });

  socket.on('join_room', (room: string) => {
    // console.log(`Socket ${socket.id} joining room ${room}`);
    socket.join(room);
  });

  socket.on('leave_room', (room: string) => {
    // console.log(`Socket ${socket.id} leaving room ${room}`);
    socket.leave(room);
  });

  socket.on('subscribe', (topic: string) => {
    console.log(`Socket ${socket.id} subscribed to ${topic}`);
    socket.join(topic);
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
                io.to(room).emit('update', { type: 'ORGANIZATIONS_UPDATED', data: updatedOrg });
                // Also emit to the global organizations list room (for admin overview)
                io.to('organizations').emit('update', { type: 'ORGANIZATIONS_UPDATED', data: updatedOrg });
                console.log(`Server: Broadcasted ORGANIZATIONS_UPDATED for ${orgId} to ${room} and global`);
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
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:teams`, type: 'TEAM_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_ADDED', data: result });
                    await broadcastOrgSummaries([result.organizationId]);
                }
                break;
            case 'UPDATE_TEAM':
                result = await dataManager.updateTeam(action.payload.id, action.payload.data);
                if (result) {
                    // Broadcast to the Organization's team list
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:teams`, type: 'TEAM_UPDATED', data: result });
                    // Broadcast to the specific team room
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_UPDATED', data: result });
                }
                break;
            case 'ADD_VENUE':
                result = await dataManager.addVenue(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:venues`, type: 'VENUE_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `venue:${result.id}`, type: 'VENUE_ADDED', data: result });
                    await broadcastOrgSummaries([result.organizationId]);
                }
                break;
            case 'UPDATE_VENUE':
                result = await dataManager.updateVenue(action.payload.id, action.payload.data);
                if (result) {
                    // Update Org List
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:venues`, type: 'VENUE_UPDATED', data: result });
                    // Update Venue Room
                    additionalBroadcasts.push({ topic: `venue:${result.id}`, type: 'VENUE_UPDATED', data: result });
                }
                break;
            case 'DELETE_VENUE':
                result = await dataManager.deleteVenue(action.payload.id);
                if (result) {
                     // Update Org List
                     additionalBroadcasts.push({ topic: `org:${result.organizationId}:venues`, type: 'VENUE_DELETED', data: { id: result.id } });
                     // Notify Venue Room
                     additionalBroadcasts.push({ topic: `venue:${result.id}`, type: 'VENUE_DELETED', data: { id: result.id } });
                     await broadcastOrgSummaries([result.organizationId]);
                }
                break;
            // ... (Games omitted for brevity, keeping as is)
             case 'ADD_GAME':
                result = await dataManager.addGame(action.payload);
                updateTopic = `games`; // Broad topic for now
                updateType = 'GAMES_UPDATED';
                if (result) {
                    additionalBroadcasts.push({ topic: `event:${result.eventId}`, type: 'GAMES_UPDATED', data: result });
                    
                    // Also notify participating orgs so it appears in their main list if needed
                    const parentEvent = await dataManager.getEvent(result.eventId);
                    if (parentEvent) {
                         // We might want to notify all participants of the event, 
                         // or just the teams involved in the game? 
                         // For now, event room covering the "Schedule" tab is critical.
                         // But if an org is looking at "My Games" dashboard, they need it too.
                         const orgIds = [parentEvent.organizationId, ...(parentEvent.participatingOrgIds || [])];
                         orgIds.forEach(orgId => {
                             additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'GAMES_UPDATED', data: result });
                         });
                    }
                }
                break;
             case 'UPDATE_GAME_STATUS':
                result = await dataManager.updateGameStatus(action.payload.id, action.payload.status);
                if (result) {
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAMES_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `event:${result.eventId}`, type: 'GAMES_UPDATED', data: result });
                    
                    const parentEvent = await dataManager.getEvent(result.eventId);
                    if (parentEvent) {
                        const orgIds = [parentEvent.organizationId, ...(parentEvent.participatingOrgIds || [])];
                        orgIds.forEach(orgId => {
                            additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'GAMES_UPDATED', data: result });
                        });
                    }
                }
                break;
             case 'UPDATE_SCORE':
                result = await dataManager.updateScore(action.payload.id, action.payload.homeScore, action.payload.awayScore);
                if (result) {
                     additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAMES_UPDATED', data: result });
                     additionalBroadcasts.push({ topic: `event:${result.eventId}`, type: 'GAMES_UPDATED', data: result });

                     const parentEvent = await dataManager.getEvent(result.eventId);
                     if (parentEvent) {
                         const orgIds = [parentEvent.organizationId, ...(parentEvent.participatingOrgIds || [])];
                         orgIds.forEach(orgId => {
                             additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'GAMES_UPDATED', data: result });
                         });
                     }
                }
                break;
             case 'UPDATE_GAME':
                result = await dataManager.updateGame(action.payload.id, action.payload.data);
                if (result) {
                    const parentEvent = await dataManager.getEvent(result.eventId);
                    if (parentEvent) {
                        const orgIds = [parentEvent.organizationId, ...(parentEvent.participatingOrgIds || [])];
                        orgIds.forEach(orgId => {
                            additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'GAMES_UPDATED', data: result });
                        });
                    }
                }
                break;
             case 'ADD_PERSON':
                result = await dataManager.addPerson(action.payload);
                // Broadcasters handled by caller if they know the org context or wait for ADD_ORG_MEMBER
                break;
             case 'ADD_TEAM_MEMBER':
                result = await dataManager.addTeamMember(action.payload);
                // Broadcast ONLY to the team room
                updateTopic = `team:${result.teamId}`;
                updateType = 'TEAM_MEMBERS_UPDATED';
                
                // ALSO Broadcast to the Org Team List (to update counts)
                // We need to fetch the team to get the orgId.
                const teamForAdd = await dataManager.getTeam(result.teamId);
                if (teamForAdd) {
                     // TODO: Ideally we send { id, playerCount: X }
                     // For now, I'll send the Team object (store will merge).
                     // But store needs logic to update count.
                     // Sending TEAM_UPDATED.
                     additionalBroadcasts.push({ 
                         topic: `org:${teamForAdd.organizationId}:teams`, 
                         type: 'TEAM_UPDATED', 
                         data: { ...teamForAdd } // Send full team or just ID? Store expects data.
                     });
                }

                const richMember = (await dataManager.getTeamMembers(result.teamId)).find((m: any) => m.membershipId === result.id);
                if (richMember) result = richMember;
                if (teamForAdd) {
                    await broadcastOrgSummaries([teamForAdd.organizationId]);
                }
                break;
             case 'REMOVE_TEAM_MEMBER':
                result = await dataManager.removeTeamMember(action.payload.id); 
                if (result) {
                    updateTopic = `team:${result.teamId}`;
                    updateType = 'TEAM_MEMBERS_UPDATED';
                    
                     // ALSO Broadcast to the Org Team List (to update counts)
                    const teamForRem = await dataManager.getTeam(result.teamId);
                    if (teamForRem) {
                         additionalBroadcasts.push({ 
                             topic: `org:${teamForRem.organizationId}:teams`, 
                             type: 'TEAM_UPDATED', 
                             data: { ...teamForRem } 
                         });
                         await broadcastOrgSummaries([teamForRem.organizationId]);
                    }
                }
                break;
            case 'DELETE_TEAM':
                result = await dataManager.deleteTeam(action.payload.id);
                if (result) {
                    // Update global org list
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:teams`, type: 'TEAM_DELETED', data: { id: result.id } });
                    // Notify team room (optional, maybe force leave?)
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_DELETED', data: { id: result.id } });
                    await broadcastOrgSummaries([result.organizationId]);
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
                console.log(`DataManager: Adding org member ${action.payload.personId} to ${action.payload.organizationId}`);
                result = await dataManager.addOrganizationMember(action.payload.personId, action.payload.organizationId, action.payload.roleId, action.payload.id);
                if (result) {
                    const richMember = (await dataManager.getOrganizationMembers(action.payload.organizationId)).find((m: any) => m.membershipId === result.id);
                    if (richMember) {
                        result = richMember;
                        console.log(`DataManager: Rich member found for broadcast: ${richMember.name}`);
                    }
                    
                    updateTopic = `org:${action.payload.organizationId}:members`;
                    updateType = 'ORG_MEMBERS_UPDATED';
                    await broadcastOrgSummaries([action.payload.organizationId]);
                }
                break;
             case 'REMOVE_ORG_MEMBER':
                console.log(`DataManager: Removing org member ${action.payload.id}`);
                result = await dataManager.removeOrganizationMember(action.payload.id);
                if (result) {
                    updateTopic = `org:${result.organizationId}:members`;
                    updateType = 'ORG_MEMBERS_UPDATED';
                    await broadcastOrgSummaries([result.organizationId]);
                }
                break;
             case 'UPDATE_ORG_MEMBER':
                console.log(`DataManager: Updating org member role ${action.payload.id} to ${action.payload.roleId}`);
                result = await dataManager.updateOrganizationMember(action.payload.id, action.payload.roleId);
                if (result) {
                    updateTopic = `org:${result.organizationId}:members`;
                    updateType = 'ORG_MEMBERS_UPDATED';
                    // Re-fetch rich member data for broadcast
                    const richMember = (await dataManager.getOrganizationMembers(result.organizationId)).find((m: any) => m.membershipId === result.id);
                    if (richMember) result = richMember;
                }
                break;
            case 'ADD_ORG':
                result = await dataManager.addOrganization(action.payload);
                updateTopic = `organizations`;
                updateType = 'ORGANIZATIONS_UPDATED';
                break;
            case 'UPDATE_ORG':
                result = await dataManager.updateOrganization(action.payload.id, action.payload.data);
                if (result) {
                    updateTopic = `organizations`;
                    updateType = 'ORGANIZATIONS_UPDATED';
                }
                break;
            case 'ADD_EVENT':
                result = await dataManager.addEvent(action.payload);
                if (result) {
                    console.log("Server: Event Added, processing broadcasts. Participating:", result.participatingOrgIds);
                    const orgIds = [result.organizationId, ...(result.participatingOrgIds || [])];
                    orgIds.forEach(orgId => {
                        additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'EVENT_ADDED', data: result });
                    });
                    additionalBroadcasts.push({ topic: `event:${result.id}`, type: 'EVENT_ADDED', data: result });
                    await broadcastOrgSummaries([result.organizationId, ...(result.participatingOrgIds || [])]);
                }
                break;
            case 'UPDATE_EVENT':
                // Fetch current event to know who might be removed
                const oldEvent = await dataManager.getEvent(action.payload.id);
                result = await dataManager.updateEvent(action.payload.id, action.payload.data);
                if (result) {
                    const oldOrgIds = oldEvent ? [oldEvent.organizationId, ...(oldEvent.participatingOrgIds || [])] : [];
                    const newOrgIds = [result.organizationId, ...(result.participatingOrgIds || [])];
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
                    const orgIds = [result.organizationId, ...(result.participatingOrgIds || [])];
                    orgIds.forEach(orgId => {
                        additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'EVENT_DELETED', data: { id: result.id } });
                    });
                    await broadcastOrgSummaries([result.organizationId, ...(result.participatingOrgIds || [])]);
                }
                break;
             case 'UPDATE_PERSON':
                console.log(`DataManager: Updating person ${action.payload.id}`, action.payload.data);
                result = await dataManager.updatePerson(action.payload.id, action.payload.data);
                if (result) {
                    // Find all teams this person belongs to and broadcast to them
                    // Note: We need to query memberships since we don't have them in memory anymore
                    // But Wait, we don't have a direct "getAllMembershipsForPerson" method.
                    // I'll skip this specific broadcast logic adjustment for now or implement a quick query if needed.
                    // For now, let's just update the person. The client will refresh if needed.
                    // Actually, let's leave the complex broadcast logic for later if it breaks.
                }
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
