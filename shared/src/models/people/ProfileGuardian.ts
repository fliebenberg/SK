/**
 * How a guardian is related to the player, for display and the organisation's records. It grants
 * nothing by itself: every relationship carries the same rights (`MEMBER-3`).
 */
export type GuardianRelationship = 'parent' | 'guardian' | 'grandparent' | 'other';

export const GUARDIAN_RELATIONSHIPS: GuardianRelationship[] = ['parent', 'guardian', 'grandparent', 'other'];

/**
 * A guardian's org profile linked to a player's, in the same organisation (`profile_guardians`).
 *
 * **Being a guardian is derived from an active link, never stored as a membership** — a membership
 * row is a permission, and a guardian answers for one child, not for the organisation. See
 * docs/guardians-implementation-plan.md §0.1.
 */
export interface ProfileGuardian {
  id: string;
  orgId: string;
  guardianProfileId: string;
  playerProfileId: string;
  relationship: GuardianRelationship;
  /** The default contact. At most one active primary per player. */
  isPrimary: boolean;
  startDate: string;
  /** Set when the link was ended. The row is kept, so the history survives. */
  endDate?: string | null;
  createdByProfileId?: string | null;

  // Read-side, joined from the guardian's profile so a list needs no second lookup.
  guardianName?: string;
  guardianEmail?: string;
  guardianCellphone?: string;
  guardianImage?: string;
  guardianImageConfig?: { scale: number; x: number; y: number };
  guardianLastInviteSentAt?: string;
  guardianLastInviteEmail?: string;
  /** Whether the guardian has a ScoreKeeper account (derived, like `OrgMember.hasAccount`). */
  guardianHasAccount?: boolean;
}
