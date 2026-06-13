import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Add image_config to org_profiles...');
        await pool.query('BEGIN');
        
        // Add image_config column to org_profiles
        await pool.query(`
            ALTER TABLE org_profiles 
            ADD COLUMN IF NOT EXISTS image_config JSONB DEFAULT NULL;
        `);
        console.log('Column image_config added/verified.');

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
