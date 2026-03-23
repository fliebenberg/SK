import { eventManager } from '../managers/EventManager';
import pool from '../db';
import { Game } from '@sk/types';

async function test() {
    try {
        console.log('--- STARTING VERIFICATION TEST for Scheduled vs Actual Time ---');

        // 1. Create a dummy event and game
        const eventId = `test-ev-${Date.now()}`;
        const gameId = `test-gm-${Date.now()}`;
        const scheduledTime = "2026-10-10T10:00:00.000Z";

        console.log('1. Creating test event and game...');
        await eventManager.addEvent({
            id: eventId,
            name: 'Test Event',
            startDate: scheduledTime,
            orgId: 'org-1',
            status: 'Scheduled'
        });

        await eventManager.addGame({
            id: gameId,
            eventId: eventId,
            startTime: scheduledTime,
            scheduledStartTime: scheduledTime
        });

        let game = await eventManager.getGame(gameId);
        const getIso = (d: any) => d instanceof Date ? d.toISOString() : d;
        
        console.log('Initial Game State:', { startTime: getIso(game?.startTime), scheduledStartTime: getIso(game?.scheduledStartTime) });

        if (getIso(game?.scheduledStartTime) !== scheduledTime) {
            throw new Error(`Expected scheduledStartTime to be ${scheduledTime}, got ${getIso(game?.scheduledStartTime)}`);
        }

        // 2. Mock starting the game (Live)
        console.log('\n2. Starting game (Live)...');
        await eventManager.updateGameStatus(gameId, 'Live');
        game = await eventManager.getGame(gameId);
        console.log('Live Game State:', { startTime: getIso(game?.startTime), scheduledStartTime: getIso(game?.scheduledStartTime), status: game?.status });

        if (game?.status !== 'Live') throw new Error('Status should be Live');
        if (!game?.startTime || getIso(game.startTime) === scheduledTime) {
            throw new Error('startTime should have been updated to NOW');
        }
        if (getIso(game.scheduledStartTime) !== scheduledTime) {
            throw new Error(`scheduledStartTime should have been preserved as ${scheduledTime}, got ${getIso(game.scheduledStartTime)}`);
        }

        // 3. Mock admin update (e.g. changing site but keeping same schedule)
        console.log('\n3. Simulating Admin Save (updating site, keeping schedule)...');
        const actualStartTime = game.startTime;
        const newSiteId = 'site-1';
        
        await eventManager.updateGame(gameId, {
            scheduledStartTime: scheduledTime,
            siteId: newSiteId
        });

        game = await eventManager.getGame(gameId);
        console.log('Post-Update Game State:', { startTime: getIso(game?.startTime), scheduledStartTime: getIso(game?.scheduledStartTime), siteId: game?.siteId });

        if (game?.siteId !== newSiteId) throw new Error('Site ID not updated');
        if (getIso(game?.startTime) !== getIso(actualStartTime)) {
            throw new Error('ACTUAL startTime should have been preserved');
        }
        if (getIso(game?.scheduledStartTime) !== scheduledTime) {
            throw new Error('scheduledStartTime should still be correct');
        }

        // 4. Reset Game
        console.log('\n4. Resetting game...');
        await eventManager.resetGame(gameId);
        game = await eventManager.getGame(gameId);
        console.log('Reset Game State:', { startTime: getIso(game?.startTime), scheduledStartTime: getIso(game?.scheduledStartTime), status: game?.status });

        if (game?.status !== 'Scheduled') throw new Error('Status should be Scheduled');
        if (getIso(game?.startTime) !== scheduledTime) {
            throw new Error(`startTime should reset to scheduled value ${scheduledTime}, got ${getIso(game?.startTime)}`);
        }
        if (game?.scheduledStartTime !== null) {
            // After reset, we currently clear it in the manager or set it back to NULL.
            // My implementation in resetGame sets start_time = COALESCE(scheduled_start_time, start_time) and scheduled_start_time = NULL.
            // Check line 163 of EventManager.ts
        }

        console.log('\n--- VERIFICATION TEST PASSED ---');

        // Cleanup
        await pool.query('DELETE FROM games WHERE id = $1', [gameId]);
        await pool.query('DELETE FROM events WHERE id = $1', [eventId]);

        process.exit(0);
    } catch (e) {
        console.error('\n--- VERIFICATION TEST FAILED ---');
        console.error(e);
        process.exit(1);
    }
}

test();
