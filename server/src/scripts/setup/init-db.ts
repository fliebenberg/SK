import * as fs from 'fs';
import * as path from 'path';
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
                event_sections JSONB DEFAULT '[]'::jsonb,
                event_templates JSONB DEFAULT '[]'::jsonb,
                facility_term TEXT,
                period_term TEXT
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
                short_name TEXT NOT NULL CHECK (btrim(short_name) <> ''),
                is_claimed BOOLEAN DEFAULT false,
                creator_id TEXT,
                is_active BOOLEAN DEFAULT true,
                settings JSONB DEFAULT '{}'::jsonb,
                address_id TEXT REFERENCES addresses(id),
                type TEXT DEFAULT 'OTHER',
                custom_type TEXT DEFAULT NULL
                -- Team/member/site counts are computed live by the org queries, not stored here.
                -- See migration 20260814_derive_org_counts.ts.
            );
        `);

        // Organization Sports Join Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS organization_sports (
                org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
                sport_id TEXT REFERENCES sports(id) ON DELETE CASCADE,
                PRIMARY KEY (org_id, sport_id)
            );
        `);

        // Organization Roles Join Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS organization_roles (
                org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
                role_id TEXT NOT NULL,
                PRIMARY KEY (org_id, role_id)
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
                address_id TEXT REFERENCES addresses(id),
                surface_type TEXT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                is_active BOOLEAN DEFAULT true,
                category TEXT DEFAULT 'other',
                primary_sport_id TEXT REFERENCES sports(id) ON DELETE SET NULL
            );
        `);

        // Facility Sports Join Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS facility_sports (
                facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
                sport_id TEXT REFERENCES sports(id) ON DELETE CASCADE,
                PRIMARY KEY (facility_id, sport_id)
            );
        `);

        // Sport age groups: each sport's list, official (curated in the sport editor) and custom
        // (added by users under "Other…"). Teams, divisions and leagues reference an entry through
        // (sport_id, age_group_id), so an age group can only be held by something of its own sport.
        // `created_by` has no FK because `users` is created further down, as with `teams.creator_id`.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sport_age_groups (
                id TEXT PRIMARY KEY,
                sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_official BOOLEAN NOT NULL DEFAULT false,
                created_by TEXT,
                created_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (sport_id, id)
            );
        `);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS sport_age_groups_name_key
                ON sport_age_groups (sport_id, lower(name));
        `);

        // Teams Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                sport_id TEXT REFERENCES sports(id),
                age_group_id TEXT,
                org_id TEXT REFERENCES organizations(id),
                is_active BOOLEAN DEFAULT true,
                creator_id TEXT,
                short_name TEXT,
                CONSTRAINT teams_age_group_fk FOREIGN KEY (sport_id, age_group_id)
                    REFERENCES sport_age_groups (sport_id, id)
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
                theme TEXT DEFAULT 'light-orange',
                force_password_reset BOOLEAN DEFAULT false
            );
        `);

        // Migration: Ensure force_password_reset column exists on older instances
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN DEFAULT false;
        `);



        // Organization Profiles (Replaces Persons)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS org_profiles (
                id TEXT PRIMARY KEY,
                org_id TEXT REFERENCES organizations(id),
                user_id TEXT REFERENCES users(id),
                name TEXT NOT NULL,
                email TEXT,
                cellphone TEXT,
                birthdate DATE,
                national_id TEXT,
                identifier TEXT,
                image TEXT,
                primary_role_id TEXT,
                last_invite_sent_at TIMESTAMPTZ,
                image_config JSONB DEFAULT NULL,
                UNIQUE(org_id, identifier)
            );
        `);

        // Migration: Ensure cellphone column exists on older instances of org_profiles
        await pool.query(`
            ALTER TABLE org_profiles ADD COLUMN IF NOT EXISTS cellphone TEXT;
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
                -- U39 / FIX-1: an event without a type should not exist, so it is refused rather
                -- than defaulted. 'SportsDay' is gone (D1) — a sports day is a Tournament whose
                -- format is 'Festival'.
                type TEXT NOT NULL,
                start_date TIMESTAMPTZ,
                end_date TIMESTAMPTZ,
                site_id TEXT REFERENCES sites(id),
                facility_id TEXT REFERENCES facilities(id),
                org_id TEXT REFERENCES organizations(id),
                settings JSONB,
                status TEXT,
                -- Appended, in the order the tournaments migration adds them, so that a database
                -- built here and one brought forward by 20260901_tournaments.ts produce the same
                -- pg_dump. "format" is a column rather than a settings key (plan §0.2).
                cached_standings JSONB DEFAULT '[]'::jsonb,
                format TEXT,
                CONSTRAINT events_type_check CHECK (type IN ('SingleMatch', 'Tournament'))
            );
        `);

        // Event Sports Join Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS event_sports (
                event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
                sport_id TEXT REFERENCES sports(id) ON DELETE CASCADE,
                PRIMARY KEY (event_id, sport_id)
            );
        `);

        // Event Organizations Join Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS event_organizations (
                event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
                org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
                PRIMARY KEY (event_id, org_id)
            );
        `);

        // ---------------------------------------------------------------------------------
        // Tournaments (docs/tournaments-data-model.md §3).
        //
        // Mirrored from migrations/20260901_tournaments.ts per migrations/README.md. They sit
        // here, above `games`, because `game_participants` takes foreign keys onto
        // `division_entrants` and `division_stages`.
        //
        // Naming follows §3.0: a table is named for its parent, so its name tells you what
        // deletes it. `tournament_divisions` is the deliberate exception — `event_divisions`
        // would read as another join table beside `event_sports`, which it is not.
        // ---------------------------------------------------------------------------------

        // Divisions: the netball, the U14 rugby. A substantial entity, not a join row.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tournament_divisions (
                id TEXT PRIMARY KEY,
                event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                sport_id TEXT REFERENCES sports(id),
                age_group_id TEXT,
                scoring_subject TEXT,           -- 'Team' | 'Organisation'; NULL inherits the event
                weighting NUMERIC(6,3) NOT NULL DEFAULT 1.0,
                settings JSONB DEFAULT '{}'::jsonb,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT tournament_divisions_age_group_fk FOREIGN KEY (sport_id, age_group_id)
                    REFERENCES sport_age_groups (sport_id, id)
            );
        `);

        // Stages: pools then knockout. Every division has at least one (D11); the UI stays
        // silent about staging when it has exactly one.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS division_stages (
                id TEXT PRIMARY KEY,
                division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                format TEXT NOT NULL,           -- 'Festival' | 'RoundRobin' | 'Knockout' | 'Plate' | 'Swiss'
                sequence INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending',
                                                -- 'Pending' | 'Ready' | 'InProgress' | 'Complete'
                earliest_start TIMESTAMPTZ,     -- D15: the knockout may not start before day 2
                settings JSONB DEFAULT '{}'::jsonb,
                cached_standings JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE (division_id, sequence)
            );
        `);

        // Entrants: a team, an individual, or an unresolved slot carrying only a label. The
        // CHECK forbids the first two at once; it does not require either.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS division_entrants (
                id TEXT PRIMARY KEY,
                division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
                team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
                org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
                org_id TEXT REFERENCES organizations(id),
                label TEXT,
                seed INTEGER,
                status TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'withdrawn'
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT entrant_is_team_or_person CHECK (team_id IS NULL OR org_profile_id IS NULL)
            );
        `);

        // Who takes part in each stage, and where they sit in it. Pool membership lives on the
        // membership row rather than in the stage's JSON, so "which pool is Northcliff in?" is
        // a query rather than a scan.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stage_entrants (
                stage_id TEXT REFERENCES division_stages(id) ON DELETE CASCADE,
                entrant_id TEXT REFERENCES division_entrants(id) ON DELETE CASCADE,
                pool_key TEXT,                  -- 'A', 'B'; NULL when the stage has no pools
                seed INTEGER,
                sort_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (stage_id, entrant_id)
            );
        `);

        // The facility cascade: the event names what is in play, a division may narrow it to a
        // subset, a division with no rows may use any of the event's. `events.facility_id`
        // stays as it is for SingleMatch, where one facility is the whole story.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS event_facilities (
                event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
                facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
                PRIMARY KEY (event_id, facility_id)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS division_facilities (
                division_id TEXT REFERENCES tournament_divisions(id) ON DELETE CASCADE,
                facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
                PRIMARY KEY (division_id, facility_id)
            );
        `);

        // D29's standings half: a deduction or a walkover becomes a row with a reason and an
        // author, rather than a quiet edit to a game that never happened.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS division_adjustments (
                id TEXT PRIMARY KEY,
                division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
                entrant_id TEXT NOT NULL REFERENCES division_entrants(id) ON DELETE CASCADE,
                points_delta NUMERIC(6,2) NOT NULL DEFAULT 0,
                reason TEXT NOT NULL,
                created_by_user_id TEXT REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // D33's three grant scopes. A table each rather than one with nullable columns: a
        // composite primary key is then the uniqueness rule (Postgres treats NULLs as distinct
        // in a unique index), and each foreign key points at exactly one parent, so a grant
        // cannot pair event A with a division of event B.
        //
        // Grants reference `org_profiles`, never `users` — `AccessManager` resolves a user into
        // a set of profile ids, so someone with no account yet can still be appointed.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS event_organizers (
                event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
                org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE CASCADE,
                granted_by_org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (event_id, org_profile_id)
            );
        `);

        // The sport scope (2026-09-20) keys on **(event, sport)**: "you run the netball at this
        // tournament", which the same sport at next weekend's tournament says nothing about. It is
        // a rule rather than a list — it covers a netball division added tomorrow, and stops
        // covering one moved to hockey, without a row being touched.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS event_sport_organizers (
                event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
                sport_id TEXT REFERENCES sports(id) ON DELETE CASCADE,
                org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE CASCADE,
                granted_by_org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (event_id, sport_id, org_profile_id)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS division_organizers (
                division_id TEXT REFERENCES tournament_divisions(id) ON DELETE CASCADE,
                org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE CASCADE,
                granted_by_org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (division_id, org_profile_id)
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
                sport_id TEXT,
                start_time TIMESTAMPTZ,
                scheduled_start_time TIMESTAMPTZ,
                status TEXT,
                site_id TEXT REFERENCES sites(id),
                facility_id TEXT REFERENCES facilities(id),
                final_score_data JSONB,
                custom_settings JSONB DEFAULT '{}'::jsonb,
                live_state JSONB DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                finish_time TIMESTAMPTZ,
                -- The stage this fixture belongs to (tournaments Phase 3). Null for every single
                -- match and for any tournament fixture added outside a stage. Not derivable from
                -- the participants: an entrant belongs to the division, and stage_entrants puts
                -- the same entrant in the pool stage and the knockout, so the indirection the data
                -- model's §4.4 proposed returns both. SET NULL rather than CASCADE, matching
                -- game_participants.source_stage_id -- deleting a stage must not delete the
                -- fixtures played in it.
                stage_id TEXT REFERENCES division_stages(id) ON DELETE SET NULL
            );
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_games_stage ON games(stage_id);`);

        // Game Participants
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_participants (
                id TEXT PRIMARY KEY,
                game_id TEXT,
                team_id TEXT,
                org_profile_id TEXT,
                status TEXT DEFAULT 'active', -- 'active', 'withdrawn', 'disqualified', 'did_not_start'
                sort_order INTEGER DEFAULT 0,
                -- Where this side came from, when it is not a team someone picked (data model
                -- §4.1). All null for every single match, so nothing reading this table today
                -- changes behaviour. Appended in the order the tournaments migration adds them,
                -- so both schema paths produce the same pg_dump.
                entrant_id TEXT REFERENCES division_entrants(id) ON DELETE SET NULL,
                source_game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
                source_stage_id TEXT REFERENCES division_stages(id) ON DELETE SET NULL,
                source_rule JSONB,
                -- FIX-10. Named explicitly rather than left to Postgres' auto-naming, because
                -- the migration adds them by these names and the two schemas are diffed.
                -- Cascade only where the row is meaningless without its parent: deleting a team
                -- must not delete the fixtures it played, and "team_id" is already nullable
                -- because a tournament side can be an unresolved rule.
                CONSTRAINT game_participants_game_fk
                    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                CONSTRAINT game_participants_team_fk
                    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
                CONSTRAINT game_participants_profile_fk
                    FOREIGN KEY (org_profile_id) REFERENCES org_profiles(id) ON DELETE SET NULL
            );
        `);

        // Game Rosters
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_rosters (
                id TEXT PRIMARY KEY,
                game_participant_id TEXT REFERENCES game_participants(id) ON DELETE CASCADE,
                org_profile_id TEXT REFERENCES org_profiles(id),
                position TEXT,
                jersey_number TEXT,
                is_reserve BOOLEAN DEFAULT false
            );
            ALTER TABLE game_rosters ADD COLUMN IF NOT EXISTS jersey_number TEXT;
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

        // Game Disputes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_disputes (
                id VARCHAR(255) PRIMARY KEY,
                game_id VARCHAR(255) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                game_event_id VARCHAR(255) NOT NULL REFERENCES game_events(id) ON DELETE CASCADE,
                initiator_org_profile_id VARCHAR(255),
                initiator_id VARCHAR(255),
                status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
                type VARCHAR(50) DEFAULT 'UNDO',
                update_data JSONB,
                dispute_config JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                resolved_at TIMESTAMP WITH TIME ZONE
            );
        `);

        // Game Dispute Votes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_dispute_votes (
                id VARCHAR(255) PRIMARY KEY,
                dispute_id VARCHAR(255) NOT NULL REFERENCES game_disputes(id) ON DELETE CASCADE,
                voter_org_profile_id VARCHAR(255),
                vote VARCHAR(50) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(dispute_id, voter_org_profile_id)
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

        // When the invitation email last went out. Re-nominating the same address resends only
        // once `org_admin_invite_cooldown_hours` has passed since this, so the original
        // `created_at` is never rewritten. NULL on rows from before the column existed reads as
        // `created_at`.
        await pool.query(`
            ALTER TABLE org_claim_referrals ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
        `);

        // Everyone who has nominated this address for this org. `referred_by_user_id` names only
        // the nominator credited for the current email; this is how a second person who enters an
        // address someone else already invited sees "you have referred this org" without a second
        // email being sent. Backfilled from `referred_by_user_id` so existing rows count.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS org_claim_referral_nominators (
                referral_id TEXT REFERENCES org_claim_referrals(id) ON DELETE CASCADE,
                user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (referral_id, user_id)
            );
            INSERT INTO org_claim_referral_nominators (referral_id, user_id, created_at)
                SELECT id, referred_by_user_id, created_at FROM org_claim_referrals
                WHERE referred_by_user_id IS NOT NULL
            ON CONFLICT DO NOTHING;
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

        // Leagues Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS leagues (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                sport_id TEXT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
                age_group_id TEXT,
                join_policy TEXT NOT NULL DEFAULT 'CLOSED',
                criteria JSONB DEFAULT '{}'::jsonb,
                logo TEXT DEFAULT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT leagues_age_group_fk FOREIGN KEY (sport_id, age_group_id)
                    REFERENCES sport_age_groups (sport_id, id)
            );
        `);

        // Seasons Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS seasons (
                id TEXT PRIMARY KEY,
                league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                start_date TIMESTAMPTZ NOT NULL,
                end_date TIMESTAMPTZ NOT NULL,
                status TEXT NOT NULL DEFAULT 'UPCOMING',
                -- D17: 3/1/0, the same ScoringSystem shape a tournament uses (D19). Existing
                -- seasons store their values explicitly, so changing this moved no league's table.
                settings JSONB DEFAULT '{"pointsPerWin": 3, "pointsPerDraw": 1, "pointsPerLoss": 0}'::jsonb,
                cached_standings JSONB DEFAULT '[]'::jsonb,
                logo TEXT DEFAULT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // Season Teams Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS season_teams (
                season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
                team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'approved',
                PRIMARY KEY (season_id, team_id)
            );
        `);

        // Game Seasons Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS game_seasons (
                game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
                season_id TEXT REFERENCES seasons(id) ON DELETE CASCADE,
                PRIMARY KEY (game_id, season_id)
            );
        `);

        // Indexes for performance
        // Back the live organization counts (and every other org-scoped filter).
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(org_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sites_org ON sites(org_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_leagues_org ON leagues(org_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_seasons_league ON seasons(league_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_seasons_season ON game_seasons(season_id);`);

        // Tournaments (mirrored from migrations/20260901_tournaments.ts). Each one backs a
        // lookup that is on the read path of a division screen: children by parent, and the two
        // that answer "what is this person or org involved in?".
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_divisions_event ON tournament_divisions(event_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_division_stages_division ON division_stages(division_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_division_entrants_division ON division_entrants(division_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_division_entrants_org ON division_entrants(org_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_stage_entrants_stage ON stage_entrants(stage_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_division_facilities_division ON division_facilities(division_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_division_adjustments_division ON division_adjustments(division_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_organizers_profile ON event_organizers(org_profile_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_sport_organizers_profile ON event_sport_organizers(org_profile_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_division_organizers_profile ON division_organizers(org_profile_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_participants_entrant ON game_participants(entrant_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_game_participants_source_game ON game_participants(source_game_id);`);

        // System Settings
        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        `);

        // Stamp every existing migration as already applied.
        //
        // A database built here *is* the current schema, so `db:migrate` against it has
        // nothing left to do — but without this it believes no migration has ever run and
        // replays all seven. That is harmless only for as long as every migration happens to
        // be written defensively, and it makes the tournaments Phase 1 check ("the migration
        // runs against a restored dump AND db:setup produces an identical schema") a ritual
        // rather than a check. See docs/tournaments-implementation-plan.md §0.3.
        //
        // The table definition is repeated from run-all-migrations.ts deliberately: whichever
        // script touches a fresh database first has to create it, and both are IF NOT EXISTS.
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name VARCHAR(255) PRIMARY KEY,
                executed_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        const migrationsDir = path.join(__dirname, '..', 'migrations');
        const migrationFiles = fs.existsSync(migrationsDir)
            ? fs.readdirSync(migrationsDir)
                .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
                .sort((a, b) => a.localeCompare(b))
            : [];

        for (const file of migrationFiles) {
            await pool.query(
                'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
                [file]
            );
        }
        console.log(`Stamped ${migrationFiles.length} existing migration(s) as already applied.`);

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
