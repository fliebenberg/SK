import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { starterAgeGroupId } from '../ageGroupSeed';
import {
    FIXTURE_ACCOUNTS_CREATED,
    FIXTURE_MEMBERSHIP_START,
    FIXTURE_ORG_ROLES,
    FIXTURE_PASSWORD,
    FIXTURE_PASSWORD_HASH,
    FixturePerson,
    FixturePlayer,
    TEST_ORGS,
    fixtureIds,
} from './testOrgs';

/** Every row the test organisations own has an id, or an `…_id`, starting with this. */
const FIXTURE_PREFIX = 'fx-';

export interface FixtureCounts {
    [table: string]: number;
}

/** Prints a table-by-table row count. */
export const printCounts = (label: string, counts: FixtureCounts) => {
    const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return console.log(`${label}: nothing`);
    console.log(`${label}:`);
    for (const [table, n] of entries) console.log(`  ${table.padEnd(28)} ${n}`);
};

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The i-th player's birthday in their team's birth year — spread over the year, never random. */
const birthdate = (year: number, index: number) =>
    `${year}-${pad((index % 12) + 1)}-${pad(((index * 5) % 28) + 1)}`;

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Deletes the test organisations and everything that hangs off them — including rows made through
 * the app afterwards, such as an event a test org hosted or a game a test team played in.
 *
 * It does not keep a list of tables, because that list is what went stale in
 * `cleanup-test-orgs.ts`. Two rules instead, both read from the catalogue:
 *
 * 1. **Roots.** Any row whose `id`, or any text column named `…_id`, starts with `fx-`. That finds
 *    fixture rows themselves and rows that point at them, whether or not the column has a foreign
 *    key — which matters, because a database built by migrations is missing some that `init-db.ts`
 *    declares (`DB-1`).
 * 2. **Dependants.** Before a row is deleted, whatever references it through a foreign key is
 *    deleted first, recursively. `ON DELETE SET NULL` references are left for Postgres to clear.
 *
 * A column whose foreign key is `SET NULL` is not used as a root either: a custom age group
 * created by a test org (`sport_age_groups.created_org_id`) may be in use by other teams, and the
 * schema already says the right answer there is to forget who created it.
 *
 * Runs inside the caller's transaction.
 */
export async function deleteFixtureData(client: PoolClient): Promise<FixtureCounts> {
    const fkRes = await client.query(`
        SELECT con.conrelid::regclass::text AS child,
               con.confrelid::regclass::text AS parent,
               con.confdeltype AS on_delete,
               array_agg(ca.attname ORDER BY k.ord)::text[] AS child_cols,
               array_agg(pa.attname ORDER BY k.ord)::text[] AS parent_cols
        FROM pg_constraint con
        CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(ck, pk, ord)
        JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = k.ck
        JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = k.pk
        WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
        GROUP BY con.oid, con.conrelid, con.confrelid, con.confdeltype
    `);

    type Fk = { child: string; parent: string; on_delete: string; child_cols: string[]; parent_cols: string[] };
    const fks = fkRes.rows as Fk[];
    const nullsItself = (fk: Fk) => fk.on_delete === 'n' || fk.on_delete === 'd';

    const referencedBy = new Map<string, Fk[]>();
    for (const fk of fks) {
        if (nullsItself(fk)) continue;
        referencedBy.set(fk.parent, [...(referencedBy.get(fk.parent) || []), fk]);
    }
    const setNullColumns = new Set(
        fks.filter(fk => nullsItself(fk) && fk.child_cols.length === 1).map(fk => `${fk.child}.${fk.child_cols[0]}`)
    );

    const counts: FixtureCounts = {};

    const deleteRows = async (table: string, where: string, depth: number): Promise<void> => {
        if (depth > 12) throw new Error(`Fixture delete recursed too deep at ${table}: is there a foreign key cycle?`);
        for (const fk of referencedBy.get(table) || []) {
            const childCols = fk.child_cols.map(quoteIdent).join(', ');
            const parentCols = fk.parent_cols.map(quoteIdent).join(', ');
            await deleteRows(
                fk.child,
                `(${childCols}) IN (SELECT ${parentCols} FROM ${quoteIdent(table)} WHERE ${where})`,
                depth + 1
            );
        }
        const res = await client.query(`DELETE FROM ${quoteIdent(table)} WHERE ${where}`);
        if (res.rowCount) counts[table] = (counts[table] || 0) + res.rowCount;
    };

    const rootRes = await client.query(`
        SELECT c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND c.data_type IN ('text', 'character varying')
          AND (c.column_name = 'id' OR c.column_name LIKE '%\\_id')
        ORDER BY c.table_name, c.column_name
    `);

    for (const { table_name, column_name } of rootRes.rows) {
        if (setNullColumns.has(`${table_name}.${column_name}`)) continue;
        await deleteRows(table_name, `${quoteIdent(column_name)} LIKE '${FIXTURE_PREFIX}%'`, 0);
    }

    return counts;
}

/**
 * Inserts the test organisations from `testOrgs.ts`. Expects none of their rows to exist yet —
 * call `deleteFixtureData` first — so a leftover row fails the load rather than being silently
 * kept. Runs inside the caller's transaction.
 */
export async function loadTestOrgs(client: PoolClient): Promise<FixtureCounts> {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Refusing to load the test organisations into a production database.');
    }
    if (!bcrypt.compareSync(FIXTURE_PASSWORD, FIXTURE_PASSWORD_HASH)) {
        throw new Error('FIXTURE_PASSWORD_HASH no longer matches FIXTURE_PASSWORD. Regenerate the hash.');
    }

    const counts: FixtureCounts = {};
    const insert = async (table: string, columns: string[], values: unknown[]) => {
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
        counts[table] = (counts[table] || 0) + 1;
    };

    // Accounts first: one person can hold a profile in two organisations with one login.
    const accounts = new Map<string, FixturePerson>();
    for (const org of TEST_ORGS) {
        const people: FixturePerson[] = [
            org.admin,
            ...org.staff,
            ...org.teams.flatMap(t => [t.coach, ...t.players.filter((p): p is FixturePlayer => typeof p !== 'string')]),
        ];
        for (const person of people.filter(p => p.account)) {
            if (!person.email) throw new Error(`${person.name} has an account but no email.`);
            const id = fixtureIds.user(person.name);
            const seen = accounts.get(id);
            if (seen && seen.email !== person.email) {
                throw new Error(`${person.name} is listed twice with different emails (${seen.email}, ${person.email}).`);
            }
            accounts.set(id, person);
        }
    }

    for (const [userId, person] of accounts) {
        const email = person.email!.toLowerCase();
        await insert('users',
            ['id', 'name', 'email', 'email_verified', 'password_hash', 'global_role', 'created_at', 'updated_at'],
            [userId, person.name, email, FIXTURE_ACCOUNTS_CREATED, FIXTURE_PASSWORD_HASH, 'user', FIXTURE_ACCOUNTS_CREATED, FIXTURE_ACCOUNTS_CREATED]);
        await insert('user_emails',
            ['id', 'user_id', 'email', 'is_primary', 'verified_at', 'created_at'],
            [fixtureIds.userEmail(person.name), userId, email, true, FIXTURE_ACCOUNTS_CREATED, FIXTURE_ACCOUNTS_CREATED]);
    }

    for (const org of TEST_ORGS) {
        const orgId = fixtureIds.org(org.key);
        const addressId = fixtureIds.address(org.key);
        const siteId = fixtureIds.site(org.key);
        const a = org.address;
        const sportIds = [...new Set(org.teams.map(t => t.sportId))];

        await insert('addresses',
            ['id', 'full_address', 'address_line_1', 'city', 'province', 'postal_code', 'country', 'latitude', 'longitude'],
            [addressId, `${a.line1}, ${a.city}, ${a.postalCode}, South Africa`, a.line1, a.city, a.province, a.postalCode, 'South Africa', a.latitude, a.longitude]);

        await insert('organizations',
            ['id', 'name', 'logo', 'primary_color', 'secondary_color', 'short_name', 'is_claimed', 'creator_id', 'is_active', 'settings', 'address_id', 'type'],
            [orgId, org.name, null, org.primaryColor, org.secondaryColor, org.shortName, true,
             org.admin.account ? fixtureIds.user(org.admin.name) : null, true, { allowUserImageUpdates: false }, addressId, org.type]);

        for (const sportId of sportIds) {
            await insert('organization_sports', ['org_id', 'sport_id'], [orgId, sportId]);
        }
        for (const roleId of FIXTURE_ORG_ROLES) {
            await insert('organization_roles', ['org_id', 'role_id'], [orgId, roleId]);
        }

        await insert('sites', ['id', 'name', 'address_id', 'org_id', 'is_active'], [siteId, org.site.name, addressId, orgId, true]);

        for (const [i, facility] of org.site.facilities.entries()) {
            const facilityId = fixtureIds.facility(org.key, facility.key);
            await insert('facilities',
                ['id', 'name', 'site_id', 'latitude', 'longitude', 'is_active', 'category', 'primary_sport_id'],
                [facilityId, facility.name, siteId, a.latitude + 0.0008 * (i + 1), a.longitude + 0.0006 * (i + 1), true, 'sport_field', facility.sportId]);
            await insert('facility_sports', ['facility_id', 'sport_id'], [facilityId, facility.sportId]);
        }

        // People, numbered in the order they are listed: that number is their identifier (a
        // student or staff number), which org_profiles requires to be unique per organisation.
        const profiles = new Map<string, string>();
        let sequence = 0;
        const addPerson = async (person: FixturePerson, orgRoleId: string, extra: { birthdate?: string; left?: string } = {}) => {
            const profileId = fixtureIds.profile(org.key, person.name);
            if (profiles.has(person.name)) throw new Error(`${person.name} is listed twice in ${org.name}.`);
            profiles.set(person.name, profileId);
            sequence += 1;

            await insert('org_profiles',
                ['id', 'org_id', 'user_id', 'name', 'email', 'birthdate', 'identifier', 'primary_role_id'],
                [profileId, orgId, person.account ? fixtureIds.user(person.name) : null, person.name,
                 person.email?.toLowerCase() ?? null, extra.birthdate ?? null, `${org.shortName}${pad(sequence, 4)}`, orgRoleId]);
            await insert('org_memberships',
                ['id', 'org_profile_id', 'org_id', 'role_id', 'start_date', 'end_date'],
                [fixtureIds.orgMembership(org.key, person.name), profileId, orgId, orgRoleId, FIXTURE_MEMBERSHIP_START, extra.left ?? null]);
            return profileId;
        };

        await addPerson(org.admin, 'role-org-admin');
        for (const person of org.staff) await addPerson(person, 'role-org-staff');

        for (const team of org.teams) {
            const teamId = fixtureIds.team(org.key, team.key);
            await insert('teams',
                ['id', 'name', 'sport_id', 'age_group_id', 'org_id', 'is_active'],
                [teamId, team.name, team.sportId, starterAgeGroupId(team.sportId, team.ageGroup), orgId, true]);

            const addToTeam = async (person: FixturePerson, profileId: string, roleId: string, left?: string) =>
                insert('team_memberships',
                    ['id', 'org_profile_id', 'team_id', 'role_id', 'start_date', 'end_date'],
                    [fixtureIds.teamMembership(org.key, team.key, person.name), profileId, teamId, roleId, FIXTURE_MEMBERSHIP_START, left ?? null]);

            const coachProfile = await addPerson(team.coach, 'role-org-member');
            await addToTeam(team.coach, coachProfile, 'role-coach');

            for (const [i, entry] of team.players.entries()) {
                const player: FixturePlayer = typeof entry === 'string' ? { name: entry } : entry;
                const profileId = await addPerson(player, 'role-org-member', { birthdate: birthdate(team.birthYear, i), left: player.left });
                await addToTeam(player, profileId, 'role-player', player.left);
            }
        }
    }

    return counts;
}
