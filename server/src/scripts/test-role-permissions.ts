import pool from '../db';
import { SocketAction } from '@sk/shared';
import { accessManager } from '../managers/AccessManager';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { addGameOfficial } from '../managers/gameOfficials';
import { enforceOrgAction } from '../wss/orgGate';
import { enforceProfileAction } from '../wss/profileGate';
import { fixtureIds } from './setup/fixtures/testOrgs';

/**
 * What each role may do, as decided on 2026-10-31 in docs/permissions.md (`PERM-2`, `PERM-5`,
 * `PERM-6`, `PERM-7`), against the real gates and `AccessManager`:
 *
 *  - **A coach** runs their own team: its record (not switching it off), its roster and team roles —
 *    never the Coach; an assistant coach not other assistant coaches either. Their team's people's
 *    details, a new Member for the team, and single matches for it. Nothing of another team.
 *  - **A team scorer** scores every game the team plays.
 *  - **Game officials**: a scorer or match official scores; a timekeeper keeps time and nothing else.
 *    Whoever may edit the fixture appoints them, from the host's people.
 *  - **A sport organiser** and **a division convenor** score, pick sides and edit the fixtures of
 *    their divisions.
 *
 * Starts from the test organisations (St Aldric's, Doringkloof). Run `npm run db:test-orgs` against
 * the database first; then `npx ts-node src/scripts/test-role-permissions.ts` (from server/). Adds
 * its own people, a single match and a tournament under a `test-roles-` id, and removes them.
 */

const P = `test-roles-${Date.now()}`;
let passes = 0;
let failures = 0;
function check(ok: boolean, label: string) {
  if (ok) passes++;
  else {
    failures++;
    console.log(`[FAIL] ${label}`);
  }
}
const q = (sql: string, params: any[] = []) => pool.query(sql, params);

/** Run the gates in the order `index.ts` runs them. */
async function allows(userId: string, type: SocketAction, payload: any): Promise<boolean> {
  try {
    await enforceProfileAction(userId, type, payload);
    await enforceOrgAction(userId, type, payload);
    return true;
  } catch {
    return false;
  }
}

const SAC = fixtureIds.org('sac');
const DKL = fixtureIds.org('dkl');
const SAC_TEAM = fixtureIds.team('sac', 'rugby-u16a');
const SAC_OTHER = fixtureIds.team('sac', 'rugby-1stxv');
const DKL_TEAM = fixtureIds.team('dkl', 'rugby-u16a');
const DKL_ADMIN = fixtureIds.user('Johan van der Merwe');
const SAC_STAFF = fixtureIds.user('Graham Hendricks');

const made = { users: [] as string[], profiles: [] as string[], events: [] as string[] };

/** A signed-in person with a profile in `orgId`, and the org role given (or none). */
async function person(slug: string, orgId: string, orgRole: string | null) {
  const userId = `${P}-user-${slug}`;
  const profileId = `${P}-prof-${slug}`;
  await q(`INSERT INTO users (id, name, email, global_role) VALUES ($1, $2, $3, 'user')`, [userId, slug, `${userId}@example.test`]);
  await q(`INSERT INTO org_profiles (id, org_id, user_id, name, email) VALUES ($1, $2, $3, $4, $5)`, [profileId, orgId, userId, slug, `${userId}@example.test`]);
  if (orgRole) {
    await q(`INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES ($1, $2, $3, $4, NOW())`, [`${P}-om-${slug}`, profileId, orgId, orgRole]);
  }
  made.users.push(userId);
  made.profiles.push(profileId);
  return { userId, profileId };
}

async function onTeam(profileId: string, teamId: string, roleId: string) {
  const id = `${P}-tm-${profileId.slice(-12)}-${roleId}`;
  await q(`INSERT INTO team_memberships (id, org_profile_id, team_id, role_id, start_date) VALUES ($1, $2, $3, $4, NOW())`, [id, profileId, teamId, roleId]);
  return id;
}

async function run() {
  if (!(await q('SELECT 1 FROM teams WHERE id = $1', [SAC_TEAM])).rows.length) {
    throw new Error('The test organisations are missing — run npm run db:test-orgs against this database first.');
  }

  // --- People ----------------------------------------------------------------------------------
  const coach = await person('coach', SAC, 'role-org-member');
  const assistant = await person('assistant', SAC, 'role-org-member');
  const teamScorer = await person('teamscorer', SAC, 'role-org-member');
  const player = await person('player', SAC, 'role-org-member');
  const otherCoach = await person('othercoach', SAC, 'role-org-member');
  const timekeeper = await person('timekeeper', SAC, 'role-org-member');
  const referee = await person('referee', SAC, 'role-org-member');
  const member = await person('member', SAC, 'role-org-member');
  const sportOrganiser = await person('sportorg', DKL, null);
  const convenor = await person('convenor', DKL, null);

  const coachTm = await onTeam(coach.profileId, SAC_TEAM, 'role-coach');
  const assistantTm = await onTeam(assistant.profileId, SAC_TEAM, 'role-assistant-coach');
  await onTeam(teamScorer.profileId, SAC_TEAM, 'role-scorer');
  const playerTm = await onTeam(player.profileId, SAC_TEAM, 'role-player');
  await onTeam(otherCoach.profileId, SAC_OTHER, 'role-coach');

  // --- A coach runs their own team (PERM-5) ---------------------------------------------------
  check(await allows(coach.userId, SocketAction.UPDATE_TEAM, { id: SAC_TEAM, data: { name: 'U16 A' } }), 'a coach may edit their team');
  check(!(await allows(coach.userId, SocketAction.UPDATE_TEAM, { id: SAC_TEAM, data: { isActive: false } })), '…but not switch it off');
  check(!(await allows(coach.userId, SocketAction.DELETE_TEAM, { id: SAC_TEAM })), '…nor delete it');
  check(!(await allows(coach.userId, SocketAction.UPDATE_TEAM, { id: SAC_OTHER, data: { name: 'X' } })), '…nor edit another team');
  check(await allows(coach.userId, SocketAction.ADD_TEAM_MEMBER, { orgProfileId: member.profileId, teamId: SAC_TEAM, roleId: 'role-player' }), 'a coach may add a player');
  check(await allows(coach.userId, SocketAction.ADD_TEAM_MEMBER, { orgProfileId: member.profileId, teamId: SAC_TEAM, roleId: 'role-assistant-coach' }), '…and appoint an assistant coach');
  check(!(await allows(coach.userId, SocketAction.ADD_TEAM_MEMBER, { orgProfileId: member.profileId, teamId: SAC_TEAM, roleId: 'role-coach' })), '…but not a Coach');
  check(await allows(coach.userId, SocketAction.UPDATE_TEAM_MEMBER, { id: playerTm, data: { roleId: 'role-medic' } }), "a coach may change a player's role");
  check(!(await allows(coach.userId, SocketAction.UPDATE_TEAM_MEMBER, { id: playerTm, data: { teamId: SAC_OTHER } })), "…but not move them to another team");
  check(!(await allows(assistant.userId, SocketAction.REMOVE_TEAM_MEMBER, { id: coachTm })), 'an assistant coach may not remove the Coach');
  check(!(await allows(assistant.userId, SocketAction.ADD_TEAM_MEMBER, { orgProfileId: member.profileId, teamId: SAC_TEAM, roleId: 'role-assistant-coach' })), '…nor appoint an assistant coach');
  check(await allows(assistant.userId, SocketAction.ADD_TEAM_MEMBER, { orgProfileId: member.profileId, teamId: SAC_TEAM, roleId: 'role-scorer' }), '…but may appoint a scorer');
  check(await allows(coach.userId, SocketAction.REMOVE_TEAM_MEMBER, { id: assistantTm }), 'a coach may remove an assistant coach');
  check(!(await allows(otherCoach.userId, SocketAction.REMOVE_TEAM_MEMBER, { id: playerTm })), "another team's coach may not touch this roster");

  check(await allows(coach.userId, SocketAction.UPDATE_ORG_PROFILE, { id: player.profileId, data: { name: 'Player One' } }), "a coach may edit their team's people");
  check(!(await allows(coach.userId, SocketAction.UPDATE_ORG_PROFILE, { id: member.profileId, data: { name: 'X' } })), "…not someone not on the team");
  check(!(await allows(coach.userId, SocketAction.DELETE_ORG_PROFILE, { id: player.profileId })), '…and never delete a record');
  check(await allows(coach.userId, SocketAction.ADD_ORG_PROFILE, { orgId: SAC, name: 'New Player' }), 'a coach may add a new person to the org');
  check(await allows(coach.userId, SocketAction.ADD_ORG_MEMBER, { orgId: SAC, orgProfileId: 'x', roleId: 'role-org-member' }), '…as a Member');
  check(!(await allows(coach.userId, SocketAction.ADD_ORG_MEMBER, { orgId: SAC, orgProfileId: 'x', roleId: 'role-org-staff' })), '…never as Staff');
  check(!(await allows(member.userId, SocketAction.ADD_ORG_PROFILE, { orgId: SAC, name: 'X' })), 'a plain Member may not add people');

  // --- Single matches (PERM-5) ----------------------------------------------------------------
  check(await allows(coach.userId, SocketAction.ADD_EVENT, { orgId: SAC, type: 'SingleMatch', name: 'X' }), 'a coach may start a single match');
  check(!(await allows(coach.userId, SocketAction.ADD_EVENT, { orgId: SAC, type: 'Tournament', name: 'X' })), '…not a tournament');
  check(!(await allows(member.userId, SocketAction.ADD_EVENT, { orgId: SAC, type: 'SingleMatch', name: 'X' })), 'a plain Member may not');
  const match = await eventManager.addEvent({ id: `${P}-match`, name: 'Match', type: 'SingleMatch', orgId: SAC, sportIds: ['rugby'], startDate: '2026-11-01', status: 'Scheduled' } as any);
  made.events.push(match.id);
  const gamePayload = { eventId: match.id, sportId: 'rugby', participants: [{ teamId: SAC_TEAM }, { teamId: DKL_TEAM }], startTime: '2026-11-01T08:00:00Z' };
  check(!(await allows(otherCoach.userId, SocketAction.ADD_GAME, gamePayload)), "its game must be one of the coach's own teams'");
  check(await allows(coach.userId, SocketAction.ADD_GAME, gamePayload), "the coach adds its game, their team's");
  const game = await eventManager.addGame(gamePayload as any);
  check(await allows(coach.userId, SocketAction.UPDATE_GAME, { id: game.id, orgId: SAC, data: {} }), 'the coach may edit their match');
  check(!(await allows(otherCoach.userId, SocketAction.UPDATE_GAME, { id: game.id, orgId: SAC, data: {} })), "another team's coach may not");

  // --- Scoring: team scorer and officials (PERM-6, PERM-7) -----------------------------------
  check(await accessManager.canScoreGame(teamScorer.userId, game.id), "the team's scorer scores its games");
  check(!(await accessManager.canScoreGame(member.userId, game.id)), 'a plain Member does not');
  check(await allows(SAC_STAFF, SocketAction.ADD_GAME_OFFICIAL, { gameId: game.id, orgProfileId: timekeeper.profileId, role: 'TIMEKEEPER' }), "the host's staff appoint officials");
  check(await allows(coach.userId, SocketAction.ADD_GAME_OFFICIAL, { gameId: game.id, orgProfileId: referee.profileId, role: 'REFEREE' }), '…as does the coach running the match');
  check(!(await allows(member.userId, SocketAction.ADD_GAME_OFFICIAL, { gameId: game.id, orgProfileId: referee.profileId, role: 'REFEREE' })), '…not a plain Member');
  await addGameOfficial(game.id, timekeeper.profileId, 'TIMEKEEPER');
  await addGameOfficial(game.id, referee.profileId, 'REFEREE');
  check(!(await accessManager.canScoreGame(timekeeper.userId, game.id)), 'a timekeeper does not score');
  check(await accessManager.canKeepTime(timekeeper.userId, game.id), '…but keeps time');
  check(await accessManager.canScoreGame(referee.userId, game.id), 'a match official scores');
  let refusedOutsider = false;
  try { await addGameOfficial(game.id, sportOrganiser.profileId, 'SCORER'); } catch { refusedOutsider = true; }
  check(refusedOutsider, "an official comes from the host's own people");
  const caps = await accessManager.getGameCapabilities(timekeeper.userId, game.id);
  check(!caps.canScore && caps.canKeepTime && caps.officialRoles.includes('TIMEKEEPER'), 'game capabilities say so');

  // --- Sport organisers and convenors (PERM-6) -----------------------------------------------
  const cup = await eventManager.addEvent({ id: `${P}-cup`, name: 'Cup', type: 'Tournament', orgId: DKL, sportIds: ['rugby'], startDate: '2026-11-01', settings: {}, status: 'Scheduled' } as any);
  made.events.push(cup.id);
  const division = await tournamentManager.addDivision({ eventId: cup.id, name: 'U16', sportId: 'rugby' } as any);
  const stage = await tournamentManager.addStage({ divisionId: division.id, name: 'Pool', format: 'RoundRobin' } as any);
  const fixture = await eventManager.addGame({ eventId: cup.id, stageId: stage.id, sportId: 'rugby', participants: [{ teamId: DKL_TEAM }, { teamId: SAC_TEAM }], startTime: '2026-11-01T09:00:00Z' } as any);
  await q(`INSERT INTO event_sport_organizers (event_id, sport_id, org_profile_id) VALUES ($1, 'rugby', $2)`, [cup.id, sportOrganiser.profileId]);
  await q(`INSERT INTO division_organizers (division_id, org_profile_id) VALUES ($1, $2)`, [division.id, convenor.profileId]);
  for (const [who, label] of [[sportOrganiser, 'a sport organiser'], [convenor, 'a division convenor']] as const) {
    check(await accessManager.canScoreGame(who.userId, fixture.id), `${label} scores the division's fixtures`);
    check(await accessManager.canEditEventOrGame(who.userId, DKL, undefined, fixture.id), `${label} edits them`);
    const side = (await q('SELECT id FROM game_participants WHERE game_id = $1 LIMIT 1', [fixture.id])).rows[0].id;
    check(await accessManager.canPickSide(who.userId, fixture.id, side), `${label} picks either side`);
  }
  check(!(await accessManager.canEditEventOrGame(convenor.userId, DKL, cup.id)), 'a convenor does not edit the tournament itself');
  check(!(await accessManager.canEditEventOrGame(DKL_ADMIN, SAC, undefined, game.id)), "another org's admin does not edit St Aldric's match");
}

async function cleanup() {
  await q('DELETE FROM game_officials WHERE org_profile_id = ANY($1)', [made.profiles]);
  await q('DELETE FROM event_sport_organizers WHERE org_profile_id = ANY($1)', [made.profiles]);
  await q('DELETE FROM division_organizers WHERE org_profile_id = ANY($1)', [made.profiles]);
  for (const id of made.events) await eventManager.deleteEvent(id).catch(() => q('DELETE FROM events WHERE id = $1', [id]));
  await q('DELETE FROM team_memberships WHERE org_profile_id = ANY($1)', [made.profiles]);
  await q('DELETE FROM org_memberships WHERE org_profile_id = ANY($1)', [made.profiles]);
  await q("DELETE FROM org_profiles WHERE id = ANY($1) OR (org_id = $2 AND name = 'New Player')", [made.profiles, SAC]);
  await q('DELETE FROM users WHERE id = ANY($1)', [made.users]);
}

run()
  .then(() => {
    console.log(failures ? `\n${failures} failed, ${passes} passed.` : `\nPASS — ${passes} role permission checks.`);
    if (failures) process.exitCode = 1;
  })
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(err => console.error('Cleanup failed:', err));
    await pool.end();
  });
