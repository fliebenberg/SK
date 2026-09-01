/**
 * `'SportsDay'` is **no longer written and no longer storable** — `events.type` carries a
 * `CHECK (type IN ('SingleMatch', 'Tournament'))` since the tournaments migration (D1: a sports day
 * is a `Tournament` whose `format` is `'Festival'`). It remains in this union only because four
 * client call sites still branch on it; those become explicit branches with an error default in
 * Phase 5, and the member goes with them. Do not add new reads of it.
 */
export type EventType = 'SingleMatch' | 'SportsDay' | 'Tournament';

/**
 * How a tournament is structured — what the event screen keys its tabs and setup steps off.
 * Null on a `SingleMatch`, which has no structure to describe.
 */
export type EventFormat = 'Festival' | 'RoundRobin' | 'Knockout' | 'PoolsKnockout';

export interface Event {
  id: string;
  name: string;
  type?: EventType; // Optional for migration, will default to SingleMatch
  format?: EventFormat;
  date?: string; // Legacy field
  startDate: string;
  endDate?: string;
  siteId?: string;
  facilityId?: string;
  orgId: string;
  participatingOrgIds?: string[];
  sportIds?: string[];
  settings?: {
    pointSystem?: 'standard' | 'weighted';
    pointsPerWin?: number;
    pointsPerDraw?: number;
    levelWeighting?: Record<string, number>;
    positions?: { id: string; name: string }[];
  };
  status?: 'Scheduled' | 'Cancelled' | 'Finished';
}
