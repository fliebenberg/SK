import pool from '../db';
import { SocketAction } from '@sk/shared';
import { eventManager } from '../managers/EventManager';
import { accessManager } from '../managers/AccessManager';
import { enforceOrgAction } from '../wss/orgGate';

/**
 * Picking a team per game (`FIX-32` part 2) and who may pick it (`SCORE-19`), 2026-10-22.
 *
 * - **Proposals.** A side with no team sheet of its own takes the sheet of the latest earlier game its
 *   team played in the same tournament, worked out when read: it follows that game when it changes,
 *   a side's own sheet replaces it, and kick-off keeps it (`standProposedRosters`).
 * - **Who may pick a side** (`canPickSide`, the org gate's `pick-side`): the side's coach and its
 *   organisation's admins and staff; in a tournament also its organisers and the host's admins and
 *   staff. Not the other side, and in a single match not the host for the visitors.
 * - **To do's read** (`getEventLineups`): a coach's own team's games still to play, picked or proposed.
 *
 * Creates its own organisations, people, events, teams and games under a unique prefix and deletes
 * them at the end whatever happens. Needs one sport in the database.
 *
 * Run: `npx ts-node src/scripts/test-lineup-proposals.ts` (from server/).
 */

const P = `lutest-${Date.now()}`;
let failures = 0;
function check(ok: boolean, label: string) {
    console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}`);
    if (!ok) failures++;
}
const q = (sql: string, params: any[] = []) => pool.query(sql, params);
const created = { orgIds: [] as string[], userIds: [] as string[], eventIds: [] as string[], teamIds: [] as string[], profileIds: [] as string[] };

async function makeOrg(slug: string): Promise<string> {
    const id = `${P}-${slug}`;
    await q(`INSERT INTO organizations (id, name, short_name, is_claimed) VALUES ($1, $2, $3, true)`, [id, `${P} ${slug}`, slug.toUpperCase().slice(0, 4)]);
    created.orgIds.push(id);
    return id;
}
async function makeUser(slug: string, orgId: string, role: string): Promise<{ userId: string; profileId: string }> {
    const userId = `${P}-user-${slug}`;
    await q(`INSERT INTO users (id, name, email, global_role) VALUES ($1, $2, $3, 'user')`, [userId, slug, `${userId}@example.test`]);
    created.userIds.push(userId);
    const profileId = `${userId}-p`;
    await q(`INSERT INTO org_profiles (id, org_id, user_id, name, email) VALUES ($1, $2, $3, $4, $5)`, [profileId, orgId, userId, slug, `${userId}@example.test`]);
    created.profileIds.push(profileId);
    await q(`INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES ($1, $2, $3, $4, NOW())`, [`${userId}-m`, profileId, orgId, role]);
    return { userId, profileId };
}
async function makeTeam(slug: string, orgId: string, sportId: string): Promise<string> {
    const id = `${P}-team-${slug}`;
    await q('INSERT INTO teams (id, name, sport_id, org_id) VALUES ($1, $2, $3, $4)', [id, `${P} ${slug}`, sportId, orgId]);
    created.teamIds.push(id);
    return id;
}
async function makePlayer(slug: string, orgId: string): Promise<string> {
    const id = `${P}-player-${slug}`;
    await q(`INSERT INTO org_profiles (id, org_id, name) VALUES ($1, $2, $3)`, [id, orgId, `${P} ${slug}`]);
    created.profileIds.push(id);
    return id;
}
const sideOf = (game: any, teamId: string) => game.participants.find((p: any) => p.teamId === teamId).id as string;
const sheet = (ids: string[]) => ids.map((orgProfileId, i) => ({ orgProfileId, position: String(i + 1), isReserve: false }));
const names = (items: any[]) => items.map(i => i.orgProfileId).sort().join(',');
async function gateAllows(userId: string, payload: any): Promise<boolean> {
    try {
        await enforceOrgAction(userId, SocketAction.SAVE_GAME_ROSTER, payload);
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
    const hostAdmin = await makeUser('hostadmin', host, 'role-org-admin');
    const guestAdmin = await makeUser('guestadmin', guest, 'role-org-admin');
    const guestCoach = await makeUser('guestcoach', guest, 'role-org-member');
    const hostTeam = await makeTeam('host', host, sportId);
    const guestTeam = await makeTeam('guest', guest, sportId);
    await q(`INSERT INTO team_memberships (id, org_profile_id, team_id, role_id, start_date) VALUES ($1, $2, $3, 'role-coach', NOW())`, [`${P}-tm`, guestCoach.profileId, guestTeam]);
    const [a, b, c] = [await makePlayer('a', guest), await makePlayer('b', guest), await makePlayer('c', guest)];

    const tournament = await eventManager.addEvent({
        id: `${P}-cup`, name: `${P} Cup`, type: 'Tournament', orgId: host, sportIds: [sportId], startDate: '2026-11-01', settings: {}, status: 'Scheduled',
    } as any);
    created.eventIds.push(tournament.id);
    const game = (at: string) => eventManager.addGame({ eventId: tournament.id, sportId, startTime: at, participants: [{ teamId: hostTeam }, { teamId: guestTeam }] } as any);
    const g1 = await game('2026-11-01T08:00:00Z');
    const g2 = await game('2026-11-01T09:00:00Z');
    const g3 = await game('2026-11-01T10:00:00Z');
    const [s1, s2, s3] = [sideOf(g1, guestTeam), sideOf(g2, guestTeam), sideOf(g3, guestTeam)];

    // --- Proposals.
    check((await eventManager.getRosterProposal(s1)) === null, 'the first game has nothing to take');
    check((await eventManager.getRosterProposal(s2)) === null, 'nothing is proposed while no earlier game has a team');
    await eventManager.saveGameRoster(g1.id, s1, sheet([a, b]));
    const p2 = await eventManager.getRosterProposal(s2);
    check(p2?.fromGameId === g1.id && names(p2.items) === [a, b].sort().join(','), "picking the first game proposes its team for the next");
    check((await eventManager.getRosterProposal(s3))?.fromGameId === g1.id, '…and for every later game');
    check(!!p2?.opponent?.includes('host'), '…naming whom that game was against');
    check((await eventManager.getRosterProposal(sideOf(g2, hostTeam))) === null, "the other side's proposal is its own team's, not this one's");
    await eventManager.saveGameRoster(g1.id, s1, sheet([a, c]));
    check(names((await eventManager.getRosterProposal(s3))!.items) === [a, c].sort().join(','), 'a proposal follows the game it comes from');
    await eventManager.saveGameRoster(g2.id, s2, sheet([b, c]));
    check((await eventManager.getRosterProposal(s2)) === null, "a side's own team replaces its proposal");
    check((await eventManager.getRosterProposal(s3))?.fromGameId === g2.id, 'the next game now takes the latest earlier team');

    // --- To do's read, for the coach.
    const lineups = await eventManager.getEventLineups(guestCoach.userId, tournament.id);
    check(lineups.length === 3 && lineups.every(l => l.teamId === guestTeam && l.asCoach), "the coach's read holds their team's three games, and only theirs");
    check(lineups.find(l => l.gameId === g3.id)?.proposedFromGameId === g2.id && !lineups.find(l => l.gameId === g3.id)?.picked, '…the last proposed from the second');

    // --- Kick-off keeps a proposal.
    await eventManager.standProposedRosters(g3.id);
    check(names(await eventManager.getGameRoster(s3)) === [b, c].sort().join(','), 'at kick-off a proposal becomes the game’s own team');

    // --- Who may pick a side (SCORE-19).
    const pick = (userId: string, g: any, side: string) => gateAllows(userId, { gameId: g.id, participantId: side, items: [] });
    check(await pick(guestCoach.userId, g1, s1), "the side's coach may pick it");
    check(await pick(guestAdmin.userId, g1, s1), "…and its organisation's admin");
    check(!(await pick(guestCoach.userId, g1, sideOf(g1, hostTeam))), "the coach may not pick the other side's team");
    check(!(await pick(guestAdmin.userId, g1, sideOf(g1, hostTeam))), "…nor may the guest's admin");
    check(await pick(hostAdmin.userId, g1, s1), "in a tournament the host's admin may pick any side");

    const match = await eventManager.addEvent({
        id: `${P}-match`, name: `${P} Match`, type: 'SingleMatch', orgId: host, sportIds: [sportId], startDate: '2026-11-02', settings: {}, status: 'Scheduled',
    } as any);
    created.eventIds.push(match.id);
    const m = await eventManager.addGame({ eventId: match.id, sportId, startTime: '2026-11-02T08:00:00Z', participants: [{ teamId: hostTeam }, { teamId: guestTeam }] } as any);
    check(await pick(hostAdmin.userId, m, sideOf(m, hostTeam)), 'in a single match the host picks its own side');
    check(!(await pick(hostAdmin.userId, m, sideOf(m, guestTeam))), "…and not the visitors'");
    check(await accessManager.canPickSide(guestCoach.userId, m.id, sideOf(m, guestTeam)), "…which is the visitors' coach's");
}

async function cleanup() {
    for (const id of created.eventIds) {
        await q('DELETE FROM game_rosters WHERE game_participant_id IN (SELECT gp.id FROM game_participants gp JOIN games g ON g.id = gp.game_id WHERE g.event_id = $1)', [id]);
        await q('DELETE FROM games WHERE event_id = $1', [id]);
        await q('DELETE FROM events WHERE id = $1', [id]);
    }
    await q('DELETE FROM team_memberships WHERE id = $1', [`${P}-tm`]);
    for (const id of created.teamIds) await q('DELETE FROM teams WHERE id = $1', [id]);
    for (const id of created.userIds) await q('DELETE FROM org_memberships WHERE id = $1', [`${id}-m`]);
    for (const id of created.profileIds) await q('DELETE FROM org_profiles WHERE id = $1', [id]);
    for (const id of created.userIds) await q('DELETE FROM users WHERE id = $1', [id]);
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
