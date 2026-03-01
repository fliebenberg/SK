import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Add Denormalized Counts to Organizations...');

        await pool.query('BEGIN');

        // 1. Add columns if they don't exist
        await pool.query(`
            ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS team_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS site_count INTEGER DEFAULT 0;
        `);

        // 2. Initialize team_count
        console.log('Initializing team_count...');
        await pool.query(`
            UPDATE organizations o
            SET team_count = (
                SELECT COUNT(*) 
                FROM teams t 
                WHERE t.org_id = o.id AND t.is_active = true
            );
        `);

        // 3. Initialize member_count
        console.log('Initializing member_count...');
        await pool.query(`
            UPDATE organizations o
            SET member_count = (
                SELECT COUNT(*) 
                FROM org_memberships m
                WHERE m.org_id = o.id 
                AND (m.end_date IS NULL OR m.end_date > NOW())
            );
        `);

        // 4. Initialize site_count
        console.log('Initializing site_count...');
        await pool.query(`
            UPDATE organizations o
            SET site_count = (
                SELECT COUNT(*) 
                FROM sites s
                WHERE s.org_id = o.id
            );
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
