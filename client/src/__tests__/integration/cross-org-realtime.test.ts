/**
 * @jest-environment node
 */
import { io, Socket } from "socket.io-client";

describe("Cross-Org Real-Time Updates", () => {
    let socketListener: Socket;
    let socketActor: Socket;
    const SERVER_URL = "http://localhost:3001";
    
    // Test Data
    const ORG_LISTENER_ID = `org-test-listener-${Date.now()}`;
    const ORG_ACTOR_ID = `org-test-actor-${Date.now()}`;
    const EVENT_ID = `event-test-${Date.now()}`;

    // Helper to creates sockets
    const createSocket = () => {
        return io(SERVER_URL, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
        });
    };

    beforeAll((done) => {
        // Setup sockets
        socketListener = createSocket();
        socketActor = createSocket();

        let connectedCount = 0;
        const checkConnected = () => {
            connectedCount++;
            if (connectedCount === 2) done();
        };

        socketListener.on("connect", checkConnected);
        socketActor.on("connect", checkConnected);
    });

    afterAll(() => {
        if (socketListener) socketListener.disconnect();
        if (socketActor) socketActor.disconnect();
    });

    it("should update dashboard counts when participating in a new cross-org event", (done) => {
        // 1. Setup Listener (Dashboard)
        // Subscribe to the summary room
        socketListener.emit("join_room", `org:${ORG_LISTENER_ID}:summary`);

        // Setup the expectation: Wait for ORGANIZATIONS_UPDATED
        socketListener.on("update", (event: any) => {
            try {
                if (event.type === 'ORGANIZATIONS_UPDATED' && event.data.id === ORG_LISTENER_ID) {
                   // Verify we received the update with CORRECT data
                   expect(event.data.id).toBe(ORG_LISTENER_ID);
                   expect(event.data.eventCount).toBe(1); // Expect exactly 1 event
                   done();
                }
            } catch (error) {
                done(error);
            }
        });

        // 2. Setup Data (Actor creates entities)
        // Create Listener Org
        socketActor.emit("action", { 
            type: "ADD_ORG", 
            payload: { id: ORG_LISTENER_ID, name: "Test Listener Org" } 
        }, (res1: any) => {
            // Create Actor Org
            socketActor.emit("action", { 
                type: "ADD_ORG", 
                payload: { id: ORG_ACTOR_ID, name: "Test Actor Org" } 
            }, (res2: any) => {
                
                // 3. Trigger Cross-Org Event Creation
                const eventPayload = {
                    id: EVENT_ID,
                    name: "Integration Test Event",
                    type: "Sports Day",
                    startDate: new Date().toISOString(),
                    endDate: new Date().toISOString(),
                    organizationId: ORG_ACTOR_ID,
                    participatingOrgIds: [ORG_LISTENER_ID], // Crucial: Involves Listener
                    sportIds: [],
                    settings: {},
                    status: "Draft"
                };

                socketActor.emit("action", { type: "ADD_EVENT", payload: eventPayload });
            });
        });
    }, 10000); // 10s timeout
});
