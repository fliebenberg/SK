import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { SPORT_SEEDS, SYSTEM_SETTINGS_SEEDS } from './seeds';
import { STARTER_AGE_GROUPS, starterAgeGroupId } from './ageGroupSeed';

/**
 * The core tier: everything the app needs in order to work, and nothing that exists only to have
 * something to look at. Safe for production. Sports and their event templates, the starter age
 * groups, system settings, the System Administration organisation, and the initial admin account
 * when `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` are set.
 *
 * Idempotent: re-running it updates sports and settings in place and leaves everything else alone.
 * Runs inside the caller's transaction.
 */
export async function seedCore(client: PoolClient): Promise<void> {
    // 1. Sports
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
        { id: "hockey", name: "Hockey", facilityTerm: "Field", periodTerm: "Period", participantType: "TEAM", matchTopology: "HEAD_TO_HEAD", defaultSettings: {}, eventTemplates: [] },
        { id: "cricket", name: "Cricket", facilityTerm: "Field", periodTerm: "Period", participantType: "TEAM", matchTopology: "HEAD_TO_HEAD", defaultSettings: {}, eventTemplates: [] },
        { id: "basketball", name: "Basketball", facilityTerm: "Court", periodTerm: "Quarter", participantType: "TEAM", matchTopology: "HEAD_TO_HEAD", defaultSettings: {}, eventTemplates: [] },
    ];

    const allSports = [...SPORT_SEEDS, ...otherSports];

    for (const sport of allSports) {
        await client.query(`
            INSERT INTO sports (id, name, facility_term, period_term, participant_type, match_topology, default_settings, event_sections, event_templates)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
                facility_term = EXCLUDED.facility_term,
                period_term = EXCLUDED.period_term,
                participant_type = EXCLUDED.participant_type,
                match_topology = EXCLUDED.match_topology,
                default_settings = EXCLUDED.default_settings,
                event_sections = EXCLUDED.event_sections,
                event_templates = EXCLUDED.event_templates
        `, [
            sport.id,
            sport.name,
            sport.facilityTerm,
            sport.periodTerm,
            sport.participantType || 'TEAM',
            sport.matchTopology || 'HEAD_TO_HEAD',
            JSON.stringify(sport.defaultSettings || {}),
            JSON.stringify(sport.eventSections || []),
            JSON.stringify(sport.eventTemplates || [])
        ]);
    }

    // 2. Every sport starts with the starter official age-group list; an admin edits it in the
    // sport editor. Existing rows are left alone, so re-seeding never undoes that editing.
    for (const sport of allSports) {
        for (let i = 0; i < STARTER_AGE_GROUPS.length; i++) {
            await client.query(`
                INSERT INTO sport_age_groups (id, sport_id, name, sort_order, is_official)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT DO NOTHING
            `, [starterAgeGroupId(sport.id, STARTER_AGE_GROUPS[i]), sport.id, STARTER_AGE_GROUPS[i], i]);
        }
    }

    // 3. System settings
    for (const setting of SYSTEM_SETTINGS_SEEDS) {
        await client.query(`
            INSERT INTO system_settings (key, value)
            VALUES ($1, $2)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `, [setting.key, setting.value]);
    }

    // 4. The System Administration organisation — membership in it is what makes a global admin.
    const SYSTEM_ORG_ID = 'org-system-admins';
    await client.query(`
        INSERT INTO organizations (id, name, short_name, primary_color, secondary_color, is_active, is_claimed, type)
        VALUES ($1, 'System Administration', 'SYS', '#000000', '#ffffff', true, true, 'ORGANIZATION')
        ON CONFLICT (id) DO NOTHING;
    `, [SYSTEM_ORG_ID]);

    // 5. The initial app admin, when the environment names one.
    const adminEmail = process.env.INITIAL_ADMIN_EMAIL;
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
        console.log(`Ensuring initial admin exists: ${adminEmail}`);
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        const adminId = 'user-initial-admin';

        await client.query(`
            INSERT INTO users (id, name, email, password_hash, global_role)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (email) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                global_role = 'admin'
        `, [adminId, 'System Admin', adminEmail, passwordHash, 'admin']);

        await client.query(`
            INSERT INTO user_emails (id, user_id, email, is_primary, verified_at)
            VALUES ($1, (SELECT id FROM users WHERE email = $2), $2, true, NOW())
            ON CONFLICT DO NOTHING
        `, ['email-initial-admin', adminEmail]);

        const profileId = `profile-admin-${adminId}`;
        await client.query(`
            INSERT INTO org_profiles (id, org_id, user_id, name, email, primary_role_id)
            VALUES ($1, $2, $3, 'System Admin', $4, 'role-org-admin')
            ON CONFLICT (id) DO NOTHING;
        `, [profileId, SYSTEM_ORG_ID, adminId, adminEmail]);

        await client.query(`
            INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
            VALUES ($1, $2, $3, 'role-org-admin', NOW())
            ON CONFLICT (id) DO NOTHING;
        `, [`mem-admin-${adminId}`, profileId, SYSTEM_ORG_ID]);
    }
}
