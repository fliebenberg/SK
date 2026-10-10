import { PoolClient } from 'pg';

/**
 * Migration: teams answer their own invitation, each division's entries are locked, and invited
 * organisations may add teams of their own (`FIX-31`, `FIX-33`, agreed 2026-10-08 to 2026-10-10).
 *
 * - `division_entrants.status` becomes a team's answer, mirroring the organisation's: `invited`,
 *   `accepted`, `declined`, `withdrawal_pending`, `withdrawn`, plus `requested` (an organisation
 *   asking to add a team, before the lock or late) and `rejected` (a request turned down, kept as
 *   the record). `active` becomes `accepted`; `withdrawn` keeps its meaning — out, results kept.
 * - Who answered and when (`answered_*`), and a request's or an answer's reason with who asked and
 *   when (`reason`, `requested_*`) — a withdrawal, a late or added entry, or a decline.
 * - `tournament_divisions.entries_locked_at` / `_by_user_id`: a division's entries are locked by
 *   hand (`FIX-31`); a division that already has fixtures is locked now, since the draw needs the
 *   lock from here on.
 * - `events.orgs_may_add_teams`: may invited organisations add teams themselves (`FIX-33`), off by
 *   default; `tournament_divisions.orgs_may_add_teams`: a division's own choice, NULL following the
 *   tournament.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE division_entrants ALTER COLUMN status SET DEFAULT 'invited'`);
  await client.query(`UPDATE division_entrants SET status = 'accepted' WHERE status = 'active'`);
  await client.query(`ALTER TABLE division_entrants DROP CONSTRAINT IF EXISTS division_entrants_status_check`);
  await client.query(`
    ALTER TABLE division_entrants
      ADD CONSTRAINT division_entrants_status_check
      CHECK (status IN ('invited', 'accepted', 'declined', 'withdrawal_pending', 'withdrawn', 'requested', 'rejected'))
  `);
  await client.query(`
    ALTER TABLE division_entrants
      ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS answered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS answered_by_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reason TEXT,
      ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `);

  await client.query(`
    ALTER TABLE tournament_divisions
      ADD COLUMN IF NOT EXISTS entries_locked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS entries_locked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS orgs_may_add_teams BOOLEAN
  `);
  await client.query(`
    UPDATE tournament_divisions d SET entries_locked_at = NOW()
     WHERE d.entries_locked_at IS NULL
       AND EXISTS (SELECT 1 FROM games g JOIN division_stages s ON s.id = g.stage_id WHERE s.division_id = d.id)
  `);

  await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS orgs_may_add_teams BOOLEAN NOT NULL DEFAULT FALSE`);
};
