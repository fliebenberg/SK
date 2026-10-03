import { PoolClient } from 'pg';

/**
 * Migration: organisations get a description — the About text on their profile.
 *
 * The org settings screen has had a "Description / Biography" field since before 2026-08, and the
 * public org page reads `description`, but there was never a column: `UPDATE_ORG` dropped the field
 * silently, so nothing anyone typed there was ever kept. Found 2026-10-01 while splitting that
 * screen into Profile and Settings. `NULL` means none.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT`);
};
