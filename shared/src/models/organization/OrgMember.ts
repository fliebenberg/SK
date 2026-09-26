import { OrgProfile } from "../people/OrgProfile";
import type { RestrictedReason } from "../../utils/guardians";

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
   * Absent means full access. Derived by the read, never stored; see `memberAccess` in
   * `@sk/shared`.
   */
  restrictedReason?: RestrictedReason;
}
