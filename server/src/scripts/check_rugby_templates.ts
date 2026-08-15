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

      // A trigger's prefilled data is only as good as the ids it names: a `triggerEventData.reason`
      // the child template does not define resolves to nothing, so the scorer sees an unselected
      // reason picker and the stored event carries an id no display can render. Cheap to check
      // here, invisible until mid-match otherwise.
      const unresolved: string[] = [];
      const describeTrigger = (source: any, label: string) => {
        const carried = source.triggerEventData || {};
        const keys = Object.keys(carried);
        const carriedStr = keys.length > 0 ? ` prefills ${keys.map((k) => `${k}=${carried[k]}`).join(', ')}` : '';
        console.log(` ${label} -> ${source.triggerEventId} (${source.triggerTeam || 'same'})${carriedStr}`);

        if (carried.reason) {
          const child = templates.find((c: any) => c.id === source.triggerEventId);
          const known = (child?.reasons || []).some((g: any) =>
            (g.options || []).some((opt: any) => (opt.id || opt.name) === carried.reason)
          );
          if (!known) unresolved.push(`${label} prefills reason="${carried.reason}", not defined by "${source.triggerEventId}"`);
        }
      };

      console.log('\nTriggered follow-ups (child event -> side it is recorded for):');
      templates.forEach((t: any) => {
        if (t.triggerEventId) describeTrigger(t, t.id);
        (t.outcomes || []).forEach((o: any) => {
          if (o.triggerEventId) describeTrigger(o, `${t.id}/${o.id}`);
        });
      });

      console.log('\nPrefilled follow-up data:');
      if (unresolved.length > 0) {
        unresolved.forEach((u) => console.log(` UNRESOLVED — ${u}`));
      } else {
        console.log(' OK — every prefilled reason resolves against the child template.');
      }

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
