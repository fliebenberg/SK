import { PoolClient } from 'pg';

/**
 * Migration: an organisation that accepted can ask to withdraw, and the organisers confirm it
 * (`FIX-30`, agreed 2026-10-08).
 *
 * - `invitation` gains `withdrawal_pending` — asked, not yet confirmed; nothing changes for its
 *   teams — and `withdrawn`, which is treated as declined.
 * - `withdrawal_reason`, `withdrawal_requested_at`, `withdrawal_requested_by_user_id`: why, when
 *   and who asked. Kept once withdrawn, as the record; cleared when the request is cancelled or the
 *   organisers keep the organisation in.
 */
export const up = async (client: PoolClient) => {
  await client.query(`ALTER TABLE event_organizations DROP CONSTRAINT IF EXISTS event_organizations_invitation_check`);
  await client.query(`
    ALTER TABLE event_organizations
      ADD CONSTRAINT event_organizations_invitation_check
      CHECK (invitation IN ('not_invited', 'invited', 'accepted', 'declined', 'withdrawal_pending', 'withdrawn'))
  `);
  await client.query(`
    ALTER TABLE event_organizations
      ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT,
      ADD COLUMN IF NOT EXISTS withdrawal_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS withdrawal_requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL
  `);
};
