import * as fs from 'fs';
import * as path from 'path';
import { SocketAction } from '@sk/shared';
import { query } from '../db';
import pool from '../db';
import { enforceOrgAction } from '../wss/orgGate';
import { enforceProfileAction } from '../wss/profileGate';

/**
 * Who may write an organisation's things — the gate added on 2026-09-21, asserted against a real
 * database rather than trusted.
 *
 * Until that date forty-five socket actions checked nothing at all. `ADD_ORG_MEMBER` would make
 * anybody an admin of any organisation; `DELETE_ORG` and `DELETE_TEAM` would act on anybody's;
 * `CLAIM_ORG` handed an unclaimed organisation to whoever the payload named. `orgGate.ts` closes
 * them with one table, and this is what stops the table quietly going wrong later.
 *
 * Three kinds of check:
 *
 *  - **Refusals.** A stranger and an anonymous socket are turned away from another organisation's
 *    things, a plain member from its writes, and staff from its identity and from handing out the
 *    admin role — the last being how a staff member would otherwise promote themselves.
 *  - **The unclaimed exception.** A stranger *may* create a team or a person in an unclaimed
 *    organisation, and the payload is cut to the minimum on the way — checked by looking at what is
 *    left of it, since "allowed" alone would pass a gate that forgot to strip.
 *  - **Coverage.** Every action the server handles must be named by a gate — the tournament,
 *    profile, organisation or scoring gate — with **no exceptions**. Nothing authorises inside its
 *    own handler any more, so a handler added later without a rule fails this script, which is the
 *    property the forty-five lacked.
 *
 * Kept, for the reason every phase script gives: `server/` has no test harness. It leaves the
 * database as it found it.
 *
 * Run: `npx ts-node src/scripts/org-permissions.ts`
 */

let checks = 0;
const failures: string[] = [];

function expect(actual: unknown, expected: unknown, what: string): void {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

/** Run the real gates in the order `index.ts` runs them, and report whether the action got through. */
async function allows(userId: string | null, type: SocketAction, payload: any): Promise<boolean> {
  try {
    await enforceProfileAction(userId, type, payload);
    await enforceOrgAction(userId, type, payload);
    return true;
  } catch {
    return false;
  }
}

const created = {
  orgIds: [] as string[],
  userIds: [] as string[],
  profileIds: [] as string[],
  teamIds: [] as string[],
  siteIds: [] as string[],
  leagueIds: [] as string[],
  notificationIds: [] as string[],
  eventIds: [] as string[],
};

async function main() {
  const stamp = Date.now();

  // ------------------------------------------------------------------------------------------
  // Two organisations: one claimed and run by people, one nobody has claimed yet
  // ------------------------------------------------------------------------------------------

  const claimed = `org-op-claimed-${stamp}`;
  const unclaimed = `org-op-unclaimed-${stamp}`;
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active) VALUES ($1, 'OP Claimed', 'OPC', true, true)`,
    [claimed]
  );
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed, is_active) VALUES ($1, 'OP Unclaimed', 'OPU', false, true)`,
    [unclaimed]
  );
  created.orgIds.push(claimed, unclaimed);

  async function person(slug: string, roleId: string | null) {
    const userId = `user-op-${slug}-${stamp}`;
    await query(`INSERT INTO users (id, name, email, global_role) VALUES ($1, $2, $3, 'user')`, [
      userId,
      `OP ${slug}`,
      `op-${slug}-${stamp}@example.test`,
    ]);
    created.userIds.push(userId);
    if (!roleId) return userId;
    const profileId = `prof-op-${slug}-${stamp}`;
    await query(`INSERT INTO org_profiles (id, org_id, user_id, name, email) VALUES ($1, $2, $3, $4, $5)`, [
      profileId,
      claimed,
      userId,
      `OP ${slug}`,
      `op-${slug}-${stamp}@example.test`,
    ]);
    created.profileIds.push(profileId);
    await query(
      `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date) VALUES ($1, $2, $3, $4, NOW())`,
      [`mem-op-${slug}-${stamp}`, profileId, claimed, roleId]
    );
    return userId;
  }

  const admin = await person('admin', 'role-org-admin');
  const staff = await person('staff', 'role-org-staff');
  const member = await person('member', 'role-org-member');
  const stranger = await person('stranger', null);

  // The claimed organisation's things, for the stranger to be turned away from.
  const teamId = `team-op-${stamp}`;
  await query(`INSERT INTO teams (id, name, org_id, is_active) VALUES ($1, 'OP XV', $2, true)`, [teamId, claimed]);
  created.teamIds.push(teamId);
  const siteId = `site-op-${stamp}`;
  await query(`INSERT INTO sites (id, name, org_id, is_active) VALUES ($1, 'OP Field', $2, true)`, [siteId, claimed]);
  created.siteIds.push(siteId);
  const sport = (await query(`SELECT id FROM sports ORDER BY id LIMIT 1`)).rows[0];
  const leagueId = `lg-op-${stamp}`;
  await query(`INSERT INTO leagues (id, name, org_id, sport_id) VALUES ($1, 'OP League', $2, $3)`, [
    leagueId,
    claimed,
    sport.id,
  ]);
  created.leagueIds.push(leagueId);
  const notificationId = `ntf-op-${stamp}`;
  await query(
    `INSERT INTO notifications (id, user_id, title, message, type) VALUES ($1, $2, 'OP', 'OP', 'info')`,
    [notificationId, admin]
  );
  created.notificationIds.push(notificationId);

  // ------------------------------------------------------------------------------------------
  // 1. Nobody signed in gets nothing that was open before
  // ------------------------------------------------------------------------------------------

  expect(
    [
      await allows(null, SocketAction.ADD_TEAM, { name: 'X', orgId: claimed }),
      await allows(null, SocketAction.DELETE_ORG, { id: claimed }),
      await allows(null, SocketAction.ADD_ORG_MEMBER, { orgId: claimed, orgProfileId: 'x', roleId: 'role-org-admin' }),
      await allows(null, SocketAction.RESET_CACHE, {}),
    ],
    [false, false, false, false],
    'an anonymous socket can no longer create a team, delete an org, grant a membership or reset the cache'
  );

  // ------------------------------------------------------------------------------------------
  // 2. A stranger is turned away from another organisation's things
  // ------------------------------------------------------------------------------------------

  const writes: Array<[SocketAction, any, string]> = [
    [SocketAction.UPDATE_ORG, { id: claimed, data: { name: 'Hijacked' } }, 'rename the org'],
    [SocketAction.DELETE_ORG, { id: claimed }, 'delete the org'],
    [SocketAction.ADD_ORG_MEMBER, { orgId: claimed, orgProfileId: 'x', roleId: 'role-org-admin' }, 'make themselves an admin'],
    [SocketAction.UPDATE_TEAM, { id: teamId, data: { name: 'Hijacked' } }, 'rename a team'],
    [SocketAction.DELETE_TEAM, { id: teamId }, 'delete a team'],
    [SocketAction.ADD_TEAM, { name: 'Planted', orgId: claimed }, 'create a team in a claimed org'],
    [SocketAction.ADD_SITE, { name: 'Planted', orgId: claimed }, 'add a site'],
    [SocketAction.DELETE_SITE, { id: siteId }, 'delete a site'],
    [SocketAction.ADD_FACILITY, { name: 'Planted', siteId }, 'add a facility'],
    [SocketAction.UPDATE_LEAGUE, { id: leagueId, data: { name: 'Hijacked' } }, 'rename a league'],
    [SocketAction.ADD_SEASON, { leagueId, name: 'Planted' }, 'add a season'],
    [SocketAction.ADD_EVENT, { orgId: claimed, name: 'Planted' }, 'create an event for the org'],
  ];
  for (const [type, payload, what] of writes) {
    expect(await allows(stranger, type, { ...payload }), false, `a stranger cannot ${what}`);
  }

  // A plain member belongs, and still may not change the organisation's things.
  expect(
    [
      await allows(member, SocketAction.DELETE_TEAM, { id: teamId }),
      await allows(member, SocketAction.ADD_SITE, { name: 'X', orgId: claimed }),
    ],
    [false, false],
    'nor can a plain member — belonging is not managing'
  );

  // ------------------------------------------------------------------------------------------
  // 3. The people who run it may
  // ------------------------------------------------------------------------------------------

  for (const [type, payload, what] of writes) {
    expect(await allows(admin, type, { ...payload }), true, `an admin may ${what}`);
  }

  expect(
    [
      await allows(staff, SocketAction.DELETE_TEAM, { id: teamId }),
      await allows(staff, SocketAction.ADD_SITE, { name: 'X', orgId: claimed }),
      await allows(staff, SocketAction.ADD_ORG_MEMBER, { orgId: claimed, orgProfileId: 'x', roleId: 'role-org-member' }),
    ],
    [true, true, true],
    "staff manage the organisation's things, and may add an ordinary member"
  );
  expect(
    [
      await allows(staff, SocketAction.DELETE_ORG, { id: claimed }),
      await allows(staff, SocketAction.UPDATE_ORG, { id: claimed, data: {} }),
      await allows(staff, SocketAction.ADD_ORG_MEMBER, { orgId: claimed, orgProfileId: 'x', roleId: 'role-org-admin' }),
    ],
    [false, false, false],
    "but not the organisation's identity, and not the admin role — how staff would promote themselves"
  );

  // ------------------------------------------------------------------------------------------
  // 4. The unclaimed exception, and what it leaves of the payload
  // ------------------------------------------------------------------------------------------

  const teamPayload: any = {
    name: 'Outsider XV',
    orgId: unclaimed,
    sportId: sport.id,
    ageGroupId: null,
    isActive: true,
    logo: 'data:image/png;base64,planted',
    creatorId: stranger,
  };
  expect(
    await allows(stranger, SocketAction.ADD_TEAM, teamPayload),
    true,
    'a stranger may create a team in an unclaimed organisation — nobody else can'
  );
  expect(
    Object.keys(teamPayload).sort(),
    ['ageGroupId', 'isActive', 'name', 'orgId', 'sportId'],
    'and is left only the fields that decide which divisions it qualifies for'
  );

  const profilePayload: any = { name: 'A Runner', orgId: unclaimed, email: 'somebody@example.test', cellphone: '0800' };
  expect(
    await allows(stranger, SocketAction.ADD_ORG_PROFILE, profilePayload),
    true,
    'a stranger may create a person in an unclaimed organisation'
  );
  expect(
    Object.keys(profilePayload).sort(),
    ['name', 'orgId'],
    'with a name only — an email would let the profile be matched to whoever owns it'
  );

  expect(
    [
      await allows(stranger, SocketAction.ADD_TEAM, { name: 'X', orgId: claimed }),
      await allows(stranger, SocketAction.ADD_ORG_PROFILE, { name: 'X', orgId: claimed }),
    ],
    [false, false],
    'none of which applies once somebody has claimed it'
  );

  // ------------------------------------------------------------------------------------------
  // 5. Operators, accounts and email links
  // ------------------------------------------------------------------------------------------

  expect(
    [
      await allows(stranger, SocketAction.CLAIM_ORG, { id: unclaimed, userId: stranger }),
      await allows(stranger, SocketAction.RESET_CACHE, {}),
      await allows(stranger, SocketAction.GLOBAL_CACHE_REFRESH, {}),
    ],
    [false, false, false],
    'claiming directly and forcing every client to refresh are for app administrators'
  );

  expect(
    [
      await allows(stranger, SocketAction.FEED_GET_HOME, { userId: stranger }),
      await allows(stranger, SocketAction.FEED_GET_HOME, { userId: admin }),
      await allows(stranger, SocketAction.CLAIM_ORG_VIA_TOKEN, { token: 't', userId: admin }),
    ],
    [true, false, false],
    "a payload naming a user must name the caller — including a claim, which makes that user an admin"
  );

  expect(
    [
      await allows(admin, SocketAction.MARK_NOTIFICATION_READ, { id: notificationId }),
      await allows(stranger, SocketAction.DELETE_NOTIFICATION, { id: notificationId }),
    ],
    [true, false],
    "a notification is its owner's to read and delete"
  );

  expect(
    [
      await allows(stranger, SocketAction.ADD_ORG, { name: 'Mine', creatorId: stranger }),
      await allows(stranger, SocketAction.ADD_ORG, { name: 'Framed', creatorId: admin }),
    ],
    [true, false],
    'anybody signed in may create an organisation, but only in their own name'
  );

  expect(
    [
      await allows(null, SocketAction.DECLINE_CLAIM, { token: 't' }),
      await allows(null, SocketAction.DECLINE_CLAIM, {}),
    ],
    [true, false],
    'an email link works signed out, because the token in it is the authorisation'
  );

  // ------------------------------------------------------------------------------------------
  // 6. Events and fixtures, which checked inside their own handlers until 2026-09-21
  // ------------------------------------------------------------------------------------------

  const eventId = `evt-op-${stamp}`;
  await query(
    `INSERT INTO events (id, name, type, start_date, org_id, status) VALUES ($1, 'OP Match', 'SingleMatch', NOW(), $2, 'Scheduled')`,
    [eventId, claimed]
  );
  created.eventIds.push(eventId);
  const gameId = `game-op-${stamp}`;
  await query(`INSERT INTO games (id, event_id, status) VALUES ($1, $2, 'Scheduled')`, [gameId, eventId]);

  expect(
    [
      await allows(stranger, SocketAction.UPDATE_EVENT, { id: eventId, data: { name: 'Hijacked' } }),
      await allows(stranger, SocketAction.DELETE_EVENT, { id: eventId }),
      await allows(stranger, SocketAction.DELETE_GAME, { id: gameId }),
      await allows(admin, SocketAction.UPDATE_EVENT, { id: eventId, data: { name: 'Renamed' } }),
      await allows(admin, SocketAction.DELETE_GAME, { id: gameId }),
    ],
    [false, false, false, true, true],
    "events and fixtures are the host's to edit and delete — still, now that the gate decides it"
  );

  /*
   * `UPDATE_GAME` chooses its rule by what the payload changes: the result needs a scorer, anything
   * else an editor. Asserted through the refusal each path gives, which is what shows the choice is
   * being made — a stranger fails both, but for two different reasons.
   */
  const refusal = async (payload: any) => {
    try {
      await enforceOrgAction(stranger, SocketAction.UPDATE_GAME, payload);
      return 'allowed';
    } catch (err: any) {
      return err?.rule;
    }
  };
  expect(
    [
      await refusal({ id: gameId, data: { status: 'Finished' } }),
      await refusal({ id: gameId, data: { finalScoreData: {} } }),
      await refusal({ id: gameId, data: { scheduledStartTime: new Date().toISOString() } }),
    ],
    ['update-fixture', 'update-fixture', 'update-fixture'],
    'every UPDATE_GAME refusal names the rule that made it, for the gate log'
  );
  const reason = async (payload: any) => {
    try {
      await enforceOrgAction(stranger, SocketAction.UPDATE_GAME, payload);
      return 'allowed';
    } catch (err: any) {
      return /score/.test(err?.message) ? 'scorer' : 'editor';
    }
  };
  expect(
    [
      await reason({ id: gameId, data: { status: 'Finished' } }),
      await reason({ id: gameId, data: { scheduledStartTime: new Date().toISOString() } }),
    ],
    ['scorer', 'editor'],
    'and asks for a scorer to finish the match but an editor to reschedule it'
  );

  expect(
    [
      await allows(null, SocketAction.ADD_AGE_GROUP, { sportId: sport.id, name: 'U9' }),
      await allows(stranger, SocketAction.ADD_AGE_GROUP, { sportId: sport.id, name: 'U9' }),
    ],
    [false, true],
    'an age group is anybody signed in — that its sport exists is left to the handler, as validation'
  );

  // ------------------------------------------------------------------------------------------
  // 7. Coverage — nothing the server handles is left unauthorised
  // ------------------------------------------------------------------------------------------

  /*
   * Read from the source rather than listed by hand, so a new `case` is seen the day it is added.
   * **No exceptions.** Until 2026-09-21 five actions authorised inside their own handlers and were
   * listed here as allowed to; they moved into `orgGate`, and the list went with them. An action a
   * gate does not name fails this check, and there is no second list to remember to keep in step.
   */

  const src = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const index = src('index.ts');
  const handler = index.slice(index.indexOf('const runAction = async'));
  const handled = [...handler.matchAll(/case SocketAction\.([A-Z_]+):/g)].map(m => m[1]);
  const gated = new Set([
    ...[...src('wss/tournamentGate.ts').matchAll(/SocketAction\.([A-Z_]+)\]/g)].map(m => m[1]),
    ...[...src('wss/profileGate.ts').matchAll(/SocketAction\.([A-Z_]+)/g)].map(m => m[1]),
    ...[...src('wss/orgGate.ts').matchAll(/\[SocketAction\.([A-Z_]+)\]:/g)].map(m => m[1]),
    ...[...index.slice(0, index.indexOf('const runAction = async')).matchAll(/\[SocketAction\.([A-Z_]+)\]\s*:/g)].map(m => m[1]),
  ]);
  expect(
    [...new Set(handled.filter(name => !gated.has(name)))],
    [],
    'every action the server handles is authorised by a gate — none checks inside its handler'
  );

  if (failures.length) {
    console.error(`FAIL — ${failures.length} of ${checks} checks:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS — ${checks} organisation permission checks.`);
  }
}

async function cleanup() {
  for (const id of created.eventIds) await query(`DELETE FROM events WHERE id = $1`, [id]);
  for (const id of created.notificationIds) await query(`DELETE FROM notifications WHERE id = $1`, [id]);
  for (const id of created.leagueIds) await query(`DELETE FROM leagues WHERE id = $1`, [id]);
  for (const id of created.siteIds) await query(`DELETE FROM sites WHERE id = $1`, [id]);
  for (const id of created.teamIds) await query(`DELETE FROM teams WHERE id = $1`, [id]);
  await query(`DELETE FROM org_memberships WHERE org_profile_id = ANY($1)`, [created.profileIds]);
  for (const id of created.profileIds) await query(`DELETE FROM org_profiles WHERE id = $1`, [id]);
  for (const id of created.userIds) await query(`DELETE FROM users WHERE id = $1`, [id]);
  for (const id of created.orgIds) await query(`DELETE FROM organizations WHERE id = $1`, [id]);
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(err => console.error('Cleanup failed:', err));
    await pool.end();
  });
