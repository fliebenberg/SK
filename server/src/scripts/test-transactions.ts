import pool from '../db';
import { organizationManager } from '../managers/OrganizationManager';
import { siteManager } from '../managers/SiteManager';
import { facilityManager } from '../managers/FacilityManager';
import { eventManager } from '../managers/EventManager';
import { userManager } from '../managers/UserManager';

/**
 * Exercises every write path converted from pooled `BEGIN`/`COMMIT` to `this.transaction` (TX-1):
 * each commits what it should, and a failure part-way leaves nothing behind — including under
 * concurrency, which is where the pooled version went wrong.
 *
 * Creates its own organisations, site, facility, team, person, events and games under a unique
 * prefix, and deletes them at the end whatever happens. Needs one sport in the database.
 *
 * Run: `npx ts-node src/scripts/test-transactions.ts` (from server/).
 */

const P = `txtest-${Date.now()}`;
let failures = 0;
function check(ok: boolean, label: string) {
    console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}`);
    if (!ok) failures++;
}
async function rejects(fn: () => Promise<unknown>): Promise<boolean> {
    try { await fn(); return false; } catch { return true; }
}
const count = async (sql: string, params: any[]) => Number((await pool.query(sql, params)).rows[0].n);

async function run() {
    const sportId = (await pool.query('SELECT id FROM sports ORDER BY id LIMIT 1')).rows[0]?.id;
    if (!sportId) throw new Error('Needs at least one sport in the database.');

    // --- Organisations: add and update run in transactions.
    const host = await organizationManager.addOrganization({ id: `${P}-host`, name: `${P} Host`, supportedSportIds: [sportId] } as any);
    const guest = await organizationManager.addOrganization({ id: `${P}-guest`, name: `${P} Guest` } as any);
    check(await count('SELECT count(*) n FROM organization_sports WHERE org_id = $1', [host.id]) === 1, 'addOrganization writes the org and its sports together');
    await organizationManager.updateOrganization(guest.id, { supportedSportIds: [sportId], name: `${P} Guest 2` });
    check(await count('SELECT count(*) n FROM organization_sports WHERE org_id = $1', [guest.id]) === 1, 'updateOrganization replaces supported sports');
    check(await rejects(() => organizationManager.updateOrganization(guest.id, { name: `${P} Renamed`, supportedSportIds: ['no-such-sport'] })), 'updateOrganization with a bad sport fails');
    check((await pool.query('SELECT name FROM organizations WHERE id = $1', [guest.id])).rows[0].name === `${P} Guest 2`, '…and its rename is rolled back with it');

    // --- Site and facility.
    const site = await siteManager.addSite({ id: `${P}-site`, name: `${P} Site`, orgId: host.id } as any);
    const facility = await facilityManager.addFacility({ id: `${P}-fac`, name: `${P} Field`, siteId: site.id, supportedSportIds: [sportId] } as any);
    check(await count('SELECT count(*) n FROM facility_sports WHERE facility_id = $1', [facility.id]) === 1, 'addFacility writes the facility and its sports together');
    check(await rejects(() => facilityManager.updateFacility(facility.id, { name: `${P} Renamed`, supportedSportIds: ['no-such-sport'] })), 'updateFacility with a bad sport fails');
    check((await pool.query('SELECT name FROM facilities WHERE id = $1', [facility.id])).rows[0].name === `${P} Field`, '…and its rename is rolled back');
    check(await count('SELECT count(*) n FROM facility_sports WHERE facility_id = $1', [facility.id]) === 1, '…and its sports are left as they were');

    // --- Events.
    const event = await eventManager.addEvent({ id: `${P}-event`, name: `${P} Event`, type: 'SingleMatch', orgId: host.id, sportIds: [sportId], settings: {}, status: 'Scheduled' } as any);
    check(event.sportIds?.length === 1 && event.participatingOrgIds?.includes(host.id) === true, 'addEvent writes the event, its sport and the host as participant');
    check(await rejects(() => eventManager.addEvent({ id: `${P}-bad`, name: 'bad', type: 'SingleMatch', orgId: host.id, participatingOrgIds: ['no-such-org'], settings: {} } as any)), 'addEvent with an unknown participant org fails');
    check(await count('SELECT count(*) n FROM events WHERE id = $1', [`${P}-bad`]) === 0, '…and leaves no event row behind');
    check(await rejects(() => eventManager.updateEvent(event.id, { name: `${P} Renamed`, participatingOrgIds: ['no-such-org'] })), 'updateEvent with an unknown participant org fails');
    check((await eventManager.getEvent(event.id))?.name === `${P} Event`, '…and its rename is rolled back');
    check(await count('SELECT count(*) n FROM event_organizations WHERE event_id = $1', [event.id]) === 1, '…and its participants are left as they were');

    // --- Games. The guest's team plays, so syncing participating orgs must see the participant
    // row written earlier in the same transaction.
    await pool.query('INSERT INTO teams (id, name, sport_id, org_id) VALUES ($1, $2, $3, $4)', [`${P}-team`, `${P} Team`, sportId, guest.id]);
    const game = await eventManager.addGame({ eventId: event.id, sportId, startTime: new Date().toISOString(), participants: [{ teamId: `${P}-team` }] } as any);
    check(game?.participants?.length === 1, 'addGame returns the game with its participant (read after commit)');
    check((await eventManager.getEvent(event.id))?.participatingOrgIds?.includes(guest.id) === true, 'addGame adds the playing team\'s org to the event, inside the transaction');

    const updated = await eventManager.updateGame(game.id, { status: 'Live', participants: [{ teamId: `${P}-team` }, { teamId: null, orgProfileId: null }] } as any);
    check(updated?.status === 'Live' && updated?.participants?.length === 2, 'updateGame updates the game and reconciles participants');
    check(await rejects(() => eventManager.updateGame(game.id, { status: 'Finished', participants: [{ teamId: `${P}-team`, id: updated!.participants![0].id }], facilityId: 'no-such-facility' } as any)), 'updateGame with a bad facility fails');
    const afterFail = await eventManager.getGame(game.id);
    check(afterFail?.status === 'Live' && afterFail?.participants?.length === 2, '…and neither the status nor the participants change');

    const reset = await eventManager.resetGame(game.id);
    check(reset?.status === 'Scheduled', 'resetGame resets the game');

    // --- Rosters: delete-then-insert, so a failure must not leave the roster empty.
    const person = await userManager.addOrgProfile({ orgId: guest.id, name: `${P} Player`, identifier: `${P}-p1` } as any);
    const participantId = reset!.participants![0].id;
    await eventManager.saveGameRoster(game.id, participantId, [{ orgProfileId: person.id, isReserve: false }]);
    check(await count('SELECT count(*) n FROM game_rosters WHERE game_participant_id = $1', [participantId]) === 1, 'saveGameRoster saves the roster');
    check(await rejects(() => eventManager.saveGameRoster(game.id, participantId, [{ orgProfileId: 'no-such-profile', isReserve: false }])), 'saveGameRoster with an unknown person fails');
    check(await count('SELECT count(*) n FROM game_rosters WHERE game_participant_id = $1', [participantId]) === 1, '…and the previous roster survives');

    // --- Concurrency: the case the pooled version got wrong. Thirty event creations at once,
    // every other one failing on its last statement.
    const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) =>
        eventManager.addEvent({
            id: `${P}-c${i}`, name: `${P} C${i}`, type: 'SingleMatch', orgId: host.id, sportIds: [sportId], settings: {},
            participatingOrgIds: i % 2 ? ['no-such-org'] : [guest.id],
        } as any)
    ));
    check(results.filter(r => r.status === 'fulfilled').length === 15, '30 concurrent addEvents: the 15 valid ones succeed');
    check(await count(`SELECT count(*) n FROM events WHERE id LIKE $1`, [`${P}-c%`]) === 15, '…and none of the 15 failures leaves an event behind');
    check(await count(`SELECT count(*) n FROM event_sports WHERE event_id LIKE $1`, [`${P}-c%`]) === 15, '…or a stray sport row');
    check(await count(`SELECT count(*) n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'`, []) === 0, 'no connection is left idle inside a transaction');

    // --- Deletes run in transactions too.
    for (let i = 0; i < 30; i += 2) await eventManager.deleteEvent(`${P}-c${i}`);
    await eventManager.deleteEvent(event.id);
    check(await count('SELECT count(*) n FROM events WHERE id LIKE $1', [`${P}%`]) === 0, 'deleteEvent removes events and their games');
    await facilityManager.deleteFacility(facility.id);
    check(await count('SELECT count(*) n FROM facilities WHERE id = $1', [facility.id]) === 0, 'deleteFacility removes the facility');
    await siteManager.deleteSite(site.id);
    check(await count('SELECT count(*) n FROM sites WHERE id = $1', [site.id]) === 0, 'deleteSite removes the site');
    await userManager.deleteOrgProfile(person.id);
    await pool.query('DELETE FROM teams WHERE id = $1', [`${P}-team`]);
    await organizationManager.deleteOrganization(guest.id);
    check(await count('SELECT count(*) n FROM organizations WHERE id = $1', [guest.id]) === 0, 'deleteOrganization removes the org');
}

async function cleanup() {
    // Whatever the checks left behind, in foreign-key order.
    const like = `${P}%`;
    await pool.query(`DELETE FROM game_rosters WHERE game_participant_id IN (SELECT gp.id FROM game_participants gp JOIN games g ON g.id = gp.game_id WHERE g.event_id LIKE $1)`, [like]);
    await pool.query('DELETE FROM events WHERE id LIKE $1', [like]);
    await pool.query('DELETE FROM facilities WHERE id LIKE $1', [like]);
    await pool.query('DELETE FROM sites WHERE id LIKE $1', [like]);
    await pool.query('DELETE FROM teams WHERE id LIKE $1', [like]);
    await pool.query(`DELETE FROM org_profiles WHERE identifier LIKE $1`, [like]);
    await pool.query('DELETE FROM organization_sports WHERE org_id LIKE $1', [like]);
    await pool.query('DELETE FROM organization_roles WHERE org_id LIKE $1', [like]);
    await pool.query('DELETE FROM org_memberships WHERE org_id LIKE $1', [like]);
    await pool.query('DELETE FROM organizations WHERE id LIKE $1', [like]);
}

run()
    .catch(err => { console.error('Test failed with error:', err); failures++; })
    .finally(async () => {
        await cleanup().catch(err => { console.error('Cleanup failed:', err); failures++; });
        console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
        await pool.end();
        process.exit(failures ? 1 : 0);
    });
