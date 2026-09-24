import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import pool from '../db';
import { assetStorage } from '../services/assetStorage';
import { IMAGE_KINDS, IMAGE_TIERS, ImageFolder } from '../services/ImageService';

/**
 * One-off move to the public/secure image layout (MEDIA-1). Safe to run more than once.
 *
 * 1. Moves `logos/*` to `public/logos/` and `profiles/*` to `secure/profiles/`. Rows store base
 *    names, not paths, so no data changes for this step.
 * 2. Renames people's pictures whose names are guessable (`profile-{id}-{timestamp}`, from before
 *    names carried a random part), and updates every column that holds them. Files are copied
 *    first, rows updated in one transaction, and old files deleted last — so a failure leaves at
 *    worst an unlinked file, which `npm run assets:audit` reports.
 *
 * Dry run by default. Run: `npm run assets:migrate` to see the plan, then `-- --apply` to do it.
 * Run it with the server stopped, or during a quiet period: a picture uploaded mid-run is not lost,
 * but may keep its old name until the next run.
 */

const APPLY = process.argv.includes('--apply');
const OLD_DIRS: Record<ImageFolder, string> = { logos: 'logos', profiles: 'profiles' };
const RANDOM_SUFFIX = /-[0-9a-f]{24}$/;

async function exists(p: string) {
    return fs.access(p).then(() => true, () => false);
}

async function moveLayout(root: string) {
    for (const folder of Object.keys(OLD_DIRS) as ImageFolder[]) {
        const from = path.join(root, OLD_DIRS[folder]);
        if (!(await exists(from))) continue;
        const to = path.join(root, IMAGE_KINDS[folder].dir);
        const files = (await fs.readdir(from, { withFileTypes: true })).filter(e => e.isFile());
        console.log(`${OLD_DIRS[folder]}/ -> ${IMAGE_KINDS[folder].dir}/: ${files.length} file(s)`);
        if (!APPLY) continue;
        await fs.mkdir(to, { recursive: true });
        for (const file of files) {
            const target = path.join(to, file.name);
            if (await exists(target)) {
                console.warn(`  kept both: ${file.name} already exists in the new layout`);
                continue;
            }
            await fs.rename(path.join(from, file.name), target);
        }
        // Removed only when empty, so nothing unexpected is lost.
        await fs.rmdir(from).catch(() => console.warn(`  left ${from} in place: not empty`));
    }
}

async function renameGuessableProfiles(root: string) {
    const kind = IMAGE_KINDS.profiles;
    const names = new Set<string>();
    for (const [table, column] of kind.columns) {
        const res = await pool.query(`SELECT DISTINCT ${column} AS name FROM ${table} WHERE ${column} LIKE 'profile-%'`);
        for (const row of res.rows) if (!RANDOM_SUFFIX.test(row.name)) names.add(row.name);
    }
    console.log(`guessable profile picture names: ${names.size}`);
    if (!APPLY) return;

    for (const oldName of names) {
        const newName = `${oldName}-${crypto.randomBytes(12).toString('hex')}`;
        const tierPath = (name: string, tier: string) => path.join(root, kind.dir, `${name}_${tier}.webp`);

        const present = [];
        for (const tier of IMAGE_TIERS) {
            if (await exists(tierPath(oldName, tier))) {
                await fs.copyFile(tierPath(oldName, tier), tierPath(newName, tier));
                present.push(tier);
            }
        }
        if (present.length === 0) {
            console.warn(`  ${oldName}: no files found — left as is (the audit reports it as missing)`);
            continue;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const [table, column] of kind.columns) {
                await client.query(`UPDATE ${table} SET ${column} = $1 WHERE ${column} = $2`, [newName, oldName]);
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            for (const tier of present) await fs.unlink(tierPath(newName, tier)).catch(() => {});
            throw err;
        } finally {
            client.release();
        }

        for (const tier of present) await fs.unlink(tierPath(oldName, tier)).catch(() => {});
        console.log(`  ${oldName} -> ${newName}`);
    }
}

async function main() {
    const root = assetStorage.localRoot;
    if (!root) throw new Error('This migration only applies to local storage (ASSET_STORAGE=local).');
    console.log(`${APPLY ? 'Applying' : 'Dry run (pass --apply to make changes)'} in ${root}`);
    await moveLayout(root);
    await renameGuessableProfiles(root);
    console.log('Done. Run `npm run assets:audit` to check the result.');
}

main()
    .catch(err => { console.error('Migration failed:', err); process.exitCode = 1; })
    .finally(() => pool.end());
