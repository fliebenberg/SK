import pool from '../db';
import bcrypt from 'bcryptjs';

const seedDb = async () => {
    try {
        console.log('Seeding Database...');
        await pool.query('BEGIN');

        const isProduction = process.env.NODE_ENV === 'production';
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

        // 1. Core Data: Sports (Core even in production)
        const sports = [
            { id: "sport-soccer", name: "Soccer" },
            { id: "sport-rugby", name: "Rugby" },
            { id: "sport-netball", name: "Netball" },
            { id: "sport-hockey", name: "Hockey" },
            { id: "sport-cricket", name: "Cricket" },
            { id: "sport-basketball", name: "Basketball" },
        ];
        
        for (const sport of sports) {
            await pool.query('INSERT INTO sports (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [sport.id, sport.name]);
        }

        // 2. Initial App Admin (Always create if env vars exist)
        const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
        const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

        if (adminEmail && adminPassword) {
            console.log(`Ensuring initial admin exists: ${adminEmail}`);
            const passwordHash = await bcrypt.hash(adminPassword, 10);
            const adminId = 'user-initial-admin';

            // Insert User
            await pool.query(`
                INSERT INTO users (id, name, email, password_hash, global_role)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (email) DO UPDATE SET 
                    password_hash = EXCLUDED.password_hash,
                    global_role = 'admin'
            `, [adminId, 'System Admin', adminEmail, passwordHash, 'admin']);

            // Ensure primary email record exists
            await pool.query(`
                INSERT INTO user_emails (id, user_id, email, is_primary, verified_at)
                VALUES ($1, (SELECT id FROM users WHERE email = $2), $2, true, NOW())
                ON CONFLICT (email) DO NOTHING
            `, [`email-admin-${Date.now()}`, adminEmail]);
        }

        // 3. Dummy Data (Only for development)
        if (!isProduction) {
            console.log('Seeding dummy development data...');
            
            // Organizations
            const organizations = [
                {
                  id: "org-1",
                  name: "Springfield High School",
                  supportedSportIds: ["sport-soccer", "sport-rugby", "sport-netball"],
                  primaryColor: "#00ff00",
                  secondaryColor: "#000000",
                  logo: "https://api.dicebear.com/7.x/initials/svg?seed=SHS&backgroundColor=00ff00&textColor=000000",
                  shortName: "SHS",
                  supportedRoleIds: ["role-org-admin", "role-org-member"],
                },
            ];

            for (const org of organizations) {
                await pool.query(`
                    INSERT INTO organizations (id, name, logo, primary_color, secondary_color, supported_sport_ids, short_name, supported_role_ids)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (id) DO NOTHING
                `, [org.id, org.name, org.logo, org.primaryColor, org.secondaryColor, org.supportedSportIds, org.shortName, org.supportedRoleIds]);
            }

            // Venues
            const venues = [
                {
                  id: "venue-1",
                  name: "Main Field",
                  address: "123 School Lane",
                  organizationId: "org-1",
                },
            ];

            for (const venue of venues) {
                await pool.query(`
                    INSERT INTO venues (id, name, address, organization_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (id) DO NOTHING
                `, [venue.id, venue.name, venue.address, venue.organizationId]);
            }

            // Teams
            const teams = [
                {
                  id: "team-1",
                  name: "First XI",
                  ageGroup: "U19",
                  sportId: "sport-soccer",
                  organizationId: "org-1",
                },
                {
                  id: "team-2",
                  name: "U16 A",
                  ageGroup: "U16",
                  sportId: "sport-rugby",
                  organizationId: "org-1",
                },
            ];

            for (const team of teams) {
                await pool.query(`
                    INSERT INTO teams (id, name, age_group, sport_id, organization_id, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (id) DO NOTHING
                `, [team.id, team.name, team.ageGroup, team.sportId, team.organizationId, true]);
            }

            // Persons
            const persons = [
                { id: "p1", name: "Sarah Connor" },
                { id: "p2", name: "Kyle Reese" },
                { id: "p3", name: "John Connor" },
            ];

            for (const person of persons) {
                await pool.query('INSERT INTO persons (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [person.id, person.name]);
            }

            // Organization Memberships
            const orgMembers = [
                { id: "om1", personId: "p1", organizationId: "org-1", roleId: "role-org-admin" },
                { id: "om2", personId: "p2", organizationId: "org-1", roleId: "role-org-member" },
                { id: "om3", personId: "p3", organizationId: "org-1", roleId: "role-org-member" },
            ];

            for (const om of orgMembers) {
                await pool.query(`
                    INSERT INTO organization_memberships (id, person_id, organization_id, role_id, start_date)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (id) DO NOTHING
                `, [om.id, om.personId, om.organizationId, om.roleId]);
            }
        }

        await pool.query('COMMIT');
        console.log('Database seeded successfully.');
        process.exit(0);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error seeding database:', error);
        process.exit(1);
    }
};

seedDb();

