import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Rename invite_cooldown_hours to org_admin_invite_cooldown_hours...');
        await pool.query('BEGIN');
        
        // Update key if it exists
        await pool.query(`
            UPDATE system_settings 
            SET key = 'org_admin_invite_cooldown_hours' 
            WHERE key = 'invite_cooldown_hours';
        `);
        console.log('Renamed setting key if it existed.');

        // Insert default setting in case it doesn't exist (336 hours = 14 days / 2 weeks)
        await pool.query(`
            INSERT INTO system_settings (key, value)
            VALUES ('org_admin_invite_cooldown_hours', '336')
            ON CONFLICT (key) DO UPDATE SET value = '336';
        `);
        console.log('Ensured org_admin_invite_cooldown_hours is seeded and set to 336.');

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
