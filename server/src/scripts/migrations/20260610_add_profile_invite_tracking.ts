import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Add last_invite_sent_at to org_profiles and seed invite_cooldown_hours...');
        await pool.query('BEGIN');
        
        // Add last_invite_sent_at column to org_profiles
        await pool.query(`
            ALTER TABLE org_profiles 
            ADD COLUMN IF NOT EXISTS last_invite_sent_at TIMESTAMP WITH TIME ZONE;
        `);
        console.log('Column last_invite_sent_at added/verified.');

        // Insert system setting if not present
        await pool.query(`
            INSERT INTO system_settings (key, value)
            VALUES ('invite_cooldown_hours', '168')
            ON CONFLICT (key) DO NOTHING;
        `);
        console.log('System setting invite_cooldown_hours seeded/verified.');

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
