import pool from '../db';
import { RUGBY_SEED_SPEC } from './setup/seeds/sports/rugby.seed';

async function syncDb() {
  try {
    const templatesJson = JSON.stringify(RUGBY_SEED_SPEC.eventTemplates);
    const res = await pool.query(
      `UPDATE sports 
       SET event_templates = $1 
       WHERE id = 'rugby' OR id = 'sport-rugby'
       RETURNING id, name;`,
      [templatesJson]
    );

    console.log(`Updated ${res.rowCount} row(s) in PostgreSQL:`, res.rows);
  } catch (err) {
    console.error('Failed to sync rugby templates to PostgreSQL:', err);
  } finally {
    process.exit(0);
  }
}

syncDb();
