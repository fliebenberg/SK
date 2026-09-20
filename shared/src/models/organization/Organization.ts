import { Address } from "../Address";

export type OrganizationType = 'SCHOOL' | 'CLUB' | 'LEAGUE' | 'ACADEMY' | 'CORPORATE' | 'COMMUNITY' | 'OTHER';

export interface Organization {
  id: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  supportedSportIds?: string[];
  /**
   * The org's short code. **Always present on a record read from the database** — the column is
   * `NOT NULL` with a non-blank `CHECK` since 2026-09-20.
   *
   * Optional here only because this same interface is the *input* to `addOrganization`, where
   * omitting it is allowed and the server derives one from the name. Do not make it required
   * without splitting the create shape out first.
   */
  shortName?: string;
  supportedRoleIds?: string[];
  addressId?: string;
  address?: Address;
  teamCount?: number;
  siteCount?: number;
  eventCount?: number;
  memberCount?: number;
  isClaimed?: boolean;
  creatorId?: string;
  isActive?: boolean;
  settings?: Record<string, any>;
  type?: OrganizationType;
  /** `null` on an update clears it. */
  customType?: string | null;
}

