import { PoolClient } from 'pg';

/**
 * Migration: every organisation has a primary colour (decided 2026-10-01).
 *
 * The register-an-org dialog never asked for colours, so most organisations had none, and every
 * screen that painted with them guessed its own fallback — the app's orange and electric blue.
 * The rule now is that each colour falls back to the one before it (`orgColors` in `@sk/shared`):
 * a missing secondary is the primary, and the primary is required.
 *
 * - `primary_color`: blank or missing becomes the app's orange `#FF3E00`, the colour these orgs
 *   were already painted in; then `NOT NULL`, a non-blank `CHECK`, and that default.
 * - `secondary_color`: blank becomes `NULL`, so "not set" has one spelling. Existing values are
 *   kept — an org that was showing the app's blue only because it had none now shows its primary.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    UPDATE organizations SET primary_color = '#FF3E00'
     WHERE primary_color IS NULL OR btrim(primary_color) = ''
  `);
  await client.query(`UPDATE organizations SET secondary_color = NULL WHERE btrim(secondary_color) = ''`);
  await client.query(`ALTER TABLE organizations ALTER COLUMN primary_color SET DEFAULT '#FF3E00'`);
  await client.query(`ALTER TABLE organizations ALTER COLUMN primary_color SET NOT NULL`);
  await client.query(`
    ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_primary_color_not_blank
  `);
  await client.query(`
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_primary_color_not_blank CHECK (btrim(primary_color) <> '')
  `);
};
