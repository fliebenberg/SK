import { PoolClient } from 'pg';

/**
 * Migration: an address gets an optional unit or building line — "Unit 16, The Waves" — above the
 * street (`VENUE-2`).
 *
 * `address_line_1` is the street and `address_line_2` the suburb, so a unit in a complex had
 * nowhere to go but over one of them. A column of its own keeps the street in one fixed place.
 * `NULL` means none, which is every existing address.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE addresses ADD COLUMN IF NOT EXISTS building TEXT`);
};
