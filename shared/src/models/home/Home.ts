import type { Event } from '../event/Event';
import type { GameSummary } from '../event/GameSummary';

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

/** A tournament near the viewer, with its fixtures for the row's live count and number of games. */
export interface NearbyTournament {
  event: Event;
  games: GameSummary[];
  km: number | null;
}

/** An organisation as Home lists it: enough for its crest, its name and one line about it. */
export interface NearbyOrganization {
  id: string;
  name: string;
  shortName: string;
  logo?: string | null;
  logoConfig?: { scale?: number; x?: number; y?: number } | null;
  primaryColor?: string | null;
  /** The suburb, or the town when there is none. */
  locality?: string | null;
  sportIds: string[];
  teamCount: number;
  km: number | null;
}

/** `get_data { type: 'home_nearby', near? }`. */
export interface HomeNearby {
  /** Single matches on now, later today and in the coming week. */
  games: NearbyGame[];
  tournaments: NearbyTournament[];
  organizations: NearbyOrganization[];
  /**
   * Nothing was within {@link HOME_RADIUS_KM}, so these are the closest there are. Separate for the
   * two lists, since a town can have organisations but nothing on this week.
   */
  eventsBeyondRadius: boolean;
  organizationsBeyondRadius: boolean;
  /** Names for the rows' Where, by id: every site and facility the games and tournaments name. */
  siteNames: Record<string, string>;
  facilityNames: Record<string, string>;
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

/** One of the signed-in viewer's organisations, for *My organisations & teams*. */
export interface MyHomeOrganization {
  id: string;
  name: string;
  shortName: string;
  logo?: string | null;
  logoConfig?: { scale?: number; x?: number; y?: number } | null;
  primaryColor?: string | null;
  roleId: string;
  /** Games live now that the organisation has a stake in. */
  liveCount: number;
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

/** `get_data { type: 'home_mine' }`: answered for the caller and nobody else. */
export interface MyHome {
  organizations: MyHomeOrganization[];
  teams: MyHomeTeam[];
}
