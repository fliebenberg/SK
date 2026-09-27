import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { SocketAction } from '@sk/shared';
import pool, { query } from '../db';

/**
 * Getting an organisation with no administrator an administrator (docs/nomination-process.md §4),
 * end to end over a real socket, against an organisation this script makes and removes.
 *
 *  - Nobody nominates their own address, whether or not they may take the role.
 *  - The nominator is the signed-in caller, never the payload's `referredByUserId`.
 *  - `TAKE_ORG_ADMIN`: anyone may take an org with no members with an account; once it has some, only
 *    a member of `admin_takeover_min_days` standing — member and staff alike — and never while an
 *    admin exists. A member's own membership is promoted in place, keeping its start date.
 *  - `org_claim_status` reports `isMember`, `canTakeOver` and `takeOverFrom` to match.
 *  - `resend` (`ORG-7`) sends again inside the cooldown with a new token, only for someone who can
 *    see the org's nominations, and leaves the nomination's credit alone.
 *  - Deleting the only admin's profile leaves the org unclaimed.
 *
 * Needs a server running against the same database, **with mail going to Ethereal rather than a
 * real SMTP host**: `SMTP_HOST= PORT=3099 npx ts-node src/index.ts`, then
 * `SOCKET_URL=http://localhost:3099 npx ts-node src/scripts/test-admin-takeover.ts`.
 */

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3099';
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';

const ORG = `test-org-takeover-${Date.now()}`;
/** Outsider: no membership of the test org. */
const OUTSIDER = 'fx-user-annelie-botha';
/** A member of long standing (staff). */
const VETERAN = 'fx-user-brendan-o-neill';
/** A member of two days (plain member). */
const NEWCOMER = 'fx-user-catherine-whitfield';

let checks = 0;
const failures: string[] = [];
function expect(actual: unknown, expected: unknown, what: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${what}: expected ${b}, got ${a}`);
}

function connect(userId: string): Promise<Socket> {
  const token = jwt.sign({ id: userId }, JWT_SECRET);
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, { transports: ['websocket'], reconnection: false, auth: { token } });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function send(socket: Socket, type: SocketAction, payload: any): Promise<any> {
  return new Promise((resolve) => socket.emit('action', { type, payload }, resolve));
}

function claimStatus(socket: Socket): Promise<any> {
  return new Promise((resolve) => socket.emit('get_data', { type: 'org_claim_status', orgId: ORG }, resolve));
}

const nominate = (socket: Socket, email: string, extra: Record<string, unknown> = {}) =>
  send(socket, SocketAction.REFER_ORG_CONTACT, { orgId: ORG, contactEmails: [email], ...extra });

async function emailOf(userId: string): Promise<string> {
  return (await query('SELECT email FROM users WHERE id = $1', [userId])).rows[0].email;
}

async function addMember(userId: string, roleId: string, daysAgo: number): Promise<{ profileId: string; membershipId: string }> {
  const profileId = `${ORG}-prof-${userId}`;
  const membershipId = `${ORG}-mem-${userId}`;
  await query(
    `INSERT INTO org_profiles (id, org_id, user_id, name, email) VALUES ($1, $2, $3, $4, $5)`,
    [profileId, ORG, userId, userId, await emailOf(userId)]
  );
  await query(
    `INSERT INTO org_memberships (id, org_profile_id, org_id, role_id, start_date)
     VALUES ($1, $2, $3, $4, NOW() - ($5 || ' days')::interval)`,
    [membershipId, profileId, ORG, roleId, String(daysAgo)]
  );
  return { profileId, membershipId };
}

async function isClaimed(): Promise<boolean> {
  return (await query('SELECT is_claimed FROM organizations WHERE id = $1', [ORG])).rows[0].is_claimed;
}

async function cleanup() {
  await query(`DELETE FROM org_claim_referral_nominators WHERE referral_id IN (SELECT id FROM org_claim_referrals WHERE org_id = $1)`, [ORG]);
  await query(`DELETE FROM org_claim_referrals WHERE org_id = $1`, [ORG]);
  await query(`DELETE FROM org_memberships WHERE org_id = $1`, [ORG]);
  await query(`DELETE FROM org_profiles WHERE org_id = $1`, [ORG]);
  await query(`DELETE FROM organizations WHERE id = $1`, [ORG]);
}

async function main() {
  await query(
    `INSERT INTO organizations (id, name, short_name, is_claimed) VALUES ($1, 'Takeover Test School', 'TTS', false)`,
    [ORG]
  );
  const outsider = await connect(OUTSIDER);
  const veteran = await connect(VETERAN);
  const newcomer = await connect(NEWCOMER);

  try {
    // --- An org with no members: anyone may take it; nobody nominates themselves. ---------------
    let s = await claimStatus(outsider);
    expect([s.isClaimed, s.isMember, s.canTakeOver], [false, false, true], 'no members: outsider may take over');

    let r = await nominate(outsider, await emailOf(OUTSIDER));
    expect(r.status, 'error', 'own address refused');
    expect(/take on the admin role directly/.test(r.message), true, 'own address: points a qualifying caller to the takeover');

    // The payload's nominator is ignored: the row is credited to whoever is signed in.
    const lostAddress = `takeover-${Date.now()}@example.com`;
    r = await nominate(outsider, lostAddress, { referredByUserId: VETERAN });
    expect([r.status, r.data?.[0]?.emailSent], ['ok', true], 'outsider nominates another address');
    const ref = (await query(
      `SELECT id, referred_by_user_id AS "by", claim_token AS token, last_sent_at AS "sentAt" FROM org_claim_referrals WHERE org_id = $1 AND referred_email = $2`,
      [ORG, lostAddress]
    )).rows[0];
    expect(ref.by, OUTSIDER, 'nominator is the signed-in caller, not the payload');

    // --- Members arrive: a veteran (40 days, staff) and a newcomer (2 days, member). ------------
    const vet = await addMember(VETERAN, 'role-org-staff', 40);
    await addMember(NEWCOMER, 'role-org-member', 2);

    s = await claimStatus(outsider);
    expect([s.isMember, s.canTakeOver], [false, false], 'members with accounts: outsider may not take over');
    r = await send(outsider, SocketAction.TAKE_ORG_ADMIN, { orgId: ORG });
    expect(r.status, 'error', 'outsider takeover refused');

    s = await claimStatus(newcomer);
    expect([s.isMember, s.canTakeOver, typeof s.takeOverFrom], [true, false, 'string'], 'newcomer: member, too new, told when');
    const daysUntil = Math.round((new Date(s.takeOverFrom).getTime() - Date.now()) / 86400000);
    expect(daysUntil, 28, 'newcomer may take over 28 days from now');
    r = await send(newcomer, SocketAction.TAKE_ORG_ADMIN, { orgId: ORG });
    expect(r.status, 'error', 'newcomer takeover refused');
    r = await nominate(newcomer, await emailOf(NEWCOMER));
    expect([r.status, /can't nominate yourself/.test(r.message)], ['error', true], 'newcomer may not nominate themselves');

    // --- Resend (ORG-7): only for someone who can see the nominations. -------------------------
    r = await nominate(outsider, lostAddress, { resend: true });
    expect(r.status, 'error', 'outsider cannot resend');
    r = await nominate(veteran, lostAddress);
    expect([r.status, r.data?.[0]?.emailSent], ['ok', false], 'plain re-nomination inside the cooldown sends nothing');
    r = await nominate(veteran, lostAddress, { resend: true });
    expect([r.status, r.data?.[0]?.emailSent], ['ok', true], 'member resends inside the cooldown');
    const after = (await query(
      `SELECT referred_by_user_id AS "by", claim_token AS token, last_sent_at AS "sentAt" FROM org_claim_referrals WHERE id = $1`,
      [ref.id]
    )).rows[0];
    expect(after.token !== ref.token, true, 'resend issues a new token');
    expect(new Date(after.sentAt) > new Date(ref.sentAt), true, 'resend restarts the cooldown');
    expect(after.by, OUTSIDER, 'resend leaves the credit alone');

    // --- The veteran takes the role; their membership is promoted in place. --------------------
    s = await claimStatus(veteran);
    expect([s.isMember, s.canTakeOver], [true, true], 'veteran may take over');
    r = await send(veteran, SocketAction.TAKE_ORG_ADMIN, { orgId: ORG });
    expect([r.status, r.data?.isClaimed], ['ok', true], 'veteran takes the admin role');
    const promoted = (await query(
      `SELECT role_id AS "roleId", start_date < NOW() - INTERVAL '39 days' AS "keptStart" FROM org_memberships WHERE id = $1`,
      [vet.membershipId]
    )).rows[0];
    expect([promoted.roleId, promoted.keptStart], ['role-org-admin', true], 'promoted in place, start date kept');
    expect((await query(`SELECT COUNT(*)::int AS n FROM org_memberships WHERE org_id = $1`, [ORG])).rows[0].n, 2, 'no extra membership');

    s = await claimStatus(newcomer);
    expect([s.isClaimed, s.canTakeOver], [true, false], 'once claimed, nobody else may take over');
    r = await send(newcomer, SocketAction.TAKE_ORG_ADMIN, { orgId: ORG });
    expect([r.status, /already has an administrator/.test(r.message)], ['error', true], 'second takeover refused');

    // --- Deleting the only admin's profile leaves the org unclaimed. ----------------------------
    r = await send(veteran, SocketAction.DELETE_ORG_PROFILE, { id: vet.profileId });
    expect(r.status, 'ok', 'admin profile deleted');
    expect(await isClaimed(), false, 'org unclaimed again after its only admin is deleted');
  } finally {
    outsider.close();
    veteran.close();
    newcomer.close();
    await cleanup();
  }

  console.log(`test-admin-takeover: ${checks - failures.length}/${checks} checks passed`);
  for (const f of failures) console.log(`  FAIL ${f}`);
  await pool.end();
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
