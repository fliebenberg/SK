import { PoolClient } from 'pg';

/**
 * A third organiser scope: one sport of one tournament (D33, widened 2026-09-20).
 *
 * `event_organizers` and `division_organizers` already exist and are unchanged. This sits between
 * them, and the shape of the key is the point: **(event, sport)**, not sport alone. A grant says
 * "you run the netball *at this tournament*" — the same sport next weekend is somebody else's job,
 * and a sport-wide grant would be a permission nobody could see the edge of.
 *
 * It is a **rule rather than a list**, which is why it is a table of two ids and not a fan-out into
 * `division_organizers`. Appointing somebody to each netball division in turn would be correct for
 * exactly as long as the draw stood still; this covers a netball division added tomorrow, and stops
 * covering a division moved to hockey, with no row being touched either time.
 *
 * `ON DELETE CASCADE` on both halves: a deleted tournament takes its grants, and a sport removed
 * from the sports list — which only an app admin can do — takes the grants that named it. Removing
 * a sport from *this tournament* is not a delete of either row and deliberately leaves the grant
 * alone, so that putting the sport back restores who ran it.
 */
export const up = async (client: PoolClient) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_sport_organizers (
        event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
        sport_id TEXT REFERENCES sports(id) ON DELETE CASCADE,
        org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE CASCADE,
        granted_by_org_profile_id TEXT REFERENCES org_profiles(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (event_id, sport_id, org_profile_id)
    );
  `);

  // "What do I hold?", asked on every room join and every capability read, keys on the profile —
  // the same index both sibling tables carry, and for the same reason.
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_event_sport_organizers_profile
       ON event_sport_organizers(org_profile_id);`
  );
};
