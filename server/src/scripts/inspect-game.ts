import pool from '../db';

async function inspectGame(gameId: string) {
    try {
        console.log(`--- Inspecting Game: ${gameId} ---`);

        // 1. Fetch Game Live State
        const gameRes = await pool.query('SELECT id, status, live_state FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) {
            console.error('Game not found.');
            process.exit(1);
        }
        console.log('\n[GAMES TABLE - live_state]');
        console.log(JSON.stringify(gameRes.rows[0].live_state, null, 2));

        // 2. Fetch Participants
        const partRes = await pool.query('SELECT id, team_id, sort_order FROM game_participants WHERE game_id = $1 ORDER BY sort_order', [gameId]);
        console.log('\n[GAME_PARTICIPANTS TABLE]');
        console.table(partRes.rows);

        // 3. Fetch Recent Events
        const eventRes = await pool.query('SELECT id, timestamp, game_participant_id, type, sub_type, event_data FROM game_events WHERE game_id = $1 ORDER BY timestamp DESC LIMIT 10', [gameId]);
        console.log('\n[GAME_EVENTS TABLE - Last 10 Events]');
        console.table(eventRes.rows.map(row => ({
            ...row,
            timestamp: new Date(row.timestamp).toLocaleTimeString(),
            event_data: JSON.stringify(row.event_data)
        })));

        process.exit(0);
    } catch (e) {
        console.error('Inspection failed:', e);
        process.exit(1);
    }
}

const targetGameId = process.argv[2] || 'game-1772995497771';
inspectGame(targetGameId);
