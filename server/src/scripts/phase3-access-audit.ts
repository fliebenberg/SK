import { APP_TEST_ORG_ID } from '@sk/shared';
import { query } from '../db';
import pool from '../db';
import { canJoinRoom } from '../wss/roomAccess';
import { canReadData } from '../wss/dataAccess';
import { eventManager } from '../managers/EventManager';
import { tournamentManager } from '../managers/TournamentManager';

/**
 * Tournaments Phase 3 — the read boundary, checked rather than reasoned about.
 *
 * `GET_DATA_ENFORCE` is on, so a `get_data` type with no rule in `dataAccess.ts` is **refused**,
 * and an undeclared room shape is refused by `roomAccess.ts`. That safety net only helps if
 * somebody runs it: this replays every new room and every new request type as an anonymous socket
 * and as a signed-in member of the hosting org, and asserts the answer each way.
 *
 * The interesting assertions are the negatives — the roster and the manual adjustments must be
 * refused anonymously while the draw and the table are not.
 *
 * **Kept rather than thrown away**, unlike Phase 0's audits. `server/` has no test harness (decided
 * at Phase 3), so deleting this would leave nothing at all checking that the roster and the
 * adjustment reasons stay unreadable to an anonymous socket. It leaves the database as it found it
 * and is an obvious first candidate to graduate when a harness lands.
 *
 * Run: `npx ts-node src/scripts/phase3-access-audit.ts`
 */

let checks = 0;
const failures: string[] = [];

function expect(actual: boolean, expected: boolean, what: string): void {
  checks++;
  if (actual !== expected) failures.push(`${what}: expected ${expected}, got ${actual}`);
}

const created = { eventId: '', divisionId: '', stageId: '', teamId: '', userId: '', profileId: '', membershipId: '' };

async function main() {
  const stamp = Date.now();

  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active)
     VALUES ($1, 'App Test Org', 'ATO', true, true) ON CONFLICT (id) DO NOTHING`,
    [APP_TEST_ORG_ID]
  );

  // A real member of the hosting org, since membership is what `member` rooms resolve against.
  created.userId = `user-p3a-${stamp}`;
  await query(`INSERT INTO users (id, name, email, global_role) VALUES ($1, 'P3 Auditor', $2, 'user')`, [
    created.userId,
    `p3-auditor-${stamp}@example.test`,
  ]);
  created.profileId = `prof-p3a-${stamp}`;
  await query(`INSERT INTO org_profiles (id, org_id, user_id, name) VALUES ($1, $2, $3, 'P3 Auditor')`, [
    created.profileId,
    APP_TEST_ORG_ID,
    created.userId,
  ]);
  created.membershipId = `mem-p3a-${stamp}`;
  await query(
    `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
     VALUES ($1, $2, $3, 'role-org-admin', NOW())`,
    [created.membershipId, created.profileId, APP_TEST_ORG_ID]
  );

  const sportId = (await query(`SELECT id FROM sports ORDER BY id LIMIT 1`)).rows[0].id;
  created.teamId = `team-p3a-${stamp}`;
  await query(
    `INSERT INTO teams (id, name, sport_id, org_id, is_active) VALUES ($1, 'P3 Audit Team', $2, $3, true)`,
    [created.teamId, sportId, APP_TEST_ORG_ID]
  );

  const event = await eventManager.addEvent({
    name: `Phase 3 Access Audit ${stamp}`,
    type: 'Tournament',
    format: 'Festival',
    startDate: new Date().toISOString(),
    orgId: APP_TEST_ORG_ID,
    sportIds: [sportId],
    settings: {},
    status: 'Scheduled',
  } as any);
  created.eventId = event.id;

  const division = await tournamentManager.addDivision({ eventId: event.id, name: 'Audit Division', sportId });
  created.divisionId = division.id;
  const stage = await tournamentManager.addStage({ divisionId: division.id, name: 'Main', format: 'Festival' });
  created.stageId = stage.id;
  await tournamentManager.setDivisionEntrants(division.id, [{ teamId: created.teamId }]);

  const ANON = 'anonymous';
  const MEMBER = created.userId;

  // --- Rooms -----------------------------------------------------------------------------
  // Public: the draw and the table, exactly as `org:*:events` and `season:*:standings` already are.
  expect(await canJoinRoom(ANON, `division:${division.id}:fixtures`), true, 'anon may join the fixtures room');
  expect(await canJoinRoom(ANON, `division:${division.id}:standings`), true, 'anon may join the standings room');
  expect(await canJoinRoom(MEMBER, `division:${division.id}:fixtures`), true, 'a member may join the fixtures room');

  // Member: the roster and the adjustments.
  expect(await canJoinRoom(ANON, `division:${division.id}`), false, 'anon may NOT join the roster room');
  expect(await canJoinRoom(MEMBER, `division:${division.id}`), true, 'a member of the hosting org may join it');

  // Undeclared shapes stay refused, which is the safety net rather than an oversight.
  expect(await canJoinRoom(MEMBER, `division:${division.id}:entrants`), false, 'an undeclared sub-room is refused');
  expect(await canJoinRoom(MEMBER, 'division:'), false, 'a division room with no id is refused');
  expect(await canJoinRoom(MEMBER, `stage:${stage.id}`), false, 'there is no stage room; it is refused');

  // --- get_data --------------------------------------------------------------------------
  const publicTypes = [
    { type: 'divisions', eventId: event.id },
    { type: 'event_facilities', eventId: event.id },
    { type: 'event_standings', eventId: event.id },
    { type: 'division', divisionId: division.id },
    { type: 'division_stages', divisionId: division.id },
    { type: 'division_games', divisionId: division.id },
    { type: 'division_facilities', divisionId: division.id },
    { type: 'division_standings', divisionId: division.id },
    { type: 'stage', stageId: stage.id },
    { type: 'stage_games', stageId: stage.id },
  ];
  for (const request of publicTypes) {
    const decision = await canReadData(ANON, request);
    expect(decision.allowed, true, `anon may read '${request.type}' (${decision.reason})`);
  }

  const memberOnlyTypes = [
    { type: 'division_entrants', divisionId: division.id },
    { type: 'division_adjustments', divisionId: division.id },
    { type: 'stage_entrants', stageId: stage.id },
  ];
  for (const request of memberOnlyTypes) {
    const anonDecision = await canReadData(ANON, request);
    expect(anonDecision.allowed, false, `anon may NOT read '${request.type}' (${anonDecision.reason})`);
    const memberDecision = await canReadData(MEMBER, request);
    expect(memberDecision.allowed, true, `a member may read '${request.type}' (${memberDecision.reason})`);
  }

  // A request naming no subject is refused rather than authorized against a room built from
  // `undefined` — the hole `facilities` had before Phase 0 closed it.
  for (const type of ['divisions', 'division', 'division_entrants', 'stage', 'stage_entrants', 'event_standings']) {
    const decision = await canReadData(MEMBER, { type });
    expect(decision.allowed, false, `'${type}' with no subject is refused (${decision.reason})`);
  }

  // And a type that does not exist stays refused, which is what makes adding one deliberate.
  const unmapped = await canReadData(MEMBER, { type: 'division_secrets', divisionId: division.id });
  expect(unmapped.allowed, false, `an unmapped type is refused (${unmapped.reason})`);

  if (failures.length) {
    console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS — ${checks} access checks.`);
  }
}

async function cleanup() {
  if (created.eventId) await query(`DELETE FROM events WHERE id = $1`, [created.eventId]);
  if (created.teamId) await query(`DELETE FROM teams WHERE id = $1`, [created.teamId]);
  if (created.membershipId) await query(`DELETE FROM org_memberships WHERE id = $1`, [created.membershipId]);
  if (created.profileId) await query(`DELETE FROM org_profiles WHERE id = $1`, [created.profileId]);
  if (created.userId) await query(`DELETE FROM users WHERE id = $1`, [created.userId]);
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
