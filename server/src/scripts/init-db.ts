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

        // Users Table (Auth accounts)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT,
                email TEXT UNIQUE,
                email_verified TIMESTAMPTZ,
                image TEXT,
                custom_image TEXT,
                avatar_source TEXT DEFAULT 'custom',
                password_hash TEXT,
                global_role TEXT DEFAULT 'user',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                preferences JSONB DEFAULT '{}',
                theme TEXT DEFAULT 'light-orange'
            );
        `);

        // User Emails (Multi-email support)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_emails (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                email TEXT UNIQUE NOT NULL,
                is_primary BOOLEAN DEFAULT false,
                verified_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // NextAuth Accounts (Social providers)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                provider TEXT NOT NULL,
                provider_account_id TEXT NOT NULL,
                refresh_token TEXT,
                access_token TEXT,
                expires_at INTEGER,
                token_type TEXT,
                scope TEXT,
                id_token TEXT,
                session_state TEXT,
                provider_image TEXT,
                UNIQUE(provider, provider_account_id)
            );
        `);

        // NextAuth Sessions
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                session_token TEXT UNIQUE NOT NULL,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires TIMESTAMPTZ NOT NULL
            );
        `);

        // Verification Tokens
        await pool.query(`
            CREATE TABLE IF NOT EXISTS verification_tokens (
                identifier TEXT NOT NULL,
                token TEXT NOT NULL,
                expires TIMESTAMPTZ NOT NULL,
                PRIMARY KEY (identifier, token)
            );
        `);

        // Password Reset Tokens
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // User Favorites
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_favorites (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                entity_type TEXT NOT NULL, -- 'team', 'organization', 'event'
                entity_id TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, entity_type, entity_id)
            );
        `);

         // Games
         await pool.query(`
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
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
