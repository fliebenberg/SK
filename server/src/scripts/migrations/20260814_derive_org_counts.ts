import { PoolClient } from 'pg';

/**
 * Migration: Derive organization counts instead of caching them.
 *
 * `organizations.team_count` / `site_count` / `member_count` were denormalized columns maintained
 * by two background jobs (`membership-expiry` and `accuracy-audit`). That arrangement could not be
 * made correct: `member_count` counts memberships where `end_date IS NULL OR end_date > NOW()`, so
 * it changes as the clock advances with no accompanying write. No trigger can maintain such a
 * value, which forced a polling job, and the job's incremental decrement raced the full-recompute
 * path (`refreshOrgSummary`) and drove counts steadily too low.
 *
 * The counts are now computed live in the organization queries, so there is no cached copy to
 * drift. Both jobs and the reconciliation script (`fix_counts.ts`) have been removed.
 *
 * `org_memberships.expiry_processed` existed solely to make the expiry job's decrement idempotent
 * and had no other reader, so it goes with the job.
 *
 * The indexes back the live counts, and are worth having regardless — every org-scoped query in
 * the app filters on these foreign keys.
 */
export const up = async (client: PoolClient) => {
  // 1. Index the foreign keys the live counts aggregate over.
  await client.query(`CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(org_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sites_org ON sites(org_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_id);`);

  // 2. Drop the denormalized counters.
  await client.query(`
    ALTER TABLE organizations
      DROP COLUMN IF EXISTS team_count,
      DROP COLUMN IF EXISTS site_count,
      DROP COLUMN IF EXISTS member_count;
  `);

  // 3. Drop the expiry bookkeeping flag, whose only reader was the deleted job.
  await client.query(`ALTER TABLE org_memberships DROP COLUMN IF EXISTS expiry_processed;`);
};
