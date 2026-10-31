import { PoolClient } from 'pg';

/**
 * Migration: an organisation can be private (`ORG-14`, docs/org-profile.md §5.3).
 *
 * A private org is seen only by its current members: the org lists, searches, Home and the map
 * leave it out for everyone else, and its public rooms close to them. Its own column rather than a
 * key in `organizations.settings`, because every org list and search filters on it. Every existing
 * organisation stays public.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false`);
};
