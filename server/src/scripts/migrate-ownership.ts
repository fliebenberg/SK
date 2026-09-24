import pool from '../db';

const migrate = async () => {
    // One client for the whole run: through the pool, BEGIN and COMMIT could land on different
    // connections, so the statements between them would not be a transaction at all (TX-1).
    const client = await pool.connect();
    try {
        console.log('Running ownership migration...');

        await client.query('BEGIN');

        // Update Organizations table
        console.log('Updating organizations table...');
        await client.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS creator_id TEXT;
        `);

        // Update Teams table
        console.log('Updating teams table...');
        await client.query(`
            ALTER TABLE teams 
            ADD COLUMN IF NOT EXISTS creator_id TEXT;
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
