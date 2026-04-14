import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Altering game disputes admin compatibility...');
        await pool.query('BEGIN');
        
        await pool.query(`ALTER TABLE game_disputes DROP CONSTRAINT IF EXISTS game_disputes_initiator_org_profile_id_fkey`);
        await pool.query(`ALTER TABLE game_dispute_votes DROP CONSTRAINT IF EXISTS game_dispute_votes_voter_org_profile_id_fkey`);
        
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
