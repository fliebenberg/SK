import { PoolClient } from 'pg';

/**
 * Migration: an email belongs to one person in an organisation (`MEMBER-7`, docs/people.md §8).
 *
 * Access follows the address, so two records sharing one would be one login holding both people's
 * memberships and roles. `UserManager.assertEmailFree` says so politely; this is what holds when two
 * saves arrive at once. Compared as the app compares them, ignoring case and spaces. Fails if two
 * records already share one, which is for a person to sort out rather than a migration to guess at.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_profiles_one_email
      ON org_profiles(org_id, LOWER(TRIM(email))) WHERE email IS NOT NULL AND TRIM(email) <> '';
  `);
};
