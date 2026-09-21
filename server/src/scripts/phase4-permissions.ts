import { APP_TEST_ORG_ID, SocketAction } from '@sk/shared';
import { query } from '../db';
import pool from '../db';
import { canJoinRoom } from '../wss/roomAccess';
import { canReadData } from '../wss/dataAccess';
import { enforceTournamentAction } from '../wss/tournamentGate';
import { enforceProfileAction } from '../wss/profileGate';
import { accessManager } from '../managers/AccessManager';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';
import { userManager } from '../managers/UserManager';

/**
 * Tournaments Phase 4 — organiser grants, checked rather than reasoned about.
 *
 * The phase's exit criterion is a list of refusals, and a refusal is the one thing that cannot be
 * confirmed by looking at a screen: a hidden button and a server-side denial look identical from
 * the outside. So this replays the whole permission model against the code the socket runs —
 * `enforceTournamentAction` is the gate itself, not a re-statement of it — and asserts both
 * directions of every rule.
 *
 * Four actors, which is what makes the negatives meaningful:
 *
 *  - **a non-admin member** of the hosting org, who may do nothing until appointed;
 *  - **an external specialist**, a profile in the hosting org with *no membership at all*, appointed
 *    to convene one division — the case the whole profile-keyed design exists for;
 *  - **an unclaimed profile**, appointed before it has a user account, which then claims one;
 *  - **a sport's organiser** (2026-09-20), appointed over one sport of the tournament, whose reach
 *    is every division of that sport and stops at the sport next door;
 *  - **a stranger**, who is refused throughout and proves the checks are not vacuous.
 *
 * Kept rather than thrown away, for the reason Phase 3's audit gives: `server/` has no test
 * harness, and deleting this would leave nothing checking that a convenor cannot touch the division
 * next door. It leaves the database as it found it.
 *
 * Run: `npx ts-node src/scripts/phase4-permissions.ts`
 */

let checks = 0;
const failures: string[] = [];

function expect(actual: boolean, expected: boolean, what: string): void {
  checks++;
  if (actual !== expected) failures.push(`${what}: expected ${expected}, got ${actual}`);
}

/** Run the real gate and report whether it let the action through. */
async function gateAllows(userId: string | null, type: SocketAction, payload: any): Promise<boolean> {
  try {
    await enforceTournamentAction(userId, type, payload);
    return true;
  } catch {
    return false;
  }
}

/** The same, for the profile gate (`PEOPLE-2`). */
async function profileGateAllows(userId: string | null, type: SocketAction, payload: any): Promise<boolean> {
  try {
    await enforceProfileAction(userId, type, payload);
    return true;
  } catch {
    return false;
  }
}

const created = {
  eventId: '',
  otherEventId: '',
  divisionA: '',
  divisionA2: '',
  divisionB: '',
  stageA: '',
  stageB: '',
  teamId: '',
  outsideOrgId: '',
  outsideTeamId: '',
  userIds: [] as string[],
  profileIds: [] as string[],
  membershipIds: [] as string[],
  /** Restored in `cleanup`, so the script leaves the shared test org as it found it. */
  testOrgWasClaimed: true,
};

async function main() {
  const stamp = Date.now();

  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, 'App Test Org', 'ATO', true, true) ON CONFLICT (id) DO NOTHING`,
    [APP_TEST_ORG_ID]
  );

  /*
   * The insert above *intends* a claimed org, but `ON CONFLICT DO NOTHING` never touches a row that
   * already exists — and on the dev database `app-test-org` was unclaimed. That was harmless until
   * 2026-09-21, when an unclaimed organisation started accepting a name-only person from anybody
   * signed in (`orgGate.ts`): the person-record assertions below then passed for the wrong reason,
   * or rather failed for the right one, and silently stopped testing a claimed org at all. So the
   * script makes the org it assumes, and puts it back afterwards.
   */
  created.testOrgWasClaimed = (
    await query(`SELECT is_claimed FROM organizations WHERE id = $1`, [APP_TEST_ORG_ID])
  ).rows[0]?.is_claimed === true;
  await query(`UPDATE organizations SET is_claimed = true WHERE id = $1`, [APP_TEST_ORG_ID]);

  // An organisation with nobody playing here, which the last section needs.
  created.outsideOrgId = `org-p4-outside-${stamp}`;
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, 'P4 Outside Org', 'P4O', true, true)`,
    [created.outsideOrgId]
  );

  async function makePerson(
    slug: string,
    name: string,
    orgId: string,
    opts: { withUser?: boolean; roleId?: string | null } = {}
  ): Promise<{ userId: string; profileId: string; email: string }> {
    const email = `p4-${slug}-${stamp}@example.test`;
    let userId = '';
    if (opts.withUser !== false) {
      userId = `user-p4-${slug}-${stamp}`;
      await query(`INSERT INTO users (id, name, email, global_role) VALUES ($1, $2, $3, 'user')`, [
        userId,
        name,
        email,
      ]);
      created.userIds.push(userId);
    }
    const profileId = `prof-p4-${slug}-${stamp}`;
    await query(`INSERT INTO org_profiles (id, org_id, user_id, name, email) VALUES ($1, $2, $3, $4, $5)`, [
      profileId,
      orgId,
      userId || null,
      name,
      email,
    ]);
    created.profileIds.push(profileId);

    if (opts.roleId) {
      const membershipId = `mem-p4-${slug}-${stamp}`;
      await query(
        `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
         VALUES ($1, $2, $3, $4, NOW())`,
        [membershipId, profileId, orgId, opts.roleId]
      );
      created.membershipIds.push(membershipId);
    }
    return { userId, profileId, email };
  }

  const admin = await makePerson('admin', 'P4 Host Admin', APP_TEST_ORG_ID, { roleId: 'role-org-admin' });
  // A **non-admin member**: the exit criterion's first actor. `role-org-member` grants nothing an
  // event cares about, so every allowance below comes from the grant and from nothing else.
  const member = await makePerson('member', 'P4 Plain Member', APP_TEST_ORG_ID, { roleId: 'role-org-member' });
  // The external specialist: known to the host org, a member of nothing.
  const specialist = await makePerson('specialist', 'P4 Netball Convenor', APP_TEST_ORG_ID, { roleId: null });
  const stranger = await makePerson('stranger', 'P4 Stranger', created.outsideOrgId, { roleId: 'role-org-admin' });
  // Staff of the hosting org, for the people-record section: they already add members through the
  // people screen, so the gate must not take that away.
  const staff = await makePerson('staff', 'P4 Host Staff', APP_TEST_ORG_ID, { roleId: 'role-org-staff' });
  // Appointed before they have an account at all; claims one later in this script.
  const unclaimed = await makePerson('unclaimed', 'P4 Unclaimed Convenor', APP_TEST_ORG_ID, {
    withUser: false,
    roleId: null,
  });
  // Runs one sport of the tournament (2026-09-20). A member of nothing, like the specialist, so
  // every allowance below comes from the sport grant alone.
  const sportRunner = await makePerson('sportrunner', 'P4 Netball Organiser', APP_TEST_ORG_ID, {
    roleId: null,
  });

  const sportRows = (await query(`SELECT id FROM sports ORDER BY id LIMIT 2`)).rows;
  const sportId = sportRows[0].id;
  // The second sport is what makes a sport grant falsifiable: with one sport, "runs the netball"
  // and "runs the tournament's divisions" are the same set and every assertion below is vacuous.
  const otherSportId = sportRows[1]?.id || sportId;
  created.teamId = `team-p4-${stamp}`;
  await query(
    `INSERT INTO teams (id, name, sport_id, org_id, is_active) VALUES ($1, 'P4 Team', $2, $3, true)`,
    [created.teamId, sportId, APP_TEST_ORG_ID]
  );

  const event = await eventManager.addEvent({
    name: `Phase 4 Permissions ${stamp}`,
    type: 'Tournament',
    format: 'Festival',
    startDate: new Date().toISOString(),
    orgId: APP_TEST_ORG_ID,
    sportIds: [sportId, otherSportId],
    settings: {},
    status: 'Scheduled',
  } as any);
  created.eventId = event.id;

  // A second event in the same org, so "you can edit the tournament and nothing else" is a claim
  // this script can actually falsify.
  const otherEvent = await eventManager.addEvent({
    name: `Phase 4 Other Event ${stamp}`,
    type: 'Tournament',
    format: 'Festival',
    startDate: new Date().toISOString(),
    orgId: APP_TEST_ORG_ID,
    sportIds: [sportId],
    settings: {},
    status: 'Scheduled',
  } as any);
  created.otherEventId = otherEvent.id;

  const divisionA = await tournamentManager.addDivision({ eventId: event.id, name: 'Netball', sportId });
  // Division B plays the *other* sport, so "a convenor may not touch the division next door" and
  // "a sport's organiser may not touch the sport next door" are both tested against it.
  const divisionB = await tournamentManager.addDivision({
    eventId: event.id,
    name: 'Hockey',
    sportId: otherSportId,
  });
  // A second division of sport A, so the sport grant covers *more than one* division and is
  // visibly a rule rather than a grant over the division that happened to exist.
  const divisionA2 = await tournamentManager.addDivision({
    eventId: event.id,
    name: 'Netball U16',
    sportId,
  });
  created.divisionA2 = divisionA2.id;
  created.divisionA = divisionA.id;
  created.divisionB = divisionB.id;
  const stageA = await tournamentManager.addStage({ divisionId: divisionA.id, name: 'Main', format: 'Festival' });
  const stageB = await tournamentManager.addStage({ divisionId: divisionB.id, name: 'Main', format: 'Festival' });
  created.stageA = stageA.id;
  created.stageB = stageB.id;
  await tournamentManager.setDivisionEntrants(divisionA.id, [{ teamId: created.teamId }]);

  // ============================================================================================
  // 1. Before any appointment, a plain member may do nothing.
  // ============================================================================================
  expect(
    await gateAllows(member.userId, SocketAction.ADD_DIVISION, { eventId: event.id, name: 'X' }),
    false,
    'an unappointed member may not add a division'
  );
  expect(
    await gateAllows(specialist.userId, SocketAction.SET_DIVISION_ENTRANTS, { divisionId: divisionA.id, entrants: [] }),
    false,
    'an unappointed specialist may not set entrants'
  );
  expect(
    await gateAllows(null, SocketAction.ADD_DIVISION, { eventId: event.id, name: 'X' }),
    false,
    'an anonymous socket may not organise'
  );
  expect(
    await gateAllows(admin.userId, SocketAction.ADD_DIVISION, { eventId: event.id, name: 'X' }),
    true,
    "the hosting org's admin may organise (the control)"
  );

  // ============================================================================================
  // 2. Appointed event organiser: the whole tournament, and nothing else in the org.
  // ============================================================================================
  await tournamentManager.appointOrganizer({
    eventId: event.id,
    orgProfileId: member.profileId,
    grantedByOrgProfileId: admin.profileId,
  });

  expect(
    await gateAllows(member.userId, SocketAction.ADD_DIVISION, { eventId: event.id, name: 'X' }),
    true,
    'an appointed organiser may add a division'
  );
  expect(
    await gateAllows(member.userId, SocketAction.SET_DIVISION_ENTRANTS, { divisionId: divisionB.id, entrants: [] }),
    true,
    'an appointed organiser may set entrants in any division of their event'
  );
  expect(
    await gateAllows(member.userId, SocketAction.APPOINT_ORGANIZER, {
      eventId: event.id,
      orgProfileId: specialist.profileId,
    }),
    true,
    'an appointed organiser may appoint further organisers (U12: no exception list)'
  );

  // ...and nothing else in the org. The other event is in the same organisation, hosted by the
  // same admins, and the grant must not reach it.
  expect(
    await gateAllows(member.userId, SocketAction.ADD_DIVISION, { eventId: otherEvent.id, name: 'X' }),
    false,
    'the grant does NOT reach another event in the same org'
  );
  expect(
    await accessManager.isOrganizationAdmin(member.userId, APP_TEST_ORG_ID),
    false,
    'the grant does NOT make them an org admin'
  );
  expect(
    await accessManager.canManageTeam(member.userId, created.teamId),
    false,
    "the grant does NOT let them manage the org's teams"
  );

  // ============================================================================================
  // 3. A division convenor: the whole of their division, and nothing beside it.
  // ============================================================================================
  await tournamentManager.appointOrganizer({
    divisionId: divisionA.id,
    orgProfileId: specialist.profileId,
    grantedByOrgProfileId: admin.profileId,
  });

  const convenorMay: [SocketAction, any, string][] = [
    [SocketAction.SET_DIVISION_ENTRANTS, { divisionId: divisionA.id, entrants: [] }, 'set their entrants'],
    [SocketAction.ADD_STAGE, { divisionId: divisionA.id, name: 'Knockout', format: 'Knockout' }, 'add a stage'],
    [SocketAction.UPDATE_STAGE, { id: stageA.id, data: { name: 'Pools' } }, 'rename their stage'],
    [SocketAction.GENERATE_STAGE_FIXTURES, { stageId: stageA.id, mode: 'create' }, 'generate their fixtures'],
    [SocketAction.SCHEDULE_STAGE, { stageId: stageA.id }, 'schedule their fixtures'],
    [SocketAction.ADD_ADJUSTMENT, { divisionId: divisionA.id, entrantId: 'x', pointsDelta: 1, reason: 'y' }, 'record an adjustment'],
    [SocketAction.SET_DIVISION_FACILITIES, { divisionId: divisionA.id, facilityIds: [] }, 'narrow their facilities'],
    // D33, revised 2026-09-19: co-convenors. Whether a withdrawal is theirs to make — only the
    // people they appointed — is checked in the handler, where the grant's author is known.
    [SocketAction.APPOINT_ORGANIZER, { divisionId: divisionA.id, orgProfileId: stranger.profileId }, 'appoint a co-convenor to their division'],
    [SocketAction.WITHDRAW_ORGANIZER, { divisionId: divisionA.id, orgProfileId: stranger.profileId }, 'reach the withdrawal of a co-convenor'],
  ];
  for (const [type, payload, what] of convenorMay) {
    expect(await gateAllows(specialist.userId, type, payload), true, `a convenor may ${what}`);
  }

  const convenorMayNot: [SocketAction, any, string][] = [
    [SocketAction.SET_DIVISION_ENTRANTS, { divisionId: divisionB.id, entrants: [] }, "set another division's entrants"],
    [SocketAction.ADD_STAGE, { divisionId: divisionB.id, name: 'X', format: 'Festival' }, "add a stage to another division"],
    [SocketAction.GENERATE_STAGE_FIXTURES, { stageId: stageB.id, mode: 'create' }, "generate another division's fixtures"],
    [SocketAction.ADD_DIVISION, { eventId: event.id, name: 'Cricket' }, 'create a division'],
    [SocketAction.DELETE_DIVISION, { id: divisionA.id }, 'delete their own division'],
    [SocketAction.UPDATE_DIVISION, { id: divisionA.id, data: { weighting: 5 } }, "change their division's weighting"],
    [SocketAction.SET_EVENT_FACILITIES, { eventId: event.id, facilityIds: [] }, "set the event's facilities"],
    [SocketAction.APPOINT_ORGANIZER, { divisionId: divisionB.id, orgProfileId: stranger.profileId }, 'appoint to another division'],
    [SocketAction.APPOINT_ORGANIZER, { eventId: event.id, orgProfileId: stranger.profileId }, 'appoint an event organiser'],
    [SocketAction.APPOINT_ORGANIZER, { eventId: event.id, divisionId: divisionA.id, orgProfileId: stranger.profileId }, 'reach event scope by naming their division alongside it'],
  ];
  for (const [type, payload, what] of convenorMayNot) {
    expect(await gateAllows(specialist.userId, type, payload), false, `a convenor may NOT ${what}`);
  }

  // A stranger is refused throughout, which is what makes the allowances above mean something.
  for (const [type, payload] of [...convenorMay, ...convenorMayNot]) {
    expect(await gateAllows(stranger.userId, type, payload), false, `a stranger is refused ${type}`);
  }

  // ============================================================================================
  // 3b. A sport's organiser: every division of their sport, and the shape of that sport (2026-09-20).
  //
  // The claim being tested is that a sport grant is a **rule, not a list**. `divisionA2` is created
  // above and never named in the appointment, so every allowance over it comes from the sport it
  // plays. `divisionB` plays the other sport and is the boundary.
  // ============================================================================================
  await tournamentManager.appointOrganizer({
    eventId: event.id,
    sportId,
    orgProfileId: sportRunner.profileId,
    grantedByOrgProfileId: admin.profileId,
  });

  const sportOrganiserMay: [SocketAction, any, string][] = [
    [SocketAction.SET_DIVISION_ENTRANTS, { divisionId: divisionA.id, entrants: [] }, "set a division of their sport's entrants"],
    [SocketAction.SET_DIVISION_ENTRANTS, { divisionId: divisionA2.id, entrants: [] }, 'reach a division they were never named on'],
    [SocketAction.ADD_STAGE, { divisionId: divisionA2.id, name: 'Knockout', format: 'Knockout' }, 'add a stage in their sport'],
    [SocketAction.GENERATE_STAGE_FIXTURES, { stageId: stageA.id, mode: 'create' }, 'generate fixtures in their sport'],
    [SocketAction.SET_DIVISION_FACILITIES, { divisionId: divisionA.id, facilityIds: [] }, 'narrow a division of their sport'],
    // The two powers a division convenor does not have.
    [SocketAction.ADD_DIVISION, { eventId: event.id, sportId, name: 'Netball U18' }, 'add a division to their sport'],
    [SocketAction.DELETE_DIVISION, { id: divisionA2.id }, 'delete a division of their sport'],
    [SocketAction.UPDATE_DIVISION, { id: divisionA.id, data: { weighting: 5 } }, "change a division of their sport's weighting"],
    // Appointing within their sport, at both scopes below them.
    [SocketAction.APPOINT_ORGANIZER, { eventId: event.id, sportId, orgProfileId: stranger.profileId }, 'appoint a co-organiser of their sport'],
    [SocketAction.APPOINT_ORGANIZER, { divisionId: divisionA.id, orgProfileId: stranger.profileId }, "appoint a convenor to their sport's division"],
    [SocketAction.WITHDRAW_ORGANIZER, { eventId: event.id, sportId, orgProfileId: stranger.profileId }, 'reach the withdrawal of a co-organiser'],
  ];
  for (const [type, payload, what] of sportOrganiserMay) {
    expect(await gateAllows(sportRunner.userId, type, payload), true, `a sport's organiser may ${what}`);
  }

  const sportOrganiserMayNot: [SocketAction, any, string][] = [
    [SocketAction.SET_DIVISION_ENTRANTS, { divisionId: divisionB.id, entrants: [] }, "set another sport's entrants"],
    [SocketAction.ADD_STAGE, { divisionId: divisionB.id, name: 'X', format: 'Festival' }, "add a stage to another sport's division"],
    [SocketAction.GENERATE_STAGE_FIXTURES, { stageId: stageB.id, mode: 'create' }, "generate another sport's fixtures"],
    [SocketAction.DELETE_DIVISION, { id: divisionB.id }, "delete another sport's division"],
    [SocketAction.ADD_DIVISION, { eventId: event.id, sportId: otherSportId, name: 'Hockey B' }, 'add a division to another sport'],
    // Moving a division between sports is the tournament's decision: it would walk a division out
    // of their reach, or one of somebody else's into it.
    [SocketAction.UPDATE_DIVISION, { id: divisionA.id, data: { sportId: otherSportId } }, 'move their division to another sport'],
    [SocketAction.SET_EVENT_FACILITIES, { eventId: event.id, facilityIds: [] }, "set the event's facilities"],
    // The "never reach up" rule, at the scope above them.
    [SocketAction.APPOINT_ORGANIZER, { eventId: event.id, orgProfileId: stranger.profileId }, 'appoint an event organiser'],
    [SocketAction.APPOINT_ORGANIZER, { eventId: event.id, sportId: otherSportId, orgProfileId: stranger.profileId }, "appoint to another sport"],
    [SocketAction.APPOINT_ORGANIZER, { divisionId: divisionB.id, orgProfileId: stranger.profileId }, "appoint into another sport's division"],
  ];
  for (const [type, payload, what] of sportOrganiserMayNot) {
    expect(await gateAllows(sportRunner.userId, type, payload), false, `a sport's organiser may NOT ${what}`);
  }

  // The grant reaches exactly as far as the sport does, on the read path too.
  expect(
    await accessManager.canOrganizeDivision(sportRunner.userId, divisionA2.id),
    true,
    "a sport's organiser organises a division of their sport they were never named on"
  );
  expect(
    await accessManager.canOrganizeDivision(sportRunner.userId, divisionB.id),
    false,
    "a sport's organiser does NOT organise another sport's division"
  );
  expect(
    await canJoinRoom(sportRunner.userId, `division:${divisionA2.id}`),
    true,
    "a sport's organiser may join the room of a division of their sport"
  );
  expect(
    (await accessManager.getEventCapabilities(sportRunner.userId, event.id)).canEditEvent,
    false,
    "a sport's organiser does NOT get canEditEvent"
  );
  expect(
    (await accessManager.getEventCapabilities(sportRunner.userId, event.id)).convenesSportIds.join() === sportId,
    true,
    'their capabilities name the one sport they run'
  );
  // The grant does not reach the same sport at a different tournament, which is the whole reason
  // the key is (event, sport) and not sport.
  expect(
    await accessManager.hasSportGrant(sportRunner.userId, otherEvent.id, sportId),
    false,
    'the grant does NOT reach the same sport at another tournament'
  );

  // Withdrawal closes it, including over the division it was never named on.
  await tournamentManager.withdrawOrganizer({
    eventId: event.id,
    sportId,
    orgProfileId: sportRunner.profileId,
  });
  expect(
    await accessManager.canOrganizeDivision(sportRunner.userId, divisionA2.id),
    false,
    "a withdrawn sport organiser holds nothing"
  );

  // ============================================================================================
  // 4. The read path. A convenor with no membership must still see the division they run.
  // ============================================================================================
  expect(
    await canJoinRoom(specialist.userId, `division:${divisionA.id}`),
    true,
    'a convenor may join their own division room (they hold no membership at all)'
  );
  expect(
    await canJoinRoom(specialist.userId, `division:${divisionB.id}`),
    false,
    "a convenor may NOT join another division's room"
  );
  expect(
    await canJoinRoom(member.userId, `division:${divisionB.id}`),
    true,
    'an event organiser may join every division room of their event'
  );

  const entrantsA = await canReadData(specialist.userId, { type: 'division_entrants', divisionId: divisionA.id });
  expect(entrantsA.allowed, true, `a convenor may read their roster (${entrantsA.reason})`);
  const entrantsB = await canReadData(specialist.userId, { type: 'division_entrants', divisionId: divisionB.id });
  expect(entrantsB.allowed, false, `a convenor may NOT read another roster (${entrantsB.reason})`);

  const organisersA = await canReadData(specialist.userId, { type: 'division_organizers', divisionId: divisionA.id });
  expect(organisersA.allowed, true, 'a convenor may see who else convenes their division');
  const organisersEvent = await canReadData(specialist.userId, { type: 'event_organizers', eventId: event.id });
  expect(organisersEvent.allowed, false, "a convenor may NOT read the event's organiser list");
  const candidates = await canReadData(stranger.userId, { type: 'organizer_candidates', eventId: event.id, query: 'a' });
  expect(candidates.allowed, false, 'a stranger may not search the organiser picker');
  // Co-convenors (D33, revised 2026-09-19): a convenor may search for people to add to their own
  // division — asked with the division — and not for the event's organisers.
  const convenorSearch = await canReadData(specialist.userId, {
    type: 'organizer_candidates', eventId: event.id, divisionId: divisionA.id, query: 'a',
  });
  expect(convenorSearch.allowed, true, 'a convenor may search for co-convenors for their division');
  const convenorEventSearch = await canReadData(specialist.userId, { type: 'organizer_candidates', eventId: event.id, query: 'a' });
  expect(convenorEventSearch.allowed, false, 'a convenor may NOT search at event scope');
  const convenorOtherSearch = await canReadData(specialist.userId, {
    type: 'organizer_candidates', eventId: event.id, divisionId: divisionB.id, query: 'a',
  });
  expect(convenorOtherSearch.allowed, false, "a convenor may NOT search for another division's convenors");

  // ============================================================================================
  // 5. Capability flags — computed from the user and the event, never from a workspace.
  // ============================================================================================
  const memberCaps = await accessManager.getEventCapabilities(member.userId, event.id);
  expect(memberCaps.canEditEvent, true, 'the appointed organiser sees canEditEvent');
  const specialistCaps = await accessManager.getEventCapabilities(specialist.userId, event.id);
  expect(specialistCaps.canEditEvent, false, 'the convenor does NOT see canEditEvent');
  expect(
    specialistCaps.convenesDivisionIds.length === 1 && specialistCaps.convenesDivisionIds[0] === divisionA.id,
    true,
    'the convenor sees exactly their own division in convenesDivisionIds'
  );
  const strangerCaps = await accessManager.getEventCapabilities(stranger.userId, event.id);
  expect(
    strangerCaps.canEditEvent === false && strangerCaps.convenesDivisionIds.length === 0,
    true,
    'a stranger holds no capabilities'
  );

  // ============================================================================================
  // 6. The grant and the account claim are decoupled.
  //
  // Appoint a profile with no user account, then create an account against that profile's email
  // and verify it. The rights must appear **without the grant row being touched**.
  // ============================================================================================
  await tournamentManager.appointOrganizer({
    divisionId: divisionB.id,
    orgProfileId: unclaimed.profileId,
    grantedByOrgProfileId: admin.profileId,
  });
  const grantBefore = await query(
    `SELECT created_at, granted_by_org_profile_id FROM division_organizers
      WHERE division_id = $1 AND org_profile_id = $2`,
    [divisionB.id, unclaimed.profileId]
  );
  expect(grantBefore.rows.length === 1, true, 'a person with no account can be appointed');

  const claimantId = `user-p4-claimant-${stamp}`;
  await query(`INSERT INTO users (id, name, email, global_role) VALUES ($1, 'P4 Claimant', $2, 'user')`, [
    claimantId,
    unclaimed.email,
  ]);
  created.userIds.push(claimantId);
  await query(
    `INSERT INTO user_emails (id, user_id, email, verified_at) VALUES ($1, $2, $3, NOW())`,
    [`ue-p4-${stamp}`, claimantId, unclaimed.email]
  );

  expect(
    await accessManager.canOrganizeDivision(claimantId, divisionB.id),
    true,
    'claiming the account picks the grant up, by verified email'
  );
  const grantAfter = await query(
    `SELECT created_at, granted_by_org_profile_id FROM division_organizers
      WHERE division_id = $1 AND org_profile_id = $2`,
    [divisionB.id, unclaimed.profileId]
  );
  expect(
    grantAfter.rows.length === 1 &&
      String(grantAfter.rows[0].created_at) === String(grantBefore.rows[0].created_at) &&
      grantAfter.rows[0].granted_by_org_profile_id === grantBefore.rows[0].granted_by_org_profile_id,
    true,
    'the grant row was not touched by the claim'
  );

  // ============================================================================================
  // 7. The accident this design is most likely to produce.
  //
  // Appoint a convenor from an organisation with no team in the tournament. That organisation must
  // not become a participating organisation, and must not appear in the standings roll-up — an org
  // in the table having played nothing is how this bug would first be noticed.
  // ============================================================================================
  const outsider = await makePerson('outsider', 'P4 Outside Convenor', created.outsideOrgId, {
    roleId: 'role-org-member',
  });
  const orgsBefore = await query(`SELECT org_id FROM event_organizations WHERE event_id = $1 ORDER BY org_id`, [
    event.id,
  ]);
  await tournamentManager.appointOrganizer({
    divisionId: divisionA.id,
    orgProfileId: outsider.profileId,
    grantedByOrgProfileId: admin.profileId,
  });
  const orgsAfter = await query(`SELECT org_id FROM event_organizations WHERE event_id = $1 ORDER BY org_id`, [
    event.id,
  ]);
  expect(
    JSON.stringify(orgsAfter.rows) === JSON.stringify(orgsBefore.rows),
    true,
    'appointing an outsider adds NO row to event_organizations'
  );
  expect(
    orgsAfter.rows.some((r: any) => r.org_id === created.outsideOrgId),
    false,
    "the outsider's org is absent from event_organizations"
  );

  await tournamentManager.recalculateEventStandings(event.id);
  const rolledUp = (await eventManager.getEvent(event.id)) as any;
  expect(
    (rolledUp?.cachedStandings || []).some((row: any) => row.orgId === created.outsideOrgId),
    false,
    "the outsider's org is absent from the standings roll-up"
  );

  // ============================================================================================
  // 8. Withdrawal closes what the grant opened.
  // ============================================================================================
  await tournamentManager.withdrawOrganizer({ divisionId: divisionA.id, orgProfileId: specialist.profileId });
  expect(
    await gateAllows(specialist.userId, SocketAction.SET_DIVISION_ENTRANTS, { divisionId: divisionA.id, entrants: [] }),
    false,
    'a withdrawn convenor may no longer write'
  );
  expect(
    await accessManager.canOrganizeDivision(specialist.userId, divisionA.id),
    false,
    'a withdrawn convenor holds nothing'
  );

  // ============================================================================================
  // 9. The picker's search, and the projection it is allowed to return (`PEOPLE-1`).
  //
  // The tiers are a convenience; the projection is a privacy boundary. Checked here because the
  // difference is invisible on screen — a picker looks identical whether or not the rows behind it
  // also carried a date of birth.
  // ============================================================================================
  const leanRows: any[] = await userManager.searchOrganizerCandidates('P4 Netball', [APP_TEST_ORG_ID]);
  expect(
    leanRows.some((row) => row.id === specialist.profileId),
    true,
    'tier 1 finds a person in the hosting org'
  );
  expect(
    leanRows.every((row) => !('cellphone' in row) && !('birthdate' in row) && !('nationalId' in row) && !('email' in row)),
    true,
    'the picker never sees contact or identity fields'
  );
  expect(
    leanRows.every((row) => 'name' in row && 'orgName' in row),
    true,
    'the picker does see a name and an organisation, which is what it needs'
  );

  const scopedOut: any[] = await userManager.searchOrganizerCandidates('P4 Netball', [created.outsideOrgId]);
  expect(
    scopedOut.some((row) => row.id === specialist.profileId),
    false,
    'tier 1 does not reach outside the orgs it was given'
  );
  const globalRows: any[] = await userManager.searchOrganizerCandidates('P4 Netball');
  expect(
    globalRows.some((row) => row.id === specialist.profileId),
    true,
    'tier 2 (the explicit global control) does reach them'
  );

  // The org-scoped call an admin screen makes is unchanged, which is what keeps the member forms
  // working: contact fields still come back when the caller asked about an org they belong to.
  const fullRows: any[] = await userManager.searchProfiles('P4 Netball', APP_TEST_ORG_ID, undefined, { lean: false });
  expect(
    fullRows.some((row) => row.id === specialist.profileId && 'cellphone' in row && 'birthdate' in row),
    true,
    'an org-scoped search still returns the fields a member form pre-fills from'
  );

  // ============================================================================================
  // 10. Person records (`PEOPLE-2`).
  //
  // A profile is the identity the permission layer resolves users into, so these four actions were
  // an org-admin takeover before they were gated: any signed-in user could point an admin's profile
  // at their own verified email — `search_people` hands out profile ids — and inherit the
  // membership. The negatives here are the whole point of this section.
  // ============================================================================================
  expect(
    await profileGateAllows(admin.userId, SocketAction.ADD_ORG_PROFILE, {
      orgId: APP_TEST_ORG_ID,
      name: 'Somebody',
    }),
    true,
    "an org admin may create a person record in their own org"
  );
  expect(
    await profileGateAllows(stranger.userId, SocketAction.ADD_ORG_PROFILE, {
      orgId: APP_TEST_ORG_ID,
      name: 'Somebody',
    }),
    false,
    'a stranger may NOT create a person record in an org they do not administer'
  );
  expect(
    await profileGateAllows(member.userId, SocketAction.ADD_ORG_PROFILE, {
      orgId: APP_TEST_ORG_ID,
      name: 'Somebody',
    }),
    false,
    'a plain member may NOT create a person record'
  );

  expect(
    await profileGateAllows(staff.userId, SocketAction.ADD_ORG_PROFILE, {
      orgId: APP_TEST_ORG_ID,
      name: 'Somebody',
    }),
    true,
    'org staff may still create a person record — the people screen has always let them'
  );
  expect(
    await profileGateAllows(staff.userId, SocketAction.UPDATE_ORG_PROFILE, {
      id: admin.profileId,
      data: { cellphone: '0800' },
    }),
    true,
    'org staff may still edit one'
  );

  // The takeover, both ways in, from an outsider and from a member of the same org.
  for (const [actor, who] of [[stranger.userId, 'a stranger'], [member.userId, 'a plain member']] as const) {
    expect(
      await profileGateAllows(actor, SocketAction.LINK_USER_PROFILE, {
        orgProfileId: admin.profileId,
        email: 'attacker@example.test',
      }),
      false,
      `${who} may NOT re-link an admin's profile to another email`
    );
    expect(
      await profileGateAllows(actor, SocketAction.UPDATE_ORG_PROFILE, {
        id: admin.profileId,
        data: { name: 'Renamed' },
      }),
      false,
      `${who} may NOT edit somebody else's profile`
    );
    expect(
      await profileGateAllows(actor, SocketAction.DELETE_ORG_PROFILE, { id: admin.profileId }),
      false,
      `${who} may NOT delete somebody else's profile`
    );
  }

  // The one exception, and its boundary. `member` is an appointed organiser of `event` by now, and
  // no kind of admin: the picker's third tier is theirs to use, for the hosting org only.
  expect(
    await profileGateAllows(member.userId, SocketAction.ADD_ORG_PROFILE, {
      orgId: APP_TEST_ORG_ID,
      name: 'A convenor not yet on the app',
      eventId: event.id,
    }),
    true,
    'an appointed event organiser may create a person to appoint, in the hosting org'
  );
  expect(
    await profileGateAllows(member.userId, SocketAction.ADD_ORG_PROFILE, {
      orgId: created.outsideOrgId,
      name: 'Somebody',
      eventId: event.id,
    }),
    false,
    'the exception does NOT reach an org that is not hosting the event'
  );
  expect(
    await profileGateAllows(member.userId, SocketAction.UPDATE_ORG_PROFILE, {
      id: admin.profileId,
      data: { name: 'Renamed' },
      eventId: event.id,
    }),
    false,
    'the exception is creation only — an organiser may not edit an existing person'
  );
  expect(
    await profileGateAllows(stranger.userId, SocketAction.ADD_ORG_PROFILE, {
      orgId: APP_TEST_ORG_ID,
      name: 'Somebody',
      eventId: event.id,
    }),
    false,
    'naming an event does not help somebody who does not organise it'
  );
  expect(
    await profileGateAllows(null, SocketAction.ADD_ORG_PROFILE, { orgId: APP_TEST_ORG_ID, name: 'X' }),
    false,
    'an anonymous socket may not create a person record'
  );

  if (failures.length) {
    console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS — ${checks} permission checks.`);
  }
}

async function cleanup() {
  await query(`UPDATE organizations SET is_claimed = $2 WHERE id = $1`, [
    APP_TEST_ORG_ID,
    created.testOrgWasClaimed,
  ]);
  for (const eventId of [created.eventId, created.otherEventId]) {
    if (eventId) await query(`DELETE FROM events WHERE id = $1`, [eventId]);
  }
  if (created.teamId) await query(`DELETE FROM teams WHERE id = $1`, [created.teamId]);
  for (const id of created.membershipIds) await query(`DELETE FROM org_memberships WHERE id = $1`, [id]);
  for (const id of created.profileIds) await query(`DELETE FROM org_profiles WHERE id = $1`, [id]);
  for (const id of created.userIds) {
    await query(`DELETE FROM user_emails WHERE user_id = $1`, [id]);
    await query(`DELETE FROM users WHERE id = $1`, [id]);
  }
  if (created.outsideOrgId) await query(`DELETE FROM organizations WHERE id = $1`, [created.outsideOrgId]);
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (err) {
      console.error('Cleanup failed:', err);
    }
    await pool.end();
  });
