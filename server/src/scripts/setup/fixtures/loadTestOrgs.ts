import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import type { PoolClient } from 'pg';
import { imageService, type ImageFolder } from '../../../services/ImageService';
import { starterAgeGroupId } from '../ageGroupSeed';
import { Booking, dayWindows, fixtureMinutes, planDivision, sharedGroundMap, timeOfDay, zonedInputsToInstant } from '@sk/shared';
import {
    FIXTURE_ACCOUNTS_CREATED,
    FIXTURE_MEMBERSHIP_START,
    FIXTURE_ORG_ROLES,
    FIXTURE_PASSWORD,
    FIXTURE_PASSWORD_HASH,
    FixtureFacility,
    FixtureOrg,
    FixturePerson,
    FixturePlayer,
    TEST_ORGS,
    fixtureIds,
    TEST_TOURNAMENTS,
} from './testOrgs';

/** A pinned test site's timezone, as the server would find it from the pin (`DATE-2`). */
const SITE_TIMEZONE = 'Africa/Johannesburg';

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

const IMAGES_DIR = path.join(__dirname, 'images');

/**
 * Writes a fixture image to asset storage, as an upload would be stored, and returns its stored name.
 * The name is fixed, so a reload overwrites the same files. Files are written outside the
 * transaction: a load that rolls back leaves them, unlinked but harmless, for the next one to reuse.
 */
const fixtureImageWriter = () => {
    const written = new Map<string, Promise<string>>();
    return (folder: ImageFolder, file: string, name: string) => {
        if (!written.has(name)) {
            written.set(name, fs.readFile(path.join(IMAGES_DIR, file)).then(async source => {
                await imageService.writeTiers(folder, name, source);
                return name;
            }));
        }
        return written.get(name)!;
    };
};

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
    const writeImage = fixtureImageWriter();
    const photo = (person: FixturePerson) =>
        person.photo ? writeImage('profiles', person.photo, fixtureIds.photoImage(person.photo)) : Promise.resolve(null);
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
            ...org.teams.flatMap(t => [...(t.coach ? [t.coach] : []), ...t.players.filter((p): p is FixturePlayer => typeof p !== 'string')]),
            ...(org.members || []),
            ...(org.guardians || []),
        ];
        for (const person of people.filter(p => p.account)) {
            if (!person.email) throw new Error(`${person.name} has an account but no email.`);
            const id = fixtureIds.user(person.name);
            const seen = accounts.get(id);
            if (seen && seen.email !== person.email) {
                throw new Error(`${person.name} is listed twice with different emails (${seen.email}, ${person.email}).`);
            }
            // Their photo in any organisation is also their account's own picture.
            accounts.set(id, { ...person, photo: person.photo || seen?.photo });
        }
    }

    for (const [userId, person] of accounts) {
        const email = person.email!.toLowerCase();
        await insert('users',
            ['id', 'name', 'email', 'email_verified', 'password_hash', 'global_role', 'created_at', 'updated_at', 'custom_image'],
            [userId, person.name, email, FIXTURE_ACCOUNTS_CREATED, FIXTURE_PASSWORD_HASH, 'user', FIXTURE_ACCOUNTS_CREATED, FIXTURE_ACCOUNTS_CREATED, await photo(person)]);
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

        const insertAddress = (id: string, at: FixtureOrg['address']) => insert('addresses',
            ['id', 'full_address', 'address_line_1', 'address_line_2', 'city', 'province', 'postal_code', 'country', 'latitude', 'longitude'],
            [id, [at.line1, at.suburb, at.city, at.postalCode, 'South Africa'].filter(Boolean).join(', '), at.line1, at.suburb || null, at.city, at.province, at.postalCode, 'South Africa', at.latitude, at.longitude]);
        await insertAddress(addressId, a);

        await insert('organizations',
            ['id', 'name', 'logo', 'primary_color', 'secondary_color', 'short_name', 'is_claimed', 'creator_id', 'is_active', 'settings', 'address_id', 'type'],
            [orgId, org.name, org.logo ? await writeImage('logos', org.logo, fixtureIds.logoImage(org.key)) : null, org.primaryColor, org.secondaryColor, org.shortName, true,
             org.admin.account ? fixtureIds.user(org.admin.name) : null, true, { allowUserImageUpdates: false }, addressId, org.type]);

        for (const sportId of sportIds) {
            await insert('organization_sports', ['org_id', 'sport_id'], [orgId, sportId]);
        }
        for (const roleId of FIXTURE_ORG_ROLES) {
            await insert('organization_roles', ['org_id', 'role_id'], [orgId, roleId]);
        }

        // Each facility's pin a step from its site's, so they spread out on the map.
        const insertFacilities = async (forSiteId: string, idPrefix: string, at: { latitude: number; longitude: number } | null, facilities: FixtureFacility[]) => {
            for (const [i, facility] of facilities.entries()) {
                const facilityId = fixtureIds.facility(org.key, idPrefix + facility.key);
                await insert('facilities',
                    ['id', 'name', 'site_id', 'latitude', 'longitude', 'is_active', 'category', 'primary_sport_id'],
                    [facilityId, facility.name, forSiteId, at ? at.latitude + 0.0008 * (i + 1) : null, at ? at.longitude + 0.0006 * (i + 1) : null,
                     !facility.inactive, facility.category || 'sport_field', facility.sportId || null]);
                if (facility.sportId) await insert('facility_sports', ['facility_id', 'sport_id'], [facilityId, facility.sportId]);
            }
            // D34: each pair once, smaller id first, as `setSharedGround` writes it.
            for (const facility of facilities) {
                for (const otherKey of facility.sharesGroundWith || []) {
                    if (!facilities.some(f => f.key === otherKey)) throw new Error(`${facility.name} shares ground with ${otherKey}, which is not at its site.`);
                    const [x, y] = [fixtureIds.facility(org.key, idPrefix + facility.key), fixtureIds.facility(org.key, idPrefix + otherKey)].sort();
                    await client.query(`INSERT INTO facility_shared_ground (facility_id, other_facility_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [x, y]);
                    counts.facility_shared_ground = (counts.facility_shared_ground || 0) + 1;
                }
            }
        };

        // The timezone the server would look up from the pin; every test organisation is in South Africa.
        await insert('sites', ['id', 'name', 'address_id', 'org_id', 'is_active', 'timezone'], [siteId, org.site.name, addressId, orgId, true, SITE_TIMEZONE]);
        await insertFacilities(siteId, '', a, org.site.facilities);

        for (const extra of org.extraSites || []) {
            const extraId = fixtureIds.extraSite(org.key, extra.key);
            const extraAddressId = extra.address ? fixtureIds.extraSiteAddress(org.key, extra.key) : null;
            if (extra.address && extraAddressId) await insertAddress(extraAddressId, extra.address);
            await insert('sites', ['id', 'name', 'address_id', 'org_id', 'is_active', 'timezone'], [extraId, extra.name, extraAddressId, orgId, !extra.inactive, extra.address ? SITE_TIMEZONE : null]);
            await insertFacilities(extraId, `${extra.key}-`, extra.address || null, extra.facilities);
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
                ['id', 'org_id', 'user_id', 'name', 'email', 'birthdate', 'identifier', 'primary_role_id', 'image'],
                [profileId, orgId, person.account ? fixtureIds.user(person.name) : null, person.name,
                 person.email?.toLowerCase() ?? null, extra.birthdate ?? null, `${org.shortName}${pad(sequence, 4)}`, orgRoleId, await photo(person)]);
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
                ['id', 'name', 'short_name', 'sport_id', 'age_group_id', 'org_id', 'is_active'],
                [teamId, team.name, team.shortName ?? null, team.sportId, starterAgeGroupId(team.sportId, team.ageGroup), orgId, !team.inactive]);

            const addToTeam = async (person: FixturePerson, profileId: string, roleId: string, left?: string) =>
                insert('team_memberships',
                    ['id', 'org_profile_id', 'team_id', 'role_id', 'start_date', 'end_date'],
                    [fixtureIds.teamMembership(org.key, team.key, person.name), profileId, teamId, roleId, FIXTURE_MEMBERSHIP_START, left ?? null]);

            if (team.coach) {
                const coachProfile = await addPerson(team.coach, 'role-org-member');
                await addToTeam(team.coach, coachProfile, 'role-coach');
            }

            for (const [i, entry] of team.players.entries()) {
                const player: FixturePlayer = typeof entry === 'string' ? { name: entry } : entry;
                const profileId = await addPerson(player, 'role-org-member', { birthdate: birthdate(team.birthYear, i), left: player.left });
                await addToTeam(player, profileId, 'role-player', player.left);
            }
        }

        // After the teams, so nobody listed above gets a different org ID.
        for (const member of org.members || []) {
            await addPerson(member, member.role, { birthdate: member.birthdate });
        }

        // A guardian already listed here is linked through that profile. Anyone else gets a
        // profile with no membership and no org ID — being a guardian is the link, not a role.
        for (const guardian of org.guardians || []) {
            let guardianId = profiles.get(guardian.name);
            if (!guardianId) {
                guardianId = fixtureIds.profile(org.key, guardian.name);
                profiles.set(guardian.name, guardianId);
                await insert('org_profiles',
                    ['id', 'org_id', 'user_id', 'name', 'email', 'cellphone', 'birthdate', 'identifier', 'primary_role_id', 'image'],
                    [guardianId, orgId, guardian.account ? fixtureIds.user(guardian.name) : null, guardian.name,
                     guardian.email?.toLowerCase() ?? null, guardian.cellphone ?? null, null, null, null, await photo(guardian)]);
            }
            for (const child of guardian.children) {
                const childId = profiles.get(child.name);
                if (!childId) throw new Error(`${guardian.name} is the guardian of ${child.name}, who is not listed in ${org.name}.`);
                await insert('profile_guardians',
                    ['id', 'org_id', 'guardian_profile_id', 'player_profile_id', 'relationship', 'is_primary', 'start_date', 'end_date'],
                    [fixtureIds.guardianLink(org.key, guardian.name, child.name), orgId, guardianId, childId,
                     child.relationship, child.primary ?? false, FIXTURE_MEMBERSHIP_START, child.ended ?? null]);
            }
        }

        // Staff beyond each team's coach, from people already listed — nobody new, so no org ID moves.
        for (const extra of org.teamStaff || []) {
            const profileId = profiles.get(extra.name);
            if (!profileId) throw new Error(`${extra.name} is on ${extra.team}'s staff but not listed in ${org.name}.`);
            if (!org.teams.some(t => t.key === extra.team)) throw new Error(`${org.name} has no team ${extra.team}.`);
            await insert('team_memberships',
                ['id', 'org_profile_id', 'team_id', 'role_id', 'start_date', 'end_date'],
                [fixtureIds.teamMembership(org.key, extra.team, extra.name), profileId, fixtureIds.team(org.key, extra.team), extra.role, FIXTURE_MEMBERSHIP_START, null]);
        }
    }

    // Games last: the other side is another organisation's team, so every team must exist first.
    for (const org of TEST_ORGS) {
        for (const game of org.games || []) {
            const team = org.teams.find(t => t.key === game.team);
            const opponentOrg = TEST_ORGS.find(o => o.key === game.opponent.org);
            if (!team) throw new Error(`${org.name} has no team ${game.team}.`);
            if (!opponentOrg?.teams.some(t => t.key === game.opponent.team)) {
                throw new Error(`Game ${game.key}: there is no team ${game.opponent.team} in ${game.opponent.org}.`);
            }
            const host = game.home ? org : opponentOrg;
            const facility = host.site.facilities.find(fac => fac.sportId === team.sportId);
            const ours = fixtureIds.team(org.key, game.team);
            const theirs = fixtureIds.team(opponentOrg.key, game.opponent.team);
            const [homeTeam, awayTeam] = game.home ? [ours, theirs] : [theirs, ours];
            const homeId = fixtureIds.gameParticipant(org.key, game.key, 'home');
            const awayId = fixtureIds.gameParticipant(org.key, game.key, 'away');
            const finished = game.status === 'Finished';
            // Scores are keyed by participant, as the app records a result.
            const result = !finished ? null
                : game.scoreNotProvided ? { notProvided: true }
                : game.score ? { scores: game.home
                    ? { [homeId]: game.score[0], [awayId]: game.score[1] }
                    : { [homeId]: game.score[1], [awayId]: game.score[0] } }
                : null;
            const day = game.kickoff.slice(0, 10);

            await insert('events',
                ['id', 'name', 'type', 'start_date', 'end_date', 'site_id', 'org_id'],
                [fixtureIds.event(org.key, game.key), game.event, 'SingleMatch', day, day, fixtureIds.site(host.key), fixtureIds.org(host.key)]);
            await insert('games',
                ['id', 'event_id', 'sport_id', 'scheduled_start_time', 'start_time', 'finish_time', 'status', 'site_id', 'facility_id', 'final_score_data', 'custom_settings'],
                [fixtureIds.game(org.key, game.key), fixtureIds.event(org.key, game.key), team.sportId, game.kickoff,
                 finished ? game.kickoff : null, null, game.status, fixtureIds.site(host.key),
                 facility ? fixtureIds.facility(host.key, facility.key) : null, result, game.timeTbd ? { timeTbd: true } : {}]);
            await insert('game_participants', ['id', 'game_id', 'team_id', 'sort_order'], [homeId, fixtureIds.game(org.key, game.key), homeTeam, 0]);
            await insert('game_participants', ['id', 'game_id', 'team_id', 'sort_order'], [awayId, fixtureIds.game(org.key, game.key), awayTeam, 1]);
        }
    }

    /**
     * A drawn division (Phase 7): a round robin, scheduled by `planDivision` — the server's own
     * planner — around what earlier divisions booked. Written as rows directly, as the rest of the
     * fixtures are, rather than through the managers, which would not see this transaction's rows.
     */
    const drawAndSchedule = async (
        tour: (typeof TEST_TOURNAMENTS)[number], division: (typeof TEST_TOURNAMENTS)[number]['divisions'][number],
        divisionId: string, stageId: string, booked: Booking[], hostFacility: (key: string) => string,
    ) => {
        const where = `Tournament ${tour.key}, ${division.key}`;
        if (!division.locked || division.teams.some(t => t.status !== 'accepted')) throw new Error(`${where}: a drawn division must be locked with every team accepted.`);
        const sport = (await client.query(`SELECT default_settings FROM sports WHERE id = $1`, [division.sportId])).rows[0];
        const minutes = fixtureMinutes(sport?.default_settings);
        if (minutes == null) throw new Error(`${where}: ${division.sportId} has no game length in its seed.`);
        const entrants = division.teams.map(t => ({ entrantId: fixtureIds.entrant(tour.key, division.key, t.org, t.team), teamId: fixtureIds.team(t.org, t.team) }));
        // Round robin by the circle method, in round order — the order generation produces.
        const ring: Array<typeof entrants[number] | null> = entrants.length % 2 ? [...entrants, null] : [...entrants];
        const draw: Array<{ id: string; round: number; matchIndex: number; home: typeof entrants[number]; away: typeof entrants[number] }> = [];
        for (let r = 0; r < ring.length - 1; r++) {
            let matchIndex = 0;
            for (let i = 0; i < ring.length / 2; i++) {
                const home = ring[i], away = ring[ring.length - 1 - i];
                if (home && away) draw.push({ id: fixtureIds.tournamentGame(tour.key, division.key, draw.length + 1), round: r + 1, matchIndex: matchIndex++, home, away });
            }
            ring.splice(1, 0, ring.pop()!);
        }
        const gap = tour.gapBetweenGamesMin ?? 5, teamBreak = tour.minTeamBreakMin ?? 0;
        const facilityIds = (division.facilities || tour.facilities || []).map(hostFacility);
        const pairs = (await client.query(`SELECT facility_id, other_facility_id FROM facility_shared_ground`)).rows.map((r: any) => [r.facility_id, r.other_facility_id] as [string, string]);
        const leave = new Set((division.leaveUnscheduled || []).map(i => draw[i]?.id));
        const plan = planDivision({
            fixtures: draw.filter(g => !leave.has(g.id)).map(g => ({ id: g.id, competitors: [g.home.teamId, g.away.teamId] })),
            days: dayWindows(tour.days || []), facilityIds, minutes, gap, teamBreak, booked, sharedGround: sharedGroundMap(pairs),
        });
        for (const [index, g] of draw.entries()) {
            const at = plan.placed.find(p => p.id === g.id);
            const start = at ? zonedInputsToInstant(at.day, timeOfDay(at.start), SITE_TIMEZONE) : null;
            // A result keyed by participant, as the app records one (stage 4).
            const result = division.results?.[index];
            if (result && !at) throw new Error(`${where}: fixture ${index} has a result but no time.`);
            await insert('games',
                ['id', 'event_id', 'sport_id', 'stage_id', 'scheduled_start_time', 'start_time', 'status', 'site_id', 'facility_id', 'placed_by', 'final_score_data', 'custom_settings'],
                [g.id, fixtureIds.tournament(tour.key), division.sportId, stageId, start, start, result ? 'Finished' : 'Scheduled', at ? fixtureIds.site(tour.host) : null, at?.facilityId ?? null,
                 at ? 'scheduler' : null, result ? { scores: { [`${g.id}-home`]: result[0], [`${g.id}-away`]: result[1] } } : null,
                 { timeTbd: !at, tournament: { round: g.round, roundName: `Round ${g.round}`, matchIndex: g.matchIndex } }]);
            for (const [sortOrder, side] of [g.home, g.away].entries()) {
                await insert('game_participants', ['id', 'game_id', 'team_id', 'entrant_id', 'sort_order'],
                    [`${g.id}-${sortOrder ? 'away' : 'home'}`, g.id, side.teamId, side.entrantId, sortOrder]);
            }
            if (at) booked.push({ id: g.id, day: at.day, facilityId: at.facilityId, start: at.start, minutes, competitors: [g.home.teamId, g.away.teamId], gap, teamBreak });
        }
        // A team sheet picked for a team's first game (`FIX-32`): its first fifteen players.
        for (const pick of division.picked || []) {
            const teamId = fixtureIds.team(pick.org, pick.team);
            const team = TEST_ORGS.find(o => o.key === pick.org)?.teams.find(t => t.key === pick.team);
            if (!team) throw new Error(`${where}: there is no team ${pick.team} in ${pick.org} to pick.`);
            const first = (await client.query(
                `SELECT gp.id FROM game_participants gp JOIN games g ON g.id = gp.game_id
                  WHERE g.stage_id = $1 AND gp.team_id = $2 AND g.scheduled_start_time IS NOT NULL
                  ORDER BY g.scheduled_start_time LIMIT 1`, [stageId, teamId])).rows[0];
            if (!first) throw new Error(`${where}: ${pick.team} has no scheduled game to pick for.`);
            for (const [n, player] of team.players.slice(0, 15).entries()) {
                const name = typeof player === 'string' ? player : player.name;
                await insert('game_rosters', ['id', 'game_participant_id', 'org_profile_id', 'position', 'is_reserve'],
                    [`fx-roster-${first.id}-${n + 1}`, first.id, fixtureIds.profile(pick.org, name), String(n + 1), false]);
            }
        }
    };

    // Tournaments after games: they reference teams of several organisations (`FIX-31`, `FIX-33`).
    for (const tour of TEST_TOURNAMENTS) {
        const tourId = fixtureIds.tournament(tour.key);
        const host = TEST_ORGS.find(o => o.key === tour.host);
        if (!host) throw new Error(`Tournament ${tour.key}: there is no organisation ${tour.host}.`);
        const userOf = (name?: string) => {
            if (!name) return null;
            const id = fixtureIds.user(name);
            if (!accounts.has(id)) throw new Error(`Tournament ${tour.key}: ${name} has no account to answer with.`);
            return id;
        };
        await insert('events',
            ['id', 'name', 'type', 'format', 'start_date', 'end_date', 'site_id', 'org_id', 'settings', 'status', 'orgs_may_add_teams', 'gap_between_games_min', 'min_team_break_min'],
            [tourId, tour.name, 'Tournament', tour.format || 'Festival', tour.startDate, tour.endDate, fixtureIds.site(host.key), fixtureIds.org(host.key), {}, 'Scheduled', tour.orgsMayAddTeams,
             tour.gapBetweenGamesMin ?? 5, tour.minTeamBreakMin ?? 0]);
        // Phase 7: playing days and the facilities in play.
        if (tour.days?.length) {
            const sorted = tour.days.map(d => d.day).sort();
            if (sorted[0] !== tour.startDate || sorted[sorted.length - 1] !== tour.endDate) {
                throw new Error(`Tournament ${tour.key}: its dates must be its first and last playing day, as SET_EVENT_DAYS writes them.`);
            }
            for (const d of tour.days) await insert('event_days', ['event_id', 'day', 'day_starts', 'day_ends'], [tourId, d.day, d.dayStarts, d.dayEnds]);
        }
        const hostFacility = (key: string) => {
            if (!host.site.facilities.some(f => f.key === key)) throw new Error(`Tournament ${tour.key}: the host has no facility ${key}.`);
            return fixtureIds.facility(host.key, key);
        };
        for (const key of tour.facilities || []) await insert('event_facilities', ['event_id', 'facility_id'], [tourId, hostFacility(key)]);
        // What drawn divisions book, in order, so each later one is scheduled around the earlier.
        const booked: Booking[] = [];
        for (const sportId of tour.sportIds) await insert('event_sports', ['event_id', 'sport_id'], [tourId, sportId]);
        await insert('event_organizations', ['event_id', 'org_id', 'invitation'], [tourId, fixtureIds.org(host.key), 'accepted']);
        for (const taking of tour.orgs) {
            const invited = taking.invitation !== 'not_invited';
            const answered = taking.invitation === 'accepted' || taking.invitation === 'declined';
            await insert('event_organizations',
                ['event_id', 'org_id', 'invitation', 'invited_at', 'invited_by_user_id', 'invited_by_org_id', 'answered_at', 'answered_by_user_id', 'answered_by_org_id'],
                [tourId, fixtureIds.org(taking.org), taking.invitation,
                 invited ? FIXTURE_MEMBERSHIP_START : null, invited ? userOf(host.admin.name) : null, invited ? fixtureIds.org(host.key) : null,
                 answered ? FIXTURE_MEMBERSHIP_START : null, answered ? userOf(taking.by) : null, answered ? fixtureIds.org(taking.org) : null]);
        }
        for (const [sortOrder, division] of tour.divisions.entries()) {
            const divisionId = fixtureIds.division(tour.key, division.key);
            const stageId = fixtureIds.stage(tour.key, division.key);
            await insert('tournament_divisions',
                ['id', 'event_id', 'name', 'sport_id', 'age_group_id', 'sort_order', 'entries_locked_at', 'entries_locked_by_user_id', 'orgs_may_add_teams'],
                [divisionId, tourId, division.name, division.sportId, starterAgeGroupId(division.sportId, division.ageGroup), sortOrder,
                 division.locked ? FIXTURE_MEMBERSHIP_START : null, division.locked ? userOf(host.admin.name) : null, division.orgsMayAddTeams ?? null]);
            // A Head to Head's division, and one set by hand, plays one stage of games set by hand
            // (`stagePlanForFormat('Dual')`, `stagePlanForFormat('Festival')`).
            await insert('division_stages', ['id', 'division_id', 'name', 'format', 'sequence'],
                tour.format === 'Dual' ? [stageId, divisionId, 'Games', 'Festival', 1]
                    : division.handSet ? [stageId, divisionId, 'Fixtures', 'Festival', 1]
                    : [stageId, divisionId, 'Fixtures', 'RoundRobin', 1]);
            for (const [seed, entry] of division.teams.entries()) {
                const org = TEST_ORGS.find(o => o.key === entry.org);
                if (entry.placeholder ? division.drawn : !org?.teams.some(t => t.key === entry.team)) {
                    throw new Error(entry.placeholder
                        ? `Tournament ${tour.key}, ${division.key}: a drawn division has no placeholders.`
                        : `Tournament ${tour.key}: there is no team ${entry.team} in ${entry.org}.`);
                }
                const entrantId = fixtureIds.entrant(tour.key, division.key, entry.org, entry.team);
                const asked = entry.status === 'requested' || entry.status === 'withdrawal_pending';
                const answered = !asked && entry.status !== 'invited' && !!entry.by;
                await insert('division_entrants',
                    ['id', 'division_id', 'team_id', 'label', 'org_id', 'seed', 'status', 'answered_at', 'answered_by_user_id', 'answered_by_org_id', 'reason', 'requested_at', 'requested_by_user_id'],
                    [entrantId, divisionId, entry.placeholder ? null : fixtureIds.team(entry.org, entry.team), entry.placeholder ?? null, fixtureIds.org(entry.org), seed + 1, entry.status,
                     answered ? FIXTURE_MEMBERSHIP_START : null, answered ? userOf(entry.by) : null, answered ? fixtureIds.org(entry.org) : null,
                     entry.reason ?? null, asked ? FIXTURE_MEMBERSHIP_START : null, asked ? userOf(entry.by) : null]);
                // The stage takes the teams in play, as `syncOpenStageEntrants` would.
                if (entry.status === 'accepted' || entry.status === 'withdrawal_pending') {
                    await insert('stage_entrants', ['stage_id', 'entrant_id', 'seed', 'sort_order'], [stageId, entrantId, seed + 1, seed]);
                }
            }
            for (const key of division.facilities || []) await insert('division_facilities', ['division_id', 'facility_id'], [divisionId, hostFacility(key)]);
            if (division.drawn) await drawAndSchedule(tour, division, divisionId, stageId, booked, hostFacility);
            // Games set by hand — a Head to Head's, as pairing writes them, or a hand-set division's;
            // a result keyed by participant, as the app records one.
            for (const [n, game] of (division.games || []).entries()) {
                const guestOrg = game.guestOrg ?? tour.orgs[0]?.org;
                if (!guestOrg) throw new Error(`Tournament ${tour.key}: a Head to Head needs the organisation it plays.`);
                const gameId = fixtureIds.tournamentGame(tour.key, division.key, n + 1);
                const sides = [
                    { org: game.hostOrg ?? tour.host, team: game.host, id: `${gameId}-home` },
                    { org: guestOrg, team: game.guest, id: `${gameId}-away` },
                ];
                for (const side of sides) {
                    if (!division.teams.some(t => t.org === side.org && t.team === side.team)) {
                        throw new Error(`Tournament ${tour.key}, ${division.key}: ${side.org} ${side.team} is not entered in the division.`);
                    }
                }
                const start = zonedInputsToInstant(tour.startDate, game.time, SITE_TIMEZONE);
                const finished = game.status === 'Finished';
                await insert('games',
                    ['id', 'event_id', 'sport_id', 'stage_id', 'scheduled_start_time', 'start_time', 'status', 'site_id', 'facility_id', 'placed_by', 'final_score_data', 'custom_settings'],
                    [gameId, tourId, division.sportId, stageId, start, start, game.status, fixtureIds.site(tour.host), hostFacility(game.facility), 'hand',
                     finished && game.score ? { scores: { [sides[0].id]: game.score[0], [sides[1].id]: game.score[1] } } : null, {}]);
                for (const [sortOrder, side] of sides.entries()) {
                    await insert('game_participants', ['id', 'game_id', 'team_id', 'entrant_id', 'sort_order'],
                        [side.id, gameId, fixtureIds.team(side.org, side.team), fixtureIds.entrant(tour.key, division.key, side.org, side.team), sortOrder]);
                }
            }
        }
    }

    return counts;
}

/**
 * Rebuild the tables of every fixture tournament that has results (stage 4), **after** the load has
 * committed: the standings engine reads through the managers' own pool, which cannot see rows still
 * inside the loading transaction. Each division is rebuilt as `recalculateDivision` would after a
 * roster change — its stages' statuses and tables, then the tournament's leaderboard.
 */
export async function rebuildFixtureStandings(): Promise<void> {
    const { tournamentManager } = await import('../../../managers/TournamentManager');
    for (const tour of TEST_TOURNAMENTS) {
        for (const division of tour.divisions) {
            const played = division.results?.length || division.games?.some(g => g.status === 'Finished');
            if (played) await tournamentManager.recalculateDivision(fixtureIds.division(tour.key, division.key));
        }
    }
}
