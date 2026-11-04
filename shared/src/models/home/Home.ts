import type { Event } from '../event/Event';
import type { GameSummary } from '../event/GameSummary';
import type { OrganizationType } from '../organization/Organization';

/**
 * What the Home page reads (`HOME-1`, docs/home.md): what is on near the viewer, a search across
 * organisations, teams and sites, and the signed-in viewer's own organisations and teams.
 */

/**
 * The viewer's position, rounded to two decimals (about a kilometre).
 *
 * **Always carried in a field called `near`.** The server's loggers redact any field of that name
 * (`redactViewerPosition` in `server/src/wss/socketLog.ts`), so the position is never written to a
 * log. It is never stored either: the server answers from it and forgets it.
 */
export interface ViewerPosition {
  lat: number;
  lng: number;
}

/** How far Home looks, in kilometres. Fixed for now (decided 2026-10-22). */
export const HOME_RADIUS_KM = 25;

/** Round a position to two decimals before it leaves the device. */
export function roundViewerPosition(position: ViewerPosition): ViewerPosition {
  return { lat: Math.round(position.lat * 100) / 100, lng: Math.round(position.lng * 100) / 100 };
}

/** A single match near the viewer: the fixture, and how far away it is played. */
export interface NearbyGame {
  game: GameSummary;
  /** Kilometres from the viewer; `null` when no position was given. */
  km: number | null;
}

/** A tournament near the viewer, with what its row shows of its games. */
export interface NearbyTournament {
  event: Event;
  gameCount: number;
  liveCount: number;
  /** One of its live games, for the hero's preview. */
  liveGame: GameSummary | null;
  km: number | null;
}

/** An organisation as Home lists it: enough for its crest, its name and one line about it. */
export interface NearbyOrganization {
  id: string;
  name: string;
  shortName: string;
  logo?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  type?: OrganizationType | null;
  customType?: string | null;
  /** The suburb, or the town when there is none. */
  locality?: string | null;
  sportIds: string[];
  teamCount: number;
  km: number | null;
  /** Listed only to its members (`ORG-14`), who see it marked so. */
  isPrivate?: boolean;
}

/** `get_data { type: 'home_nearby', near? }`: read again every few minutes while Home is on screen. */
export interface HomeNearby {
  /** Single matches on now, later today and in the coming week. */
  games: NearbyGame[];
  tournaments: NearbyTournament[];
  /** Nothing was within {@link HOME_RADIUS_KM}, so these are the closest there are. */
  eventsBeyondRadius: boolean;
  /** Names for the rows' Where, by id: every site and facility the games and tournaments name. */
  siteNames: Record<string, string>;
  facilityNames: Record<string, string>;
}

/** `get_data { type: 'home_nearby_orgs', near? }`: read once a visit, since these barely change. */
export interface HomeNearbyOrganizations {
  organizations: NearbyOrganization[];
  /** Nothing was within {@link HOME_RADIUS_KM}, so these are the closest there are. */
  organizationsBeyondRadius: boolean;
}

export interface HomeSearchTeam {
  id: string;
  name: string;
  sportId: string;
  orgId: string;
  orgName: string;
  km: number | null;
}

export interface HomeSearchSite {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  km: number | null;
}

/** `get_data { type: 'home_search', query, near? }`: anywhere, closest first, at most ten of each. */
export interface HomeSearchResult {
  organizations: NearbyOrganization[];
  teams: HomeSearchTeam[];
  sites: HomeSearchSite[];
}

/** `get_data { type: 'approximate_location' }`: where the connection seems to come from, or `null`. */
export interface ApproximateLocation {
  near: ViewerPosition;
  /** The town, or the province when the town is not known — "Pretoria". */
  label: string;
}

/**
 * `get_data { type: 'place_name', near }`: the name of the place at a position, or `null` when
 * nothing is near enough to name. From the server's own place list (`HOME-4`), not a map service.
 */
export interface PlaceName {
  /** The suburb with its town, or the town — "Doringkloof, Centurion". */
  label: string;
}

/** One answer of `get_data { type: 'place_search', query, near? }`: a town or suburb. */
export interface PlaceMatch {
  name: string;
  /** Where it is — "Centurion, Gauteng" for a suburb, "Gauteng" for a town. */
  context: string;
  near: ViewerPosition;
}

/** One of the signed-in viewer's organisations, for *My organisations & teams*. */
export interface MyHomeOrganization {
  id: string;
  name: string;
  shortName: string;
  logo?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  tertiaryColor?: string | null;
  type?: OrganizationType | null;
  customType?: string | null;
  /** The suburb, or the town when there is none. */
  locality?: string | null;
  roleId: string;
  /** Games live now that the organisation has a stake in. */
  liveCount: number;
  /** Seen only by its members (`ORG-14`), who see it marked so. */
  isPrivate?: boolean;
}

/** One of the signed-in viewer's teams, with the game it is playing now or plays next. */
export interface MyHomeTeam {
  id: string;
  name: string;
  sportId: string;
  orgId: string;
  orgName: string;
  roleId: string;
  /** Live now, or the next one scheduled; absent when there is none. */
  game?: GameSummary | null;
}

/**
 * A tournament the viewer runs by appointment — as its organiser, one of its sport organisers or a
 * division convenor (`PERM-8`). Listed first on Home, because for someone who belongs to no
 * organisation it is the only way in to the tournament's workspace.
 */
export interface MyHomeRunEvent {
  id: string;
  name: string;
  /** The host, whose workspace the tournament's pages are in. */
  orgId: string;
  orgName: string;
  startDate?: string | null;
  endDate?: string | null;
  /** The widest of their appointments there. */
  scope: 'event' | 'sport' | 'division';
}

/** `get_data { type: 'home_mine' }`: answered for the caller and nobody else. */
export interface MyHome {
  /** Tournaments they run by appointment, soonest first; current and upcoming only. */
  runs: MyHomeRunEvent[];
  organizations: MyHomeOrganization[];
  teams: MyHomeTeam[];
}
