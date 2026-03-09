
import * as db from '../db';

async function checkEventCount() {
    const orgId = 'org-1772080048750';
    console.log(`Checking event count for organization: ${orgId}`);
    
    const query = `
        SELECT o.id, o.name,
        (SELECT COUNT(*)::int FROM events e WHERE (e.org_id = o.id OR o.id = ANY(e.participating_org_ids)) AND (e.start_date IS NULL OR e.start_date > (NOW() - INTERVAL '24 hours'))) as "eventCount"
        FROM organizations o
        WHERE o.id = $1
    `;
    
    const res = await db.query(query, [orgId]);
    console.log('Result:', JSON.stringify(res.rows[0], null, 2));
    
    process.exit(0);
}

checkEventCount().catch(err => {
    console.error(err);
    process.exit(1);
});
