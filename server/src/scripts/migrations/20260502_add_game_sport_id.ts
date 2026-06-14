import pool from '../../db';

async function migrate() {
    try {
        console.log('Running migration: Add sport_id to games...');
        await pool.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS sport_id TEXT;');
        
        console.log('Populating sport_id from associated events...');
        const colCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'events' AND column_name = 'sport_ids'
        `);

        if (colCheck.rows.length > 0) {
            console.log('Using events.sport_ids array...');
            await pool.query(`
                UPDATE games g
                SET sport_id = e.sport_ids[1]
                FROM events e
                WHERE g.event_id = e.id
                AND g.sport_id IS NULL;
            `);
        } else {
            console.log('Using event_sports join table...');
            await pool.query(`
                UPDATE games g
                SET sport_id = (
                    SELECT sport_id 
                    FROM event_sports es 
                    WHERE es.event_id = g.event_id 
                    LIMIT 1
                )
                WHERE g.sport_id IS NULL;
            `);
        }

        // Final check for those without an event or where event had no sport_ids
        console.log('Populating missing sport_ids from team sports...');
        await pool.query(`
            UPDATE games g
            SET sport_id = t.sport_id
            FROM game_participants gp
            JOIN teams t ON gp.team_id = t.id
            WHERE g.id = gp.game_id
            AND g.sport_id IS NULL;
        `);
        
        console.log('Migration successful.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
