import { PoolClient } from 'pg';

/**
 * Migration: Clean Sport ID Canonicalization
 * Replaces legacy 'sport-' prefixed sport IDs ('sport-rugby', 'sport-soccer', etc.)
 * with clean slugs ('rugby', 'soccer', etc.) across all database tables.
 */
export const up = async (client: PoolClient) => {
  // 1. Duplicate existing sports entries with clean IDs to satisfy Foreign Key constraints
  await client.query(`
    INSERT INTO sports (id, name, facility_term, period_term, participant_type, match_topology, default_settings, event_templates)
    SELECT REPLACE(id, 'sport-', ''), name, facility_term, period_term, participant_type, match_topology, default_settings, event_templates
    FROM sports
    WHERE id LIKE 'sport-%'
    ON CONFLICT (id) DO NOTHING;
  `);

  // 2. Update child tables foreign keys
  await client.query(`UPDATE teams SET sport_id = REPLACE(sport_id, 'sport-', '') WHERE sport_id LIKE 'sport-%';`);
  await client.query(`UPDATE games SET sport_id = REPLACE(sport_id, 'sport-', '') WHERE sport_id LIKE 'sport-%';`);
  await client.query(`UPDATE leagues SET sport_id = REPLACE(sport_id, 'sport-', '') WHERE sport_id LIKE 'sport-%';`);
  await client.query(`UPDATE facilities SET primary_sport_id = REPLACE(primary_sport_id, 'sport-', '') WHERE primary_sport_id LIKE 'sport-%';`);

  // 3. Update join tables
  await client.query(`UPDATE event_sports SET sport_id = REPLACE(sport_id, 'sport-', '') WHERE sport_id LIKE 'sport-%';`);
  await client.query(`UPDATE organization_sports SET sport_id = REPLACE(sport_id, 'sport-', '') WHERE sport_id LIKE 'sport-%';`);
  await client.query(`UPDATE facility_sports SET sport_id = REPLACE(sport_id, 'sport-', '') WHERE sport_id LIKE 'sport-%';`);

  // 4. Clean up legacy 'sport-' entries from sports table
  await client.query(`DELETE FROM sports WHERE id LIKE 'sport-%';`);
};
