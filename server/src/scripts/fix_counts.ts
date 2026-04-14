import pool from '../../db';

async function fix() {
    console.log('Updating counts Authoritatively...');
    await pool.query(`
        UPDATE organizations o
        SET 
          member_count = (SELECT COUNT(*)::int FROM org_memberships om WHERE om.org_id = o.id AND (om.end_date IS NULL OR om.end_date > NOW())),
          team_count = (SELECT COUNT(*)::int FROM teams t WHERE t.org_id = o.id AND t.is_active = true),
          site_count = (SELECT COUNT(*)::int FROM sites s WHERE s.org_id = o.id)
    `);
    console.log('Done.');
    process.exit(0);
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
