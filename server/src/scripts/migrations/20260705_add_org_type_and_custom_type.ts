import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Add type and custom_type columns to organizations...');
        await pool.query('BEGIN');
        
        // Add type column to organizations
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'OTHER';
        `);
        console.log('Column type added/verified.');

        // Add custom_type column to organizations
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS custom_type TEXT DEFAULT NULL;
        `);
        console.log('Column custom_type added/verified.');

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
