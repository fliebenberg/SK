import { Address } from "../Address";
import type { OrgMinorsSettings } from "../../utils/guardians";
import type { TimeZone } from "../../utils/zonedTime";

export type OrganizationType = 'SCHOOL' | 'CLUB' | 'LEAGUE' | 'ACADEMY' | 'CORPORATE' | 'COMMUNITY' | 'OTHER';

/**
 * The most an Other type's description may hold ("Charity", "Social group"). It is shown where a
 * type label goes — the profile banner's facts — so it is a label, not a sentence. Held by the
 * app's fields only; the `custom_type` column is `TEXT` (2026-10-31).
 */
export const ORG_CUSTOM_TYPE_MAX_LENGTH = 30;

/**
 * An organisation reduced to what it takes to *show* one, and nothing else.
 *
 * Screens that list organisations alongside something else — the tournament entrants grid, the
 * invite list — need a logo, a name and a short code, and nothing about sports, addresses or
 * counts. Sending the whole {@link Organization} for each is the shape `FIX-2` warned about from
 * the other direction: reading far more than the screen displays.
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
 * `organizations.settings`. Still an open bag for the keys that predate this type; **a new key with any weight gets a declared shape here** rather than another loose
 * one (`PEOPLE-4`).
 */
export type OrgSettings = Record<string, any> & {
  /** Minors' own accounts (`MEMBER-3`). Read it through `minorsSettingsOf`, which fills the defaults. */
  minors?: Partial<OrgMinorsSettings>;
};

export type OrgMembershipMode = 'invite' | 'apply';

export interface Organization {
  id: string;
  name: string;
  logo?: string;
  /**
   * Required on every org read from the database since 2026-10-01 (`NOT NULL`); optional here
   * because this is also the create input, where the server defaults it. Paint with `orgColors`.
   */
  primaryColor?: string;
  /** Optional: `null` (or blank on an update, which clears it) means "the primary colour". */
  secondaryColor?: string | null;
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
  /** `null` on an update removes the org's address. */
  address?: Address | null;
  /**
   * The timezone at the address's pin, derived by the server on every read; `null` with no pinned
   * address. Read-only — the org's own `timezone` is the setting, and may differ from this on
   * purpose. The Settings page only points out when they differ.
   */
  addressTimeZone?: string | null;
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
  /** The About text on the org's profile. Empty or `null` means none. */
  description?: string | null;
  /**
   * Where the organisation plays, as an IANA name: the timezone kick-offs are typed in at a venue
   * with no timezone of its own (`DATE-2`). Always present on a record read from the database.
   * On create the app sends the creator's device timezone; the server falls back to
   * `DEFAULT_TIME_ZONE` without one.
   */
  timezone?: TimeZone;
  /**
   * Seen only by its current members (and app admins); hidden from everyone else — absent from
   * lists, searches, Home and the map, and its public rooms closed (`ORG-14`, docs/org-profile.md
   * §5.3). A private org plays only among itself. Always present on a record read from the
   * database; changed only by `SET_ORG_PRIVATE`.
   */
  isPrivate?: boolean;
  /**
   * `invite` (the default): only its admins and staff add people. `apply`: anyone signed in may apply
   * from its public page, and joins once its admins or staff approve (`MEMBER-1`). Changed only by
   * `SET_ORG_MEMBERSHIP_MODE`.
   */
  membershipMode?: OrgMembershipMode;
  /**
   * Whether it has ever shared a game, tournament or season with another organisation. Such an org
   * can never be made private, so the Settings page leaves the setting out. Computed on single-org
   * reads (`organization`, `org_summary`); absent from lists.
   */
  hasExternalHistory?: boolean;
}

