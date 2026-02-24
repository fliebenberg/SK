/**
 * @jest-environment node
 */
import { io, Socket } from "socket.io-client";
import { SocketAction } from "../../../../shared/src/constants/SocketActions";

describe("Organization Lifecycle (Deactivation and Deletion)", () => {
    let socket: Socket;
    const SERVER_URL = "http://localhost:3001";
    
    // Test Data
    const ORG_ID = `org-lifecycle-test-${Date.now()}`;
    const ORG_WITH_TEAM_ID = `org-with-team-${Date.now()}`;
    const TEAM_ID = `team-test-${Date.now()}`;

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

    it("should create, deactivate, and delete an empty organization", (done) => {
        // 1. Create Org
        socket.emit("action", { 
            type: SocketAction.ADD_ORG, 
            payload: { id: ORG_ID, name: "Lifecycle Test Org" } 
        }, (res1: any) => {
            expect(res1.status).toBe('ok');
            expect(res1.data.isActive).toBe(true);

            // 2. Deactivate Org
            socket.emit("action", {
                type: SocketAction.UPDATE_ORG,
                payload: { id: ORG_ID, data: { isActive: false } }
            }, (res2: any) => {
                expect(res2.status).toBe('ok');
                expect(res2.data.isActive).toBe(false);

                // 3. Delete Org
                socket.emit("action", {
                    type: SocketAction.DELETE_ORG,
                    payload: { id: ORG_ID }
                }, (res3: any) => {
                    expect(res3.status).toBe('ok');
                    done();
                });
            });
        });
    });

    it("should fail to delete an organization with linked teams", (done) => {
        // 1. Create Org
        socket.emit("action", { 
            type: SocketAction.ADD_ORG, 
            payload: { id: ORG_WITH_TEAM_ID, name: "Org With Team" } 
        }, (res1: any) => {
            expect(res1.status).toBe('ok');

            // 2. Add Team
            socket.emit("action", {
                type: SocketAction.ADD_TEAM,
                payload: { 
                    id: TEAM_ID, 
                    name: "Linked Team", 
                    organizationId: ORG_WITH_TEAM_ID,
                    sportId: "soccer", // Assuming soccer exists or is ignored
                }
            }, (res2: any) => {
                // Not strictly checking ADD_TEAM status because it might fail on sportId if not pre-seeded, 
                // but if and only if it succeeded or the org has the team linked in DB.
                // OrganizationManager.deleteOrganization checks teams table.

                // 3. Try Delete
                socket.emit("action", {
                    type: SocketAction.DELETE_ORG,
                    payload: { id: ORG_WITH_TEAM_ID }
                }, (res3: any) => {
                    expect(res3.status).toBe('error');
                    expect(res3.message).toContain("Cannot delete organization");
                    
                    // Cleanup: Ideally we should delete the team first, but we are testing failure.
                    done();
                });
            });
        });
    });
});
