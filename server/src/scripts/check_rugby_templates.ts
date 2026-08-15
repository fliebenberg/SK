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

      console.log('\nTriggered follow-ups (child event -> side it is recorded for):');
      templates.forEach((t: any) => {
        if (t.triggerEventId) {
          console.log(` ${t.id} -> ${t.triggerEventId} (${t.triggerTeam || 'same'})`);
        }
        (t.steps || []).forEach((step: any) => {
          (step.outcomes || []).forEach((o: any) => {
            if (o.triggerEventId) {
              console.log(` ${t.id}/${o.id} -> ${o.triggerEventId} (${o.triggerTeam || 'same'})`);
            }
          });
        });
      });
    }
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    process.exit(0);
  }
}

check();
