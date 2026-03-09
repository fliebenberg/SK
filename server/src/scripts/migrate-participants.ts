import pool from '../db';
import { v4 as uuidv4 } from 'uuid';

const migrateParticipants = async () => {
    try {
        await pool.query('BEGIN');
        
        console.log('Migrating home_team_id to game_participants...');
        await pool.query(`
            INSERT INTO game_participants (id, game_id, team_id, status)
            SELECT md5(random()::text || clock_timestamp()::text)::uuid::text, id, home_team_id, 'active' 
            FROM games 
            WHERE home_team_id IS NOT NULL;
        `);

        console.log('Migrating away_team_id to game_participants...');
        await pool.query(`
            INSERT INTO game_participants (id, game_id, team_id, status)
            SELECT md5(random()::text || clock_timestamp()::text)::uuid::text, id, away_team_id, 'active' 
            FROM games 
            WHERE away_team_id IS NOT NULL;
        `);

        console.log('Dropping legacy columns from games...');
        await pool.query(`
            ALTER TABLE games 
            DROP COLUMN IF EXISTS home_team_id,
            DROP COLUMN IF EXISTS away_team_id,
            DROP COLUMN IF EXISTS away_team_name,
            DROP COLUMN IF EXISTS home_score,
            DROP COLUMN IF EXISTS away_score;
        `);

        await pool.query('COMMIT');
        console.log('Migration complete. Legacy columns dropped and game_participants populated.');
        process.exit(0);
    } catch(e) {
        await pool.query('ROLLBACK');
        console.error('Migration failed:', e);
        process.exit(1);
    }
};

migrateParticipants();
