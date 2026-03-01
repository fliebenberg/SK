import pool from '../db';
import { v4 as uuidv4 } from 'uuid';

const migrate = async () => {
    console.log('Starting migration: persons -> org_profiles');
    try {
        await pool.query('BEGIN');

        // 1. Ensure org_profiles exists and other columns are ready
        console.log('1. Setting up schema...');
        
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

        await pool.query('ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT \'{}\'::jsonb;');
        await pool.query('ALTER TABLE team_memberships ADD COLUMN IF NOT EXISTS org_profile_id TEXT REFERENCES org_profiles(id);');
        await pool.query('ALTER TABLE org_memberships ADD COLUMN IF NOT EXISTS org_profile_id TEXT REFERENCES org_profiles(id);');

        // 2. Fetch all legacy persons
        console.log('2. Fetching legacy persons...');
        const { rows: persons } = await pool.query('SELECT * FROM persons');
        console.log(`Found ${persons.length} persons to migrate.`);

        // 3. Migrate each person
        console.log('3. Migrating profiles mapping...');
        
        for (const person of persons) {
            // Find organizations this person belongs to
            const { rows: orgIdsResult } = await pool.query(`
                SELECT DISTINCT org_id FROM org_memberships WHERE person_id = $1
                UNION
                SELECT DISTINCT t.org_id FROM team_memberships tm JOIN teams t ON tm.team_id = t.id WHERE tm.person_id = $1
            `, [person.id]);

            const orgIds = orgIdsResult.map(r => r.org_id).filter(id => id);

            if (orgIds.length === 0) {
                console.warn(`Person ${person.id} (${person.name}) has no organization links. Skipping...`);
                continue;
            }

            for (const orgId of orgIds) {
                const profileId = uuidv4();
                
                // Get legacy identifier if it exists
                const { rows: identifiers } = await pool.query(`
                    SELECT identifier FROM person_identifiers WHERE person_id = $1 AND org_id = $2
                `, [person.id, orgId]);
                const identifier = identifiers.length > 0 ? identifiers[0].identifier : null;

                // Try to find matching user by email
                let userId = null;
                if (person.email) {
                    const { rows: users } = await pool.query('SELECT id FROM users WHERE email = $1', [person.email]);
                    if (users.length > 0) {
                        userId = users[0].id;
                    }
                }

                // Insert into org_profiles (Handle conflicts nicely)
                await pool.query(`
                    INSERT INTO org_profiles (
                        id, org_id, user_id, name, email, birthdate, national_id, identifier
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT DO NOTHING
                `, [profileId, orgId, userId, person.name, person.email, person.birthdate, person.national_id, identifier]);

                // Update team_memberships
                const { rows: associatedTeams } = await pool.query(`SELECT id FROM teams WHERE org_id = $1`, [orgId]);
                
                if (associatedTeams.length > 0) {
                     await pool.query(`
                        UPDATE team_memberships 
                        SET org_profile_id = $1 
                        WHERE person_id = $2 AND team_id = ANY($3::text[])
                     `, [profileId, person.id, associatedTeams.map(t => t.id)]);
                }

                // Update org_memberships
                await pool.query(`
                    UPDATE org_memberships
                    SET org_profile_id = $1
                    WHERE person_id = $2 AND org_id = $3
                `, [profileId, person.id, orgId]);
                
                // Set primary_role_id if they have an active org role
                const { rows: orgRoles } = await pool.query(`
                    SELECT role_id FROM org_memberships 
                    WHERE org_profile_id = $1 
                    ORDER BY start_date DESC NULLS LAST LIMIT 1
                `, [profileId]);
                
                if (orgRoles.length > 0 && orgRoles[0].role_id) {
                    await pool.query(`UPDATE org_profiles SET primary_role_id = $1 WHERE id = $2`, [orgRoles[0].role_id, profileId]);
                }
            }
        }
        
        console.log('4. Data migration complete.');
        console.log('NOTE: Legacy `persons`, `person_identifiers`, and the `person_id` columns still exist for safety.');
        console.log('If everything works, you can drop them in a future update.');
        
        await pool.query('COMMIT');
        console.log('Migration committed successfully.');
        process.exit(0);
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Migration failed and was rolled back:', e);
        process.exit(1);
    }
}

migrate();
