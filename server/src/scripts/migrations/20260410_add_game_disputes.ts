import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Add game disputes and votes...');
        await pool.query('BEGIN');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_disputes (
                id VARCHAR(255) PRIMARY KEY,
                game_id VARCHAR(255) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                game_event_id VARCHAR(255) NOT NULL REFERENCES game_events(id) ON DELETE CASCADE,
                initiator_org_profile_id VARCHAR(255) NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
                status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                resolved_at TIMESTAMP WITH TIME ZONE
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_dispute_votes (
                id VARCHAR(255) PRIMARY KEY,
                dispute_id VARCHAR(255) NOT NULL REFERENCES game_disputes(id) ON DELETE CASCADE,
                voter_org_profile_id VARCHAR(255) NOT NULL REFERENCES org_profiles(id) ON DELETE CASCADE,
                vote VARCHAR(50) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(dispute_id, voter_org_profile_id)
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
