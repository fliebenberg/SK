import pool from '../db';

const createTables = async () => {
    try {
        console.log('Initializing Database...');

        await pool.query('BEGIN');

        // Sports Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sports (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );
        `);

        // Organizations Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS organizations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                logo TEXT,
                primary_color TEXT,
                secondary_color TEXT,
                supported_sport_ids TEXT[],
                short_name TEXT,
                supported_role_ids TEXT[]
            );
        `);

        // Venues Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS venues (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                organization_id TEXT REFERENCES organizations(id)
            );
        `);

        // Teams Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                age_group TEXT,
                sport_id TEXT REFERENCES sports(id),
                organization_id TEXT REFERENCES organizations(id),
                is_active BOOLEAN DEFAULT true
            );
        `);

        // Persons Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS persons (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );
        `);

        // Team Memberships
        await pool.query(`
            CREATE TABLE IF NOT EXISTS team_memberships (
                id TEXT PRIMARY KEY,
                person_id TEXT REFERENCES persons(id),
                team_id TEXT REFERENCES teams(id),
                role_id TEXT,
                start_date TIMESTAMPTZ,
                end_date TIMESTAMPTZ
            );
        `);

        // Organization Memberships
        await pool.query(`
            CREATE TABLE IF NOT EXISTS organization_memberships (
                id TEXT PRIMARY KEY,
                person_id TEXT REFERENCES persons(id),
                organization_id TEXT REFERENCES organizations(id),
                role_id TEXT,
                start_date TIMESTAMPTZ,
                end_date TIMESTAMPTZ
            );
        `);

        // Events
        await pool.query(`
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT,
                start_date TIMESTAMPTZ,
                end_date TIMESTAMPTZ,
                venue_id TEXT, -- No FK constraint enforced strictly to allow external venues? No, keep safe for now.
                organization_id TEXT REFERENCES organizations(id),
                participating_org_ids TEXT[],
                sport_ids TEXT[],
                settings JSONB,
                status TEXT
            );
        `);

         // Games
         await pool.query(`
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                event_id TEXT REFERENCES events(id),
                home_team_id TEXT REFERENCES teams(id),
                away_team_id TEXT REFERENCES teams(id),
                away_team_name TEXT,
                start_time TIMESTAMPTZ,
                status TEXT,
                venue_id TEXT,
                home_score INTEGER DEFAULT 0,
                away_score INTEGER DEFAULT 0
            );
        `);

        await pool.query('COMMIT');
        console.log('Tables created successfully.');
        process.exit(0);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error creating tables:', error);
        process.exit(1);
    }
};

createTables();
