import pool from '../../db';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const seedDb = async () => {
    try {
        console.log('Seeding Database...');
        await pool.query('BEGIN');

        const isProduction = process.env.NODE_ENV === 'production';
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

        // 1. Core Data: Sports (Core even in production)
        const sports = [
            { 
                id: "sport-soccer", 
                name: "Soccer", 
                facilityTerm: "Field", 
                periodTerm: "Half",
                defaultSettings: {
                    maxReserves: 5,
                    positions: [
                        { id: "GK", name: "Goalkeeper" },
                        { id: "DF1", name: "Defender" },
                        { id: "DF2", name: "Defender" },
                        { id: "DF3", name: "Defender" },
                        { id: "DF4", name: "Defender" },
                        { id: "MF1", name: "Midfielder" },
                        { id: "MF2", name: "Midfielder" },
                        { id: "MF3", name: "Midfielder" },
                        { id: "FW1", name: "Forward" },
                        { id: "FW2", name: "Forward" },
                        { id: "FW3", name: "Forward" }
                    ]
                }
            },
            { 
                id: "sport-rugby", 
                name: "Rugby", 
                facilityTerm: "Field", 
                periodTerm: "Half",
                defaultSettings: {
                    maxReserves: 8,
                    positions: [
                        { id: "1", name: "Loosehead Prop" },
                        { id: "2", name: "Hooker" },
                        { id: "3", name: "Tighthead Prop" },
                        { id: "4", name: "Lock" },
                        { id: "5", name: "Lock" },
                        { id: "6", name: "Blindside Flanker" },
                        { id: "7", name: "Openside Flanker" },
                        { id: "8", name: "Number 8" },
                        { id: "9", name: "Scrum-half" },
                        { id: "10", name: "Fly-half" },
                        { id: "11", name: "Left Wing" },
                        { id: "12", name: "Inside Center" },
                        { id: "13", name: "Outside Center" },
                        { id: "14", name: "Right Wing" },
                        { id: "15", name: "Full-back" }
                    ]
                }
            },
            { id: "sport-netball", name: "Netball", facilityTerm: "Court", periodTerm: "Period" },
            { id: "sport-hockey", name: "Hockey", facilityTerm: "Field", periodTerm: "Period" },
            { id: "sport-cricket", name: "Cricket", facilityTerm: "Field", periodTerm: "Period" },
            { id: "sport-basketball", name: "Basketball", facilityTerm: "Court", periodTerm: "Quarter" },
        ];
        
        for (const sport of sports) {
            await pool.query(`
                INSERT INTO sports (id, name, facility_term, period_term, default_settings) 
                VALUES ($1, $2, $3, $4, $5) 
                ON CONFLICT (id) DO UPDATE SET 
                    facility_term = EXCLUDED.facility_term, 
                    period_term = EXCLUDED.period_term,
                    default_settings = EXCLUDED.default_settings
            `, [sport.id, sport.name, sport.facilityTerm, sport.periodTerm, JSON.stringify(sport.defaultSettings || {})]);
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
            const organizations: any[] = [
                {
                  id: "org-1",
                  name: "Springfield High School",
                  supported_sport_ids: ["sport-soccer", "sport-rugby", "sport-netball"],
                  primary_color: "#00ff00",
                  secondary_color: "#000000",
                  logo: "https://api.dicebear.com/7.x/initials/svg?seed=SHS&backgroundColor=00ff00&textColor=000000",
                  short_name: "SHS",
                  supported_role_ids: ["role-org-admin", "role-org-member"],
                  is_active: true,
                  is_claimed: true
                },
            ];

            // Try to load additional organizations from local extraction
            const extractedPath = path.resolve(__dirname, '../../../data/existing_orgs.json');
            if (fs.existsSync(extractedPath)) {
                try {
                    const extraOrgs = JSON.parse(fs.readFileSync(extractedPath, 'utf8'));
                    console.log(`Loading ${extraOrgs.length} additional organizations...`);
                    for (const org of extraOrgs) {
                        // Avoid duplicates with our static list if IDs match
                        if (!organizations.find(o => o.id === org.id)) {
                            organizations.push(org);
                        }
                    }
                } catch (e) {
                    console.error('Failed to load extra orgs:', e);
                }
            }

            for (const org of organizations) {
                await pool.query(`
                    INSERT INTO organizations (
                        id, name, logo, primary_color, secondary_color, 
                        supported_sport_ids, short_name, supported_role_ids, 
                        is_claimed, is_active, creator_id, settings
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        logo = EXCLUDED.logo,
                        primary_color = EXCLUDED.primary_color,
                        secondary_color = EXCLUDED.secondary_color,
                        supported_sport_ids = EXCLUDED.supported_sport_ids,
                        short_name = EXCLUDED.short_name,
                        supported_role_ids = EXCLUDED.supported_role_ids,
                        is_claimed = EXCLUDED.is_claimed,
                        is_active = EXCLUDED.is_active,
                        creator_id = EXCLUDED.creator_id,
                        settings = EXCLUDED.settings
                `, [
                    org.id, 
                    org.name, 
                    org.logo, 
                    org.primary_color || org.primaryColor, 
                    org.secondary_color || org.secondaryColor, 
                    org.supported_sport_ids || org.supportedSportIds, 
                    org.short_name || org.shortName, 
                    org.supported_role_ids || org.supportedRoleIds,
                    org.is_claimed ?? false,
                    org.is_active ?? true,
                    org.creator_id ?? null,
                    org.settings ?? '{}'
                ]);
            }

            // Sites
            const sites = [
                {
                  id: "site-1",
                  name: "Main Campus",
                  orgId: "org-1",
                },
            ];

            for (const site of sites) {
                await pool.query(`
                    INSERT INTO sites (id, name, org_id)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (id) DO NOTHING
                `, [site.id, site.name, site.orgId]);
            }

            // Facilities
            const facilities = [
                {
                  id: "facility-1",
                  name: "Main Field",
                  siteId: "site-1",
                  primarySportId: "sport-soccer"
                },
                {
                  id: "facility-2",
                  name: "Court 1",
                  siteId: "site-1",
                  primarySportId: "sport-netball"
                },
            ];

            for (const facility of facilities) {
                await pool.query(`
                    INSERT INTO facilities (id, name, site_id, primary_sport_id)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (id) DO NOTHING
                `, [facility.id, facility.name, facility.siteId, facility.primarySportId]);
            }

            // Teams
            const teams = [
                {
                  id: "team-1",
                  name: "First XI",
                  ageGroup: "U19",
                  sportId: "sport-soccer",
                  orgId: "org-1",
                },
                {
                  id: "team-2",
                  name: "U16 A",
                  ageGroup: "U16",
                  sportId: "sport-rugby",
                  orgId: "org-1",
                },
            ];

            for (const team of teams) {
                await pool.query(`
                    INSERT INTO teams (id, name, age_group, sport_id, org_id, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (id) DO NOTHING
                `, [team.id, team.name, team.ageGroup, team.sportId, team.orgId, true]);
            }

            // Org Profiles
            const orgProfiles = [
                { id: "p1", name: "Sarah Connor", orgId: "org-1" },
                { id: "p2", name: "Kyle Reese", orgId: "org-1" },
                { id: "p3", name: "John Connor", orgId: "org-1" },
            ];

            for (const profile of orgProfiles) {
                await pool.query('INSERT INTO org_profiles (id, name, org_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [profile.id, profile.name, profile.orgId]);
            }

            // Organization Memberships
            const orgMembers = [
                { id: "om1", profileId: "p1", orgId: "org-1", roleId: "role-org-admin" },
                { id: "om2", profileId: "p2", orgId: "org-1", roleId: "role-org-member" },
                { id: "om3", profileId: "p3", orgId: "org-1", roleId: "role-org-member" },
            ];

            for (const om of orgMembers) {
                await pool.query(`
                    INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (id) DO NOTHING
                `, [om.id, om.profileId, om.orgId, om.roleId]);
            }
        }

        await pool.query('COMMIT');
        console.log('Database seeded successfully.');

        // 4. Trigger Server Cache Reset
        const PORT = process.env.PORT || 3001;
        try {
            const { io } = require('socket.io-client');
            const { SocketAction } = require('@sk/types');
            const socket = io(`http://localhost:${PORT}`);
            
            socket.on('connect', () => {
                console.log('Connected to server, triggering cache reset...');
                socket.emit('action', { type: SocketAction.RESET_CACHE }, (response: any) => {
                    console.log('Server response:', response);
                    socket.disconnect();
                    process.exit(0);
                });
            });

            socket.on('connect_error', () => {
                console.log('Server not running or unreachable. Skipping cache reset.');
                process.exit(0);
            });

            // Fallback timeout
            setTimeout(() => {
                console.log('Cache reset timeout. Exiting.');
                process.exit(0);
            }, 5000);

        } catch (e) {
            console.log('Could not notify server (socket.io-client might be missing). Skipping cache reset.');
            process.exit(0);
        }

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error seeding database:', error);
        process.exit(1);
    }
};

seedDb();

