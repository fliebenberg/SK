
import * as db from '../db';

async function inspectEvents() {
    const orgId = 'org-1772080048750';
    console.log(`Inspecting events for organization: ${orgId}`);
    
    const eventsRes = await db.query('SELECT * FROM events WHERE org_id = $1', [orgId]);
    console.log(`Found ${eventsRes.rows.length} host events:`);
    
    for (const event of eventsRes.rows) {
        console.log(`\nEvent ID: ${event.id}`);
        console.log(`Name: ${event.name}`);
        console.log(`Type: ${event.type}`);
        console.log(`Start Date: ${event.start_date}`);
        console.log(`End Date: ${event.end_date}`);
        
        const gamesRes = await db.query('SELECT * FROM games WHERE event_id = $1', [event.id]);
        console.log(`Games (${gamesRes.rows.length}):`);
        gamesRes.rows.forEach(g => {
            console.log(`  - Game ${g.id}: ${g.home_team_id} vs ${g.away_team_id} (Org Host: ${event.org_id})`);
        });
    }
    
    process.exit(0);
}

inspectEvents().catch(err => {
    console.error(err);
    process.exit(1);
});
