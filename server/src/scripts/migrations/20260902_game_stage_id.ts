import { PoolClient } from 'pg';

/**
 * Migration: a fixture names the stage it belongs to.
 *
 * Tournaments Phase 3. One column and one index.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS DEVIATES FROM THE DATA MODEL, WHICH SAYS `games` GAINS NOTHING
 *
 * [data model §4.4](file:///c:/Fred/Coding/SK/docs/tournaments-data-model.md) says a game's stage
 * "is reached through its participants' entrants, and if that indirection proves awkward in
 * queries a `stage_id` column is a cheap denormalisation to add later".
 *
 * The indirection is not awkward — it is **insufficient**, and in the ordinary case rather than an
 * exotic one. A `division_entrants` row belongs to the *division*, not to a stage, and
 * `stage_entrants` deliberately puts the same entrant in the pool stage *and* the knockout that
 * follows it. So "which stage is this fixture in?" resolved through participants returns *both*
 * stages of every pools-and-knockout division — which is exactly the shape the choke point has to
 * answer for, since progression is the one thing it exists to do.
 *
 * Everything Phase 3 does needs a definite answer:
 *
 *   - `recalculateForGame` must rewrite *one* stage's `cached_standings`, not two;
 *   - "has this stage become Complete?" is `every fixture in the stage has a result`, and cannot
 *     be asked at all without knowing which fixtures those are;
 *   - regeneration deletes a stage's fixtures, and deleting the knockout's alongside the pool's
 *     would be a data-loss bug rather than a slow query.
 *
 * `ON DELETE SET NULL`, matching `source_stage_id` beside it and for the same reason: removing a
 * stage must not delete the fixtures that were played in it.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 * ---------------------------------------------------------------------------------------------
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    ALTER TABLE games ADD COLUMN IF NOT EXISTS stage_id TEXT
        REFERENCES division_stages(id) ON DELETE SET NULL;
  `);

  // Every query the choke point runs starts "the fixtures of this stage", so the index is the
  // point of the column rather than an optimisation on top of it.
  await client.query(`CREATE INDEX IF NOT EXISTS idx_games_stage ON games(stage_id);`);

  // Nothing to backfill: no stage exists yet in any environment, so every row is correctly null.
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM division_stages`);
  console.log(`  games.stage_id added; ${rows[0].n} stage(s) exist, so 0 rows needed a backfill.`);
};
