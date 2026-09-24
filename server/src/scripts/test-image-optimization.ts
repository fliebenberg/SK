import { imageService, IMAGE_TIERS } from '../services/ImageService';
import { assetStorage } from '../services/assetStorage';
import { issueAssetToken, verifyAssetToken } from '../services/assetAccess';
import pool from '../db';
import fs from 'fs/promises';
import path from 'path';

/**
 * Exercises image storage (MEDIA-1): tiers written to the right area, the stage/discard/commit
 * protocol, name reduction, and the asset token. Touches only files it creates itself; the database
 * is read, never written.
 *
 * Run: `npx ts-node src/scripts/test-image-optimization.ts` (from server/).
 */

let failures = 0;
function check(ok: boolean, label: string) {
    console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}`);
    if (!ok) failures++;
}

async function tierFilesExist(folder: 'logos' | 'profiles', name: string): Promise<boolean[]> {
    if (!assetStorage.localRoot) throw new Error('This test reads files back from local storage (ASSET_STORAGE=local).');
    return Promise.all(IMAGE_TIERS.map(tier =>
        fs.access(path.join(assetStorage.localRoot!, imageService.keyFor(folder, name, tier))).then(() => true, () => false)
    ));
}

async function runTest() {
    // A tiny 1x1 transparent base64 GIF
    const sampleBase64 = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    // Logos go to public/, people's pictures to secure/, each with an unguessable name.
    const logo = await imageService.stage('logos', sampleBase64, 'test-org');
    check(typeof logo.value === 'string' && /^logo-test-org-\d+-[0-9a-f]{24}$/.test(logo.value), `logo name is unguessable: ${logo.value}`);
    check((await tierFilesExist('logos', logo.value!)).every(Boolean), 'logo tiers written under public/logos');

    const photo = await imageService.stage('profiles', sampleBase64, 'test-person');
    check((await tierFilesExist('profiles', photo.value!)).every(Boolean), 'photo tiers written under secure/profiles');

    // A failed database write discards what was staged.
    await photo.discard();
    check((await tierFilesExist('profiles', photo.value!)).every(e => !e), 'discard removes a staged upload');

    // After a successful write, the previous image is released — deleted, as no row references it.
    const replacement = await imageService.stage('logos', sampleBase64, 'test-org');
    await replacement.commit(logo.value);
    check((await tierFilesExist('logos', logo.value!)).every(e => !e), 'commit releases the unreferenced previous image');

    // An image a row still references is never released.
    let keptChecked = false;
    for (const folder of ['logos', 'profiles'] as const) {
        const inUse = [...await imageService.referencedNames(folder)][0];
        if (!inUse) continue;
        const before = await tierFilesExist(folder, inUse);
        await imageService.release(folder, inUse);
        const after = await tierFilesExist(folder, inUse);
        check(before.every((e, i) => e === after[i]), `a referenced image is kept (${folder}: ${inUse})`);
        keptChecked = true;
        break;
    }
    if (!keptChecked) console.log('[SKIP] no image is referenced in this database, so the keep-if-referenced check has nothing to test');

    // Values that are not ours are left alone, and staging "no change" writes nothing.
    await imageService.release('profiles', 'https://lh3.googleusercontent.com/a/photo');
    check((await imageService.stage('logos', undefined, 'x')).value === undefined, 'undefined means no change');
    check((await imageService.stage('logos', '', 'x')).value === null, 'empty means clear');

    // A display URL sent back by a client reduces to the stored name, whatever host built it.
    const name = replacement.value!;
    for (const url of [
        `http://localhost:3001/uploads/public/logos/${name}_medium.webp`,
        `https://cdn.example.com/sk/public/logos/${name}_thumb.webp?t=abc`,
        name,
    ]) {
        check(imageService.toStoredName(url, 'logos') === name, `${url.slice(0, 60)}… -> stored name`);
    }
    await imageService.release('logos', name);

    // The asset token.
    const now = Date.now();
    const { token, expiresAt } = issueAssetToken('user-123', now);
    check(verifyAssetToken(token, now) === 'user-123', 'a fresh token verifies to its user');
    check(expiresAt - now >= 24 * 3600e3 && expiresAt - now <= 36 * 3600e3, 'a token lasts 24–36 hours');
    check(issueAssetToken('user-123', now + 60e3).token === token, 'tokens are stable within a window');
    check(verifyAssetToken(token, expiresAt) === null, 'an expired token is refused');
    const parts = token.split('.');
    const forged = [parts[0], String(expiresAt + 86400e3), parts[2], parts[3]].join('.');
    check(verifyAssetToken(forged, now) === null, 'a token with an altered expiry is refused');
    check(verifyAssetToken(undefined, now) === null && verifyAssetToken('junk', now) === null, 'missing or malformed tokens are refused');

    console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
}

runTest()
    .catch(err => { console.error('Test failed with error:', err); failures++; })
    .finally(async () => { await pool.end(); process.exit(failures ? 1 : 0); });
