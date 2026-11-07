import pool from '../db';
import { eventManager } from '../managers/EventManager';
import { LeagueManager } from '../managers/LeagueManager';
import { EditConflictError } from '../utils/editConflict';

/**
 * Two people editing the same thing (`SYNC-11`, 2026-11-07): a save carries the old values of what
 * it changes, and is refused — saying who changed what — when one of them has changed since.
 *
 * - **Season settings** (`UPDATE_SEASON`): a save based on what is saved goes through; one over a
 *   change to a field it changes is refused with that field's value now; a change to other fields
 *   is not a clash, and both survive; *Save mine anyway* (the same save, `was` now the reported
 *   values) goes through; a save without `was` behaves as before.
 * - **Team sheets** (`SAVE_GAME_ROSTER`): the same, for the whole sheet, including a sheet saved
 *   by the server itself at kick-off (`standProposedRosters`), which is named as such.
 *
 * Creates its own organisation, people, league, season, event, teams and game under a unique prefix
 * and deletes them at the end whatever happens. Needs one sport and the `20261107_last_saved_by`
 * migration.
 *
 * Run: `npx ts-node src/scripts/test-edit-conflicts.ts` (from server/).
 */

const P = `ectest-${Date.now()}`;
let failures = 0;
function check(ok: boolean, label: string) {
    console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}`);
    if (!ok) failures++;
}
const q = (sql: string, params: any[] = []) => pool.query(sql, params);
const leagueManager = new LeagueManager();
const created = { orgIds: [] as string[], userIds: [] as string[], profileIds: [] as string[], teamIds: [] as string[], eventIds: [] as string[], leagueIds: [] as string[] };

async function makeUser(slug: string, orgId: string, profileName: string): Promise<string> {
    const userId = `${P}-user-${slug}`;
    await q(`INSERT INTO users (id, name, email, global_role) VALUES ($1, $2, $3, 'user')`, [userId, `${slug} account`, `${userId}@example.test`]);
    created.userIds.push(userId);
    const profileId = `${userId}-p`;
    await q(`INSERT INTO org_profiles (id, org_id, user_id, name, email) VALUES ($1, $2, $3, $4, $5)`, [profileId, orgId, userId, profileName, `${userId}@example.test`]);
    created.profileIds.push(profileId);
    return userId;
}
async function makePlayer(slug: string, orgId: string): Promise<string> {
    const id = `${P}-player-${slug}`;
    await q(`INSERT INTO org_profiles (id, org_id, name) VALUES ($1, $2, $3)`, [id, orgId, `${P} ${slug}`]);
    created.profileIds.push(id);
    return id;
}
/** The refusal a call raised, or null when it went through. */
async function refusal(call: () => Promise<unknown>): Promise<EditConflictError | null> {
    try {
        await call();
        return null;
    } catch (error) {
        if (error instanceof EditConflictError) return error;
        throw error;
    }
}

async function run() {
    const sportId = (await q('SELECT id FROM sports ORDER BY id LIMIT 1')).rows[0]?.id;
    if (!sportId) throw new Error('Needs at least one sport in the database.');
    const orgId = `${P}-org`;
    await q(`INSERT INTO organizations (id, name, short_name, is_claimed) VALUES ($1, $2, 'EC', true)`, [orgId, `${P} Org`]);
    created.orgIds.push(orgId);
    const thabo = await makeUser('thabo', orgId, 'Thabo Nkosi');
    const anna = await makeUser('anna', orgId, 'Anna Botha');

    // --- Season settings -------------------------------------------------------------------
    const leagueId = `${P}-league`;
    await q(`INSERT INTO leagues (id, name, org_id, sport_id) VALUES ($1, $2, $3, $4)`, [leagueId, `${P} League`, orgId, sportId]);
    created.leagueIds.push(leagueId);
    const season = await leagueManager.createSeason({
        leagueId, name: 'Winter', startDate: '2026-05-01', endDate: '2026-08-31', status: 'UPCOMING',
        settings: { pointsPerWin: 3, pointsPerDraw: 1, pointsPerLoss: 0 }, logo: null,
    } as any);

    // Both open the form on the same version. Thabo changes the points for a win.
    check(!(await refusal(() => leagueManager.updateSeason(season.id, { settings: { pointsPerWin: 4 } }, { was: { pointsPerWin: 3 }, userId: thabo }))),
        'a save based on what is saved goes through');
    const afterThabo = await leagueManager.getSeason(season.id);
    check(afterThabo?.settings.pointsPerWin === 4 && afterThabo?.settings.pointsPerDraw === 1, 'points are merged: the others stay as they were');

    // Anna, on the old version, changes the points for a win too: refused, naming Thabo.
    const clash = await refusal(() => leagueManager.updateSeason(season.id, { settings: { pointsPerWin: 5 } }, { was: { pointsPerWin: 3 }, userId: anna }));
    check(!!clash, 'a save over a change to the same field is refused');
    check(!!clash?.message.includes('Thabo Nkosi') && !!clash?.message.includes('points for a win'), `the refusal says who changed what: "${clash?.message}"`);
    check(clash?.conflict.changedBy === 'Thabo Nkosi', 'named as the organisation knows them, not by their account name');
    check(JSON.stringify(clash?.conflict.fields) === '["pointsPerWin"]' && clash?.conflict.current.pointsPerWin === 4, 'the conflict carries the field and its value now');
    check((await leagueManager.getSeason(season.id))?.settings.pointsPerWin === 4, 'nothing was written');

    // Anna, still on the old version, changes the end date only: not a clash, and both survive.
    check(!(await refusal(() => leagueManager.updateSeason(season.id, { endDate: '2026-09-30' }, { was: { endDate: '2026-08-31' }, userId: anna }))),
        'a change to other fields is not a clash');
    const both = await leagueManager.getSeason(season.id);
    check(both?.endDate === '2026-09-30' && both?.settings.pointsPerWin === 4, "both people's changes are kept");

    // Save mine anyway: the same save, now based on the reported value.
    check(!(await refusal(() => leagueManager.updateSeason(season.id, { settings: { pointsPerWin: 5 } }, { was: { pointsPerWin: 4 }, userId: anna }))),
        'Save mine anyway goes through');
    check((await leagueManager.getSeason(season.id))?.settings.pointsPerWin === 5, 'and replaces their change');

    // A third change in between is refused in turn, naming its maker.
    await leagueManager.updateSeason(season.id, { name: 'Winter league' }, { userId: thabo });
    const third = await refusal(() => leagueManager.updateSeason(season.id, { name: 'Winter cup' }, { was: { name: 'Winter' }, userId: anna }));
    check(third?.conflict.changedBy === 'Thabo Nkosi' && third?.conflict.current.name === 'Winter league', 'a third change is refused rather than overwritten');

    // No `was`: as before, the save replaces what is there.
    check(!(await refusal(() => leagueManager.updateSeason(season.id, { name: 'Winter final' }, {}))), 'a save without was behaves as before');

    // --- Team sheets ------------------------------------------------------------------------
    const team = `${P}-team`;
    const other = `${P}-other`;
    await q('INSERT INTO teams (id, name, sport_id, org_id) VALUES ($1, $2, $3, $4), ($5, $6, $3, $4)', [team, `${P} A`, sportId, orgId, other, `${P} B`]);
    created.teamIds.push(team, other);
    const [a, b, c] = [await makePlayer('a', orgId), await makePlayer('b', orgId), await makePlayer('c', orgId)];
    const event = await eventManager.addEvent({
        id: `${P}-match`, name: `${P} Match`, type: 'SingleMatch', orgId, sportIds: [sportId], startDate: '2026-11-01', settings: {}, status: 'Scheduled',
    } as any);
    created.eventIds.push(event.id);
    const game = await eventManager.addGame({ eventId: event.id, sportId, startTime: '2026-11-01T08:00:00Z', participants: [{ teamId: team }, { teamId: other }] } as any);
    const side = (game as any).participants.find((p: any) => p.teamId === team).id as string;
    const sheet = (ids: string[]) => ids.map((orgProfileId, i) => ({ orgProfileId, position: String(i + 1), isReserve: false }));

    check(!(await refusal(() => eventManager.saveGameRoster(game.id, side, sheet([a, b]), { itemsWas: [], userId: thabo }))), 'a first sheet over none goes through');
    const sheetClash = await refusal(() => eventManager.saveGameRoster(game.id, side, sheet([c]), { itemsWas: [], userId: anna }));
    check(!!sheetClash?.message.includes('Thabo Nkosi'), `a sheet picked over an older one is refused, naming who saved it: "${sheetClash?.message}"`);
    check(((sheetClash?.conflict.current.items as any[]) ?? []).map(i => i.orgProfileId).sort().join() === [a, b].sort().join(), 'the conflict carries the sheet saved now');
    check(!(await refusal(() => eventManager.saveGameRoster(game.id, side, sheet([b, a]), { itemsWas: sheet([a, b]).reverse(), userId: anna }))) ,
        'the same sheet in another order is not a clash');
    check(!(await refusal(() => eventManager.saveGameRoster(game.id, side, sheet([c]), { itemsWas: sheet([b, a]), userId: anna }))), 'Save mine anyway goes through');

    // Saved by the server at kick-off (null saver, game under way): named as such.
    await eventManager.saveGameRoster(game.id, side, sheet([a]));
    await q(`UPDATE games SET status = 'Live' WHERE id = $1`, [game.id]);
    const kickoff = await refusal(() => eventManager.saveGameRoster(game.id, side, sheet([b]), { itemsWas: sheet([c]), userId: anna }));
    check(!!kickoff?.message.includes('when it started'), `a sheet the server saved is named as such: "${kickoff?.message}"`);
}

async function cleanup() {
    for (const id of created.eventIds) {
        await q('DELETE FROM game_rosters WHERE game_participant_id IN (SELECT gp.id FROM game_participants gp JOIN games g ON g.id = gp.game_id WHERE g.event_id = $1)', [id]);
        await q('DELETE FROM games WHERE event_id = $1', [id]);
        await q('DELETE FROM events WHERE id = $1', [id]);
    }
    for (const id of created.leagueIds) await q('DELETE FROM leagues WHERE id = $1', [id]);
    for (const id of created.teamIds) await q('DELETE FROM teams WHERE id = $1', [id]);
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
            console.error('[CLEANUP FAILED]', error);
            failures++;
        }
        await pool.end();
        console.log(failures ? `\n${failures} failure(s).` : '\nAll passed.');
        process.exit(failures ? 1 : 0);
    }
})();
