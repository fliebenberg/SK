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
  
    socket.on('get_data', (request, callback) => {
      const { type, organizationId, id, teamId } = request;
      
      switch(type) {
          case 'organizations':
              callback(dataManager.getOrganizations());
              break;
          case 'teams':
              callback(dataManager.getTeams(organizationId));
              break;
          case 'venues':
              callback(dataManager.getVenues(organizationId));
              break;
          case 'games':
              callback(dataManager.getGames(organizationId));
              break;
          case 'sports':
              callback(dataManager.getSports());
              break;
          case 'roles':
              callback({
                  team: dataManager.getTeamRoles(),
                  org: dataManager.getOrganizationRoles()
              });
              break;
          case 'persons':
              // Avoid sending ALL persons. 
              // Returns empty as we usually fetch via team or organization context
              callback([]); 
              break;
          case 'organization_members':
              if (organizationId) {
                  callback(dataManager.getOrganizationMembers(organizationId));
              } else {
                  callback([]);
              }
              break;
          case 'team_members':
              // Fetch members for a specific team
              if (teamId) {
                  callback(dataManager.getTeamMembers(teamId));
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

  socket.on('action', (action: { type: string, payload: any }, callback) => {
    console.log(`Action received: ${action.type}`, action.payload);
    let result: any = null;
    let updateTopic = '';
    let updateType = '';
    
    // Some actions might need multiple broadcasts (e.g. to team room AND global list)
    let additionalBroadcasts: { topic: string, type: string, data: any }[] = [];

    try {
        switch(action.type) {
            case 'ADD_TEAM':
                result = dataManager.addTeam(action.payload);
                updateTopic = `org:${result.organizationId}:teams`;
                updateType = 'TEAM_ADDED';
                break;
            case 'UPDATE_TEAM':
                result = dataManager.updateTeam(action.payload.id, action.payload.data);
                if (result) {
                    // Broadcast to the Organization's team list
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:teams`, type: 'TEAM_UPDATED', data: result });
                    // Broadcast to the specific team room
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_UPDATED', data: result });
                }
                break;
            case 'ADD_VENUE':
                result = dataManager.addVenue(action.payload);
                updateTopic = `org:${result.organizationId}:venues`; 
                updateType = 'VENUE_ADDED';
                break;
            case 'UPDATE_VENUE':
                result = dataManager.updateVenue(action.payload.id, action.payload.data);
                if (result) {
                    // Update Org List
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:venues`, type: 'VENUE_UPDATED', data: result });
                    // Update Venue Room
                    additionalBroadcasts.push({ topic: `venue:${result.id}`, type: 'VENUE_UPDATED', data: result });
                }
                break;
            case 'DELETE_VENUE':
                result = dataManager.deleteVenue(action.payload.id);
                if (result) {
                     // Update Org List
                     additionalBroadcasts.push({ topic: `org:${result.organizationId}:venues`, type: 'VENUE_DELETED', data: { id: result.id } });
                     // Notify Venue Room
                     additionalBroadcasts.push({ topic: `venue:${result.id}`, type: 'VENUE_DELETED', data: { id: result.id } });
                }
                break;
            // ... (Games omitted for brevity, keeping as is)
             case 'ADD_GAME':
                result = dataManager.addGame(action.payload);
                updateTopic = `games`; // Broad topic for now
                updateType = 'GAMES_UPDATED';
                break;
             case 'UPDATE_GAME_STATUS':
                result = dataManager.updateGameStatus(action.payload.id, action.payload.status);
                updateTopic = `games`;
                updateType = 'GAMES_UPDATED';
                break;
             case 'UPDATE_SCORE':
                result = dataManager.updateScore(action.payload.id, action.payload.homeScore, action.payload.awayScore);
                updateTopic = `games`;
                updateType = 'GAMES_UPDATED';
                break;
             case 'ADD_PERSON':
                result = dataManager.addPerson(action.payload);
                // Broadcasters handled by caller if they know the org context or wait for ADD_ORG_MEMBER
                break;
             case 'ADD_TEAM_MEMBER':
                result = dataManager.addTeamMember(action.payload);
                // Broadcast ONLY to the team room
                updateTopic = `team:${result.teamId}`;
                updateType = 'TEAM_MEMBERS_UPDATED';
                
                // ALSO Broadcast to the Org Team List (to update counts)
                // We need to fetch the team to get the orgId.
                const teamForAdd = dataManager.getTeam(result.teamId);
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

                const richMember = dataManager.getTeamMembers(result.teamId).find((m: any) => m.membershipId === result.id);
                if (richMember) result = richMember;
                break;
             case 'REMOVE_TEAM_MEMBER':
                result = dataManager.removeTeamMember(action.payload.id); 
                if (result) {
                    updateTopic = `team:${result.teamId}`;
                    updateType = 'TEAM_MEMBERS_UPDATED';
                    
                     // ALSO Broadcast to the Org Team List (to update counts)
                    const teamForRem = dataManager.getTeam(result.teamId);
                    if (teamForRem) {
                         additionalBroadcasts.push({ 
                             topic: `org:${teamForRem.organizationId}:teams`, 
                             type: 'TEAM_UPDATED', 
                             data: { ...teamForRem } 
                         });
                    }
                }
                break;
            case 'DELETE_TEAM':
                result = dataManager.deleteTeam(action.payload.id);
                if (result) {
                    // Update global org list
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:teams`, type: 'TEAM_DELETED', data: { id: result.id } });
                    // Notify team room (optional, maybe force leave?)
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_DELETED', data: { id: result.id } });
                }
                break;
             case 'UPDATE_TEAM_MEMBER':
                result = dataManager.updateTeamMember(action.payload.id, action.payload.data);
                if (result) {
                    updateTopic = `team:${result.teamId}`;
                    updateType = 'TEAM_MEMBERS_UPDATED';
                    // Re-fetch rich member data for broadcast
                    const richMember = dataManager.getTeamMembers(result.teamId).find((m: any) => m.membershipId === result.id);
                    if (richMember) result = richMember;
                }
                break;
             case 'ADD_ORG_MEMBER':
                console.log(`DataManager: Adding org member ${action.payload.personId} to ${action.payload.organizationId}`);
                result = dataManager.addOrganizationMember(action.payload.personId, action.payload.organizationId, action.payload.roleId, action.payload.id);
                if (result) {
                    const richMember = dataManager.getOrganizationMembers(action.payload.organizationId).find((m: any) => m.membershipId === result.id);
                    if (richMember) {
                        result = richMember;
                        console.log(`DataManager: Rich member found for broadcast: ${richMember.name}`);
                    }
                    
                    updateTopic = `org:${action.payload.organizationId}:members`;
                    updateType = 'ORG_MEMBERS_UPDATED';
                }
                break;
             case 'REMOVE_ORG_MEMBER':
                console.log(`DataManager: Removing org member ${action.payload.id}`);
                result = dataManager.removeOrganizationMember(action.payload.id);
                if (result) {
                    updateTopic = `org:${result.organizationId}:members`;
                    updateType = 'ORG_MEMBERS_UPDATED';
                }
                break;
             case 'UPDATE_ORG_MEMBER':
                console.log(`DataManager: Updating org member role ${action.payload.id} to ${action.payload.roleId}`);
                result = dataManager.updateOrganizationMember(action.payload.id, action.payload.roleId);
                if (result) {
                    updateTopic = `org:${result.organizationId}:members`;
                    updateType = 'ORG_MEMBERS_UPDATED';
                    // Re-fetch rich member data for broadcast
                    const richMember = dataManager.getOrganizationMembers(result.organizationId).find((m: any) => m.membershipId === result.id);
                    if (richMember) result = richMember;
                }
                break;
            case 'ADD_ORG':
                result = dataManager.addOrganization(action.payload);
                updateTopic = `organizations`;
                updateType = 'ORGANIZATIONS_UPDATED';
                break;
            case 'UPDATE_ORG':
                result = dataManager.updateOrganization(action.payload.id, action.payload.data);
                if (result) {
                    updateTopic = `organizations`;
                    updateType = 'ORGANIZATIONS_UPDATED';
                }
                break;
             case 'UPDATE_PERSON':
                console.log(`DataManager: Updating person ${action.payload.id}`, action.payload.data);
                result = dataManager.updatePerson(action.payload.id, action.payload.data);
                if (result) {
                    // Find all teams this person belongs to and broadcast to them
                    const memberships = dataManager.teamMemberships.filter(m => m.personId === result.id && !m.endDate);
                    memberships.forEach(m => {
                        additionalBroadcasts.push({
                            topic: `team:${m.teamId}`,
                            type: 'TEAM_MEMBERS_UPDATED',
                            // Enriched data for store.handleUpdate
                            data: {
                                ...result,
                                membershipId: m.id,
                                roleId: m.roleId,
                                teamId: m.teamId,
                            }
                        });
                    });

                    // BROADCAST to Organization Members lists
                    const orgMemberships = dataManager.organizationMemberships.filter(m => m.personId === result.id && !m.endDate);
                    orgMemberships.forEach(m => {
                        additionalBroadcasts.push({
                            topic: `org:${m.organizationId}:members`,
                            type: 'ORG_MEMBERS_UPDATED',
                            data: {
                                ...result,
                                membershipId: m.id,
                                roleId: m.roleId,
                                organizationId: m.organizationId
                            }
                        });
                    });
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

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
