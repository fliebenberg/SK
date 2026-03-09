import pool from '../db';

const fixDb = async () => {
    try {
        await pool.query('BEGIN');
        await pool.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS final_score_data JSONB;');
        await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS custom_settings JSONB DEFAULT '{}'::jsonb;`);
        await pool.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS live_state JSONB DEFAULT '{}'::jsonb;`);

        await pool.query('ALTER TABLE sports ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES sport_categories(id);');
        await pool.query('ALTER TABLE sports ADD COLUMN IF NOT EXISTS participant_type TEXT;');
        await pool.query('ALTER TABLE sports ADD COLUMN IF NOT EXISTS match_topology TEXT;');
        await pool.query(`ALTER TABLE sports ADD COLUMN IF NOT EXISTS default_settings JSONB DEFAULT '{}'::jsonb;`);

        await pool.query('COMMIT');
        console.log('Database schema fixed.');
        process.exit(0);
    } catch(e) {
        await pool.query('ROLLBACK');
        console.error(e);
        process.exit(1);
    }
};
fixDb();
