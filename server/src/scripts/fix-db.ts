import pool from '../db';

const fixDb = async () => {
    // One client for the whole run: through the pool, BEGIN and COMMIT could land on different
    // connections, so the statements between them would not be a transaction at all (TX-1).
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('ALTER TABLE games ADD COLUMN IF NOT EXISTS final_score_data JSONB;');
        await client.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS custom_settings JSONB DEFAULT '{}'::jsonb;`);
        await client.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS live_state JSONB DEFAULT '{}'::jsonb;`);

        await client.query('ALTER TABLE sports ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES sport_categories(id);');
        await client.query('ALTER TABLE sports ADD COLUMN IF NOT EXISTS participant_type TEXT;');
        await client.query('ALTER TABLE sports ADD COLUMN IF NOT EXISTS match_topology TEXT;');
        await client.query(`ALTER TABLE sports ADD COLUMN IF NOT EXISTS default_settings JSONB DEFAULT '{}'::jsonb;`);

        await client.query('COMMIT');
        console.log('Database schema fixed.');
        process.exit(0);
    } catch(e) {
        await client.query('ROLLBACK');
        console.error(e);
        process.exit(1);
    }
};
fixDb();
