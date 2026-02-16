import pool from '../db';

const migrate = async () => {
    try {
        console.log('Running ownership migration...');

        await pool.query('BEGIN');

        // Update Organizations table
        console.log('Updating organizations table...');
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS creator_id TEXT;
        `);

        // Update Teams table
        console.log('Updating teams table...');
        await pool.query(`
            ALTER TABLE teams 
            ADD COLUMN IF NOT EXISTS creator_id TEXT;
        `);

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
