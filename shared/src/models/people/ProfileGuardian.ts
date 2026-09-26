/**
 * How a guardian is related to the player, for display and the organisation's records. It grants
 * nothing by itself: every relationship carries the same rights (`MEMBER-3`).
 */
import type { RestrictedReason } from '../../utils/guardians';
import type { CalendarDate } from '../../utils/calendarDate';

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

/**
 * A child as their guardian sees them — `USER_MEMBERSHIPS_UPDATED.dependants`, the data behind My
 * Family (`MEMBER-3`). Only what a guardian may see of their own child: never another child, and
 * nothing org-wide.
 */
export interface Dependant {
  playerProfileId: string;
  orgId: string;
  orgName: string;
  name: string;
  image?: string | null;
  imageConfig?: { scale: number; x: number; y: number } | null;
  birthdate?: CalendarDate | null;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  /** The child's own-account value (tri-state) and who last set it. */
  ownAccountAllowed: boolean | null;
  ownAccountSetAt?: string | null;
  ownAccountSetByName?: string | null;
  /** `null` when the child's membership carries full privileges. */
  restrictedReason: RestrictedReason | null;
  /** Whether the child has an account of their own. */
  hasAccount: boolean;
  email?: string | null;
  lastInviteSentAt?: string | null;
  lastInviteEmail?: string | null;
  teams: { teamId: string; name: string; roleId: string }[];
  /** The guardian's own profile in the child's organisation — read-only to them. */
  guardianProfileId: string;
  guardianName: string;
  guardianEmail?: string | null;
  guardianCellphone?: string | null;
  /** The org's minors settings, so the screen can say why without a second read. */
  minorsAccountsAllowed: boolean;
  minorAge: number;
}
