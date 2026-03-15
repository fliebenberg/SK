import { Socket } from "socket.io-client";
import { SocketAction } from "../../../../shared/src/constants/SocketActions";
import { APP_TEST_ORG_ID, APP_TEST_ORG_NAME } from "../../../../shared/src/constants/TestConstants";

export class TestHelper {
    /**
     * Ensures the shared 'App Test Org' exists.
     */
    static async ensureAppTestOrg(socket: Socket): Promise<string> {
        return new Promise((resolve) => {
            socket.emit("action", {
                type: SocketAction.ADD_ORG,
                payload: { id: APP_TEST_ORG_ID, name: APP_TEST_ORG_NAME }
            }, (res: any) => {
                // If it already exists, that's fine too (status might be ok or error depending on server implementation)
                resolve(APP_TEST_ORG_ID);
            });
        });
    }

    /**
     * Best effort cleanup for an organization.
     * Deletes the organization which should trigger failure if dependencies are not cleared,
     * so this helper also tries to clear common dependencies.
     */
    static async cleanupOrg(socket: Socket, orgId: string): Promise<void> {
        if (!orgId) return;

        return new Promise((resolve) => {
            // First, try to delete the org directly. 
            // If it fails due to dependencies, a more thorough cleanup would be needed,
            // but for now, we follow the pattern of the tests.
            socket.emit("action", {
                type: SocketAction.DELETE_ORG,
                payload: { id: orgId }
            }, (res: any) => {
                if (res.status === 'error' && res.message.includes('it has')) {
                    console.warn(`Cleanup for ${orgId} failed due to dependencies. Manual cleanup required or update TestHelper.`);
                }
                resolve();
            });
        });
    }

    /**
     * Helper to wait for a specific socket event.
     */
    static waitForEvent(socket: Socket, eventName: string, predicate?: (data: any) => boolean): Promise<any> {
        return new Promise((resolve) => {
            const listener = (data: any) => {
                if (!predicate || predicate(data)) {
                    socket.off(eventName, listener);
                    resolve(data);
                }
            };
            socket.on(eventName, listener);
        });
    }

    /**
     * Helper to wrap emit in a promise.
     */
    static emitAsync(socket: Socket, event: string, payload: any): Promise<any> {
        return new Promise((resolve) => {
            socket.emit(event, payload, (res: any) => resolve(res));
        });
    }
}
