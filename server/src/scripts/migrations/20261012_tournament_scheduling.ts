import { PoolClient } from 'pg';

/**
 * Migration: tournament scheduling (Phase 7, agreed 2026-10-12 — docs/tournaments-implementation-plan.md,
 * *Phase 7 — schema and API*).
 *
 * - `event_days`: a tournament's playing days, one row each, with when its first games start and by
 *   when its last must end — venue clock times on a calendar date. Days need not follow each other.
 *   No backfill: an existing tournament has a date range and no hours, and inventing hours would be
 *   a schedule nobody chose; its When section reads as not set until the organisers set it.
 * - `division_days`: where a division differs from the tournament on one of its days — not playing,
 *   its own first start, a set last end. The composite foreign key removes a division's row when its
 *   day leaves the tournament.
 * - `events.gap_between_games_min` / `min_team_break_min`, and the same on `tournament_divisions`
 *   (NULL following the tournament): the scheduling gaps. The team break defaults to 0, no minimum.
 * - `facility_shared_ground`: facilities on the same ground (D34) — each pair once, smaller id first,
 *   read both ways; not transitive.
 * - `games.placed_by`: whether the scheduler or a person placed a fixture, so scheduling again can
 *   keep what was placed by hand.
 * - An index on `games (facility_id, start_time)`: clashes include other events' games at a venue.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_days (
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      day_starts TIME NOT NULL,
      day_ends TIME NOT NULL,
      PRIMARY KEY (event_id, day),
      CONSTRAINT event_days_window_check CHECK (day_ends > day_starts)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS division_days (
      event_id TEXT NOT NULL,
      division_id TEXT NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      plays BOOLEAN NOT NULL DEFAULT TRUE,
      first_game_start TIME,
      last_game_ends TIME,
      PRIMARY KEY (division_id, day),
      CONSTRAINT division_days_event_day_fkey FOREIGN KEY (event_id, day) REFERENCES event_days(event_id, day) ON DELETE CASCADE,
      CONSTRAINT division_days_window_check CHECK (last_game_ends IS NULL OR first_game_start IS NULL OR last_game_ends > first_game_start)
    )
  `);

  await client.query(`
    ALTER TABLE events
      ADD COLUMN IF NOT EXISTS gap_between_games_min SMALLINT NOT NULL DEFAULT 5,
      ADD COLUMN IF NOT EXISTS min_team_break_min SMALLINT NOT NULL DEFAULT 0
  `);
  await client.query(`
    ALTER TABLE tournament_divisions
      ADD COLUMN IF NOT EXISTS gap_between_games_min SMALLINT,
      ADD COLUMN IF NOT EXISTS min_team_break_min SMALLINT
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS facility_shared_ground (
      facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
      other_facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
      PRIMARY KEY (facility_id, other_facility_id),
      CONSTRAINT facility_shared_ground_order_check CHECK (facility_id < other_facility_id)
    )
  `);

  await client.query(`ALTER TABLE games ADD COLUMN IF NOT EXISTS placed_by TEXT`);
  const { rowCount } = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = 'games_placed_by_check'`);
  if (!rowCount) {
    await client.query(`ALTER TABLE games ADD CONSTRAINT games_placed_by_check CHECK (placed_by IN ('scheduler', 'hand'))`);
  }
  await client.query(`CREATE INDEX IF NOT EXISTS idx_games_facility_start ON games (facility_id, start_time)`);
};
