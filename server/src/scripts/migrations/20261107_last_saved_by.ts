import { PoolClient } from 'pg';

/**
 * Migration: who last saved a season's settings and a side's team sheet (`SYNC-11`).
 *
 * A save made over a change it did not see is refused, and the refusal names who made that change.
 * `seasons.updated_by` is written by `UPDATE_SEASON` only (not by standings recalculation);
 * `game_participants.roster_saved_by` by `SAVE_GAME_ROSTER`, and set to null when the server saves
 * a proposed team itself at kick-off or with a result. Both are null for every save before this.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    ALTER TABLE seasons ADD COLUMN IF NOT EXISTS updated_by TEXT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE game_participants ADD COLUMN IF NOT EXISTS roster_saved_by TEXT REFERENCES users(id) ON DELETE SET NULL;
  `);
};
