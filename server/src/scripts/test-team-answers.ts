import pool from '../db';
import { SocketAction } from '@sk/shared';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { enforceTournamentAction } from '../wss/tournamentGate';
import { enforceOrgAction } from '../wss/orgGate';
import { fixtureIds } from './setup/fixtures/testOrgs';

/**
 * `FIX-31`, `FIX-33`: teams answer their own invitation, each division's entries are locked by hand,
 * and invited organisations may add teams of their own.
 *
 *  - A team the organisers enter starts **invited**; the host's own team and a placeholder start
 *    accepted.
 *  - **Who answers for a team**: its organisation's admins (any team), its coach (their own), or the
 *    division's organisers. Staff and strangers are refused.
 *  - **The organisers** may decline at any time, but accept only once the team's organisation has
 *    accepted (rule 6). Its own people may accept before then (rule 1).
 *  - **The lock**: refused while a team is still invited, a request waits, or a team's organisation
 *    has not accepted; the draw needs it; after it a team leaves only by withdrawing.
 *  - **Accepting with its teams** accepts every invited team; teams already answered keep theirs.
 *  - **Withdrawing a team** after the lock: asked with a reason, cancellable, confirmed or kept in.
 *  - **Asking to enter**: late, after the lock, whatever the setting; before it, only where the
 *    division allows (`FIX-33`, the tournament's default or the division's own choice). Only an
 *    invited organisation; admins for any team, a coach for their own. Turned down is kept.
 *  - **Declining** keeps its teams, as the record, declined.
 *  - **Lock all** locks what it can and says why the rest stay open.
 *
 * Starts from the test organisations (Doringkloof hosting, St Aldric's and Riverbend invited,
 * Kwaggafontein not), against `sk_test`: run `npm run db:test-orgs` there first, then
 * `DB_NAME=sk_test npx ts-node src/scripts/test-team-answers.ts` (from server/). Adds one tournament
 * under a `test-` id and deletes it at the end.
 */

const P = `test-answers-${Date.now()}`;
let failures = 0;
let passes = 0;
function check(ok: boolean, label: string) {
  if (ok) passes++;
  else {
    failures++;
    console.log(`[FAIL] ${label}`);
  }
}
async function rejects(fn: () => Promise<unknown>, pattern?: RegExp): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (error: any) {
    if (pattern && !pattern.test(String(error?.message))) console.log(`   (refused, but with: ${error?.message})`);
    return pattern ? pattern.test(String(error?.message)) : true;
  }
}
const q = (sql: string, params: any[] = []) => pool.query(sql, params);
const statusOf = async (entrantId: string) =>
  (await q('SELECT status FROM division_entrants WHERE id = $1', [entrantId])).rows[0]?.status;
const inStage = async (stageId: string, entrantId: string) =>
  (await q('SELECT 1 FROM stage_entrants WHERE stage_id = $1 AND entrant_id = $2', [stageId, entrantId])).rows.length > 0;

const DKL = fixtureIds.org('dkl');
const SAC = fixtureIds.org('sac');
const RBH = fixtureIds.org('rbh');
const KSC = fixtureIds.org('ksc');
const DKL_ADMIN = fixtureIds.user('Johan van der Merwe');
const SAC_ADMIN = fixtureIds.user('Catherine Whitfield');
const SAC_STAFF = fixtureIds.user('Graham Hendricks');
const SAC_COACH = fixtureIds.user("Brendan O'Neill"); // St Aldric's U16 A
const RBH_ADMIN = fixtureIds.user('Sipho Dlamini');
const RBH_COACH = fixtureIds.user('Themba Zulu'); // Riverbend U16 A
const KSC_ADMIN = fixtureIds.user('Riaan Venter');
const T = {
  dkl: fixtureIds.team('dkl', 'rugby-u16a'),
  sac: fixtureIds.team('sac', 'rugby-u16a'),
  sacXv: fixtureIds.team('sac', 'rugby-1stxv'),
  rbh: fixtureIds.team('rbh', 'rugby-u16a'),
  rbhXv: fixtureIds.team('rbh', 'rugby-1stxv'),
  ksc: fixtureIds.team('ksc', 'rugby-u16'),
};

async function run() {
  for (const user of [DKL_ADMIN, SAC_ADMIN, SAC_STAFF, SAC_COACH, RBH_ADMIN, RBH_COACH, KSC_ADMIN]) {
    if (!(await q('SELECT 1 FROM users WHERE id = $1', [user])).rows.length) {
      throw new Error(`Fixture user ${user} is missing — run npm run db:test-orgs against this database first.`);
    }
  }

  const event = await eventManager.addEvent({
    id: `${P}-event`, name: `${P} Cup`, type: 'Tournament', orgId: DKL, sportIds: ['rugby'],
    startDate: '2026-11-01', settings: {}, status: 'Scheduled',
  } as any);
  await eventManager.addEventOrgs(event.id, [SAC, RBH], true, { userId: DKL_ADMIN, orgId: DKL });
  const division = await tournamentManager.addDivision({ eventId: event.id, name: 'U16', sportId: 'rugby' } as any);
  const stage = await tournamentManager.addStage({ divisionId: division.id, name: 'Fixtures', format: 'RoundRobin' } as any);
  const as = (userId: string, type: SocketAction, payload: any) =>
    rejects(() => (type in GATED_BY_TOURNAMENT ? enforceTournamentAction(userId, type, payload) : enforceOrgAction(userId, type, payload)));

  // --- Entering ---------------------------------------------------------------------------------
  await tournamentManager.setDivisionEntrants(division.id, [
    { teamId: T.dkl }, { teamId: T.sac }, { teamId: T.rbh }, { teamId: T.rbhXv }, { label: 'Winner of the qualifier' },
  ]);
  const entrants = await tournamentManager.getEntrants(division.id);
  const id = (teamId: string) => entrants.find(e => e.teamId === teamId)!.id;
  const placeholder = entrants.find(e => !e.teamId)!.id;
  check((await statusOf(id(T.sac))) === 'invited' && (await statusOf(id(T.rbh))) === 'invited', 'a team the organisers enter starts invited');
  check((await statusOf(id(T.dkl))) === 'accepted', "the host's own team starts accepted");
  check((await statusOf(placeholder)) === 'accepted', 'a placeholder starts accepted');
  check(!(await inStage(stage.id, id(T.sac))) && (await inStage(stage.id, id(T.dkl))), 'only a team in play is in the stage the draw takes');
  const sacInvites = await tournamentManager.getTeamEntries({ orgId: SAC, invitedOnly: true });
  check(sacInvites.some(e => e.teamId === T.sac && e.eventName === `${P} Cup` && e.divisionName === 'U16'),
    "an organisation's invitations list names each team still invited, with its tournament and division");
  check((await tournamentManager.getTeamEntries({ teamId: T.dkl })).length === 1, "a team's own entries list its tournaments");

  // --- Who may answer for a team ----------------------------------------------------------------
  const answer = (entrantId: string, ans = 'accepted') => ({ divisionId: division.id, entrantId, orgId: SAC, answer: ans });
  check(!(await as(SAC_ADMIN, SocketAction.SET_ENTRANT_ANSWER, answer(id(T.sac)))), "its organisation's admin may answer for a team");
  check(!(await as(SAC_COACH, SocketAction.SET_ENTRANT_ANSWER, answer(id(T.sac)))), 'its coach may answer for their own team');
  check(await as(SAC_STAFF, SocketAction.SET_ENTRANT_ANSWER, answer(id(T.sac))), "its organisation's staff may not");
  check(await as(RBH_COACH, SocketAction.SET_ENTRANT_ANSWER, answer(id(T.sac))), "another team's coach may not");
  check(await as(SAC_ADMIN, SocketAction.SET_ENTRANT_ANSWER, answer(id(T.rbh))), "another organisation's admin may not");
  check(!(await as(DKL_ADMIN, SocketAction.SET_ENTRANT_ANSWER, answer(id(T.rbh)))), "the tournament's organisers may");
  check(await as(KSC_ADMIN, SocketAction.SET_ENTRANT_ANSWER, answer(id(T.rbh))), 'a stranger may not');

  // --- Each side's rules ------------------------------------------------------------------------
  const coach = { userId: SAC_COACH, orgId: SAC };
  const organisers = { userId: DKL_ADMIN, orgId: DKL };
  await tournamentManager.setEntrantAnswer(division.id, id(T.sac), 'accepted', 'organisation', coach);
  check((await statusOf(id(T.sac))) === 'accepted', "a coach may accept before the organisation has (rule 1)");
  const sacTeam = await tournamentManager.getEntrant(id(T.sac));
  check(sacTeam?.answeredBy?.name === "Brendan O'Neill", '…and who answered is recorded, by name');
  check(await inStage(stage.id, id(T.sac)), '…and an accepted team joins the stage');
  check(
    await rejects(() => tournamentManager.setEntrantAnswer(division.id, id(T.rbh), 'accepted', 'organisers', organisers), /organisation has accepted/),
    'the organisers may not accept a team before its organisation has (rule 6)'
  );
  await tournamentManager.setEntrantAnswer(division.id, id(T.rbh), 'declined', 'organisers', organisers, 'No space');
  check((await statusOf(id(T.rbh))) === 'declined', '…but may decline it at any time');
  check((await tournamentManager.getEntrant(id(T.rbh)))?.reason === 'No space', '…with the reason kept');
  await tournamentManager.setEntrantAnswer(division.id, id(T.rbh), 'accepted', 'organisation', { userId: RBH_ADMIN, orgId: RBH });
  check((await statusOf(id(T.rbh))) === 'accepted', 'before the lock either side may change an answer');

  // --- The lock ---------------------------------------------------------------------------------
  check(
    await rejects(() => tournamentManager.generateStageFixtures(stage.id, 'create'), /Lock the entries first/),
    'the draw needs the lock'
  );
  check(
    await rejects(() => tournamentManager.setDivisionLock(division.id, true, organisers), /still to answer/),
    'the lock is refused while a team is still invited'
  );
  // Riverbend accepts, and its invited team with it; its answered team keeps its answer.
  await tournamentManager.setEntrantAnswer(division.id, id(T.rbh), 'declined', 'organisation', { userId: RBH_ADMIN, orgId: RBH });
  await eventManager.setEventOrgAnswer(event.id, RBH, 'accepted', { userId: RBH_ADMIN, orgId: RBH });
  await tournamentManager.acceptOrgTeams(event.id, RBH, { userId: RBH_ADMIN, orgId: RBH });
  check((await statusOf(id(T.rbhXv))) === 'accepted', 'accepting with its teams accepts every invited team');
  check((await statusOf(id(T.rbh))) === 'declined', '…and a team already declined stays declined');
  check(
    await rejects(() => tournamentManager.setDivisionLock(division.id, true, organisers), /has not accepted/),
    "the lock is refused while a team's organisation has not accepted"
  );
  check(
    await as(DKL_ADMIN, SocketAction.SET_DIVISION_LOCK, { divisionId: division.id, orgId: DKL, locked: true }) === false,
    'the organisers may lock a division'
  );
  check(await as(SAC_ADMIN, SocketAction.SET_DIVISION_LOCK, { divisionId: division.id, orgId: SAC, locked: true }), "a taking-part organisation's admin may not");
  await eventManager.setEventOrgAnswer(event.id, SAC, 'accepted', { userId: SAC_ADMIN, orgId: SAC });
  const locked = await tournamentManager.setDivisionLock(division.id, true, organisers);
  check(!!locked.entriesLockedAt && locked.entriesLockedBy?.name === 'Johan van der Merwe', 'locked once everything is answered, with who locked it');
  check(
    await rejects(() => tournamentManager.setEntrantAnswer(division.id, id(T.sac), 'declined', 'organisation', coach), /locked/),
    'after the lock an answer no longer changes'
  );

  // --- Withdrawing a team after the lock --------------------------------------------------------
  const withdrawal = { divisionId: division.id, entrantId: id(T.sac), orgId: SAC, reason: 'Injuries' };
  check(!(await as(SAC_ADMIN, SocketAction.REQUEST_ENTRANT_WITHDRAWAL, withdrawal)), 'its organisation may ask to withdraw a team');
  check(await as(DKL_ADMIN, SocketAction.REQUEST_ENTRANT_WITHDRAWAL, withdrawal), "…which is not the organisers' to ask");
  check(
    await rejects(() => tournamentManager.requestEntrantWithdrawal(division.id, id(T.sac), ' ', coach), /why/),
    'asking to withdraw needs a reason'
  );
  await tournamentManager.requestEntrantWithdrawal(division.id, id(T.sac), 'Injuries', coach);
  check((await statusOf(id(T.sac))) === 'withdrawal_pending' && (await inStage(stage.id, id(T.sac))), 'a pending withdrawal changes nothing yet');
  await tournamentManager.cancelEntrantRequest(division.id, id(T.sac));
  check((await statusOf(id(T.sac))) === 'accepted', 'cancelled, the team is accepted again');
  await tournamentManager.requestEntrantWithdrawal(division.id, id(T.sac), 'Injuries', coach);
  await tournamentManager.respondEntrantRequest(division.id, id(T.sac), false, organisers);
  check((await statusOf(id(T.sac))) === 'accepted', 'kept in by the organisers, it is accepted again');
  await tournamentManager.requestEntrantWithdrawal(division.id, id(T.sac), 'Injuries', coach);
  await tournamentManager.respondEntrantRequest(division.id, id(T.sac), true, organisers);
  check((await statusOf(id(T.sac))) === 'withdrawn' && !(await inStage(stage.id, id(T.sac))), 'confirmed, it is withdrawn and out of the draw');
  check((await tournamentManager.getEntrant(id(T.sac)))?.reason === 'Injuries', '…and the reason stays, as the record');

  // --- Asking to enter, late ----------------------------------------------------------------------
  const entry = (teamId: string) => ({ divisionId: division.id, teamId, orgId: SAC });
  check(!(await as(SAC_ADMIN, SocketAction.REQUEST_ENTRY, entry(T.sacXv))), "an organisation's admin may ask to enter any of its teams");
  check(await as(SAC_COACH, SocketAction.REQUEST_ENTRY, entry(T.sacXv)), 'a coach may not ask for a team they do not coach');
  check(await as(SAC_STAFF, SocketAction.REQUEST_ENTRY, entry(T.sacXv)), 'staff may not ask');
  const late = await tournamentManager.requestEntry(division.id, T.sacXv, { userId: SAC_ADMIN }, 'Squad back');
  check(late.status === 'requested', 'after the lock a team can be asked for late, whatever the setting');
  check(
    await rejects(() => tournamentManager.requestEntry(division.id, T.ksc, { userId: KSC_ADMIN }), /invited/),
    'an organisation not invited cannot ask'
  );
  await tournamentManager.respondEntrantRequest(division.id, late.id, false, organisers);
  check((await statusOf(late.id)) === 'rejected', 'turned down, the request is kept as the record');

  // --- Asking to add, before the lock (FIX-33) ----------------------------------------------------
  await tournamentManager.setDivisionLock(division.id, false, organisers);
  check(
    await rejects(() => tournamentManager.requestEntry(division.id, T.sacXv, { userId: SAC_ADMIN }), /enter its teams/),
    'while open, adding is refused where the division does not allow it (off by default)'
  );
  await eventManager.updateEvent(event.id, { orgsMayAddTeams: true } as any);
  const added = await tournamentManager.requestEntry(division.id, T.sacXv, { userId: SAC_ADMIN });
  check(added.status === 'requested', "with the tournament's setting on, an organisation may add a team, for approval");
  check(
    await rejects(() => tournamentManager.setDivisionLock(division.id, true, organisers), /waiting for your approval/),
    'the lock is refused while an added team waits (FIX-33 rule 7)'
  );
  await tournamentManager.cancelEntrantRequest(division.id, added.id);
  check(!(await q('SELECT 1 FROM division_entrants WHERE id = $1', [added.id])).rows.length, 'an added team cancelled is gone: it was never in');
  await tournamentManager.setDivisionOrgAdding(division.id, false);
  check(
    await rejects(() => tournamentManager.requestEntry(division.id, T.sacXv, { userId: SAC_ADMIN }), /enter its teams/),
    "a division's own choice overrides the tournament's"
  );
  check(!(await as(DKL_ADMIN, SocketAction.SET_DIVISION_ORG_ADDING, { divisionId: division.id, orgId: DKL, allow: null })), 'its organisers may choose for the division');
  await tournamentManager.setDivisionOrgAdding(division.id, null);
  check((await tournamentManager.getDivision(division.id))?.orgsMayAddTeams === null, '…and go back to following the tournament');

  // --- Declining keeps the teams, as the record ---------------------------------------------------
  await eventManager.setEventOrgAnswer(event.id, RBH, 'declined', organisers);
  await tournamentManager.retireOrgEntrants(event.id, RBH, 'declined', organisers);
  check((await statusOf(id(T.rbhXv))) === 'declined', "an organisation declining declines its teams, kept as the record");

  // --- Lock all -----------------------------------------------------------------------------------
  const second = await tournamentManager.addDivision({ eventId: event.id, name: 'U19', sportId: 'rugby' } as any);
  await tournamentManager.setDivisionEntrants(second.id, [{ teamId: T.sacXv }]);
  check(await as(SAC_ADMIN, SocketAction.LOCK_EVENT_DIVISIONS, { eventId: event.id, orgId: SAC }), "Lock all is the tournament's organisers' only");
  const all = await tournamentManager.lockEventDivisions(event.id, organisers);
  check(all.lockedIds.includes(division.id), 'Lock all locks what can be locked');
  check(all.notLocked.some(n => n.divisionId === second.id && /still to answer/.test(n.reason)), '…and says why the rest stay open');
}

/** The organisers' half goes through the tournament gate; the rest through the org gate. */
const GATED_BY_TOURNAMENT: Partial<Record<SocketAction, true>> = {
  [SocketAction.SET_DIVISION_LOCK]: true,
  [SocketAction.LOCK_EVENT_DIVISIONS]: true,
  [SocketAction.SET_DIVISION_ORG_ADDING]: true,
  [SocketAction.RESPOND_ENTRANT_REQUEST]: true,
};

(async () => {
  try {
    await run();
  } catch (error) {
    console.error('[ERROR]', error);
    failures++;
  } finally {
    try {
      await q('DELETE FROM events WHERE id = $1', [`${P}-event`]);
    } catch (error) {
      console.error('[CLEANUP ERROR]', error);
    }
    console.log(failures ? `\nFAIL — ${failures} of ${passes + failures} checks.` : `\nPASS — ${passes} team answer and entry checks.`);
    await pool.end();
    process.exit(failures ? 1 : 0);
  }
})();
