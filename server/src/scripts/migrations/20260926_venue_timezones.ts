import { PoolClient } from 'pg';
import { timeZoneAt } from '../../utils/timeZoneLookup';

/**
 * Migration: organisations and venues carry a timezone, so a kick-off is typed in the venue's time
 * rather than whatever timezone the organiser's device is set to (`DATE-2`).
 *
 * - `organizations.timezone` — an IANA name, required. Set from the creator's device when an
 *   organisation is created, changeable in its settings. Every existing organisation gets
 *   `Africa/Johannesburg`: their creators' devices cannot be asked now, and all of them were South
 *   African.
 * - `sites.timezone` — looked up from the venue's pin whenever the pin is saved, never typed.
 *   `NULL` means "the organisation's timezone": a venue with no pin, or one whose lookup found
 *   nothing. Existing sites with coordinates are looked up here, once.
 *
 * Stored kick-offs are instants and are not touched: they are the same moments they were.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Johannesburg'
  `);
  await client.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS timezone TEXT`);

  const pinned = await client.query(`
    SELECT s.id, a.latitude, a.longitude
      FROM sites s
      JOIN addresses a ON a.id = s.address_id
     WHERE a.latitude IS NOT NULL AND a.longitude IS NOT NULL
  `);
  for (const row of pinned.rows) {
    const zone = timeZoneAt(row.latitude, row.longitude);
    if (zone) await client.query('UPDATE sites SET timezone = $1 WHERE id = $2', [zone, row.id]);
  }
};
