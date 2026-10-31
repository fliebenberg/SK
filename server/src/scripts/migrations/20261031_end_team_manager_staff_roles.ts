import { PoolClient } from 'pg';

/**
 * Migration: the team roles Manager and Staff are gone (`PERM-10`, docs/permissions.md §1).
 *
 * Neither carried any right, so they were labels that suggested powers they did not have. Every
 * current team membership in either role is ended today rather than deleted, so a team's history
 * still shows who helped out. The roles themselves are a list in `TeamManager`, not rows.
 *
 * Data only, no schema change.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    UPDATE team_memberships SET end_date = NOW()
     WHERE role_id IN ('role-manager', 'role-staff') AND (end_date IS NULL OR end_date > NOW())
  `);
};
