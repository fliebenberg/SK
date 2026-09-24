import pool from '../../db';
import { deleteFixtureData, loadTestOrgs, printCounts } from './fixtures/loadTestOrgs';

/**
 * `npm run db:test-orgs` — puts the test organisations back exactly as `fixtures/testOrgs.ts`
 * describes them, in whichever database `DB_NAME` names, without touching anything else.
 *
 * Deletes every `fx-` row and whatever was built on them through the app (events a test org
 * hosted, games its teams played, a membership a test account took elsewhere), then loads the
 * dataset again. One transaction: if the load fails, the old test data is still there.
 */
const resetTestOrgs = async () => {
    console.log(`Resetting the test organisations in "${process.env.DB_NAME}"...`);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        printCounts('Removed', await deleteFixtureData(client));
        printCounts('Loaded', await loadTestOrgs(client));
        await client.query('COMMIT');
        console.log('Test organisations reset.');
        console.log('If the server is running, restart it so its caches reload.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error resetting the test organisations:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
};

resetTestOrgs();
