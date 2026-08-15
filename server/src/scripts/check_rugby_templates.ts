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
        (t.outcomes || []).forEach((o: any) => {
          if (o.triggerEventId) {
            console.log(` ${t.id}/${o.id} -> ${o.triggerEventId} (${o.triggerTeam || 'same'})`);
          }
        });
      });

      // `outcomes` and `reasons` moved from the step to the template. A template still carrying
      // the old shape is one the sync missed: the server would resolve no points and no triggers
      // for it, silently, so it is worth naming rather than leaving to be noticed mid-match.
      const stale: string[] = [];
      const walk = (steps: any[], templateId: string) => {
        (steps || []).forEach((step: any) => {
          if (step.outcomes || step.reasons) stale.push(`${templateId}/${step.type}`);
          walk(step.steps, templateId);
        });
      };
      templates.forEach((t: any) => walk(t.steps, t.id));

      console.log('\nStored shape:');
      if (stale.length > 0) {
        console.log(` STALE — ${stale.length} step(s) still hold outcomes/reasons: ${stale.join(', ')}`);
        console.log(' Re-run: npx ts-node src/scripts/sync_db_rugby_templates.ts');
      } else {
        console.log(' OK — no step holds outcomes or reasons.');
      }
    }
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    process.exit(0);
  }
}

check();
