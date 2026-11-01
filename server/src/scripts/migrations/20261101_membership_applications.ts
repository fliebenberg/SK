import { PoolClient } from 'pg';

/**
 * Migration: asking to join an organisation (`MEMBER-1`, docs/people.md §7).
 *
 * `membership_mode` says whether an organisation takes applications; every existing one stays
 * `invite`, so nothing changes for them. An application is its own record, not a profile: applying joins
 * nobody, and nothing here is a permission until it is approved.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS membership_mode TEXT NOT NULL DEFAULT 'invite'
      CHECK (membership_mode IN ('invite', 'apply'));
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS org_membership_applications (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      applicant_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      applicant_name TEXT NOT NULL,
      applicant_cellphone TEXT NOT NULL,
      name TEXT NOT NULL,
      birthdate DATE NOT NULL,
      relationship TEXT CHECK (relationship IN ('parent', 'guardian', 'grandparent', 'other')),
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn')),
      org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
      decided_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_applications_one_pending
      ON org_membership_applications(org_id, applicant_user_id, LOWER(name)) WHERE status = 'pending';
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_org_applications_org_status ON org_membership_applications(org_id, status);
  `);
};
