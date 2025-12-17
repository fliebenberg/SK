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
      // Basic initial data fetcher
      // request: { type: 'teams', orgId: '...' }
      const { type, organizationId, id } = request;
      
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
              callback(dataManager.getPersons());
              break;
          // TODO: Add memberships getters if needed via separate call or included in other calls
          case 'team_memberships':
               callback(dataManager.teamMemberships);
               break;
          case 'organization_memberships':
                callback(dataManager.organizationMemberships);
                break;
          default:
              callback(null);
      }
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
    let result = null;
    let updateTopic = '';
    let updateType = '';

    try {
        switch(action.type) {
            case 'ADD_TEAM':
                result = dataManager.addTeam(action.payload);
                updateTopic = `org:${action.payload.organizationId}:teams`;
                updateType = 'TEAMS_UPDATED';
                break;
            case 'UPDATE_TEAM':
                result = dataManager.updateTeam(action.payload.id, action.payload.data);
                if (result) {
                    updateTopic = `org:${result.organizationId}:teams`;
                    updateType = 'TEAMS_UPDATED';
                }
                break;
            case 'ADD_VENUE':
                result = dataManager.addVenue(action.payload);
                updateTopic = `org:${action.payload.organizationId}:venues`; // Note: payload needs orgId
                updateType = 'VENUES_UPDATED';
                break;
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
                updateTopic = `persons`;
                updateType = 'PERSONS_UPDATED';
                break;
             case 'ADD_TEAM_MEMBER':
                result = dataManager.addTeamMember(action.payload);
                updateTopic = `team_memberships`;
                updateType = 'TEAM_MEMBERSHIPS_UPDATED';
                break;
             case 'REMOVE_TEAM_MEMBER':
                result = dataManager.removeTeamMember(action.payload.id); // payload should have id
                updateTopic = `team_memberships`;
                updateType = 'TEAM_MEMBERSHIPS_UPDATED';
                break;
             case 'ADD_ORG_MEMBER':
                result = dataManager.addOrganizationMember(action.payload.personId, action.payload.organizationId, action.payload.roleId);
                updateTopic = `organization_memberships`;
                updateType = 'ORG_MEMBERSHIPS_UPDATED';
                break;
             // Add other cases as needed
        }

        if (callback) callback({ status: 'ok', data: result });

        if (updateTopic && result) {
            // Broadcast to topic that data has changed
            // Using a generic "update" event implies the client should re-fetch or we send the delta?
            // "The client should keep its own copy... up to date with data from the server"
            // Easiest is to send the *new item* or *updated list*?
            // If we send just the item, client merges.
            // Let's send the specific event + data.
            io.to(updateTopic).emit('update', { type: updateType, data: result });
            console.log(`Broadcasted ${updateType} to ${updateTopic}`);
        }

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
