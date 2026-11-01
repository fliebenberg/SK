import type { RestrictedReason } from "../../utils/guardians";
import type { CalendarDate } from "../../utils/calendarDate";

export interface TeamMember {
  id: string; // profile id
  userId?: string;
  name: string;
  membershipId: string;
  teamId: string;
  roleId: string;
  roleName?: string;
  /** Their membership of the team's organisation, and its role: a coach's way to their page. */
  orgMembershipId?: string;
  orgRoleId?: string;
  ownAccountSetAt?: string;
  ownAccountSetBy?: string;
  startDate: string; // ISO UTC
  endDate?: string; // ISO UTC
  email?: string;
  cellphone?: string;
  image?: string;
  birthdate?: CalendarDate;
  lastInviteSentAt?: string;
  /** See `OrgProfile.lastInviteEmail`. */
  lastInviteEmail?: string;
  /** See `OrgMember.hasAccount`. */
  hasAccount?: boolean;
  /** See `OrgMember.restrictedReason`. A restricted coach still coaches this team (plan §0.3). */
  restrictedReason?: RestrictedReason | null;
}
