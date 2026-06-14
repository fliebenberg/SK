import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Relational Refactor of Array Columns...');
        await pool.query('BEGIN');

        // 1. Create join tables
        console.log('Creating organization_sports table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS organization_sports (
                org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
                sport_id TEXT REFERENCES sports(id) ON DELETE CASCADE,
                PRIMARY KEY (org_id, sport_id)
            );
        `);

        console.log('Creating organization_roles table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS organization_roles (
                org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
                role_id TEXT NOT NULL,
                PRIMARY KEY (org_id, role_id)
            );
        `);

        console.log('Creating facility_sports table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS facility_sports (
                facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
                sport_id TEXT REFERENCES sports(id) ON DELETE CASCADE,
                PRIMARY KEY (facility_id, sport_id)
            );
        `);

        console.log('Creating event_sports table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS event_sports (
                event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
                sport_id TEXT REFERENCES sports(id) ON DELETE CASCADE,
                PRIMARY KEY (event_id, sport_id)
            );
        `);

        console.log('Creating event_organizations table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS event_organizations (
                event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
                org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
                PRIMARY KEY (event_id, org_id)
            );
        `);

        // 2. Migrate existing data from columns to join tables
        console.log('Migrating organizations sports and roles data...');
        // We check if column exists first before selecting from it (to make script re-runnable)
        const checkOrgCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'organizations' AND column_name IN ('supported_sport_ids', 'supported_role_ids')
        `);
        const orgColNames = checkOrgCols.rows.map(r => r.column_name);

        if (orgColNames.includes('supported_sport_ids')) {
            await pool.query(`
                INSERT INTO organization_sports (org_id, sport_id)
                SELECT id, unnest(supported_sport_ids)
                FROM organizations
                WHERE supported_sport_ids IS NOT NULL AND array_length(supported_sport_ids, 1) > 0
                ON CONFLICT DO NOTHING
            `);
            console.log('Migrated supported_sport_ids to organization_sports.');
        }

        if (orgColNames.includes('supported_role_ids')) {
            await pool.query(`
                INSERT INTO organization_roles (org_id, role_id)
                SELECT id, unnest(supported_role_ids)
                FROM organizations
                WHERE supported_role_ids IS NOT NULL AND array_length(supported_role_ids, 1) > 0
                ON CONFLICT DO NOTHING
            `);
            console.log('Migrated supported_role_ids to organization_roles.');
        }

        console.log('Migrating facilities sport data...');
        const checkFacCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'facilities' AND column_name = 'primary_sport_id'
        `);
        if (checkFacCols.rows.length > 0) {
            await pool.query(`
                INSERT INTO facility_sports (facility_id, sport_id)
                SELECT id, primary_sport_id
                FROM facilities
                WHERE primary_sport_id IS NOT NULL
                ON CONFLICT DO NOTHING
            `);
            console.log('Migrated primary_sport_id to facility_sports.');
        }

        console.log('Migrating events sports and organizations data...');
        const checkEventCols = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'events' AND column_name IN ('sport_ids', 'participating_org_ids')
        `);
        const eventColNames = checkEventCols.rows.map(r => r.column_name);

        if (eventColNames.includes('sport_ids')) {
            await pool.query(`
                INSERT INTO event_sports (event_id, sport_id)
                SELECT id, unnest(sport_ids)
                FROM events
                WHERE sport_ids IS NOT NULL AND array_length(sport_ids, 1) > 0
                ON CONFLICT DO NOTHING
            `);
            console.log('Migrated sport_ids to event_sports.');
        }

        if (eventColNames.includes('participating_org_ids')) {
            await pool.query(`
                INSERT INTO event_organizations (event_id, org_id)
                SELECT id, unnest(participating_org_ids)
                FROM events
                WHERE participating_org_ids IS NOT NULL AND array_length(participating_org_ids, 1) > 0
                ON CONFLICT DO NOTHING
            `);
            console.log('Migrated participating_org_ids to event_organizations.');
        }

        // 3. Drop legacy columns
        console.log('Dropping legacy array and single reference columns...');
        if (orgColNames.includes('supported_sport_ids')) {
            await pool.query('ALTER TABLE organizations DROP COLUMN supported_sport_ids;');
        }
        if (orgColNames.includes('supported_role_ids')) {
            await pool.query('ALTER TABLE organizations DROP COLUMN supported_role_ids;');
        }
        if (checkFacCols.rows.length > 0) {
            await pool.query('ALTER TABLE facilities DROP COLUMN primary_sport_id;');
        }
        if (eventColNames.includes('sport_ids')) {
            await pool.query('ALTER TABLE events DROP COLUMN sport_ids;');
        }
        if (eventColNames.includes('participating_org_ids')) {
            await pool.query('ALTER TABLE events DROP COLUMN participating_org_ids;');
        }
        console.log('Legacy columns dropped successfully.');

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
