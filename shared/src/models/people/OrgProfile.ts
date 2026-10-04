import type { CalendarDate } from '../../utils/calendarDate';

export interface OrgProfile {
  id: string;
  orgId: string;
  userId?: string;
  name: string;
  /** `null` when not set, as the server sends it; `null` on an update clears it. */
  email?: string | null;
  /** `null` when not set; `null` on an update clears it. */
  cellphone?: string | null;
  /** A calendar date (`YYYY-MM-DD`), never a timestamp. `null` on an update clears it. */
  birthdate?: CalendarDate | null;
  /** `null` when not set; `null` on an update clears it. */
  nationalId?: string | null;
  /** The organisation's own number for the person. `null` when not set; `null` on an update clears it. */
  identifier?: string | null;
  image?: string;
  primaryRoleId?: string;
  lastInviteSentAt?: string;
  /** The address `lastInviteSentAt`'s invite went to — what the resend cooldown is keyed on. */
  lastInviteEmail?: string;
  imageConfig?: { scale: number; x: number; y: number };
  /**
   * A minor's own say in whether their membership carries a member's privileges (`MEMBER-3`).
   * **Tri-state**: `null` means nobody has said, so the organisation's setting decides; `false` is
   * an explicit refusal. Collapse the two and a refusal cannot be told from silence.
   * Set by a guardian, or by an org Admin while the minor has none — never through
   * `UPDATE_ORG_PROFILE` (see `SET_MINOR_ACCOUNT_ACCESS`).
   */
  ownAccountAllowed?: boolean | null;
  ownAccountSetAt?: string | null;
  /** The profile — a guardian's or an admin's — that last set `ownAccountAllowed`. */
  ownAccountSetBy?: string | null;
}
