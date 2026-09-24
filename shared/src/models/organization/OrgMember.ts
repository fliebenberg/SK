import { OrgProfile } from "../people/OrgProfile";

export interface OrgMember extends OrgProfile {
  membershipId: string;
  roleId: string;
  roleName?: string;
  startDate: string; // ISO UTC
  endDate?: string; // ISO UTC
  personOrgId?: string; // identifier
  /**
   * The person has a ScoreKeeper account: the profile is linked by `userId`, or its email is an
   * account's — the same match `AccessManager` uses. Derived by the read, never stored.
   */
  hasAccount?: boolean;
}
