
import { query } from './db';

async function migrate() {
    try {
        console.log('Running migration: ADD COLUMN update_data TO game_disputes');
        await query('ALTER TABLE game_disputes ADD COLUMN IF NOT EXISTS update_data JSONB;');
        console.log('Migration successful');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
