import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Add logo column to leagues and seasons...');
        await pool.query('BEGIN');
        
        // Add logo column to leagues
        await pool.query(`
            ALTER TABLE leagues 
            ADD COLUMN IF NOT EXISTS logo TEXT DEFAULT NULL;
        `);
        console.log('Column logo added/verified to leagues.');

        // Add logo column to seasons
        await pool.query(`
            ALTER TABLE seasons 
            ADD COLUMN IF NOT EXISTS logo TEXT DEFAULT NULL;
        `);
        console.log('Column logo added/verified to seasons.');

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
