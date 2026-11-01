import type { PaginatedResponse } from "../../types/Protocol";
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

/** One past event's row, beside its record in `org:{id}:events`: `game` is a single match's fixture. */
export interface PastEventRow {
  eventId: string;
  gameCount: number;
  sportIds: string[];
  game: GameSummary | null;
}

/** A team's finished games in one season, the seasons it has played in, and how many games it has ever had. */
export interface TeamSeasonResults {
  games: GameSummary[];
  gameCount: number;
  seasons: number[];
}

/** How many games a site has had, and how many of them on each of its facilities. */
export interface SiteGameCounts {
  games: number;
  byFacility: Record<string, number>;
}
