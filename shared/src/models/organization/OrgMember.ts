import { OrgProfile } from "../people/OrgProfile";
import type { PaginatedResponse } from "../../types/Protocol";
import type { ProfileGuardian } from "../people/ProfileGuardian";
import type { RestrictedReason } from "../../utils/guardians";

/** One row of an organisation's People list, with its guardians' names, primary first. */
export type OrgPersonRow = OrgMember & { guardianNames: string[] };

/** One page of People, and how many hold each role across the whole organisation. */
export type OrgPeoplePage = PaginatedResponse<OrgPersonRow> & { roleCounts: Record<string, number> };

/** One person's page: their member record, their guardians, and who last set their account's permission. */
export type OrgPerson = OrgMember & { guardians: ProfileGuardian[]; ownAccountSetByName?: string | null };

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
  /**
   * Set when this is a minor whose membership carries **no member privileges** — the organisation
   * does not allow minors their own account, or the minor's own setting says no (`MEMBER-3`).
   * `null` means full access. Derived by the read, never stored; see `memberAccess` in
   * `@sk/shared`.
   */
  restrictedReason?: RestrictedReason | null;
}
