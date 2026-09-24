import { PoolClient } from 'pg';

/**
 * Migration: **Data only, no schema change.** Renames the `system_settings` key
 * `org_admin_invite_cooldown_hours` to `invite_cooldown_hours`.
 *
 * It was named for the organisation-claim invitation, but one value now paces every invitation
 * email the app sends: re-nominating an org's contact (`ReferralManager`) and inviting a person
 * onto ScoreKeeper (`SEND_MEMBER_INVITE`). The old name suggested it governed only the first.
 *
 * The value is kept. Where both keys somehow exist, the new one wins and the old one goes.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    INSERT INTO system_settings (key, value)
    SELECT 'invite_cooldown_hours', value FROM system_settings WHERE key = 'org_admin_invite_cooldown_hours'
    ON CONFLICT (key) DO NOTHING
  `);
  await client.query(`DELETE FROM system_settings WHERE key = 'org_admin_invite_cooldown_hours'`);
};
