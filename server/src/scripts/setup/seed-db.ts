import pool from '../../db';
import { seedCore } from './seedCore';
import { deleteFixtureData, loadTestOrgs, printCounts } from './fixtures/loadTestOrgs';

/**
 * `npm run db:seed` — the core tier, then the test organisations.
 * `npm run db:seed:core` — the core tier only. What a production install runs.
 *
 * The test organisations are the development data (`fixtures/testOrgs.ts`). They are never
 * loaded when `NODE_ENV=production`, and they replace themselves on every run: whatever an
 * earlier run or the app left under the `fx-` ids is deleted first.
 */
const coreOnly = process.argv.includes('--core-only');

const seedDb = async () => {
    const isProduction = process.env.NODE_ENV === 'production';
    console.log(`Seeding database "${process.env.DB_NAME}" (${process.env.NODE_ENV || 'development'})...`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await seedCore(client);
        console.log('Core data seeded.');

        if (coreOnly) {
            console.log('Core only: test organisations skipped.');
        } else if (isProduction) {
            console.log('Production: test organisations skipped.');
        } else {
            printCounts('Removed previous test data', await deleteFixtureData(client));
            printCounts('Loaded test organisations', await loadTestOrgs(client));
        }

        await client.query('COMMIT');
        console.log('Database seeded successfully.');
        console.log('If the server is running, restart it so its caches reload.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error seeding database:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
};

seedDb();
