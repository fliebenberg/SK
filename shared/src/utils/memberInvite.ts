/**
 * Inviting a person who is not on ScoreKeeper yet to create an account.
 *
 * The rules live here so the server, which enforces them, and the screens, which label the Invite
 * button with them, cannot disagree about when the next invite may go.
 */

/**
 * Hours between two invites to the same address, when `system_settings` does not say: two weeks,
 * the seeded value, and what `ReferralManager` falls back to for the same setting.
 */
export const DEFAULT_INVITE_COOLDOWN_HOURS = 336;

/** Loose on purpose: the same test the signup screen applies. Delivery is the real check. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An address as it is stored and compared: trimmed and lower-case. Blank becomes `''`. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function isValidEmail(email: string | null | undefined): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

/** What a profile records about the last invite it was sent. */
export interface InviteHistory {
  lastInviteSentAt?: string | null;
  lastInviteEmail?: string | null;
}

/**
 * Whole hours until another invite may go to `email`; `0` means it may go now.
 *
 * **The cooldown belongs to the address, not the person.** An admin who mistyped an address must
 * be able to send to the corrected one straight away, so a different address is never on cooldown.
 * The address is compared with the one the last invite actually went to — not with the profile's
 * current email — so clearing the email and typing the same one back does not reset it.
 */
export function inviteCooldownRemainingHours(
  history: InviteHistory,
  email: string | null | undefined,
  cooldownHours: number,
  now: number = Date.now()
): number {
  if (!history.lastInviteSentAt || !history.lastInviteEmail) return 0;
  if (normalizeEmail(history.lastInviteEmail) !== normalizeEmail(email)) return 0;

  const sentAt = new Date(history.lastInviteSentAt).getTime();
  if (Number.isNaN(sentAt)) return 0;

  const elapsedHours = (now - sentAt) / (1000 * 60 * 60);
  return elapsedHours < cooldownHours ? Math.ceil(cooldownHours - elapsedHours) : 0;
}

/** `168` → `"7 days"`, `5` → `"5 hours"`: for "you can resend in …". */
export function formatInviteWait(hours: number): string {
  if (hours > 24) {
    const days = Math.ceil(hours / 24);
    return `${days} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

/** Reads `system_settings.invite_cooldown_hours`, falling back to the default. */
export function inviteCooldownHoursFrom(settings: Record<string, any> | null | undefined): number {
  const parsed = parseInt(settings?.invite_cooldown_hours, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_INVITE_COOLDOWN_HOURS;
}
