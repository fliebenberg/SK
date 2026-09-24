export interface OrgProfile {
  id: string;
  orgId: string;
  userId?: string;
  name: string;
  email?: string;
  cellphone?: string;
  birthdate?: string;
  nationalId?: string;
  identifier?: string;
  image?: string;
  primaryRoleId?: string;
  lastInviteSentAt?: string;
  /** The address `lastInviteSentAt`'s invite went to — what the resend cooldown is keyed on. */
  lastInviteEmail?: string;
  imageConfig?: { scale: number; x: number; y: number };
}
