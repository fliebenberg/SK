import { SocketAction, normalizeEmail } from '@sk/shared';
import { sendAction } from './actions';

/**
 * Nominating somebody to administer an organisation, and taking the empty role yourself.
 *
 * Every screen that nominates goes through here, so the server's answers are read one way: the
 * dialog (`NominateAdminModal`), the settings screen's Resend, and the register-an-org dialog's
 * contact field. The process is docs/nomination-process.md §4.
 */

/** Why an address could not be invited: the nominee has already answered. */
export type NominationAnswered = 'declined' | 'claimed' | 'referred';

/**
 * What became of a nomination. `sent` — an email went. `already-invited` — the address was invited
 * inside the cooldown, so no second email; the caller is recorded as a nominator of it.
 */
export type NominationOutcome = 'sent' | 'already-invited' | NominationAnswered;

export type NominationResult =
  | { ok: true; email: string; outcome: NominationOutcome }
  | { ok: false; message: string };

/**
 * Nominate `email` for `orgId`. Sent immediately: a nomination is never part of whatever form the
 * organisation was being added to, so it cannot be lost when that form is cancelled.
 *
 * `resend` is the deliberate override for an invitation that went astray (`ORG-7`) — only offered
 * where the org's nominations are listed. A failure is toasted by `sendAction` unless the caller
 * shows it inline (`suppressToast`).
 */
export async function nominateOrgContact(
  orgId: string,
  email: string,
  options: { resend?: boolean; suppressToast?: boolean } = {}
): Promise<NominationResult> {
  const address = normalizeEmail(email);
  const result = await sendAction(
    SocketAction.REFER_ORG_CONTACT,
    { orgId, contactEmails: [address], ...(options.resend ? { resend: true } : {}) },
    { suppressToast: options.suppressToast }
  );
  if (!result.ok) return { ok: false, message: result.message };

  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (row && row.status !== 'pending') {
    const outcome: NominationAnswered =
      row.status === 'declined' ? 'declined' : row.status === 'claimed' ? 'claimed' : 'referred';
    return { ok: true, email: address, outcome };
  }
  return { ok: true, email: address, outcome: row && row.emailSent === false ? 'already-invited' : 'sent' };
}

/** Take the admin role of an organisation that has none (`TAKE_ORG_ADMIN`). */
export function takeOrgAdmin(orgId: string, options: { suppressToast?: boolean } = {}) {
  return sendAction(SocketAction.TAKE_ORG_ADMIN, { orgId }, { suppressToast: options.suppressToast });
}
