import pool from '../db';

const gameId = 'game-1772995497771';

async function fixGameData() {
    try {
        console.log(`Fixing data for game: ${gameId}...`);
        
        // 1. Fetch current game
        const res = await pool.query('SELECT custom_settings FROM games WHERE id = $1', [gameId]);
        if (res.rows.length === 0) {
            console.error('Game not found.');
            return;
        }

        const customSettings = res.rows[0].custom_settings || {};
        if (customSettings.positions) {
            console.log(`Found ${customSettings.positions.length} positions. Filtering...`);
            // Remove positions 16-23
            const filteredPositions = customSettings.positions.filter((p: any) => {
                const isLegacyId = /^(1[6-9]|2[0-3])$/.test(p.id);
                // In some cases they might just be named "Reserve"
                const isReserveName = p.name?.toLowerCase() === "reserve";
                return !(isLegacyId && isReserveName);
            });
            
            if (filteredPositions.length !== customSettings.positions.length) {
                console.log(`Updating positions count from ${customSettings.positions.length} to ${filteredPositions.length}`);
                customSettings.positions = filteredPositions;
                await pool.query('UPDATE games SET custom_settings = $1 WHERE id = $2', [JSON.stringify(customSettings), gameId]);
                console.log('Database updated successfully.');
            } else {
                console.log('No legacy positions found in customSettings.');
            }
        } else {
            console.log('No custom positions found for this game.');
        }

        console.log('Cleanup complete.');
        process.exit(0);
    } catch (error) {
        console.error('Error fixing game data:', error);
        process.exit(1);
    }
}

fixGameData();
