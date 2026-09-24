import pool from '../db';
import { assetStorage } from '../services/assetStorage';
import { imageService, IMAGE_KINDS, IMAGE_TIERS, ImageFolder } from '../services/ImageService';

/**
 * Checks that stored images and the database agree (MEDIA-1). Run it now and then.
 *
 * Reports:
 * - **Unlinked** — files no row references. Normal writes do not leave these (see `StagedImage`),
 *   but a crash between saving a file and writing its row can, and so can data deleted by hand or
 *   a database reset. Only files older than an hour are counted, so an upload in progress is not.
 * - **Missing** — names a row references with some or all of their files absent. These show as
 *   broken images. Nothing here fixes them; the record needs a new picture.
 * - **Stray** — files outside the known layout (e.g. the pre-MEDIA-1 `logos/` and `profiles/`
 *   folders; `npm run assets:migrate` moves those).
 *
 * Run: `npm run assets:audit`. Add `-- --delete-unlinked` to delete the unlinked files.
 */

const DELETE_UNLINKED = process.argv.includes('--delete-unlinked');
const MIN_AGE_MS = 60 * 60 * 1000;
const FILE_NAME = /^(.+)_(large|medium|thumb)\.webp$/;

async function main() {
    const known = new Set<string>();
    let problems = 0;

    for (const folder of Object.keys(IMAGE_KINDS) as ImageFolder[]) {
        const dir = IMAGE_KINDS[folder].dir;
        const referenced = await imageService.referencedNames(folder);
        const files = await assetStorage.list(`${dir}/`);
        const onDisk = new Map<string, { tiers: Set<string>; newest: Date }>();

        for (const file of files) {
            known.add(file.key);
            const match = file.key.slice(dir.length + 1).match(FILE_NAME);
            if (!match) {
                console.log(`stray      ${file.key}`);
                problems++;
                continue;
            }
            const entry = onDisk.get(match[1]) ?? { tiers: new Set(), newest: file.modifiedAt };
            entry.tiers.add(match[2]);
            if (file.modifiedAt > entry.newest) entry.newest = file.modifiedAt;
            onDisk.set(match[1], entry);
        }

        const unlinked = [...onDisk].filter(([name, e]) =>
            !referenced.has(name) && Date.now() - e.newest.getTime() > MIN_AGE_MS
        );
        for (const [name] of unlinked) {
            console.log(`unlinked   ${dir}/${name}`);
            if (DELETE_UNLINKED) await imageService.release(folder, name);
        }
        problems += unlinked.length;

        let missing = 0;
        for (const name of referenced) {
            const tiers = onDisk.get(name)?.tiers ?? new Set();
            const absent = IMAGE_TIERS.filter(t => !tiers.has(t));
            if (absent.length) {
                console.log(`missing    ${dir}/${name} (${absent.join(', ')})`);
                missing++;
            }
        }
        problems += missing;

        console.log(`${dir}: ${onDisk.size} image(s) stored, ${referenced.size} referenced, ${unlinked.length} unlinked, ${missing} missing`);
    }

    // Anything else under the storage root is outside the layout.
    for (const file of await assetStorage.list('')) {
        if (!known.has(file.key)) {
            console.log(`stray      ${file.key}`);
            problems++;
        }
    }

    if (DELETE_UNLINKED) console.log('Unlinked images were deleted (each re-checked for references first).');
    console.log(problems ? `${problems} problem(s) found.` : 'Storage and database agree.');
    if (problems && !DELETE_UNLINKED) process.exitCode = 1;
}

main()
    .catch(err => { console.error('Audit failed:', err); process.exitCode = 1; })
    .finally(() => pool.end());
