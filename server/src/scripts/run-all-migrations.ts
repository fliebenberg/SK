import * as fs from 'fs';
import * as path from 'path';
import pool from '../db';

const runMigrations = async () => {
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        console.error('Migrations directory not found:', migrationsDir);
        process.exit(1);
    }

    const client = await pool.connect();

    try {
        // 1. Ensure schema_migrations table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name VARCHAR(255) PRIMARY KEY,
                executed_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        // 2. Fetch already executed migration names
        const res = await client.query('SELECT name FROM schema_migrations;');
        const executedMigrations = new Set<string>(res.rows.map((r: { name: string }) => r.name));

        // 3. Get all migration script files sorted alphabetically
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
            .sort((a, b) => a.localeCompare(b));

        const pendingFiles = files.filter(f => !executedMigrations.has(f));

        if (pendingFiles.length === 0) {
            console.log('No pending database migrations. Database is up to date.');
            client.release();
            await pool.end();
            process.exit(0);
        }

        console.log(`Found ${pendingFiles.length} pending migration(s) out of ${files.length} total.`);

        for (const file of pendingFiles) {
            const filePath = path.join(migrationsDir, file);
            console.log(`\n==========================================`);
            console.log(`Executing migration: ${file}`);
            console.log(`==========================================`);

            try {
                await client.query('BEGIN');

                // Dynamically load the migration module
                const migrationModule = require(filePath);
                const migrationFn = migrationModule.up || migrationModule.default;

                if (typeof migrationFn !== 'function') {
                    throw new Error(`Migration ${file} does not export an 'up' or default async function.`);
                }

                // Execute migration within transaction
                await migrationFn(client);

                // Record successful execution
                await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);

                await client.query('COMMIT');
                console.log(`[SUCCESS] Completed migration: ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`[FAILURE] Migration ${file} failed! Transaction rolled back.`);
                console.error(err);
                client.release();
                await pool.end();
                process.exit(1);
            }
        }

        console.log('\nAll pending migrations completed successfully.');
    } catch (err) {
        console.error('Fatal error during migration processing:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

runMigrations();

