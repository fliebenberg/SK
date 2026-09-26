import {
  formatInviteWait,
  inviteCooldownHoursFrom,
  inviteCooldownRemainingHours,
  isValidEmail,
  normalizeEmail,
} from '@sk/shared';
import pool from '../db';
import { dataManager } from '../DataManager';
import { accessManager } from '../managers/AccessManager';
import { guardianManager } from '../managers/GuardianManager';
import { mailManager } from '../managers/MailManager';
import { broadcast } from './broadcast';
import { publishGuardianProfileChange } from './guardians';
import { publishUserMemberships } from './memberships';
import { orgMembersRoom } from './rooms';

/**
 * Invite a person the organisation has on record to create an account — the one set of rules behind
 * both `SEND_MEMBER_INVITE` (an org's admins and staff) and `SEND_DEPENDANT_INVITE` (a guardian
 * inviting their own child, `MEMBER-3`). The gates differ; the rules must not.
 *
 * There is no token: signing up with the invited address is what links the account to the profile,
 * because `AccessManager` matches a profile to an account by email. So an address that differs from
 * the profile's is saved to it — after the email has gone, so a failed send changes nothing.
 *
 * Publishes the result itself: the member row to the member list when the person holds a
 * membership, every guardian list they appear in, and — for a player — their guardians' own view.
 */
export async function sendMemberInvite(memberId: string, emailInput?: string, resend?: boolean) {
  const profile = await dataManager.getOrgProfile(memberId);
  if (!profile) throw new Error('Member profile not found');
  if ((await accessManager.getUserIdsForOrgProfile(memberId)).length > 0) {
    throw new Error(`${profile.name} is already on ScoreKeeper.`);
  }
  // A minor the rule would restrict is not invited (`MEMBER-3`): the account would link to a
  // membership that grants nothing. Their guardian is invited instead.
  const restricted = await guardianManager.getRestrictedReason(memberId);
  if (restricted === 'org-off') {
    throw new Error(`${profile.name} is under this organisation's minor age, and minors do not have member access here (Org Settings › Minors). Invite their guardian instead.`);
  }
  if (restricted === 'minor-off') {
    throw new Error(`${profile.name} has not been allowed their own access. Invite their guardian instead, who can change that.`);
  }

  const email = normalizeEmail(emailInput ?? profile.email);
  if (!email) throw new Error(`${profile.name} has no email address. Enter one to send the invite to.`);
  if (!isValidEmail(email)) throw new Error(`"${email}" is not a valid email address.`);

  // Saving an account's address to the profile would link that account to it — an identity change
  // the profile edit screen makes deliberately, not an invite.
  const emailHasAccount = await pool.query(
    `SELECT 1 FROM users WHERE LOWER(email) = $1
     UNION ALL
     SELECT 1 FROM user_emails WHERE LOWER(email) = $1 AND verified_at IS NOT NULL
     LIMIT 1`,
    [email]
  );
  if (emailHasAccount.rows.length > 0) {
    throw new Error(`${email} already belongs to a ScoreKeeper account, so there is nobody to invite. To link it to ${profile.name}, set it on their profile.`);
  }
  // The invite saves the address to the profile, so it may not be one a guardian and their child
  // would then share (`MEMBER-3`).
  if (await guardianManager.linkedEmailClash(memberId, email)) {
    throw new Error(`${email} is the email of someone ${profile.name} is linked to as guardian or child. Each needs their own address.`);
  }

  const settingsRes = await pool.query("SELECT key, value FROM system_settings WHERE key = 'invite_cooldown_hours'");
  const cooldownHours = inviteCooldownHoursFrom(Object.fromEntries(settingsRes.rows.map((r: any) => [r.key, r.value])));
  // `resend` is the deliberate override, for an invite that went astray.
  const waitHours = inviteCooldownRemainingHours(profile, email, cooldownHours);
  if (waitHours > 0 && resend !== true) {
    throw new Error(`An invite already went to ${email}. You can send another in ${formatInviteWait(waitHours)}, or to a different address now.`);
  }

  // Send first: if the email cannot go, nothing is recorded and the sender is told.
  const org = await dataManager.getOrganization(profile.orgId);
  const appUrl = process.env.APP_URL || 'http://localhost:8081';
  const signupUrl = `${appUrl}/signup?email=${encodeURIComponent(email)}`;
  // A guardian is told whose guardian they are, not invited as though they played there.
  const guardianOf = await guardianManager.getChildNames(memberId);
  try {
    await mailManager.sendMemberInvitation(email, profile.name, org?.name || 'Your organisation', signupUrl, guardianOf);
  } catch (mailErr) {
    console.error('Failed to send member invitation:', mailErr);
    throw new Error(`The invite to ${email} could not be sent. Nothing was changed; try again later.`);
  }

  const updatedProfile = await dataManager.updateOrgProfile(memberId, {
    ...(email !== normalizeEmail(profile.email) ? { email } : {}),
    lastInviteSentAt: new Date().toISOString(),
    lastInviteEmail: email,
  });

  // The member list hears about members; a guardian with no membership is not one, and their invite
  // status travels in the guardian lists they appear in instead.
  const richMember = (await dataManager.getOrganizationMembers(profile.orgId)).find((m: any) => m.id === memberId);
  if (richMember) broadcast(orgMembersRoom(profile.orgId), 'ORG_MEMBER_UPDATED', richMember);
  await publishGuardianProfileChange(memberId);
  // A player's guardians see the invite on My Family.
  for (const userId of await guardianManager.getAffectedUserIds(memberId)) await publishUserMemberships(userId);

  return richMember || updatedProfile;
}
