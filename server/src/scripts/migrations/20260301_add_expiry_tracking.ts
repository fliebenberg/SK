import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Add expiry_processed to memberships...');
        await pool.query('BEGIN');
        await pool.query(`
            ALTER TABLE org_memberships 
            ADD COLUMN IF NOT EXISTS expiry_processed BOOLEAN DEFAULT false;
        `);
        // Mark existing expired ones as processed so we don't decrement them now (since they were already handled by the first migration's initialization)
        await pool.query(`
            UPDATE org_memberships SET expiry_processed = true WHERE end_date <= NOW();
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
