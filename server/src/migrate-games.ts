import pool from './db';

const migrate = async () => {
    try {
        console.log('Running migration to add columns to games table...');
        await pool.query(`
            ALTER TABLE games 
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS finish_time TIMESTAMPTZ;
        `);
        console.log('Migration successful.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
};

migrate();
