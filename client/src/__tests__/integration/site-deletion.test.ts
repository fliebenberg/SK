/**
 * @jest-environment node
 */
import { io, Socket } from "socket.io-client";
import { SocketAction } from "../../../../shared/src/constants/SocketActions";
import { TestHelper } from "./TestHelper";
import { APP_TEST_ORG_ID } from "../../../../shared/src/constants/TestConstants";

jest.setTimeout(30000); // Increased timeout to 30s

describe("Site Deletion and Dependency Checks", () => {
    let socket: Socket;
    const SERVER_URL = "http://localhost:3001";
    
    const ORG_ID = APP_TEST_ORG_ID;
    const SITE_ID = `site-del-test-${Date.now()}`;
    const FACILITY_ID = `facility-del-test-${Date.now()}`;
    const EVENT_ID = `event-del-test-${Date.now()}`;
    const GAME_ID = `game-del-test-${Date.now()}`;

    const createSocket = () => {
        return io(SERVER_URL, {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
        });
    };

    beforeAll(async () => {
        socket = createSocket();
        await new Promise((resolve, reject) => {
            socket.on("connect", () => {
                console.log("Test socket connected");
                resolve(null);
            });
            socket.on("connect_error", (err) => {
                console.error("Socket connect error:", err);
                reject(err);
            });
        });

        // Setup Org
        const res = await TestHelper.emitAsync(socket, "action", { 
            type: SocketAction.ADD_ORG, 
            payload: { id: ORG_ID, name: "Site Deletion Test Org" } 
        });
        if (res.status === 'error' && !res.message.includes('already exists')) {
            console.error("Error creating org:", res.message);
        }
    });

    afterAll(async () => {
        if (socket && socket.connected) {
            // Cleanup any leftovers from failed tests
            // We use the same IDs for most things, but some sites are dynamically named
            // Specifically SITE_ID-cascade, SITE_ID-event, SITE_ID-game, SITE_ID-fac-game
            const sitesToDelete = [SITE_ID, `${SITE_ID}-cascade`, `${SITE_ID}-event`, `${SITE_ID}-game`, `${SITE_ID}-fac-game`];
            for (const id of sitesToDelete) {
                await TestHelper.emitAsync(socket, "action", { type: SocketAction.DELETE_SITE, payload: { id } });
            }
            socket.disconnect();
        }
    });

    it("should successfully delete a clean site", (done) => {
        socket.emit("action", { 
            type: SocketAction.ADD_SITE, 
            payload: { id: SITE_ID, name: "Test Site Clean", orgId: ORG_ID } 
        }, (res1: any) => {
            try {
                expect(res1.status).toBe('ok');
                socket.emit("action", {
                    type: SocketAction.DELETE_SITE,
                    payload: { id: SITE_ID }
                }, (res2: any) => {
                    try {
                        expect(res2.status).toBe('ok');
                        done();
                    } catch (e) { done(e); }
                });
            } catch (e) { done(e); }
        });
    });

    it("should delete a site and its facilities", (done) => {
        const siteId = `${SITE_ID}-cascade`;
        socket.emit("action", { 
            type: SocketAction.ADD_SITE, 
            payload: { id: siteId, name: "Test Site Cascade", orgId: ORG_ID } 
        }, (res1: any) => {
            try {
                expect(res1.status).toBe('ok');
                socket.emit("action", {
                    type: SocketAction.ADD_FACILITY,
                    payload: { id: FACILITY_ID, name: "Test Facility", siteId: siteId }
                }, (res2: any) => {
                    try {
                        expect(res2.status).toBe('ok');
                        socket.emit("action", {
                            type: SocketAction.DELETE_SITE,
                            payload: { id: siteId }
                        }, (res3: any) => {
                            try {
                                expect(res3.status).toBe('ok');
                                socket.emit("action", {
                                    type: SocketAction.UPDATE_FACILITY,
                                    payload: { id: FACILITY_ID, data: { name: 'Broken' } }
                                }, (res4: any) => {
                                    try {
                                        // The server returns status: 'ok' with data: null when an entity is not found during update
                                        expect(res4.status).toBe('ok');
                                        expect(res4.data).toBeNull();
                                        done();
                                    } catch (e) { done(e); }
                                });
                            } catch (e) { done(e); }
                        });
                    } catch (e) { done(e); }
                });
            } catch (e) { done(e); }
        });
    });

    it("should prevent deleting a site linked to an event", (done) => {
        const siteId = `${SITE_ID}-event`;
        socket.emit("action", { 
            type: SocketAction.ADD_SITE, 
            payload: { id: siteId, name: "Test Site Event Link", orgId: ORG_ID } 
        }, (res1: any) => {
            try {
                expect(res1.status).toBe('ok');
                socket.emit("action", {
                    type: SocketAction.ADD_EVENT,
                    payload: { 
                        id: EVENT_ID, 
                        name: "Test Event", 
                        siteId: siteId, 
                        orgId: ORG_ID,
                        type: 'tournament',
                        startDate: new Date().toISOString(),
                        endDate: new Date().toISOString(),
                        status: 'Scheduled',
                        sportIds: [],
                        participatingOrgIds: [],
                        settings: {}
                    }
                }, (res2: any) => {
                    try {
                        if (res2.status === 'error') console.error("ADD_EVENT error:", res2.message);
                        expect(res2.status).toBe('ok');
                        socket.emit("action", {
                            type: SocketAction.DELETE_SITE,
                            payload: { id: siteId }
                        }, (res3: any) => {
                            try {
                                expect(res3.status).toBe('error');
                                expect(res3.message).toContain('linked to 1 events');
                                
                                // Cleanup
                                socket.emit("action", { type: SocketAction.DELETE_EVENT, payload: { id: EVENT_ID } }, () => {
                                    socket.emit("action", { type: SocketAction.DELETE_SITE, payload: { id: siteId } }, () => done());
                                });
                            } catch (e) { done(e); }
                        });
                    } catch (e) { done(e); }
                });
            } catch (e) { done(e); }
        });
    });

    it("should prevent deleting a site linked to a game", (done) => {
        const siteId = `${SITE_ID}-game`;
        socket.emit("action", { 
            type: SocketAction.ADD_SITE, 
            payload: { id: siteId, name: "Test Site Game Link", orgId: ORG_ID } 
        }, (res1: any) => {
            try {
                expect(res1.status).toBe('ok');
                const eventId = `${EVENT_ID}-game`;
                socket.emit("action", {
                    type: SocketAction.ADD_EVENT,
                    payload: { 
                        id: eventId, 
                        name: "Test Event for Game", 
                        orgId: ORG_ID,
                        type: 'tournament',
                        startDate: new Date().toISOString(),
                        endDate: new Date().toISOString(),
                        status: 'Scheduled',
                        sportIds: [],
                        participatingOrgIds: [],
                        settings: {}
                    }
                }, (res2: any) => {
                    try {
                        expect(res2.status).toBe('ok');
                        socket.emit("action", {
                            type: SocketAction.ADD_GAME,
                            payload: {
                                id: GAME_ID,
                                eventId: eventId,
                                siteId: siteId,
                                startTime: new Date().toISOString(),
                                participants: []
                            }
                        }, (res3: any) => {
                            try {
                                if (res3.status === 'error') console.error("ADD_GAME error:", res3.message);
                                expect(res3.status).toBe('ok');
                                socket.emit("action", {
                                    type: SocketAction.DELETE_SITE,
                                    payload: { id: siteId }
                                }, (res4: any) => {
                                    try {
                                        expect(res4.status).toBe('error');
                                        expect(res4.message).toContain('linked to 1 games');
                                        
                                        // Cleanup
                                        socket.emit("action", { type: SocketAction.DELETE_GAME, payload: { id: GAME_ID } }, () => {
                                            socket.emit("action", { type: SocketAction.DELETE_EVENT, payload: { id: eventId } }, () => {
                                                socket.emit("action", { type: SocketAction.DELETE_SITE, payload: { id: siteId } }, () => done());
                                            });
                                        });
                                    } catch (e) { done(e); }
                                });
                            } catch (e) { done(e); }
                        });
                    } catch (e) { done(e); }
                });
            } catch (e) { done(e); }
        });
    });

    it("should prevent deleting a site if its facility is linked to a game", (done) => {
        const siteId = `${SITE_ID}-fac-game`;
        socket.emit("action", { 
            type: SocketAction.ADD_SITE, 
            payload: { id: siteId, name: "Test Site Fac Game Link", orgId: ORG_ID } 
        }, (res1: any) => {
            try {
                expect(res1.status).toBe('ok');
                const facId = `${FACILITY_ID}-fac-game`;
                socket.emit("action", {
                    type: SocketAction.ADD_FACILITY,
                    payload: { id: facId, name: "Linked Fac", siteId: siteId }
                }, (res2: any) => {
                    try {
                        expect(res2.status).toBe('ok');
                        const eventId = `${EVENT_ID}-fac-game`;
                        socket.emit("action", {
                            type: SocketAction.ADD_EVENT,
                            payload: { 
                                id: eventId, 
                                name: "Test Event Fac Game", 
                                orgId: ORG_ID,
                                type: 'tournament',
                                startDate: new Date().toISOString(),
                                endDate: new Date().toISOString(),
                                status: 'Scheduled',
                                sportIds: [],
                                participatingOrgIds: [],
                                settings: {}
                            }
                        }, (res3: any) => {
                            try {
                                expect(res3.status).toBe('ok');
                                const gameId = `${GAME_ID}-fac-game`;
                                socket.emit("action", {
                                    type: SocketAction.ADD_GAME,
                                    payload: {
                                        id: gameId,
                                        eventId: eventId,
                                        facilityId: facId,
                                        startTime: new Date().toISOString(),
                                        participants: []
                                    }
                                }, (res4: any) => {
                                    try {
                                        expect(res4.status).toBe('ok');
                                        socket.emit("action", {
                                            type: SocketAction.DELETE_SITE,
                                            payload: { id: siteId }
                                        }, (res5: any) => {
                                            try {
                                                expect(res5.status).toBe('error');
                                                expect(res5.message).toContain('linked to 1 games (linked via facilities)');
                                                
                                                // Cleanup
                                                socket.emit("action", { type: SocketAction.DELETE_GAME, payload: { id: gameId } }, () => {
                                                    socket.emit("action", { type: SocketAction.DELETE_EVENT, payload: { id: eventId } }, () => {
                                                        socket.emit("action", { type: SocketAction.DELETE_SITE, payload: { id: siteId } }, () => done());
                                                    });
                                                });
                                            } catch (e) { done(e); }
                                        });
                                    } catch (e) { done(e); }
                                });
                            } catch (e) { done(e); }
                        });
                    } catch (e) { done(e); }
                });
            } catch (e) { done(e); }
        });
    });
});
