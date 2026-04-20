import { Pool } from 'pg';
require('dotenv').config({ path: '../.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    try {
        await pool.query(`
            UPDATE game_events 
            SET event_data = jsonb_set(
                jsonb_set(COALESCE(event_data, '{}'::jsonb), '{successful}', 'true'::jsonb), 
                '{pointsDelta}', '2'::jsonb
            ) 
            WHERE id = 'fake'
        `);
        console.log('SUCCESS');
    } catch (e) {
        console.error('SQL ERROR:', e);
    } finally {
        await pool.end();
    }
}

run();