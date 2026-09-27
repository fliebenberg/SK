import { PoolClient } from 'pg';

/**
 * Migration: **Data only, no schema change.** Adds the `system_settings` key
 * `admin_takeover_min_days`, default 30.
 *
 * An organisation left with no admin may have that role taken by one of its members without a claim
 * email (`TAKE_ORG_ADMIN`), once they have been a member this many days — so somebody who joined
 * yesterday cannot take over an org that still has longer-standing members. See
 * `ReferralManager.getAdminTakeover` and docs/nomination-process.md §4.
 *
 * An existing value is kept.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    INSERT INTO system_settings (key, value) VALUES ('admin_takeover_min_days', '30')
    ON CONFLICT (key) DO NOTHING
  `);
};
