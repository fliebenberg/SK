import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:3002";

async function test() {
    console.log("Connecting to socket...");
    const socket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: false
    });

    socket.on('connect', () => {
        console.log("Connected directly to socket server.");
        
        // Test 1: Subscribe to organizations -> Expect NO ORGANIZATIONS_SYNC (New behavior)
        console.log("Emitting subscribe 'organizations'...");
        socket.emit('subscribe', 'organizations');

        // Test 2: Request live games -> Expect callback with games
        console.log("Emitting get_live_games...");
        socket.emit('get_live_games', {}, (games: any[]) => {
            console.log(`Received ${games.length} live games via callback.`);
            if (Array.isArray(games)) {
                console.log("SUCCESS: Received games array.");
            } else {
                console.log("FAILURE: Did not receive games array.");
            }
             // Allow some time for unexpected sync events to arrive
             setTimeout(() => {
                 console.log("Finished waiting for unexpected events.");
                 process.exit(0);
             }, 2000);
        });
    });

    socket.on('update', (event: any) => {
        console.log(`Received update: ${event.type}`);
        if (event.type === 'ORGANIZATIONS_SYNC') {
            console.log("FAILURE: Received unexpected ORGANIZATIONS_SYNC!");
        } else if (event.type === 'GAMES_SYNC') {
            console.log("FAILURE: Received unexpected GAMES_SYNC!");
        }
    });

    socket.on('connect_error', (err) => {
        console.error("Connection error:", err);
        process.exit(1);
    });

    // Timeout
    setTimeout(() => {
        console.log("Timeout waiting for events.");
        process.exit(1);
    }, 5000);
}

test();
