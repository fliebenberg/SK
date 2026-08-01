import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Add jersey_number column to game_rosters...');
        await pool.query('BEGIN');
        
        await pool.query(`
            ALTER TABLE game_rosters 
            ADD COLUMN IF NOT EXISTS jersey_number TEXT DEFAULT NULL;
        `);
        console.log('Column jersey_number added/verified on game_rosters table.');

        await pool.query('COMMIT');
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
