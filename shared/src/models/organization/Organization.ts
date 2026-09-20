import { Address } from "../Address";

export type OrganizationType = 'SCHOOL' | 'CLUB' | 'LEAGUE' | 'ACADEMY' | 'CORPORATE' | 'COMMUNITY' | 'OTHER';

/**
 * An organisation reduced to what it takes to *show* one, and nothing else.
 *
 * Screens that list organisations alongside something else — the tournament entrants grid, the
 * invite list — need a logo, a name and a short code, and nothing about sports, addresses or
 * counts. Sending the whole {@link Organization} for each is the shape `FIX-2` warned about from
 * the other direction: reading far more than the screen displays.
 *
 * `logoConfig` travels with the logo because `<OrgLogo>` cannot place one without it. It lives in
 * `organizations.settings`, and an org whose owner has nudged their crest renders wrong without
 * it — which is worse than no logo, because it looks like a bug rather than a gap.
 *
 * `primaryColor` is here for the orgs with **no** logo, which are most of them: it tints the
 * fallback mark, so a codeless-looking placeholder still carries the school's colour.
 */
export interface OrgBadge {
  id: string;
  name: string;
  /** Always set — `organizations.short_name` is `NOT NULL` since 2026-09-20. */
  shortName: string;
  logo?: string;
  /** `null` where the org has never adjusted its logo; `<OrgLogo>` defaults it. */
  logoConfig?: { scale?: number; x?: number; y?: number } | null;
  primaryColor?: string;
}

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

