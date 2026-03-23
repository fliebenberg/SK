import pool from '../../db';

async function migrate() {
    try {
        console.log('Running migration: Add scheduled_start_time to games...');
        await pool.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMPTZ;');
        console.log('Migration successful.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
}

migrate();
