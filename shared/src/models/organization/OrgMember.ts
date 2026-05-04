import { OrgProfile } from "../people/OrgProfile";

export interface OrgMember extends OrgProfile {
  membershipId: string;
  roleId: string;
  roleName?: string;
  startDate: string; // ISO UTC
  endDate?: string; // ISO UTC
  personOrgId?: string; // identifier
}
