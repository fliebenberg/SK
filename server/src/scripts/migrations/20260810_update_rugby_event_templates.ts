import { PoolClient } from 'pg';
import { RUGBY_SEED_SPEC } from '../setup/seeds/sports/rugby.seed';

/**
 * Migration: Synchronize Rugby Event Templates in Database
 * Updates the event_templates JSONB column in PostgreSQL for the rugby sport record
 * with the full canonical specification from RUGBY_SEED_SPEC.
 */
export const up = async (client: PoolClient) => {
  const templatesJson = JSON.stringify(RUGBY_SEED_SPEC.eventTemplates);

  await client.query(
    `UPDATE sports 
     SET event_templates = $1 
     WHERE id = 'rugby' OR id = 'sport-rugby';`,
    [templatesJson]
  );
};
