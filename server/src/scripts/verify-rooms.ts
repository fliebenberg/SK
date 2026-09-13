/**
 * Joins every room the server declares and reports what each one hands over.
 *
 * Rule 4 of the live-data skill says a room is one dataset, and that adding one means declaring it
 * in `classifyRoom`, giving it a join push, and giving it a publisher. Two of those three fail
 * **silently**: a room that pushes nothing starts every screen empty (`LIVE-14`), and a room nothing
 * publishes to goes stale the moment anything changes (`FIX-4`, `LIVE-8`). Neither shows up in a
 * typecheck, and neither shows up in a screen that happens to also run a `get_data`.
 *
 * So this checks the half that can be checked from outside: connect as a real signed-in user, join
 * each room, and record which message types arrive. A room reporting `SILENT` has no join push; one
 * reporting `REFUSED` was rejected by `classifyRoom`, and the report says which.
 *
 * A healthy run is every row `OK` with **one** type in its last column - that is rule 4 holding. A
 * row naming several types is a room carrying several datasets, which is what this repo spent
 * 2026-09-11 undoing.
 *
 * It deliberately does **not** check publishers — that needs a mutation per room and would write to
 * the database. `okf/live_rooms.md` is the register for that half.
 *
 * Usage (against a running server):
 *   npm run verify:rooms
 *   PORT=3001 VERIFY_USER_EMAIL=someone@example.com npm run verify:rooms
 *
 * Ids are resolved from the database, so it reports `SKIPPED (no row)` rather than failing when a
 * dev database has no leagues or no tournament divisions in it.
 */

import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import pool from '../db';

const PORT = process.env.PORT || 3001;
const URL = process.env.VERIFY_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';
/** How long to wait for a room's push before calling it silent. */
const PUSH_WAIT_MS = Number(process.env.VERIFY_PUSH_WAIT_MS || 1200);

interface Probe {
  /** Room name with `{id}` still in it, for the report. */
  label: string;
  room: string | null;
  /** What the join push is expected to contain, for a human reading the report. */
  expect: string;
}

async function one(sql: string): Promise<any | null> {
  const res = await pool.query(sql);
  return res.rows[0] || null;
}

async function resolveIds() {
  // The ids have to be *coherent*, not merely present: a user and an unrelated org makes every
  // `member`-tier room report REFUSED, which is indistinguishable from the room not being declared.
  // So the org is the one this user actually administers, and the rest hang off it.
  const seed = await one(
    process.env.VERIFY_USER_EMAIL
      ? `SELECT p.user_id AS user_id, m.org_id
           FROM org_profiles p
           JOIN org_memberships m ON m.org_profile_id = p.id
           JOIN users u ON u.id = p.user_id
          WHERE u.email = '${(process.env.VERIFY_USER_EMAIL || '').replace(/'/g, "''")}'
            AND m.role_id = 'role-org-admin'
            AND (m.end_date IS NULL OR m.end_date > NOW())
          LIMIT 1`
      : `SELECT p.user_id AS user_id, m.org_id
           FROM org_memberships m
           JOIN org_profiles p ON p.id = m.org_profile_id
          WHERE m.role_id = 'role-org-admin'
            AND p.user_id IS NOT NULL
            AND m.org_id <> 'org-system-admins'
            AND (m.end_date IS NULL OR m.end_date > NOW())
          -- Richest org this user administers. An org with no events leaves half the report
          -- SKIPPED, which tells you nothing about whether those rooms work.
          ORDER BY (SELECT count(*) FROM events e WHERE e.org_id = m.org_id) DESC,
                   (SELECT count(*) FROM teams tm WHERE tm.org_id = m.org_id) DESC
          LIMIT 1`
  );
  const userId = seed?.user_id || null;
  const orgId = seed?.org_id || null;

  const [team, site, facility, event] = await Promise.all([
    one(`SELECT id FROM teams WHERE org_id = '${orgId}' LIMIT 1`),
    one(`SELECT id FROM sites WHERE org_id = '${orgId}' LIMIT 1`),
    one(`SELECT f.id FROM facilities f JOIN sites s ON s.id = f.site_id WHERE s.org_id = '${orgId}' LIMIT 1`),
    // An event with a division is the useful one - it exercises the tournament rooms too.
    one(`SELECT e.id FROM events e
           JOIN tournament_divisions d ON d.event_id = e.id
          WHERE e.org_id = '${orgId}' LIMIT 1`)
      .then(row => row || one(`SELECT id FROM events WHERE org_id = '${orgId}' LIMIT 1`)),
  ]);
  const eventId = event?.id || null;

  // Game and league fall back to anything under *any* org this user administers, not just the one
  // chosen above - otherwise a dev database whose richest org happens to have no fixtures reports
  // six rooms SKIPPED and proves nothing about them. Still scoped to the user, so a REFUSED here
  // still means the room, not the membership.
  // *Any* current membership, not just an admin one: `member` tier asks for a membership, not a
  // role, so this is the widest set for which a REFUSED still means the room rather than the user.
  const memberOrgs = `SELECT m.org_id FROM org_memberships m
                        JOIN org_profiles p ON p.id = m.org_profile_id
                       WHERE p.user_id = '${userId}'
                         AND (m.end_date IS NULL OR m.end_date > NOW())`;
  const [division, game, league] = await Promise.all([
    eventId ? one(`SELECT id FROM tournament_divisions WHERE event_id = '${eventId}' LIMIT 1`) : null,
    one(`SELECT g.id FROM games g JOIN events e ON e.id = g.event_id
          WHERE e.org_id IN (${memberOrgs}) LIMIT 1`),
    one(`SELECT id FROM leagues WHERE org_id IN (${memberOrgs}) LIMIT 1`),
  ]);

  // Last resort: any game or league at all. Reporting four rooms as SKIPPED proves nothing about
  // them, and the public tiers (`game:{id}:summary`) are testable regardless of who owns the row.
  // Recorded in `unscoped` so the report can say that a REFUSED on a `member`-tier room here may be
  // the membership rather than the room.
  const unscoped: string[] = [];
  let gameRow = game;
  let leagueRow = league;
  if (!gameRow) {
    gameRow = await one(`SELECT id FROM games LIMIT 1`);
    if (gameRow) unscoped.push('gameId');
  }
  if (!leagueRow) {
    leagueRow = await one(`SELECT id FROM leagues LIMIT 1`);
    if (leagueRow) unscoped.push('leagueId');
  }
  const leagueId = leagueRow?.id || null;
  const season = leagueId ? await one(`SELECT id FROM seasons WHERE league_id = '${leagueId}' LIMIT 1`) : null;

  return {
    userId,
    orgId,
    teamId: team?.id || null,
    siteId: site?.id || null,
    facilityId: facility?.id || null,
    eventId,
    divisionId: division?.id || null,
    gameId: gameRow?.id || null,
    leagueId,
    seasonId: season?.id || null,
    unscoped,
  };
}

/**
 * Every room name the server declares, in the order `classifyRoom` lists them. Keeping this list
 * by hand is the point: a room added to `classifyRoom` and not added here shows up as a gap between
 * this file and `okf/live_rooms.md`, which is a cheaper thing to notice than a blank screen.
 */
function buildProbes(ids: Awaited<ReturnType<typeof resolveIds>>): Probe[] {
  const { orgId, teamId, siteId, facilityId, eventId, divisionId, gameId, leagueId, seasonId, userId } = ids;
  const org = (sub: string, expect: string): Probe =>
    ({ label: `org:{id}:${sub}`, room: orgId ? `org:${orgId}:${sub}` : null, expect });

  return [
    org('summary', 'ORGANIZATION_UPDATED'),
    org('events', 'EVENTS_SYNC'),
    org('fixtures', 'GAME_SUMMARIES_SYNC'),
    org('teams', 'TEAMS_SYNC'),
    org('sites', 'SITES_SYNC'),
    org('facilities', 'FACILITIES_SYNC'),
    org('leagues', 'LEAGUES_SYNC'),
    org('members', 'ORG_MEMBERS_SYNC'),
    org('referrals', 'ORG_REFERRALS_SYNC'),

    { label: 'team:{id}', room: teamId ? `team:${teamId}` : null, expect: 'TEAM_UPDATED' },
    { label: 'team:{id}:members', room: teamId ? `team:${teamId}:members` : null, expect: 'TEAM_MEMBERS_SYNC' },
    { label: 'site:{id}', room: siteId ? `site:${siteId}` : null, expect: 'SITE_UPDATED' },
    { label: 'facility:{id}', room: facilityId ? `facility:${facilityId}` : null, expect: 'FACILITY_UPDATED' },

    { label: 'event:{id}', room: eventId ? `event:${eventId}` : null, expect: 'EVENT_UPDATED' },
    { label: 'event:{id}:fixtures', room: eventId ? `event:${eventId}:fixtures` : null, expect: 'GAME_SUMMARIES_SYNC' },
    { label: 'event:{id}:divisions', room: eventId ? `event:${eventId}:divisions` : null, expect: 'DIVISIONS_SYNC' },
    { label: 'event:{id}:facilities', room: eventId ? `event:${eventId}:facilities` : null, expect: 'EVENT_FACILITIES_SYNC' },
    { label: 'event:{id}:standings', room: eventId ? `event:${eventId}:standings` : null, expect: 'EVENT_STANDINGS_UPDATED' },
    { label: 'event:{id}:entrants', room: eventId ? `event:${eventId}:entrants` : null, expect: 'EVENT_ENTRANTS_SYNC' },

    { label: 'division:{id}', room: divisionId ? `division:${divisionId}` : null, expect: 'DIVISION_UPDATED' },
    { label: 'division:{id}:fixtures', room: divisionId ? `division:${divisionId}:fixtures` : null, expect: 'DIVISION_GAMES_SYNC' },
    { label: 'division:{id}:stages', room: divisionId ? `division:${divisionId}:stages` : null, expect: 'STAGES_SYNC' },
    { label: 'division:{id}:standings', room: divisionId ? `division:${divisionId}:standings` : null, expect: 'DIVISION_STANDINGS_UPDATED' },
    { label: 'division:{id}:facilities', room: divisionId ? `division:${divisionId}:facilities` : null, expect: 'DIVISION_FACILITIES_SYNC' },
    { label: 'division:{id}:entrants', room: divisionId ? `division:${divisionId}:entrants` : null, expect: 'DIVISION_ENTRANTS_SYNC' },
    { label: 'division:{id}:adjustments', room: divisionId ? `division:${divisionId}:adjustments` : null, expect: 'DIVISION_ADJUSTMENTS_SYNC' },
    { label: 'division:{id}:stage_entrants', room: divisionId ? `division:${divisionId}:stage_entrants` : null, expect: 'STAGE_ENTRANTS_SYNC (one per stage)' },

    { label: 'game:{id}', room: gameId ? `game:${gameId}` : null, expect: 'GAME_UPDATED' },
    { label: 'game:{id}:summary', room: gameId ? `game:${gameId}:summary` : null, expect: 'GAME_SUMMARY_UPDATED' },
    { label: 'game:{id}:events', room: gameId ? `game:${gameId}:events` : null, expect: 'GAME_EVENTS_SYNC' },
    { label: 'game:{id}:disputes', room: gameId ? `game:${gameId}:disputes` : null, expect: 'ACTIVE_DISPUTES_SYNC' },

    { label: 'league:{id}:seasons', room: leagueId ? `league:${leagueId}:seasons` : null, expect: 'SEASONS_SYNC' },
    { label: 'season:{id}:standings', room: seasonId ? `season:${seasonId}:standings` : null, expect: 'STANDINGS_UPDATED' },

    { label: 'user:{id}:notifications', room: userId ? `user:${userId}:notifications` : null, expect: 'NOTIFICATIONS_SYNC' },
    { label: 'user:{id}:memberships', room: userId ? `user:${userId}:memberships` : null, expect: 'USER_MEMBERSHIPS_UPDATED' },
    { label: 'user:{id}:capabilities', room: userId ? `user:${userId}:capabilities` : null, expect: 'EVENT_GRANTS_SYNC' },
  ];
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ['websocket'], auth: { token }, reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', err => reject(new Error(`Could not connect to ${URL}: ${err.message}`)));
    setTimeout(() => reject(new Error(`Timed out connecting to ${URL}`)), 8000);
  });
}

async function main() {
  const ids = await resolveIds();
  if (!ids.userId) {
    console.error('No user found to authenticate as. Seed the database or set VERIFY_USER_EMAIL.');
    process.exit(1);
  }
  console.log(`Resolved ids: ${JSON.stringify(ids, null, 2)}`);
  if (ids.unscoped.length) {
    console.log(
      `
Note: ${ids.unscoped.join(', ')} could not be scoped to this user's organisations, so a ` +
      `REFUSED on a member-tier room for them may be the membership rather than the room.`
    );
  }

  const token = jwt.sign({ id: ids.userId, email: 'verify@local', globalRole: 'user' }, JWT_SECRET, {
    expiresIn: '1h',
  });
  const socket = await connect(token);
  console.log(`Connected to ${URL} as ${ids.userId} (socket ${socket.id})\n`);

  // One listener for the whole run; messages are attributed by `topic`, which is exactly what the
  // envelope carries it for.
  const received = new Map<string, string[]>();
  socket.on('update', (msg: { topic?: string; type: string }) => {
    if (!msg?.topic) return;
    const list = received.get(msg.topic) || [];
    list.push(msg.type);
    received.set(msg.topic, list);
  });

  const probes = buildProbes(ids);
  const rows: { label: string; status: string; got: string }[] = [];

  for (const probe of probes) {
    if (!probe.room) {
      rows.push({ label: probe.label, status: 'SKIPPED', got: 'no row in database' });
      continue;
    }
    received.set(probe.room, []);
    socket.emit('join_room', probe.room);
    await new Promise(r => setTimeout(r, PUSH_WAIT_MS));
    const got = received.get(probe.room) || [];
    const denied = got.includes('ROOM_ACCESS_DENIED');
    const status = denied ? 'REFUSED' : got.length ? 'OK' : 'SILENT';
    rows.push({ label: probe.label, status, got: got.length ? [...new Set(got)].join(', ') : `expected ${probe.expect}` });
    socket.emit('leave_room', probe.room);
  }

  socket.close();

  const width = Math.max(...rows.map(r => r.label.length)) + 2;
  console.log('Room'.padEnd(width) + 'Status'.padEnd(10) + 'Types received');
  console.log('-'.repeat(width + 10 + 40));
  for (const row of rows) {
    console.log(row.label.padEnd(width) + row.status.padEnd(10) + row.got);
  }

  const silent = rows.filter(r => r.status === 'SILENT');
  const refused = rows.filter(r => r.status === 'REFUSED');
  console.log(
    `\n${rows.filter(r => r.status === 'OK').length} OK, ${silent.length} silent, ` +
    `${refused.length} refused, ${rows.filter(r => r.status === 'SKIPPED').length} skipped.`
  );
  if (silent.length) {
    console.log(`\nSilent rooms (declared but push nothing - this is the LIVE-14 defect):`);
    for (const row of silent) console.log(`  ${row.label} - ${row.got}`);
  }
  await pool.end();
  process.exit(silent.length ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
