import pool from '../../db';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { SPORT_SEEDS, SYSTEM_SETTINGS_SEEDS } from './seeds';

const seedDb = async () => {
    try {
        console.log('Seeding Database...');
        await pool.query('BEGIN');

        const isProduction = process.env.NODE_ENV === 'production';
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

        // 1. Core Data: Sports (Core even in production)
        const otherSports: any[] = [
            { 
                id: "soccer", 
                name: "Soccer", 
                facilityTerm: "Field", 
                periodTerm: "Half",
                participantType: "TEAM",
                matchTopology: "HEAD_TO_HEAD",
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
                },
                eventTemplates: []
            },
            { id: "netball", name: "Netball", facilityTerm: "Court", periodTerm: "Period", participantType: "TEAM", matchTopology: "HEAD_TO_HEAD", defaultSettings: {}, eventTemplates: [] },
            { id: "hockey", name: "Hockey", facilityTerm: "Field", periodTerm: "Period", participantType: "TEAM", matchTopology: "HEAD_TO_HEAD", defaultSettings: {}, eventTemplates: [] },
            { id: "cricket", name: "Cricket", facilityTerm: "Field", periodTerm: "Period", participantType: "TEAM", matchTopology: "HEAD_TO_HEAD", defaultSettings: {}, eventTemplates: [] },
            { id: "basketball", name: "Basketball", facilityTerm: "Court", periodTerm: "Quarter", participantType: "TEAM", matchTopology: "HEAD_TO_HEAD", defaultSettings: {}, eventTemplates: [] },
        ];
        
        const allSports = [...SPORT_SEEDS, ...otherSports];

        for (const sport of allSports) {
            await pool.query(`
                INSERT INTO sports (id, name, facility_term, period_term, participant_type, match_topology, default_settings, event_templates) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                ON CONFLICT (id) DO UPDATE SET 
                    facility_term = EXCLUDED.facility_term, 
                    period_term = EXCLUDED.period_term,
                    participant_type = EXCLUDED.participant_type,
                    match_topology = EXCLUDED.match_topology,
                    default_settings = EXCLUDED.default_settings,
                    event_templates = EXCLUDED.event_templates
            `, [
                sport.id, 
                sport.name, 
                sport.facilityTerm, 
                sport.periodTerm, 
                sport.participantType || 'TEAM', 
                sport.matchTopology || 'HEAD_TO_HEAD', 
                JSON.stringify(sport.defaultSettings || {}),
                JSON.stringify(sport.eventTemplates || [])
            ]);
        }

        // 1b. Seed System Settings
        for (const setting of SYSTEM_SETTINGS_SEEDS) {
            await pool.query(`
                INSERT INTO system_settings (key, value)
                VALUES ($1, $2)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            `, [setting.key, setting.value]);
        }

        const SYSTEM_ORG_ID = 'org-system-admins';

        // Ensure System Administration Organization exists
        await pool.query(`
            INSERT INTO organizations (id, name, short_name, primary_color, secondary_color, is_active, is_claimed, type)
            VALUES ($1, 'System Administration', 'SYS', '#000000', '#ffffff', true, true, 'ORGANIZATION')
            ON CONFLICT (id) DO NOTHING;
        `, [SYSTEM_ORG_ID]);

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

            // Ensure Admin OrgProfile & OrgMembership exist in System Administration Org
            const profileId = `profile-admin-${adminId}`;
            await pool.query(`
                INSERT INTO org_profiles (id, org_id, user_id, name, email, primary_role_id)
                VALUES ($1, $2, $3, 'System Admin', $4, 'role-org-admin')
                ON CONFLICT (id) DO NOTHING;
            `, [profileId, SYSTEM_ORG_ID, adminId, adminEmail]);

            await pool.query(`
                INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
                VALUES ($1, $2, $3, 'role-org-admin', NOW())
                ON CONFLICT (id) DO NOTHING;
            `, [`mem-admin-${adminId}`, profileId, SYSTEM_ORG_ID]);
        }

        // 3. Dummy Data (Only for development)
        if (!isProduction) {
            console.log('Seeding dummy development data...');
            
            // Organizations
            const organizations: any[] = [
                {
                  id: "org-1",
                  name: "Springfield High School",
                  supported_sport_ids: ["soccer", "rugby", "netball"],
                  primary_color: "#00ff00",
                  secondary_color: "#000000",
                  logo: "https://api.dicebear.com/7.x/initials/svg?seed=SHS&backgroundColor=00ff00&textColor=000000",
                  short_name: "SHS",
                  supported_role_ids: ["role-org-admin", "role-org-member"],
                  is_active: true,
                  is_claimed: true,
                  type: 'SCHOOL'
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
                        short_name, is_claimed, is_active, creator_id, settings,
                        type, custom_type
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        logo = EXCLUDED.logo,
                        primary_color = EXCLUDED.primary_color,
                        secondary_color = EXCLUDED.secondary_color,
                        short_name = EXCLUDED.short_name,
                        is_claimed = EXCLUDED.is_claimed,
                        is_active = EXCLUDED.is_active,
                        creator_id = EXCLUDED.creator_id,
                        settings = EXCLUDED.settings,
                        type = EXCLUDED.type,
                        custom_type = EXCLUDED.custom_type
                `, [
                    org.id, 
                    org.name, 
                    org.logo, 
                    org.primary_color || org.primaryColor, 
                    org.secondary_color || org.secondaryColor, 
                    org.short_name || org.shortName, 
                    org.is_claimed ?? false,
                    org.is_active ?? true,
                    org.creator_id ?? null,
                    org.settings ?? '{}',
                    org.type || 'OTHER',
                    org.custom_type || org.customType || null
                ]);

                // Seed organization_sports
                const sports = org.supported_sport_ids || org.supportedSportIds || [];
                for (const sportId of sports) {
                    await pool.query(`
                        INSERT INTO organization_sports (org_id, sport_id)
                        VALUES ($1, $2)
                        ON CONFLICT DO NOTHING
                    `, [org.id, sportId]);
                }

                // Seed organization_roles
                const roles = org.supported_role_ids || org.supportedRoleIds || [];
                for (const roleId of roles) {
                    await pool.query(`
                        INSERT INTO organization_roles (org_id, role_id)
                        VALUES ($1, $2)
                        ON CONFLICT DO NOTHING
                    `, [org.id, roleId]);
                }
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
                    INSERT INTO facilities (id, name, site_id)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (id) DO NOTHING
                `, [facility.id, facility.name, facility.siteId]);

                if (facility.primarySportId) {
                    await pool.query(`
                        INSERT INTO facility_sports (facility_id, sport_id)
                        VALUES ($1, $2)
                        ON CONFLICT DO NOTHING
                    `, [facility.id, facility.primarySportId]);
                }
            }

            // Teams
            const teams = [
                {
                  id: "team-1",
                  name: "First XI",
                  ageGroup: "U19",
                  sportId: "soccer",
                  orgId: "org-1",
                },
                {
                  id: "team-2",
                  name: "U16 A",
                  ageGroup: "U16",
                  sportId: "rugby",
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

