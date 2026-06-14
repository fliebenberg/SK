import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const runMigrations = async () => {
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        console.error('Migrations directory not found:', migrationsDir);
        process.exit(1);
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.ts'))
        .sort((a, b) => {
            return a.localeCompare(b);
        });

    console.log(`Found ${files.length} migrations to process.`);

    for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        console.log(`\n==========================================`);
        console.log(`Running migration: ${file}`);
        console.log(`==========================================`);
        try {
            // Run each migration script as a separate process using ts-node
            execSync(`npx ts-node "src/scripts/migrations/${file}"`, {
                cwd: path.join(__dirname, '../..'),
                stdio: 'inherit'
            });
        } catch (error) {
            console.error(`Migration ${file} failed! Stopping run.`);
            process.exit(1);
        }
    }

    console.log('\nAll migrations completed successfully.');
};

runMigrations();
