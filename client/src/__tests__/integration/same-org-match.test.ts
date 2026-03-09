/**
 * @jest-environment node
 */
import { io, Socket } from "socket.io-client";
import { SocketAction } from "../../../../shared/src/constants/SocketActions";

describe("Same-Org Match Creation", () => {
    let socket: Socket;
    const SERVER_URL = "http://localhost:3001";
    
    // Test Data
    const ORG_ID = `same-org-test-${Date.now()}`;
    const TEAM1_ID = `team1-${Date.now()}`;
    const TEAM2_ID = `team2-${Date.now()}`;
    const EVENT_ID = `event-${Date.now()}`;

    const createSocket = () => {
        return io(SERVER_URL, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
        });
    };

    beforeAll((done) => {
        socket = createSocket();
        socket.on("connect", () => done());
    });

    afterAll(() => {
        if (socket) socket.disconnect();
    });

    it("should allow creating a match between two teams from the same organization", (done) => {
        // 1. Create Org
        socket.emit("action", { 
            type: SocketAction.ADD_ORG, 
            payload: { id: ORG_ID, name: "Same Org Test" } 
        }, (res1: any) => {
            expect(res1.status).toBe('ok');

            // 2. Create Team 1
            socket.emit("action", {
                type: SocketAction.ADD_TEAM,
                payload: { id: TEAM1_ID, name: "Team 1", orgId: ORG_ID, sportId: "sport-soccer" }
            }, (res2: any) => {
                expect(res2.status).toBe('ok');

                // 3. Create Team 2
                socket.emit("action", {
                    type: SocketAction.ADD_TEAM,
                    payload: { id: TEAM2_ID, name: "Team 2", orgId: ORG_ID, sportId: "sport-soccer" }
                }, (res3: any) => {
                    expect(res3.status).toBe('ok');

                    // 4. Create Event
                    socket.emit("action", {
                        type: SocketAction.ADD_EVENT,
                        payload: { 
                            id: EVENT_ID, 
                            name: "Internal Tournament", 
                            orgId: ORG_ID, 
                            type: "Tournament",
                            sportIds: ["sport-soccer"]
                        }
                    }, (res4: any) => {
                        expect(res4.status).toBe('ok');

                        // 5. Create Game (Match) between Team 1 and Team 2
                        socket.emit("action", {
                            type: SocketAction.ADD_GAME,
                            payload: {
                                eventId: EVENT_ID,
                                participants: [{ teamId: TEAM1_ID }, { teamId: TEAM2_ID }],
                                startTime: new Date().toISOString()
                            }
                        }, (res5: any) => {
                            expect(res5.status).toBe('ok');
                            expect(res5.data.participants[0].teamId).toBe(TEAM1_ID);
                            expect(res5.data.participants[1].teamId).toBe(TEAM2_ID);
                            done();
                        });
                    });
                });
            });
        });
    });
});
