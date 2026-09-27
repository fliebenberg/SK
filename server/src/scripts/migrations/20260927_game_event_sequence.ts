import { PoolClient } from 'pg';

/**
 * Migration: `game_events.sequence`, the order of a game's log (`DB-4`).
 *
 * `GameEventManager` has numbered each game's events 1, 2, 3… since March, and reads the log, and
 * replays it to recalculate scores, in that order. But nothing created the column: it was added by
 * hand to the old dev database, and a database built from `init-db.ts` had none, so every log write
 * there failed with `column "sequence" does not exist`.
 *
 * The backfill renumbers every game from 1. An existing number keeps its place (so a database that
 * has the hand-made column keeps its order, and any duplicate numbers two simultaneous writes gave it
 * are pulled apart); an event with none follows, in the order it was recorded. `id` breaks ties.
 *
 * `UNIQUE (game_id, sequence)` makes the database refuse a second event with the same number, which
 * `ingestEvent` prevents by locking the game while it picks one. Postgres has no `IF NOT EXISTS` for
 * `ADD CONSTRAINT`, so it is guarded on `pg_constraint`.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE game_events ADD COLUMN IF NOT EXISTS sequence INTEGER`);

  await client.query(`
    UPDATE game_events ge
       SET sequence = numbered.n
      FROM (SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY game_id
                                      ORDER BY sequence NULLS LAST, timestamp, id) AS n
              FROM game_events) numbered
     WHERE ge.id = numbered.id
       AND ge.sequence IS DISTINCT FROM numbered.n
  `);

  await client.query(`ALTER TABLE game_events ALTER COLUMN sequence SET NOT NULL`);

  const { rows } = await client.query(
    `SELECT 1 FROM pg_constraint WHERE conname = 'game_events_game_id_sequence_key' AND conrelid = 'game_events'::regclass`
  );
  if (rows.length === 0) {
    await client.query(
      `ALTER TABLE game_events ADD CONSTRAINT game_events_game_id_sequence_key UNIQUE (game_id, sequence)`
    );
  }
};
