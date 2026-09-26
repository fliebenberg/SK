import jwt from 'jsonwebtoken';
import { io, Socket } from 'socket.io-client';
import { SocketAction } from '@sk/shared';
import pool, { query } from '../db';
import { memberInvitationContent } from '../managers/MailManager';

/**
 * `SEND_MEMBER_INVITE`, end to end over a real socket, against the test organisations (Doringkloof).
 *
 *  - Anyone without an account can be invited, with or without an email on file; a new address is
 *    saved to the profile.
 *  - Nobody with an account can be, and no address that already belongs to one.
 *  - The cooldown is per address: a different address goes at once, the same one does not — and
 *    clearing the profile's email and typing the same address back does not reset it.
 *  - `resend` sends to the same address inside the cooldown, and restarts it.
 *  - `UPDATE_ORG_PROFILE` cannot clear the invite record.
 *  - Minors (`MEMBER-3`): a guardian is invited with wording that names their children; a minor the
 *    org's minors rule restricts is refused, and allowed once the rule allows them; an invite may not
 *    give a guardian their child's address.
 *
 * Needs a server running against the same database, **with mail going to Ethereal rather than a
 * real SMTP host**: `SMTP_HOST= PORT=3099 npx ts-node src/index.ts`, then
 * `SOCKET_URL=http://localhost:3099 npx ts-node src/scripts/test-member-invite.ts`. Signs in as
 * Doringkloof's admin. Puts the profiles it touches back as it found them.
 */

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3099';
const JWT_SECRET = process.env.JWT_SECRET || 'sk-jwt-secret-key-2026-secure-development-only';

const ADMIN = 'fx-user-johan-van-der-merwe';
const COACH_NO_ACCOUNT = 'fx-prof-dkl-marelize-coetzee';
const COACH_WITH_ACCOUNT = 'fx-prof-dkl-pieter-joubert';
// An adult (born 2008-02-06) with no email. Not a U16: minors are restricted by default (`MEMBER-3`),
// and a restricted minor is not invited at all.
const PLAYER_NO_EMAIL = 'fx-prof-dkl-wikus-labuschagne';
const TOUCHED = [COACH_NO_ACCOUNT, PLAYER_NO_EMAIL];

// Minors (`MEMBER-3`). Two U14 sisters and a guardian made for the test.
const DKL = 'fx-org-dkl';
const ANIKA = 'fx-prof-dkl-anika-kotze';
const MIA = 'fx-prof-dkl-mia-strydom';
const GUARDIAN = 'test-prof-invite-guardian';
const MINORS = [ANIKA, MIA];

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

const invite = (socket: Socket, memberId: string, email?: string) =>
  send(socket, SocketAction.SEND_MEMBER_INVITE, email === undefined ? { memberId } : { memberId, email });

async function profile(id: string) {
  return (await query(
    `SELECT email, last_invite_sent_at AS "sentAt", last_invite_email AS "sentTo" FROM org_profiles WHERE id = $1`,
    [id]
  )).rows[0];
}

async function main() {
  const originals = (await query(
    `SELECT id, email, last_invite_sent_at, last_invite_email FROM org_profiles WHERE id = ANY($1)`,
    [TOUCHED]
  )).rows;
  if (originals.length !== TOUCHED.length) throw new Error('The test organisations are not loaded — run `npm run db:test-orgs`.');
  const minorOriginals = (await query(
    `SELECT id, email, last_invite_sent_at, last_invite_email, own_account_allowed FROM org_profiles WHERE id = ANY($1)`,
    [MINORS]
  )).rows;
  const orgSettings = (await query(`SELECT settings FROM organizations WHERE id = $1`, [DKL])).rows[0]?.settings;

  // Start from "never invited", whatever an earlier run or a person clicking about left behind.
  await query(`UPDATE org_profiles SET last_invite_sent_at = NULL, last_invite_email = NULL WHERE id = ANY($1)`, [TOUCHED]);

  const socket = await connect(ADMIN);
  try {
    // --- Someone with an email, not on ScoreKeeper --------------------------------------------
    const first = await invite(socket, COACH_NO_ACCOUNT);
    expect(first?.status, 'ok', 'a person with an email and no account can be invited');
    expect((await profile(COACH_NO_ACCOUNT)).sentTo, 'marelize.coetzee@doringkloof.test', 'the address it went to is recorded');

    const again = await invite(socket, COACH_NO_ACCOUNT);
    expect(again?.status, 'error', 'the same address is on cooldown');

    const sentBefore = (await profile(COACH_NO_ACCOUNT)).sentAt;
    const resent = await send(socket, SocketAction.SEND_MEMBER_INVITE, { memberId: COACH_NO_ACCOUNT, resend: true });
    expect(resent?.status, 'ok', 'but can be resent deliberately, for an invite that went astray');
    expect((await profile(COACH_NO_ACCOUNT)).sentAt > sentBefore, true, 'which restarts the cooldown');

    const corrected = await invite(socket, COACH_NO_ACCOUNT, '  Marelize.C@Doringkloof.test ');
    expect(corrected?.status, 'ok', 'a different address goes at once');
    const afterCorrection = await profile(COACH_NO_ACCOUNT);
    expect([afterCorrection.email, afterCorrection.sentTo], ['marelize.c@doringkloof.test', 'marelize.c@doringkloof.test'], 'and is saved to the profile, normalised');

    // Clear the email, then type the same address back in the invite.
    const cleared = await send(socket, SocketAction.UPDATE_ORG_PROFILE, { id: COACH_NO_ACCOUNT, data: { email: null } });
    expect(cleared?.status, 'ok', 'the email can be cleared');
    const retyped = await invite(socket, COACH_NO_ACCOUNT, 'marelize.c@doringkloof.test');
    expect(retyped?.status, 'error', 'clearing the email and typing it back does not reset the cooldown');

    const wiped = await send(socket, SocketAction.UPDATE_ORG_PROFILE, { id: COACH_NO_ACCOUNT, data: { lastInviteSentAt: null, lastInviteEmail: null, name: 'Marelize Coetzee' } });
    expect(wiped?.status, 'ok', 'a profile edit naming the invite fields still saves the rest');
    expect(Boolean((await profile(COACH_NO_ACCOUNT)).sentAt), true, 'but cannot clear the invite record');

    // --- Someone with no email ---------------------------------------------------------------
    const noAddress = await invite(socket, PLAYER_NO_EMAIL);
    expect(noAddress?.status, 'error', 'a person with no email needs one entered');
    const invalid = await invite(socket, PLAYER_NO_EMAIL, 'not-an-address');
    expect(invalid?.status, 'error', 'an invalid address is refused');
    const takenAddress = await invite(socket, PLAYER_NO_EMAIL, 'pieter.joubert@doringkloof.test');
    expect(takenAddress?.status, 'error', 'an address that already has an account is refused');
    expect((await profile(PLAYER_NO_EMAIL)).email, null, 'and nothing was saved');
    const entered = await invite(socket, PLAYER_NO_EMAIL, 'wikus.labuschagne@doringkloof.test');
    expect(entered?.status, 'ok', 'an entered address is sent to');
    expect((await profile(PLAYER_NO_EMAIL)).email, 'wikus.labuschagne@doringkloof.test', 'and saved to the profile');
    expect(entered?.data?.hasAccount, false, 'the reply is the member, still without an account');

    // --- Someone on ScoreKeeper --------------------------------------------------------------
    const onScoreKeeper = await invite(socket, COACH_WITH_ACCOUNT);
    expect(onScoreKeeper?.status, 'error', 'a person who has an account is not invited');

    // --- Minors and their guardians (`MEMBER-3`) ---------------------------------------------
    await query(`UPDATE organizations SET settings = COALESCE(settings, '{}'::jsonb) - 'minors' WHERE id = $1`, [DKL]);
    await query(`UPDATE org_profiles SET last_invite_sent_at = NULL, last_invite_email = NULL, own_account_allowed = NULL, email = NULL WHERE id = ANY($1)`, [MINORS]);
    // Whatever an interrupted run left behind.
    await query(`DELETE FROM profile_guardians WHERE guardian_profile_id = $1`, [GUARDIAN]);
    await query(`DELETE FROM org_profiles WHERE id = $1`, [GUARDIAN]);
    await query(`INSERT INTO org_profiles (id, org_id, name, email) VALUES ($1, $2, 'Elsa Kotzé', 'test-elsa@guardians.test')`, [GUARDIAN, DKL]);
    for (const child of MINORS) {
      expect((await send(socket, SocketAction.ADD_PROFILE_GUARDIAN, { playerProfileId: child, guardianProfileId: GUARDIAN }))?.status, 'ok', 'a guardian is recorded for each sister');
    }

    const toGuardian = await invite(socket, GUARDIAN);
    expect(toGuardian?.status, 'ok', 'a guardian with no membership can be invited');
    expect((await profile(GUARDIAN)).sentTo, 'test-elsa@guardians.test', 'and the address it went to is recorded');
    const wording = memberInvitationContent('Elsa Kotzé', 'Test Hoërskool Doringkloof', 'https://x', ['Anika Kotzé', 'Mia Strydom']);
    expect(wording.text.includes("recorded you as Anika Kotzé and Mia Strydom's parent or guardian"), true, 'a guardian’s invitation names every child they are recorded for');
    expect(memberInvitationContent('Pieter', 'DKL', 'https://x').text.includes('has invited you to join'), true, 'an ordinary invitation is unchanged');

    const childWhileOff = await invite(socket, ANIKA, 'test-anika-invite@guardians.test');
    expect(childWhileOff?.status, 'error', 'a minor is not invited while the org has minors switched off');
    expect((await profile(ANIKA)).email, null, 'and nothing was saved to her profile');

    await query(`UPDATE organizations SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{minors}', '{"accountsAllowed": true, "minorAge": 18}') WHERE id = $1`, [DKL]);
    await query(`UPDATE org_profiles SET own_account_allowed = false WHERE id = $1`, [ANIKA]);
    expect((await invite(socket, ANIKA, 'test-anika-invite@guardians.test'))?.status, 'error', 'nor while her own setting says no');
    await query(`UPDATE org_profiles SET own_account_allowed = NULL WHERE id = $1`, [ANIKA]);
    expect((await invite(socket, ANIKA, 'test-anika-invite@guardians.test'))?.status, 'ok', 'but is, once the rule allows her');

    expect((await invite(socket, GUARDIAN, 'test-anika-invite@guardians.test'))?.status, 'error', 'a guardian is not invited to their child’s address');
    expect((await invite(socket, MIA, 'test-elsa@guardians.test'))?.status, 'error', 'nor a child to their guardian’s');
  } finally {
    socket.disconnect();
    await query(`DELETE FROM profile_guardians WHERE guardian_profile_id = $1`, [GUARDIAN]);
    await query(`DELETE FROM org_profiles WHERE id = $1`, [GUARDIAN]);
    await query(`UPDATE organizations SET settings = $2 WHERE id = $1`, [DKL, orgSettings]);
    for (const row of minorOriginals) {
      await query(
        `UPDATE org_profiles SET email = $2, last_invite_sent_at = $3, last_invite_email = $4, own_account_allowed = $5 WHERE id = $1`,
        [row.id, row.email, row.last_invite_sent_at, row.last_invite_email, row.own_account_allowed]
      );
    }
    for (const row of originals) {
      await query(
        `UPDATE org_profiles SET email = $2, last_invite_sent_at = $3, last_invite_email = $4 WHERE id = $1`,
        [row.id, row.email, row.last_invite_sent_at, row.last_invite_email]
      );
    }
    await pool.end();
  }

  if (failures.length) {
    console.error(`test-member-invite: ${failures.length} of ${checks} checks failed`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`test-member-invite: all ${checks} checks passed`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
