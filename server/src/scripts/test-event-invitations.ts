import pool from '../db';
import { SocketAction } from '@sk/shared';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { accessManager } from '../managers/AccessManager';
import { enforceTournamentAction } from '../wss/tournamentGate';
import { enforceOrgAction } from '../wss/orgGate';

/**
 * `FIX-29`: an organisation added to an event but **not invited yet** must not see it by any route
 * — its row, its entered teams, or its teams' fixtures — and the invitation actions are authorised
 * as agreed: the event's organisers add, invite and remove; an answer is theirs or the invited
 * organisation's own.
 *
 * Creates its own organisations, people, event, division, teams and fixture under a unique prefix,
 * and deletes them at the end whatever happens. Needs one sport in the database.
 *
 * Run: `npx ts-node src/scripts/test-event-invitations.ts` (from server/).
 */

const P = `invtest-${Date.now()}`;
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
const invitationOf = async (eventId: string, orgId: string) =>
    (await q('SELECT invitation FROM event_organizations WHERE event_id = $1 AND org_id = $2', [eventId, orgId])).rows[0]?.invitation;

const created = { orgIds: [] as string[], userIds: [] as string[], eventIds: [] as string[], teamIds: [] as string[] };

async function makeOrg(slug: string): Promise<string> {
    const id = `${P}-${slug}`;
    await q(`INSERT INTO organizations (id, name, short_name, is_claimed) VALUES ($1, $2, $3, true)`, [id, `${P} ${slug}`, slug.toUpperCase().slice(0, 4)]);
    created.orgIds.push(id);
    return id;
}

/** A user who is an admin of `orgId`. */
async function makeAdmin(slug: string, orgId: string): Promise<string> {
    const userId = `${P}-user-${slug}`;
    await q(`INSERT INTO users (id, name, email, global_role) VALUES ($1, $2, $3, 'user')`, [userId, slug, `${userId}@example.test`]);
    created.userIds.push(userId);
    await q(`INSERT INTO org_profiles (id, org_id, user_id, name, email) VALUES ($1, $2, $3, $4, $5)`, [`${userId}-p`, orgId, userId, slug, `${userId}@example.test`]);
    await q(
        `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES ($1, $2, $3, 'role-org-admin', NOW())`,
        [`${userId}-m`, `${userId}-p`, orgId]
    );
    return userId;
}

async function makeTeam(slug: string, orgId: string, sportId: string): Promise<string> {
    const id = `${P}-team-${slug}`;
    await q('INSERT INTO teams (id, name, sport_id, org_id) VALUES ($1, $2, $3, $4)', [id, `${P} ${slug}`, sportId, orgId]);
    created.teamIds.push(id);
    return id;
}

const sees = async (orgId: string, eventId: string, gameId: string, divisionId: string) => ({
    events: (await eventManager.getEvents(orgId)).some(e => e.id === eventId),
    games: (await eventManager.getGames(orgId)).some(g => g.id === gameId),
    summaries: (await eventManager.getGameSummaries(orgId)).some(g => g.id === gameId),
    gameStake: (await accessManager.getGameOrgIds(gameId)).includes(orgId),
    divisionStake: (await accessManager.getDivisionOrgIds(divisionId)).includes(orgId),
    eventStake: (await accessManager.getEventOrgIds(eventId)).includes(orgId),
});

async function run() {
    const sportId = (await q('SELECT id FROM sports ORDER BY id LIMIT 1')).rows[0]?.id;
    if (!sportId) throw new Error('Needs at least one sport in the database.');

    const host = await makeOrg('host');
    const guest = await makeOrg('guest');
    const late = await makeOrg('late');
    const hostAdmin = await makeAdmin('hostadmin', host);
    const guestAdmin = await makeAdmin('guestadmin', guest);
    const lateAdmin = await makeAdmin('lateadmin', late);

    const event = await eventManager.addEvent({
        id: `${P}-event`, name: `${P} Cup`, type: 'Tournament', orgId: host, sportIds: [sportId],
        startDate: '2026-11-01', settings: {}, status: 'Scheduled',
    } as any);
    created.eventIds.push(event.id);
    check(event.participatingOrgs?.find(o => o.id === host)?.invitation === 'accepted', 'the host takes part as accepted');

    // --- Adding without inviting.
    const added = await eventManager.addEventOrgs(event.id, [guest, host], false);
    check(added.participatingOrgs?.find(o => o.id === guest)?.invitation === 'not_invited', 'an organisation added without inviting is not invited yet');
    check(added.participatingOrgs?.find(o => o.id === host)?.invitation === 'accepted', '…and adding the host again leaves it accepted');
    check(!(added.participatingOrgIds || []).includes(guest), '…and it is not among the organisations that can see the event');

    // Its team is entered and drawn into a fixture before the invitation goes out.
    const division = await tournamentManager.addDivision({ eventId: event.id, name: `${P} Open`, sportId } as any);
    const guestTeam = await makeTeam('guest', guest, sportId);
    const hostTeam = await makeTeam('host', host, sportId);
    await tournamentManager.setDivisionEntrants(division.id, [{ teamId: guestTeam }, { teamId: hostTeam }]);
    const game = await eventManager.addGame({
        eventId: event.id, sportId, startTime: '2026-11-01T08:00:00Z', participants: [{ teamId: hostTeam }, { teamId: guestTeam }],
    } as any);
    check((await invitationOf(event.id, guest)) === 'not_invited', 'a fixture with its team does not turn the row into an invitation');

    const before = await sees(guest, event.id, game.id, division.id);
    check(!before.events, 'not invited: the event is not in its events list');
    check(!before.games && !before.summaries, 'not invited: its fixtures are not among its games');
    check(!before.gameStake, 'not invited: it has no stake in the fixture, though its team plays');
    check(!before.divisionStake, 'not invited: it cannot read the roster its team is in');
    check(!before.eventStake, 'not invited: it is not one of the event\'s organisations');
    check((await sees(host, event.id, game.id, division.id)).events, 'the host still sees its event');

    check(await rejects(() => eventManager.setEventOrgAnswer(event.id, guest, 'accepted'), /not been invited/), 'an answer before an invitation is refused');

    // --- Inviting.
    const invited = await eventManager.inviteEventOrgs(event.id, [guest]);
    check(invited.newlyInvited.length === 1 && invited.newlyInvited[0] === guest, 'inviting reports the organisation as newly able to see it');
    check(!!invited.event.participatingOrgs?.find(o => o.id === guest)?.invitedAt, '…and records when');
    check((await eventManager.inviteEventOrgs(event.id, [guest])).newlyInvited.length === 0, 'inviting it again changes nothing');
    const after = await sees(guest, event.id, game.id, division.id);
    check(after.events && after.games && after.summaries, 'invited: the event and its fixtures are visible to it');
    check(after.gameStake && after.divisionStake && after.eventStake, 'invited: it has its stake in the fixture, roster and event');

    // --- Answers.
    const accepted = await eventManager.setEventOrgAnswer(event.id, guest, 'accepted');
    const guestRow = accepted.participatingOrgs?.find(o => o.id === guest);
    check(guestRow?.invitation === 'accepted' && !!guestRow.answeredAt, 'an answer is recorded with its time');
    const cleared = await eventManager.setEventOrgAnswer(event.id, guest, 'invited');
    check(cleared.participatingOrgs?.find(o => o.id === guest)?.answeredAt == null, '"no answer yet" clears the time');
    await eventManager.setEventOrgAnswer(event.id, guest, 'declined');
    check((await sees(guest, event.id, game.id, division.id)).events, 'a declined organisation can still see the event');
    check(await rejects(() => eventManager.setEventOrgAnswer(event.id, host, 'declined'), /host/), 'the host has no invitation to answer');

    // --- Adding and inviting at once; the whole-list write keeps everybody's status.
    await eventManager.addEventOrgs(event.id, [late], false);
    await eventManager.updateEvent(event.id, { participatingOrgIds: [host, guest, late] });
    check((await invitationOf(event.id, guest)) === 'declined' && (await invitationOf(event.id, late)) === 'not_invited', 'the whole-list write keeps each organisation\'s invitation');
    await eventManager.updateEvent(event.id, { participatingOrgIds: [host, guest] });
    check((await invitationOf(event.id, late)) === undefined, '…and still takes out one no longer listed');
    await eventManager.addEventOrgs(event.id, [late], true);
    check((await invitationOf(event.id, late)) === 'invited', 'adding and inviting at once invites');

    // --- The gates.
    const payload = (extra: any) => ({ eventId: event.id, orgId: host, ...extra });
    check(!(await rejects(() => enforceTournamentAction(hostAdmin, SocketAction.ADD_EVENT_ORGS, payload({ participantOrgIds: [late], invite: true })))), 'the host\'s admin may add organisations');
    check(await rejects(() => enforceTournamentAction(guestAdmin, SocketAction.INVITE_EVENT_ORGS, { eventId: event.id, orgId: guest, participantOrgIds: [late] })), 'a taking-part organisation\'s admin may not invite others');
    check(await rejects(() => enforceTournamentAction(null, SocketAction.REMOVE_EVENT_ORG, payload({ participantOrgId: guest }))), 'nobody signed out may remove one');
    check(!(await rejects(() => enforceOrgAction(guestAdmin, SocketAction.SET_EVENT_ORG_ANSWER, { eventId: event.id, orgId: guest, participantOrgId: guest, answer: 'accepted' }))), 'an invited organisation\'s admin may answer for it');
    check(await rejects(() => enforceOrgAction(guestAdmin, SocketAction.SET_EVENT_ORG_ANSWER, { eventId: event.id, orgId: guest, participantOrgId: late, answer: 'declined' })), '…but not for another organisation');
    check(await rejects(() => enforceOrgAction(lateAdmin, SocketAction.SET_EVENT_ORG_ANSWER, { eventId: event.id, orgId: late, participantOrgId: guest, answer: 'declined' })), 'one organisation\'s admin cannot answer for a third');
    check(!(await rejects(() => enforceOrgAction(hostAdmin, SocketAction.SET_EVENT_ORG_ANSWER, payload({ participantOrgId: late, answer: 'accepted' })))), 'the event\'s organisers may record any organisation\'s answer');

    // --- Removing.
    await q(`UPDATE games SET status = 'Finished' WHERE id = $1`, [game.id]);
    check(await rejects(() => tournamentManager.removeEventOrg(event.id, guest), /played a fixture/), 'an organisation whose team has played cannot be removed');
    check((await invitationOf(event.id, guest)) === 'declined', '…and stays taking part');
    await q(`UPDATE games SET status = 'Scheduled', final_score_data = NULL WHERE id = $1`, [game.id]);
    const removal = await tournamentManager.removeEventOrg(event.id, guest);
    check(removal.divisions.length === 1 && removal.divisions[0].divisionId === division.id, 'removing it reports the division whose roster changed');
    check((await invitationOf(event.id, guest)) === undefined, '…takes it out of the event');
    const left = await q('SELECT count(*)::int n FROM division_entrants WHERE division_id = $1 AND org_id = $2', [division.id, guest]);
    check(left.rows[0].n === 0, '…and its entrants with it');
}

async function cleanup() {
    for (const id of created.eventIds) await q('DELETE FROM events WHERE id = $1', [id]);
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
