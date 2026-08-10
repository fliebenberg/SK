import pool from '../db';

async function check() {
  try {
    const res = await pool.query(`SELECT id, name, event_templates FROM sports WHERE id = 'rugby'`);
    const sport = res.rows[0];
    if (!sport) {
      console.log('No sport record found for "rugby"');
    } else {
      const templates = sport.event_templates || [];
      console.log(`Sport: ${sport.name} (${sport.id})`);
      console.log(`Total Templates in DB: ${templates.length}`);
      console.log('Template List in DB:');
      templates.forEach((t: any, idx: number) => {
        console.log(` ${idx + 1}. id="${t.id}", name="${t.name}", section="${t.section}"`);
      });
    }
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    process.exit(0);
  }
}

check();
