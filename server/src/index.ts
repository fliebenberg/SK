import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { dataManager } from './DataManager';
import { SocketAction } from '@sk/types';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
      const { type, organizationId, id, teamId } = request;
      
      switch(type) {
          case 'organizations':
              callback(await dataManager.getOrganizations());
              break;
          case 'organization':
          case 'organization_summary':
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
          case 'venue':
              callback(await dataManager.getVenue(id));
              break;
          case 'games':
              callback(await dataManager.getGames(organizationId));
              break;
          case 'game':
              callback(await dataManager.getGame(id));
              break;
          case 'events':
              callback(await dataManager.getEvents(organizationId));
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
          case 'user_memberships':
                if (id) {
                    const [orgs, teams] = await Promise.all([
                        dataManager.getUserOrgMemberships(id),
                        dataManager.getUserTeamMemberships(id)
                    ]);
                    // Combine into unified list or send separate?
                    // Let's assume client expects list of memberships
                    // Wait, getUserOrgMemberships returns OrganizationMembership[]
                    callback({ orgs, teams }); 
                } else {
                    callback({});
                }
                break;
          case 'person_identifiers':
                if (id) {
                    callback(await dataManager.getPersonIdentifiers(id));
                } else {
                    callback([]);
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
                    callback(await dataManager.searchPeople(request.query, request.organizationId));
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
          default:
              console.warn('Unknown get_data type:', type);
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
            } else if (type === 'venues') {
                const venues = await dataManager.getVenues(orgId);
                socket.emit('update', { type: 'VENUES_SYNC', data: venues }); // Add VENUES_SYNC handling in client if needed, or iterate
                // Actually client handles individual updates, but bulk sync is better for initial load
                // For now, let's reuse loop on client side in handleUpdate if we send array
                // Or just rely on get_data? No, push on join is better.
                // Client store handleUpdate handles arrays for some types.
            } else if (type === 'events') {
                const events = await dataManager.getEvents(orgId);
                socket.emit('update', { type: 'EVENTS_SYNC', data: events });
            } else if (type === 'games') {
                const games = await dataManager.getGames(orgId);
                socket.emit('update', { type: 'GAMES_SYNC', data: games });
            } else if (type === 'summary') {
                const org = await dataManager.getOrganization(orgId);
                if (org) socket.emit('update', { type: 'ORGANIZATIONS_UPDATED', data: org });
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
        } else if (room.startsWith('venue:')) {
            const venueId = room.split(':')[1];
            const venue = await dataManager.getVenue(venueId);
            if (venue) socket.emit('update', { type: 'VENUE_UPDATED', data: venue });
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
            case SocketAction.ADD_TEAM:
                result = await dataManager.addTeam(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:teams`, type: 'TEAM_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_ADDED', data: result });
                    await broadcastOrgSummaries([result.organizationId]);
                }
                break;
            case SocketAction.UPDATE_TEAM:
                result = await dataManager.updateTeam(action.payload.id, action.payload.data);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:teams`, type: 'TEAM_UPDATED', data: result });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_UPDATED', data: result });
                }
                break;
            case SocketAction.DELETE_TEAM:
                const teamToDelete = await dataManager.getTeam(action.payload.id);
                result = await dataManager.deleteTeam(action.payload.id);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:teams`, type: 'TEAM_DELETED', data: { id: result.id } });
                    additionalBroadcasts.push({ topic: `team:${result.id}`, type: 'TEAM_DELETED', data: { id: result.id } });
                    if (teamToDelete) await broadcastOrgSummaries([teamToDelete.organizationId]);
                }
                break;

            case SocketAction.REFER_ORG_CONTACT:
                const { organizationId, contactEmails, referredByUserId } = action.payload;
                result = await dataManager.referOrgContact(organizationId, contactEmails, referredByUserId);
                // No immediate broadcast needed for referrals, they are private to admin/referrer until claimed
                // But we return the created referrals to the caller
                break;

            case SocketAction.ADD_VENUE:
                result = await dataManager.addVenue(action.payload);
                if (result) {
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:venues`, type: 'VENUE_ADDED', data: result });
                    additionalBroadcasts.push({ topic: `venue:${result.id}`, type: 'VENUE_ADDED', data: result });
                    await broadcastOrgSummaries([result.organizationId]);
                }
                break;
            case SocketAction.UPDATE_VENUE:
                result = await dataManager.updateVenue(action.payload.id, action.payload.data);
                if (result) {
                    // Update Org List
                    additionalBroadcasts.push({ topic: `org:${result.organizationId}:venues`, type: 'VENUE_UPDATED', data: result });
                    // Update Venue Room
                    additionalBroadcasts.push({ topic: `venue:${result.id}`, type: 'VENUE_UPDATED', data: result });
                }
                break;
            case SocketAction.DELETE_VENUE:
                result = await dataManager.deleteVenue(action.payload.id);
                if (result) {
                     // Update Org List
                     additionalBroadcasts.push({ topic: `org:${result.organizationId}:venues`, type: 'VENUE_DELETED', data: { id: result.id } });
                     // Notify Venue Room
                     additionalBroadcasts.push({ topic: `venue:${result.id}`, type: 'VENUE_DELETED', data: { id: result.id } });
                     await broadcastOrgSummaries([result.organizationId]);
                }
                break;

            case SocketAction.ADD_GAME:
                result = await dataManager.addGame(action.payload);
                if (result) {
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
            case SocketAction.UPDATE_GAME_STATUS:
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
            case SocketAction.UPDATE_GAME_SCORE:
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
            case SocketAction.UPDATE_GAME:
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
            case SocketAction.DELETE_GAME:
                result = await dataManager.deleteGame(action.payload.id);
                if (result) {
                    additionalBroadcasts.push({ topic: `game:${result.id}`, type: 'GAME_DELETED', data: { id: result.id } });
                    additionalBroadcasts.push({ topic: `event:${result.eventId}`, type: 'GAMES_UPDATED', data: result });
                }
                break;

            case SocketAction.ADD_EVENT:
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
            case SocketAction.UPDATE_EVENT:
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
            case SocketAction.DELETE_EVENT:
                const eventToDelete = await dataManager.getEvent(action.payload.id); 
                result = await dataManager.deleteEvent(action.payload.id);
                if (result) {
                    const orgIds = [result.organizationId, ...(result.participatingOrgIds || [])];
                    orgIds.forEach(orgId => {
                        additionalBroadcasts.push({ topic: `org:${orgId}:events`, type: 'EVENT_DELETED', data: { id: result.id } });
                    });
                    await broadcastOrgSummaries([result.organizationId, ...(result.participatingOrgIds || [])]);
                }
                break;

            case SocketAction.ADD_ORG:
                result = await dataManager.addOrganization(action.payload);
                updateTopic = `organizations`;
                updateType = 'ORGANIZATIONS_UPDATED';
                break;
            case SocketAction.UPDATE_ORG:
                result = await dataManager.updateOrganization(action.payload.id, action.payload.data);
                if (result) {
                    updateTopic = `organizations`;
                    updateType = 'ORGANIZATIONS_UPDATED';
                }
                break;

            case SocketAction.ADD_TEAM_MEMBER:
                result = await dataManager.addTeamMember(action.payload);
                // Broadcast ONLY to the team room
                updateTopic = `team:${result.teamId}`;
                updateType = 'TEAM_MEMBERS_UPDATED';
                
                // ALSO Broadcast to the Org Team List (to update counts)
                // We need to fetch the team to get the orgId.
                const teamForAdd = await dataManager.getTeam(result.teamId);
                if (teamForAdd) {
                     additionalBroadcasts.push({ 
                         topic: `org:${teamForAdd.organizationId}:teams`, 
                         type: 'TEAM_UPDATED', 
                         data: { ...teamForAdd } 
                     });
                }

                const richMemberAdd = (await dataManager.getTeamMembers(result.teamId)).find((m: any) => m.membershipId === result.id);
                if (richMemberAdd) result = richMemberAdd;
                if (teamForAdd) {
                    await broadcastOrgSummaries([teamForAdd.organizationId]);
                }
                break;
            case SocketAction.UPDATE_TEAM_MEMBER:
                result = await dataManager.updateTeamMember(action.payload.id, action.payload.data);
                if (result) {
                    updateTopic = `team:${result.teamId}`;
                    updateType = 'TEAM_MEMBERS_UPDATED';
                    // Re-fetch rich member data for broadcast
                    const richMemberUpd = (await dataManager.getTeamMembers(result.teamId)).find((m: any) => m.membershipId === result.id);
                    if (richMemberUpd) result = richMemberUpd;
                }
                break;
            case SocketAction.REMOVE_TEAM_MEMBER:
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
            case SocketAction.ADD_ORG_MEMBER:
                console.log(`DataManager: Adding org member ${action.payload.personId} to ${action.payload.organizationId}`);
                result = await dataManager.addOrganizationMember(action.payload.personId, action.payload.organizationId, action.payload.roleId, action.payload.id);
                if (result) {
                    const richMember = (await dataManager.getOrganizationMembers(action.payload.organizationId)).find((m: any) => m.membershipId === result.id);
                    if (richMember) {
                        result = richMember;
                    }
                    
                    updateTopic = `org:${action.payload.organizationId}:members`;
                    updateType = 'ORG_MEMBERS_UPDATED';
                    await broadcastOrgSummaries([action.payload.organizationId]);
                }
                break;
            case SocketAction.UPDATE_ORG_MEMBER:
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
            case SocketAction.REMOVE_ORG_MEMBER:
                console.log(`DataManager: Removing org member ${action.payload.id}`);
                const orgMembership = await dataManager.getOrganizationMembership(action.payload.id);
                result = await dataManager.removeOrganizationMember(action.payload.id);
                if (orgMembership) {
                    updateTopic = `org:${orgMembership.organizationId}:members`;
                    updateType = 'ORG_MEMBERS_UPDATED';
                    await broadcastOrgSummaries([orgMembership.organizationId]);
                }
                break;
            case SocketAction.ADD_PERSON:
                result = await dataManager.addPerson(action.payload);
                break;
            case SocketAction.UPDATE_PERSON:
                console.log(`DataManager: Updating person ${action.payload.id}`, action.payload.data);
                result = await dataManager.updatePerson(action.payload.id, action.payload.data);
                break;
            case SocketAction.DELETE_PERSON:
                console.log(`DataManager: Deleting person ${action.payload.id}`);
                result = await dataManager.deletePerson(action.payload.id);
                break;
            case SocketAction.SET_PERSON_IDENTIFIER:
                result = await dataManager.setPersonIdentifier(action.payload.personId, action.payload.organizationId, action.payload.identifier);
                break;
            case SocketAction.LINK_USER_PERSON:
                result = await dataManager.linkUserToPerson(action.payload.email, action.payload.personId);
                break;
            case SocketAction.CLAIM_ORG:
                result = await dataManager.claimOrganization(action.payload.organizationId, action.payload.userId);
                 if (result) {
                    updateTopic = `organizations`;
                    updateType = 'ORGANIZATIONS_UPDATED';
                 }
                break;
            case SocketAction.CLAIM_ORG_VIA_TOKEN:
                result = await dataManager.claimOrgViaToken(action.payload.token, action.payload.userId);
                if (result) {
                    updateTopic = `organizations`;
                    updateType = 'ORGANIZATIONS_UPDATED';
                    additionalBroadcasts.push({ topic: `org:${result.id}:summary`, type: 'ORGANIZATIONS_UPDATED', data: result });
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
        console.error(`Error handling action ${action.type}:`, error);
        if (callback) callback({ status: 'error', message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
