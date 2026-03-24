import pool from '../../db';

const createTables = async () => {
    try {
        console.log('Initializing Database...');

        await pool.query('BEGIN');

        // Enable pg_trgm for fuzzy search
        await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

        // Addresses Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS addresses (
                id TEXT PRIMARY KEY,
                full_address TEXT,
                address_line_1 TEXT,
                address_line_2 TEXT,
                city TEXT,
                province TEXT,
                postal_code TEXT,
                country TEXT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION
            );
        `);

        // Sport Categories Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sport_categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon_url TEXT
            );
        `);

        // Sports Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sports (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category_id TEXT REFERENCES sport_categories(id),
                participant_type TEXT, -- 'TEAM' | 'INDIVIDUAL'
                match_topology TEXT, -- 'HEAD_TO_HEAD' | 'MULTI_COMPETITOR'
                default_settings JSONB DEFAULT '{}'::jsonb,
                facility_term TEXT
            );
        `);

        // Sport Presets
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sport_presets (
                id TEXT PRIMARY KEY,
                sport_id TEXT REFERENCES sports(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                settings_override JSONB DEFAULT '{}'::jsonb
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
                supported_role_ids TEXT[],
                is_claimed BOOLEAN DEFAULT false,
                creator_id TEXT,
                is_active BOOLEAN DEFAULT true,
                settings JSONB DEFAULT '{}'::jsonb,
                address_id TEXT REFERENCES addresses(id)
            );
        `);

        // Sites Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sites (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                address_id TEXT REFERENCES addresses(id),
                org_id TEXT REFERENCES organizations(id),
                is_active BOOLEAN DEFAULT true
            );
        `);

        // Facilities Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS facilities (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                site_id TEXT REFERENCES sites(id),
                primary_sport_id TEXT REFERENCES sports(id),
                address_id TEXT REFERENCES addresses(id),
                surface_type TEXT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                is_active BOOLEAN DEFAULT true
            );
        `);

        // Teams Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                age_group TEXT,
                sport_id TEXT REFERENCES sports(id),
                org_id TEXT REFERENCES organizations(id),
                is_active BOOLEAN DEFAULT true,
                creator_id TEXT
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

        // Organization Profiles (Replaces Persons)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS org_profiles (
                id TEXT PRIMARY KEY,
                org_id TEXT REFERENCES organizations(id),
                user_id TEXT REFERENCES users(id),
                name TEXT NOT NULL,
                email TEXT,
                birthdate DATE,
                national_id TEXT,
                identifier TEXT,
                image TEXT,
                primary_role_id TEXT,
                UNIQUE(org_id, identifier)
            );
        `);

        // Team Memberships
        await pool.query(`
            CREATE TABLE IF NOT EXISTS team_memberships (
                id TEXT PRIMARY KEY,
                org_profile_id TEXT REFERENCES org_profiles(id),
                team_id TEXT REFERENCES teams(id),
                role_id TEXT,
                start_date TIMESTAMPTZ,
                end_date TIMESTAMPTZ
            );
        `);

        // Organization Memberships
        await pool.query(`
            CREATE TABLE IF NOT EXISTS org_memberships (
                id TEXT PRIMARY KEY,
                org_profile_id TEXT REFERENCES org_profiles(id),
                org_id TEXT REFERENCES organizations(id),
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
                site_id TEXT REFERENCES sites(id),
                facility_id TEXT REFERENCES facilities(id),
                org_id TEXT REFERENCES organizations(id),
                participating_org_ids TEXT[],
                sport_ids TEXT[],
                settings JSONB,
                status TEXT
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

         // Games (Generic match entity)
         await pool.query(`
            CREATE TABLE IF NOT EXISTS games (
                id TEXT PRIMARY KEY,
                event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
                start_time TIMESTAMPTZ,
                status TEXT,
                site_id TEXT REFERENCES sites(id),
                facility_id TEXT REFERENCES facilities(id),
                final_score_data JSONB,
                custom_settings JSONB DEFAULT '{}'::jsonb,
                live_state JSONB DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                finish_time TIMESTAMPTZ
            );
        `);

        // Game Participants
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_participants (
                id TEXT PRIMARY KEY,
                game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
                team_id TEXT REFERENCES teams(id),
                org_profile_id TEXT REFERENCES org_profiles(id),
                status TEXT DEFAULT 'active', -- 'active', 'withdrawn', 'disqualified', 'did_not_start'
                sort_order INTEGER DEFAULT 0
            );
        `);

        // Game Rosters
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_rosters (
                id TEXT PRIMARY KEY,
                game_participant_id TEXT REFERENCES game_participants(id) ON DELETE CASCADE,
                org_profile_id TEXT REFERENCES org_profiles(id),
                position TEXT,
                is_reserve BOOLEAN DEFAULT false
            );
        `);

        // Game Officials
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_officials (
                id TEXT PRIMARY KEY,
                game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
                org_profile_id TEXT REFERENCES org_profiles(id),
                role TEXT NOT NULL -- 'SCORER', 'REFEREE', 'TIMEKEEPER', 'JUDGE'
            );
        `);

        // Game Events
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_events (
                id TEXT PRIMARY KEY,
                game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
                timestamp TIMESTAMPTZ DEFAULT NOW(),
                game_participant_id TEXT REFERENCES game_participants(id),
                actor_org_profile_id TEXT REFERENCES org_profiles(id),
                initiator_org_profile_id TEXT REFERENCES org_profiles(id),
                type TEXT NOT NULL,
                sub_type TEXT,
                event_data JSONB DEFAULT '{}'::jsonb
            );
        `);

        // Org Claim Referrals
        await pool.query(`
            CREATE TABLE IF NOT EXISTS org_claim_referrals (
                id TEXT PRIMARY KEY,
                org_id TEXT REFERENCES organizations(id),
                referred_email TEXT NOT NULL,
                referred_by_user_id TEXT REFERENCES users(id),
                claim_token TEXT UNIQUE,
                claim_token_expires_at TIMESTAMPTZ, -- Optional; NULL = never expires
                status TEXT DEFAULT 'pending',      -- 'pending', 'claimed', 'declined'
                claimed_by_user_id TEXT REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                claimed_at TIMESTAMPTZ,
                notified_referrer_at TIMESTAMPTZ
            );
        `);

        // Reports
        await pool.query(`
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                reporter_user_id TEXT REFERENCES users(id),
                entity_type TEXT NOT NULL,          -- 'organization', 'event', 'user'
                entity_id TEXT NOT NULL,
                reason TEXT NOT NULL,               -- 'impersonation', 'inappropriate_content', 'spam', 'other'
                description TEXT,
                status TEXT DEFAULT 'open',         -- 'open', 'investigating', 'resolved', 'dismissed'
                resolved_by_user_id TEXT,
                resolved_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // User Badges
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_badges (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id),
                badge_type TEXT NOT NULL,           -- 'community_builder', etc.
                earned_at TIMESTAMPTZ DEFAULT NOW(),
                metadata JSONB DEFAULT '{}'
            );
        `);
        
        // Notifications Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL, -- e.g. 'claim_invitation', 'match_update'
                link TEXT,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT NOW()
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
