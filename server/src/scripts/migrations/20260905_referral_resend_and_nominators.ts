import { PoolClient } from 'pg';

/**
 * Migration: a referral remembers when it was last emailed, and everyone who nominated it.
 *
 * Two things the nomination process always described but never had columns for — see
 * [docs/nomination-process.md](file:///c:/Fred/Coding/SK/docs/nomination-process.md) §2 and the
 * cooldown policy:
 *
 *   - `last_sent_at`: re-nominating an address that is already pending resends the invitation
 *     only once `org_admin_invite_cooldown_hours` has passed since the last send. The doc had this
 *     resetting `created_at`; a separate column keeps the original date and makes the rule
 *     explicit. NULL on older rows is read as `created_at`.
 *
 *   - `org_claim_referral_nominators`: one row per (org, email) is the right shape for the
 *     invitation, but it can only credit one nominator. A second person who enters an address
 *     someone else already invited must still see "you have referred this org" on their own
 *     screens (`org_claim_status` is strictly the caller's view) — without a second email going
 *     out inside the cooldown. Backfilled from `referred_by_user_id` so existing referrals count
 *     for the person who made them.
 *
 * MIRRORED INTO `setup/init-db.ts`, per the standing rule in ./README.md.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    ALTER TABLE org_claim_referrals ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS org_claim_referral_nominators (
        referral_id TEXT REFERENCES org_claim_referrals(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (referral_id, user_id)
    );
  `);

  await client.query(`
    INSERT INTO org_claim_referral_nominators (referral_id, user_id, created_at)
        SELECT id, referred_by_user_id, created_at FROM org_claim_referrals
        WHERE referred_by_user_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);
};
