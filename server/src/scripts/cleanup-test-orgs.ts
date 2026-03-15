import { query } from '../db';
import { TEST_ORG_ID_PATTERNS, APP_TEST_ORG_ID } from '../../../shared/src/constants/TestConstants';

async function cleanupTestOrgs() {
    console.log('--- Starting Test Organization Cleanup ---');

    try {
        // 1. Find all organization IDs that match test patterns
        const orgsRes = await query(`
            SELECT id, name FROM organizations 
            WHERE id LIKE ANY($1) 
               OR id = $2
        `, [TEST_ORG_ID_PATTERNS.map(p => `${p}%`), APP_TEST_ORG_ID]);

        const orgIds = orgsRes.rows.map(r => r.id);
        
        if (orgIds.length === 0) {
            console.log('No test organizations found.');
            return;
        }

        console.log(`Found ${orgIds.length} test organizations to clean up.`);

        for (const orgId of orgIds) {
            console.log(`Cleaning up organization: ${orgId}`);

            // The order is important due to foreign key constraints
            
            // Delete Game Events (if they exist)
            // Note: Game events are often linked to games
            // Since we don't have a direct org link for game events in some schemas, we find games first
            const gamesRes = await query('SELECT id FROM games WHERE event_id IN (SELECT id FROM events WHERE org_id = $1 OR $1 = ANY(participating_org_ids))', [orgId]);
            const gameIds = gamesRes.rows.map(g => g.id);
            
            if (gameIds.length > 0) {
                await query('DELETE FROM game_events WHERE game_id = ANY($1)', [gameIds]);
                await query('DELETE FROM games WHERE id = ANY($1)', [gameIds]);
            }

            // Delete Events
            await query('DELETE FROM events WHERE org_id = $1 OR $1 = ANY(participating_org_ids)', [orgId]);

            // Delete Team Memberships
            await query('DELETE FROM team_memberships WHERE team_id IN (SELECT id FROM teams WHERE org_id = $1)', [orgId]);
            
            // Delete Teams
            await query('DELETE FROM teams WHERE org_id = $1', [orgId]);

            // Delete Facility Links manually if needed, but sites usually cascade if set up
            // To be safe:
            await query('DELETE FROM facilities WHERE site_id IN (SELECT id FROM sites WHERE org_id = $1)', [orgId]);
            await query('DELETE FROM sites WHERE org_id = $1', [orgId]);

            // Delete Organization Memberships
            await query('DELETE FROM org_memberships WHERE org_id = $1', [orgId]);

            // Delete Organization
            await query('DELETE FROM organizations WHERE id = $1', [orgId]);
            
            console.log(`Successfully deleted ${orgId}`);
        }

        console.log('--- Cleanup Complete ---');
    } catch (error) {
        console.error('Error during cleanup:', error);
    } finally {
        process.exit(0);
    }
}

cleanupTestOrgs();
