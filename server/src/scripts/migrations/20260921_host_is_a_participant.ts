import { PoolClient } from 'pg';

/**
 * Migration: **Data only, no schema change.** The host organisation becomes an ordinary row in
 * `event_organizations`.
 *
 * Participation used to be implicit for the host: `event_organizations` held everybody *else*, and
 * every reader unioned `events.org_id` back in. That reads as a tidy saving until somebody asks
 * the obvious question — *can a school run a tournament it does not play in?* — and the answer has
 * nowhere to live. Absence cannot distinguish "the host was never added" from "the host was
 * removed", so hosting and competing could not be told apart at all.
 *
 * Now the table means what its name says: the organisations taking part, host included unless
 * somebody takes it out. `EventManager.addEvent` writes the row for new events and this backfills
 * the old ones, so the implicit unions can go — `getEventCandidateTeams` no longer adds the host
 * to the orgs that may enter, which is precisely what makes removing it do anything.
 *
 * `ON CONFLICT DO NOTHING`, because a single match created through `events/create` already lists
 * its home organisation when that is not the acting one, and a tournament may have had its host
 * invited by hand.
 */
export const up = async (client: PoolClient) => {
  const res = await client.query(`
    INSERT INTO event_organizations (event_id, org_id)
    SELECT id, org_id FROM events WHERE org_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
  console.log(`[host_is_a_participant] Added ${res.rowCount ?? 0} host row(s).`);
};
