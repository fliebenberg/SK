import type { RestrictedReason } from "../../utils/guardians";

export interface TeamMembership {
  id: string; // Unique ID for this specific tenure/role
  orgProfileId: string;
  teamId: string;
  roleId: string;
  startDate?: string;
  endDate?: string;
  /** On the signed-in user's own memberships. See `OrgMembership.restrictedReason`. */
  restrictedReason?: RestrictedReason;
}
