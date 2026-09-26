import type { RestrictedReason } from "../../utils/guardians";

export interface OrgMembership {
  id: string;
  orgProfileId: string;
  orgId: string;
  roleId: string;
  startDate?: string;
  endDate?: string;
  /**
   * On the signed-in user's own memberships (`USER_MEMBERSHIPS_UPDATED`): set when this membership
   * carries no member privileges, so the app shows it as theirs but keeps them out of the admin
   * area. See `OrgMember.restrictedReason`.
   */
  restrictedReason?: RestrictedReason;
}
