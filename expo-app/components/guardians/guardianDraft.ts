import { GuardianRelationship, SocketAction, isValidEmail } from '@sk/shared';
import { sendAction, requestKeyFor } from '../../services/actions';

/**
 * A guardian being entered on a form, before it is saved (`MEMBER-3`).
 *
 * Either an existing person in the organisation (`existingId`) or a new one, whose name and contact
 * details are typed here. A new guardian is created as a profile **with no membership** — being a
 * guardian is the link, not a role — and never with an org ID number, so it cannot collide with
 * another profile's (`PEOPLE-7`).
 */
export interface GuardianDraft {
  existingId: string | null;
  name: string;
  email: string;
  cellphone: string;
  relationship: GuardianRelationship;
  /** Only offered when the player already has a guardian; the first is primary regardless. */
  makePrimary: boolean;
}

export const emptyGuardianDraft = (): GuardianDraft => ({
  existingId: null,
  name: '',
  email: '',
  cellphone: '',
  relationship: 'parent',
  makePrimary: false,
});

export const RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  parent: 'Parent',
  guardian: 'Guardian',
  grandparent: 'Grandparent',
  other: 'Other',
};

/** Has anything been entered? An untouched guardian block is simply skipped. */
export function isGuardianDraftStarted(draft: GuardianDraft): boolean {
  return Boolean(draft.existingId || draft.name.trim() || draft.email.trim() || draft.cellphone.trim());
}

/** What is wrong with a started draft, or `null` when it can be saved. */
export function guardianDraftProblem(draft: GuardianDraft): string | null {
  if (!draft.existingId && !draft.name.trim()) return 'Enter the guardian’s name, or pick someone already on record.';
  if (!draft.existingId && draft.email.trim() && !isValidEmail(draft.email)) return 'The guardian’s email is not a valid address.';
  return null;
}

export type GuardianSaveResult = { ok: true; linkId: string } | { ok: false; message: string };

/**
 * Save a draft as a guardian of `playerProfileId`: create the guardian's profile if they are new,
 * then link them. Two writes, keyed under `scope` so a retry after a failure re-sends the first and
 * gets the same person back rather than creating them twice (`requestKeyFor`). Stops at the first
 * failure and says which write failed; `sendAction` has already announced it unless `quiet`.
 */
export async function saveGuardianDraft(
  orgId: string,
  playerProfileId: string,
  draft: GuardianDraft,
  scope: string,
  options: { quiet?: boolean } = {}
): Promise<GuardianSaveResult> {
  const suppressToast = options.quiet;
  let guardianProfileId = draft.existingId;

  if (!guardianProfileId) {
    const profile = {
      id: `profile-${scope}-guardian`,
      orgId,
      name: draft.name.trim(),
      email: draft.email.trim() || undefined,
      cellphone: draft.cellphone.trim() || undefined,
    };
    const created = await sendAction(SocketAction.ADD_ORG_PROFILE, profile, {
      suppressToast,
      requestId: requestKeyFor(scope, SocketAction.ADD_ORG_PROFILE, profile),
    });
    if (!created.ok) return { ok: false, message: `The guardian could not be created: ${created.message}` };
    guardianProfileId = created.data.id;
  }

  const link = {
    id: `pg-${scope}`,
    playerProfileId,
    guardianProfileId,
    relationship: draft.relationship,
    ...(draft.makePrimary ? { isPrimary: true } : {}),
  };
  const linked = await sendAction(SocketAction.ADD_PROFILE_GUARDIAN, link, {
    suppressToast,
    requestId: requestKeyFor(scope, SocketAction.ADD_PROFILE_GUARDIAN, link),
  });
  if (!linked.ok) return { ok: false, message: `The guardian could not be linked: ${linked.message}` };
  return { ok: true, linkId: linked.data.id };
}
