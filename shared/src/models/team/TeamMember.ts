import type { RestrictedReason } from "../../utils/guardians";

export interface TeamMember {
  id: string; // profile id
  userId?: string;
  name: string;
  membershipId: string;
  teamId: string;
  roleId: string;
  roleName?: string;
  startDate: string; // ISO UTC
  endDate?: string; // ISO UTC
  email?: string;
  cellphone?: string;
  image?: string;
  imageConfig?: any;
  birthdate?: string;
  lastInviteSentAt?: string;
  /** See `OrgProfile.lastInviteEmail`. */
  lastInviteEmail?: string;
  /** See `OrgMember.hasAccount`. */
  hasAccount?: boolean;
  /** See `OrgMember.restrictedReason`. A restricted coach still coaches this team (plan §0.3). */
  restrictedReason?: RestrictedReason;
}
