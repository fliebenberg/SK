import { Address } from "../Address";
import type { OrgMinorsSettings } from "../../utils/guardians";

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
  /**
   * Whether anybody owns it. An unclaimed organisation accepts a minimum from anybody signed in — a
   * team's name, sport and age group, a person's name — so that the people entering it are not
   * blocked by an owner who does not exist yet (2026-09-21). A claimed one does not: a screen reads
   * this to offer an org-linked placeholder instead, rather than a form the server will refuse.
   */
  isClaimed?: boolean;
}

/**
 * `organizations.settings`. Still an open bag for the keys that predate this type (`logoConfig`
 * and others); **a new key with any weight gets a declared shape here** rather than another loose
 * one (`PEOPLE-4`).
 */
export type OrgSettings = Record<string, any> & {
  /** Minors' own accounts (`MEMBER-3`). Read it through `minorsSettingsOf`, which fills the defaults. */
  minors?: Partial<OrgMinorsSettings>;
};

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
  /** Events not over yet: undated, or whose last day is today or later (the database's today). */
  eventCount?: number;
  memberCount?: number;
  isClaimed?: boolean;
  creatorId?: string;
  isActive?: boolean;
  settings?: OrgSettings;
  type?: OrganizationType;
  /** `null` on an update clears it. */
  customType?: string | null;
}

