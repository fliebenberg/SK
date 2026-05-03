import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Fix game_disputes columns...');
        await pool.query('BEGIN');
        
        // Add missing columns
        await pool.query(`
            ALTER TABLE game_disputes 
            ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'UNDO',
            ADD COLUMN IF NOT EXISTS update_data JSONB,
            ADD COLUMN IF NOT EXISTS dispute_config JSONB;
        `);

        // Handle initiator column mismatch
        // The code currently alternates between initiator_id and initiator_org_profile_id
        await pool.query(`
            ALTER TABLE game_disputes 
            ADD COLUMN IF NOT EXISTS initiator_id VARCHAR(255);
        `);
        
        // Sync any existing data if possible
        await pool.query(`
            UPDATE game_disputes SET initiator_id = initiator_org_profile_id WHERE initiator_id IS NULL;
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
