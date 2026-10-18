import pool from '../db';
import { SocketAction } from '@sk/shared';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { enforceOrgAction } from '../wss/orgGate';

/**
 * `FIX-32` (part 1, 2026-10-18): an organisation names its own team for a place the organisers kept
 * for it — "Guest second team, TBC" — through `NAME_OWN_PLACEHOLDER`.
 *
 * - **Who may** (the org gate's `own-placeholder`): the place's organisation's admins, with one of
 *   its own teams. Not its staff, not another organisation's admin, not a team of somebody else's,
 *   and not a place that already has a team.
 * - **What it does**: the team takes the place — the same entrant, so a fixture drawn against the
 *   place now names the team — and goes in accepted, answered by the organisation; a team already
 *   entered in the tournament is refused, as the organisers' replace refuses it.
 *
 * Creates its own organisations, people, event, division, teams and fixture under a unique prefix,
 * and deletes them at the end whatever happens. Needs one sport in the database.
 *
 * Run: `npx ts-node src/scripts/test-own-placeholder.ts` (from server/).
 */

const P = `phtest-${Date.now()}`;
let failures = 0;
function check(ok: boolean, label: string) {
    console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}`);
    if (!ok) failures++;
}
async function rejects(fn: () => Promise<unknown>, pattern?: RegExp): Promise<boolean> {
    try {
        await fn();
        return false;
    } catch (error: any) {
        return pattern ? pattern.test(String(error?.message)) : true;
    }
}
const q = (sql: string, params: any[] = []) => pool.query(sql, params);
const created = { orgIds: [] as string[], userIds: [] as string[], eventIds: [] as string[], teamIds: [] as string[] };

async function makeOrg(slug: string): Promise<string> {
    const id = `${P}-${slug}`;
    await q(`INSERT INTO organizations (id, name, short_name, is_claimed) VALUES ($1, $2, $3, true)`, [id, `${P} ${slug}`, slug.toUpperCase().slice(0, 4)]);
    created.orgIds.push(id);
    return id;
}
async function makeAdmin(slug: string, orgId: string, role = 'role-org-admin'): Promise<string> {
    const userId = `${P}-user-${slug}`;
    await q(`INSERT INTO users (id, name, email, global_role) VALUES ($1, $2, $3, 'user')`, [userId, slug, `${userId}@example.test`]);
    created.userIds.push(userId);
    await q(`INSERT INTO org_profiles (id, org_id, user_id, name, email) VALUES ($1, $2, $3, $4, $5)`, [`${userId}-p`, orgId, userId, slug, `${userId}@example.test`]);
    await q(
        `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES ($1, $2, $3, $4, NOW())`,
        [`${userId}-m`, `${userId}-p`, orgId, role]
    );
    return userId;
}
async function makeTeam(slug: string, orgId: string, sportId: string): Promise<string> {
    const id = `${P}-team-${slug}`;
    await q('INSERT INTO teams (id, name, sport_id, org_id) VALUES ($1, $2, $3, $4)', [id, `${P} ${slug}`, sportId, orgId]);
    created.teamIds.push(id);
    return id;
}
async function gateAllows(userId: string, payload: any): Promise<boolean> {
    try {
        await enforceOrgAction(userId, SocketAction.NAME_OWN_PLACEHOLDER, payload);
        return true;
    } catch {
        return false;
    }
}

async function run() {
    const sportId = (await q('SELECT id FROM sports ORDER BY id LIMIT 1')).rows[0]?.id;
    if (!sportId) throw new Error('Needs at least one sport in the database.');
    const host = await makeOrg('host');
    const guest = await makeOrg('guest');
    const other = await makeOrg('other');
    const guestAdmin = await makeAdmin('guestadmin', guest);
    const guestStaff = await makeAdmin('gueststaff', guest, 'role-org-staff');
    const otherAdmin = await makeAdmin('otheradmin', other);

    const event = await eventManager.addEvent({
        id: `${P}-event`, name: `${P} Cup`, type: 'Tournament', orgId: host, sportIds: [sportId],
        startDate: '2026-11-01', settings: {}, status: 'Scheduled',
    } as any);
    created.eventIds.push(event.id);
    await eventManager.addEventOrgs(event.id, [guest], false);
    await eventManager.inviteEventOrgs(event.id, [guest]);
    await eventManager.setEventOrgAnswer(event.id, guest, 'accepted');

    const division = await tournamentManager.addDivision({ eventId: event.id, name: `${P} Open`, sportId } as any);
    const second = await tournamentManager.addDivision({ eventId: event.id, name: `${P} Second`, sportId } as any);
    const hostTeam = await makeTeam('host', host, sportId);
    const guestTeam = await makeTeam('guest', guest, sportId);
    const guestEntered = await makeTeam('guest-entered', guest, sportId);
    const otherTeam = await makeTeam('other', other, sportId);
    const roster = await tournamentManager.setDivisionEntrants(division.id, [
        { teamId: hostTeam }, { label: 'Guest second team, TBC', orgId: guest },
    ] as any);
    const place = roster.entrants.find(e => !e.teamId) as any;
    check(!!place && place.status === 'accepted', 'a placeholder for the guest starts accepted');
    // A team already in the tournament, in another division, for the one-division rule.
    await tournamentManager.setDivisionEntrants(second.id, [{ teamId: guestEntered }] as any);
    const hostEntrant = roster.entrants.find(e => e.teamId === hostTeam)!;

    // A fixture drawn against the place.
    const game = await eventManager.addGame({
        eventId: event.id, sportId, startTime: '2026-11-01T08:00:00Z',
        participants: [{ teamId: hostTeam, entrantId: hostEntrant.id }, { entrantId: place.id }],
    } as any);

    const payload = (teamId: string, entrantId = place.id) => ({ divisionId: division.id, entrantId, orgId: guest, teamId });

    // --- Who may.
    check(await gateAllows(guestAdmin, payload(guestTeam)), "the guest's admin may name its own place with its own team");
    check(!(await gateAllows(guestStaff, payload(guestTeam))), '…not its staff');
    check(!(await gateAllows(otherAdmin, payload(otherTeam))), "…not another organisation's admin");
    check(!(await gateAllows(guestAdmin, payload(otherTeam))), "…and not with another organisation's team");
    check(!(await gateAllows(guestAdmin, payload(guestTeam, hostEntrant.id))), '…nor for a place that already has a team');

    // --- The one-division rule.
    check(
        await rejects(() => tournamentManager.nameOwnPlaceholder(division.id, place.id, guestEntered, { userId: guestAdmin, orgId: guest }), /already entered/),
        'a team already entered in the tournament is refused'
    );

    // --- What it does.
    const named = await tournamentManager.nameOwnPlaceholder(division.id, place.id, guestTeam, { userId: guestAdmin, orgId: guest });
    check(named.entrant.id === place.id && named.entrant.teamId === guestTeam, 'the team takes the place: the same entrant, now with the team');
    check(named.entrant.status === 'accepted' && named.entrant.answeredBy?.userId === guestAdmin, '…accepted, answered by the organisation');
    const side = (await q('SELECT team_id FROM game_participants WHERE game_id = $1 AND entrant_id = $2', [game.id, place.id])).rows[0];
    check(side?.team_id === guestTeam, '…and the fixture drawn against the place now names the team');
    check(named.changedGameIds.includes(game.id), '…which it reports as changed');
    check(!(await gateAllows(guestAdmin, payload(guestTeam))), 'once named, the place is no longer a placeholder');
}

async function cleanup() {
    for (const id of created.eventIds) {
        await q('DELETE FROM games WHERE event_id = $1', [id]);
        await q('DELETE FROM events WHERE id = $1', [id]);
    }
    for (const id of created.teamIds) await q('DELETE FROM teams WHERE id = $1', [id]);
    for (const id of created.userIds) {
        await q('DELETE FROM org_memberships WHERE id = $1', [`${id}-m`]);
        await q('DELETE FROM org_profiles WHERE id = $1', [`${id}-p`]);
        await q('DELETE FROM users WHERE id = $1', [id]);
    }
    for (const id of created.orgIds) await q('DELETE FROM organizations WHERE id = $1', [id]);
}

(async () => {
    try {
        await run();
    } catch (error) {
        console.error('[ERROR]', error);
        failures++;
    } finally {
        try {
            await cleanup();
        } catch (error) {
            console.error('[CLEANUP ERROR]', error);
        }
        console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
        await pool.end();
        process.exit(failures ? 1 : 0);
    }
})();
