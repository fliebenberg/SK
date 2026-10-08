import { PoolClient } from 'pg';

/**
 * Migration: who invited each organisation taking part in an event, and who gave its answer
 * (`FIX-26`, agreed 2026-10-08: "Accepted by Pieter Joubert (Laerskool Waterkloof) · Tue 7 Oct").
 *
 * - `invited_by_user_id`, `invited_by_org_id`: the person who sent the invitation, and the
 *   organisation they acted from.
 * - `answered_by_user_id`, `answered_by_org_id`: the same for the answer — the organisation's own
 *   admin, or an organiser who recorded an answer heard another way.
 *
 * All four `ON DELETE SET NULL`: the answer stands when the person or organisation goes. Existing
 * rows have none, and say only when.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    ALTER TABLE event_organizations
      ADD COLUMN IF NOT EXISTS invited_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS invited_by_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS answered_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS answered_by_org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL
  `);
};
