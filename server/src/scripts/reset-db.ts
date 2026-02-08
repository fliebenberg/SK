import pool from '../db';

const resetDb = async () => {
    try {
        console.log('Resetting Database...');
        await pool.query('BEGIN');
        
        // Drop tables in reverse order of dependency
        const tables = [
            'games',
            'user_favorites',
            'password_reset_tokens',
            'verification_tokens',
            'sessions',
            'accounts',
            'user_emails',
            'users',
            'events',
            'organization_memberships',
            'team_memberships',
            'persons',
            'teams',
            'venues',
            'organizations',
            'sports'
        ];

        for (const table of tables) {
            await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
        }

        await pool.query('COMMIT');
        console.log('Database reset successfully.');
        process.exit(0);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error resetting database:', error);
        process.exit(1);
    }
};

resetDb();
