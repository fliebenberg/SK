import { PoolClient } from 'pg';

/**
 * Migration: a new organisation starts with the app's electric blue as its secondary colour, as
 * well as the app's orange as its primary (decided 2026-10-03), so banners show two colours until an
 * admin sets the org's own. An admin may still clear the secondary; the org is then painted in its
 * primary alone (`orgColors` in `@sk/shared`).
 *
 * - `secondary_color` defaults to `#00E5FF`, for rows inserted without one (scripts, fixtures). The
 *   server sets it explicitly on create.
 * - Orgs still in the app's orange with no secondary — those that never had colours, which
 *   `20261003_org_primary_color_required.ts` gave the orange — get the blue, which is what they
 *   were shown in before that migration.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE organizations ALTER COLUMN secondary_color SET DEFAULT '#00E5FF'`);
  await client.query(`
    UPDATE organizations SET secondary_color = '#00E5FF'
     WHERE upper(primary_color) = '#FF3E00' AND secondary_color IS NULL
  `);
};
