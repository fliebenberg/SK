import type { PaginatedResponse } from "../../types/Protocol";
import type { Event } from "./Event";
import type { GameSummary } from "./GameSummary";

/**
 * A page of an organisation's past fixtures (`LIST-1`). `total` is what search and filters left;
 * `everything`, `sportCounts` and `roleCounts` are before they narrow it, for what the filters offer.
 */
export type PastFixturesPage<T> = PaginatedResponse<T> & {
  everything: number;
  sportCounts: Record<string, number>;
  roleCounts: { hosting: number; convening: number; away: number };
};

/** One past event's row: `game` is a single match's fixture. */
export interface PastEventRow {
  eventId: string;
  event: Event;
  gameCount: number;
  sportIds: string[];
  game: GameSummary | null;
}

/** A page of past games, with the records of the events they belong to. */
export type PastGamesPage = PastFixturesPage<GameSummary> & { events: Event[] };

/** A team's finished games in one season, the competitions' names, the seasons it has played in, and how many games it has ever had. */
export interface TeamSeasonResults {
  games: GameSummary[];
  eventNames: Record<string, string>;
  gameCount: number;
  seasons: number[];
}

/** How many games a site has had and events based there, and how many games on each of its facilities. */
export interface SiteGameCounts {
  games: number;
  events: number;
  byFacility: Record<string, number>;
}
