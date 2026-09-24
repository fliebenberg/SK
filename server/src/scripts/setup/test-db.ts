import { spawnSync } from 'child_process';
import * as path from 'path';
import dotenv from 'dotenv';
import { Client } from 'pg';

/**
 * `npm run db:test:setup` — builds the test database from nothing: create it if missing, drop its
 * schema, `init-db`, then `seed-db` (core + test organisations). Every run gives the same database.
 *
 * The test database is named by `DB_TEST_NAME` (default `sk_test`) and uses the same server and
 * credentials as `DB_NAME`. It refuses to run when the two names match, because the first step
 * wipes the schema.
 *
 * To point the server at it: `$env:DB_NAME='sk_test'; npm run dev` (PowerShell) or
 * `DB_NAME=sk_test npm run dev` (bash). dotenv never overrides a variable already set.
 */
const serverDir = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(serverDir, '.env') });

const testDb = process.env.DB_TEST_NAME || 'sk_test';

const run = (script: string) => {
    console.log(`\n> ${script} (${testDb})`);
    const result = spawnSync(process.execPath, ['-r', 'ts-node/register', path.join(__dirname, script)], {
        cwd: serverDir,
        stdio: 'inherit',
        env: { ...process.env, DB_NAME: testDb },
    });
    if (result.status !== 0) throw new Error(`${script} failed against ${testDb}.`);
};

const setupTestDb = async () => {
    if (!/^[a-z0-9_]+$/.test(testDb)) throw new Error(`DB_TEST_NAME "${testDb}" must be lowercase letters, digits and underscores.`);
    if (testDb === process.env.DB_NAME) {
        throw new Error(`DB_TEST_NAME and DB_NAME are both "${testDb}". Refusing to wipe the development database.`);
    }

    const admin = new Client({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        database: 'postgres',
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
    });
    await admin.connect();
    try {
        const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDb]);
        if (exists.rowCount === 0) {
            console.log(`Creating database ${testDb}...`);
            await admin.query(`CREATE DATABASE ${testDb}`);
        }
    } finally {
        await admin.end();
    }

    run('reset-db.ts');
    run('init-db.ts');
    run('seed-db.ts');
    console.log(`\nTest database ${testDb} is ready.`);
};

setupTestDb().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
