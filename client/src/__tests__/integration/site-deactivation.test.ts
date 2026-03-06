/**
 * @jest-environment node
 */
import { io, Socket } from "socket.io-client";
import { SocketAction } from "../../../../shared/src/constants/SocketActions";

describe("Site and Facility Deactivation", () => {
    let socket: Socket;
    const SERVER_URL = "http://localhost:3001";
    
    // Test Data
    const ORG_ID = `org-site-test-${Date.now()}`;
    const SITE_ID = `site-test-${Date.now()}`;
    const FACILITY_ID = `facility-test-${Date.now()}`;

    const createSocket = () => {
        return io(SERVER_URL, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
        });
    };

    beforeAll((done) => {
        socket = createSocket();
        socket.on("connect", () => {
            // Setup Org
            socket.emit("action", { 
                type: SocketAction.ADD_ORG, 
                payload: { id: ORG_ID, name: "Site Test Org" } 
            }, () => done());
        });
    });

    afterAll((done) => {
        // Cleanup Org (which cascades or we just delete it)
        socket.emit("action", {
            type: SocketAction.DELETE_ORG,
            payload: { id: ORG_ID }
        }, () => {
            if (socket) socket.disconnect();
            done();
        });
    });

    it("should create a site, deactivate it, and verify isActive flag", (done) => {
        // 1. Create Site
        socket.emit("action", { 
            type: SocketAction.ADD_SITE, 
            payload: { id: SITE_ID, name: "Test Site Active", orgId: ORG_ID } 
        }, (res1: any) => {
            expect(res1.status).toBe('ok');
            expect(res1.data.isActive).toBe(true);

            // 2. Deactivate Site
            socket.emit("action", {
                type: SocketAction.UPDATE_SITE,
                payload: { id: SITE_ID, data: { isActive: false } }
            }, (res2: any) => {
                expect(res2.status).toBe('ok');
                expect(res2.data.isActive).toBe(false);
                done();
            });
        });
    });

    it("should create a facility, deactivate it, and verify isActive flag", (done) => {
        // 1. Create Facility
        socket.emit("action", { 
            type: SocketAction.ADD_FACILITY, 
            payload: { id: FACILITY_ID, name: "Test Facility Active", siteId: SITE_ID } 
        }, (res1: any) => {
            expect(res1.status).toBe('ok');
            expect(res1.data.isActive).toBe(true);

            // 2. Deactivate Facility
            socket.emit("action", {
                type: SocketAction.UPDATE_FACILITY,
                payload: { id: FACILITY_ID, data: { isActive: false } }
            }, (res2: any) => {
                expect(res2.status).toBe('ok');
                expect(res2.data.isActive).toBe(false);
                done();
            });
        });
    });
});
