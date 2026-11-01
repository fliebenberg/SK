import { PoolClient } from 'pg';

/**
 * Migration: an organisation can have a third colour (`ORG-17`, docs/design_spec.md §5.4).
 *
 * Optional, and unset to start, so every existing organisation looks as it did: an unset third
 * colour is painted as the secondary (`orgColors`).
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tertiary_color TEXT`);
};
