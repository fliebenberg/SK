import pool from '../../db';

const migrate = async () => {
    try {
        console.log('Starting Migration: Create System Administration Org and seed admin org profiles...');
        await pool.query('BEGIN');

        const SYSTEM_ORG_ID = 'org-system-admins';

        // 1. Ensure System Administration Organization exists
        await pool.query(`
            INSERT INTO organizations (id, name, short_name, primary_color, secondary_color, is_active, is_claimed, type)
            VALUES ($1, 'System Administration', 'SYS', '#000000', '#ffffff', true, true, 'ORGANIZATION')
            ON CONFLICT (id) DO NOTHING;
        `, [SYSTEM_ORG_ID]);
        console.log('System Administration Organization verified/created.');

        // 2. Fetch all users with global_role = 'admin'
        const adminUsersRes = await pool.query(`
            SELECT id, name, email FROM users WHERE global_role = 'admin';
        `);

        for (const admin of adminUsersRes.rows) {
            const profileId = `profile-admin-${admin.id}`;

            // Check or insert org_profile in org-system-admins
            const existingProfile = await pool.query(`
                SELECT id FROM org_profiles WHERE user_id = $1 AND org_id = $2;
            `, [admin.id, SYSTEM_ORG_ID]);

            let activeProfileId = profileId;
            if (existingProfile.rows.length === 0) {
                await pool.query(`
                    INSERT INTO org_profiles (id, org_id, user_id, name, email, primary_role_id)
                    VALUES ($1, $2, $3, $4, $5, 'role-org-admin')
                    ON CONFLICT (id) DO NOTHING;
                `, [profileId, SYSTEM_ORG_ID, admin.id, admin.name || 'System Admin', admin.email]);
                console.log(`Created System Admin OrgProfile ${profileId} for user ${admin.id}`);
            } else {
                activeProfileId = existingProfile.rows[0].id;
            }

            // Ensure org_memberships record exists
            await pool.query(`
                INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
                VALUES ($1, $2, $3, 'role-org-admin', NOW())
                ON CONFLICT (id) DO NOTHING;
            `, [`mem-admin-${admin.id}`, activeProfileId, SYSTEM_ORG_ID]);
        }

        await pool.query('COMMIT');
        console.log('System Administration Org Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
