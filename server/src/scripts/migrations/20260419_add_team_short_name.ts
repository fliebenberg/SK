import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Running migration to add short_name to teams table...');
        await pool.query(`
            ALTER TABLE teams 
            ADD COLUMN IF NOT EXISTS short_name TEXT;
        `);
        console.log('Migration successful.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
};

migrate();
