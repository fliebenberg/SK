import { PoolClient } from 'pg';

/**
 * Migration: an event can have only one open dispute at a time (`SCORE-17`).
 *
 * `initiateDispute` checks for an open dispute and then inserts one, as two statements, so two
 * officials challenging the same event at once could both pass the check and open two votes, each
 * resolving on its own timer and each able to apply its own undo or correction. A partial unique
 * index makes the database refuse the second; the manager answers it as it answers the check.
 *
 * Existing duplicates would make the index fail to build, and choosing which of two open votes
 * stands is not a migration's call, so it stops and names them instead.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  const { rows } = await client.query(`
    SELECT game_event_id, COUNT(*)::int AS open
      FROM game_disputes
     WHERE status = 'OPEN'
     GROUP BY game_event_id
    HAVING COUNT(*) > 1
  `);
  if (rows.length > 0) {
    const list = rows.map(r => `${r.game_event_id} (${r.open})`).join(', ');
    throw new Error(`Events with more than one open dispute — resolve all but one first: ${list}`);
  }

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS game_disputes_one_open_per_event
      ON game_disputes (game_event_id) WHERE status = 'OPEN'
  `);
};
