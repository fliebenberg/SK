import { PoolClient } from 'pg';

/**
 * Migration: drop `facilities.address_id` (`VENUE-5`).
 *
 * Nothing ever read or wrote it — the `Facility` model has no address, and a facility's address is
 * its site's: a facility is a pin at its site (decided 2026-10-03). Checked on 2026-10-04: no row in
 * the dev or test database had a value. Dropping the column drops its foreign key with it.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE facilities DROP COLUMN IF EXISTS address_id`);
};
