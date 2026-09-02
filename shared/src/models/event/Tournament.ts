import { LeagueStandingRow } from "../league/League";

/**
 * How a *stage* of a division is structured.
 *
 * Distinct from `EventFormat` on the event, which describes the tournament as a whole and is what
 * the event screen keys its tabs off. A `PoolsKnockout` event is two stages here: a `RoundRobin`
 * followed by a `Knockout`.
 */
export type TournamentFormat =
  | 'Festival'
  | 'RoundRobin'
  | 'Knockout'
  | 'Plate'
  | 'Swiss';

/** Whether a standings table ranks teams or the organisations behind them (D6). */
export type ScoringSubject = 'Team' | 'Organisation';

/**
 * A factor the standings engine may use to separate entrants level on points.
 *
 * The organiser orders them (D20/D29); {@link DEFAULT_TIEBREAKERS} is what ships. The engine walks
 * the list until one factor separates the entrants, so the order is the whole configuration.
 */
export type TiebreakFactor =
  | 'pointsDifference'
  | 'pointsFor'
  | 'headToHead'
  | 'mostWins'
  | 'fewestCards';

/**
 * Shared by tournaments and league seasons (D19).
 *
 * Two modes, because awarding points by finishing position is a scoring system in its own right
 * and not a special case: a head-to-head division scores `byResult`, a ranked meet scores
 * `byPlacing`. Both feed the same standings engine, so an athletics division and a rugby division
 * can sit in one sports day and roll up into one organisation table.
 */
export type ScoringSystem =
  | {
      mode: 'byResult';
      pointsPerWin: number;
      pointsPerDraw: number;
      pointsPerLoss: number;
      bonusRules?: Record<string, any>;
    }
  | {
      mode: 'byPlacing';
      /** Position (1-based) to points. Positions beyond the last entry score `pointsBeyond`. */
      pointsByPosition: number[];
      pointsBeyond?: number;
    };

/** D17 — 3/1/0 is the shared default for tournaments and leagues alike. */
export const DEFAULT_SCORING_SYSTEM: ScoringSystem = {
  mode: 'byResult',
  pointsPerWin: 3,
  pointsPerDraw: 1,
  pointsPerLoss: 0,
};

/**
 * The order shipped when an organiser has not reordered them (D29).
 *
 * Points difference first because it is what every league table already does; head-to-head after
 * the two aggregate measures because it is only meaningful once a group is small.
 */
export const DEFAULT_TIEBREAKERS: TiebreakFactor[] = [
  'pointsDifference',
  'pointsFor',
  'headToHead',
  'mostWins',
  'fewestCards',
];

export interface TournamentDivision {
  id: string;
  eventId: string;
  name: string;
  sportId?: string;
  ageGroup?: string;
  /** Inherits the event's when unset (data model §6). */
  scoringSubject?: ScoringSubject;
  /** D18 — the multiplier applied to this division's points in the organisation roll-up. */
  weighting: number;
  settings?: {
    /** Overrides the event's; most specific wins (data model §6). */
    scoring?: ScoringSystem;
    tiebreakers?: TiebreakFactor[];
  };
  sortOrder: number;
  stages?: TournamentStage[];
  entrants?: TournamentEntrant[];
}

export interface StagePool {
  key: string;
  name: string;
}

/** Which entrants a stage draws from the stage before it. */
export interface EntrantSourceRule {
  fromStage: string;
  poolKey?: string;
  positions: number[];
}

export interface TournamentStage {
  id: string;
  divisionId: string;
  name: string;
  format: TournamentFormat;
  sequence: number;
  status: 'Pending' | 'Ready' | 'InProgress' | 'Complete';
  /** ISO. D15 — the knockout may not start before day 2. */
  earliestStart?: string;
  settings?: {
    legs?: number;
    pools?: StagePool[];
    bracketSize?: number;
    thirdPlacePlayoff?: boolean;
    /** Stage id losers drop into. */
    feedsPlate?: string;
    /** Swiss. */
    rounds?: number;
    roundsGenerated?: number;
    entrantSource?: EntrantSourceRule[];
  };
  cachedStandings?: TournamentStandingRow[];
}

/**
 * A competitor entered in a division — a team, a person, or a promise of one.
 *
 * An entrant with `team_id` null and a `label` set is the "awaiting a person" state of data model
 * §2.0: fixtures can be generated and scheduled against it, and when the school confirms, every
 * fixture updates at once because they all point at this one row.
 */
export interface TournamentEntrant {
  id: string;
  divisionId: string;
  teamId?: string;
  orgProfileId?: string;
  orgId?: string;
  /** Printed while unresolved. */
  label?: string;
  seed?: number;
  status: 'active' | 'withdrawn';
  /**
   * Derived, never stored: the team's or the person's name, falling back to `label`.
   *
   * Carried on the row for the same reason `GameSummary` carries `orgShortName` — a roster, a
   * standings table and a draw all print competitor names, and resolving them client-side means a
   * teams lookup per entrant that goes stale the moment a team is renamed.
   */
  name?: string;
  /** Derived, never stored. Prefixed to `name` the way `participantLabel` does it. */
  orgShortName?: string;
}

/**
 * Who takes part in one stage, and where they sit in it.
 *
 * For a single-stage division this is a copy of the roster and the UI never mentions it. For pools
 * it is where pool membership lives — on the membership row rather than in the stage's JSON, so
 * "which pool is Northcliff in?" is a query rather than a scan.
 */
export interface StageEntrant {
  stageId: string;
  entrantId: string;
  /** 'A', 'B'; absent when the stage has no pools. */
  poolKey?: string;
  seed?: number;
  sortOrder: number;
}

/**
 * How an unfilled fixture slot knows what will fill it (D26).
 *
 * The game or stage it points at is a real foreign key on `game_participants`
 * (`source_game_id` / `source_stage_id`); this carries only what a key cannot express.
 */
export type ParticipantSourceRule =
  | { type: 'winnerOf' }                                      // with sourceGameId
  | { type: 'loserOf' }                                       // with sourceGameId
  | { type: 'standing'; poolKey?: string; position: number };  // with sourceStageId

/** A manual points correction on a division's table, recorded as such rather than hidden (D29). */
export interface TournamentAdjustment {
  id: string;
  divisionId: string;
  entrantId: string;
  pointsDelta: number;
  reason: string;
  createdByUserId?: string;
  createdAt: string;
}

/**
 * One row of a standings table.
 *
 * Extends `LeagueStandingRow` rather than replacing it, so one table shape serves leagues, seasons
 * and tournaments (D19). `teamId` and `teamName` carry whatever subject the table ranks — an
 * entrant, a team or an organisation — which is what `scoringSubject` decides.
 */
export interface TournamentStandingRow extends LeagueStandingRow {
  entrantId: string;
  orgId?: string;
  poolKey?: string;
  /** Sum of `division_adjustments`, already folded into `points`. */
  adjustment?: number;
  /**
   * 1-based position after tiebreakers — the definite answer progression needs.
   *
   * Entrants no configured factor could separate **share** a rank (1, 2, 2, 4). That is the signal
   * that a human has to decide, and D29's manual override is how they do it.
   */
  rank?: number;
}
