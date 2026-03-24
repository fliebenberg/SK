import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Running migration to add sort_order to game_participants table...');
        await pool.query(`
            ALTER TABLE game_participants 
            ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
        `);
        console.log('Migration successful.');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed:', e);
        process.exit(1);
    }
};

migrate();
