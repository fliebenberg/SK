import { PoolClient } from 'pg';

/**
 * Migration: each organisation taking part in an event gets an **invitation status** (`FIX-29`).
 *
 * A row in `event_organizations` used to be all it took for an organisation to see an event: the
 * event appeared in its events list and its staff could read the rosters and fixtures. `FIX-26`
 * separates **adding** an organisation — so the organiser can enter its teams and build the
 * tournament — from **inviting** it, and an organisation not invited yet must not see the event.
 *
 * - `invitation`: `not_invited`, `invited`, `accepted` or `declined`.
 * - `invited_at`, `answered_at`: when it was invited, and when it answered (instants).
 *
 * **Every existing row becomes `accepted`**, which is also the column default: nothing anybody can
 * see today disappears, and the writers that add an organisation because its teams are playing
 * (`EventManager.syncEventOrganizationsFromGames`) or because it hosts keep meaning "taking part". Only the
 * new add-organisations action writes `not_invited`.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    ALTER TABLE event_organizations
      ADD COLUMN IF NOT EXISTS invitation TEXT NOT NULL DEFAULT 'accepted',
      ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ
  `);
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_organizations_invitation_check') THEN
        ALTER TABLE event_organizations
          ADD CONSTRAINT event_organizations_invitation_check
          CHECK (invitation IN ('not_invited', 'invited', 'accepted', 'declined'));
      END IF;
    END $$;
  `);
};
