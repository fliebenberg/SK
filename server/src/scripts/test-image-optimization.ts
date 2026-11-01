import sharp from 'sharp';
import { imageService, IMAGE_TIERS, UploadError, UPLOAD_RULES } from '../services/ImageService';
import { assetStorage } from '../services/assetStorage';
import { issueAssetToken, verifyAssetToken } from '../services/assetAccess';
import pool from '../db';
import fs from 'fs/promises';
import path from 'path';

/**
 * Exercises image storage (MEDIA-1) and uploads: what an upload must be, metadata removal, tiers
 * written to the right area, claiming an upload by saving it, discarding and sweeping unsaved ones,
 * name reduction, and the asset token. Touches only the files and `pending_uploads` rows it creates;
 * it needs two users in the database to upload as.
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

const picture = (width: number, height: number, format: 'png' | 'jpeg' | 'webp' | 'gif' = 'png') =>
    sharp({ create: { width, height, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 0.5 } } })
        .toFormat(format)
        .toBuffer();

async function refused(label: string, attempt: () => Promise<unknown>) {
    try {
        await attempt();
        check(false, `${label} (was accepted)`);
    } catch (err) {
        check(err instanceof UploadError, `${label}: "${(err as Error).message}"`);
    }
}

const isPending = async (name: string) =>
    !!(await pool.query('SELECT 1 FROM pending_uploads WHERE name = $1', [name])).rowCount;

async function runTest() {
    const users = (await pool.query('SELECT id FROM users ORDER BY id LIMIT 2')).rows.map(r => r.id as string);
    if (users.length < 2) throw new Error('This test needs two users in the database.');
    const [me, someoneElse] = users;

    // What an upload must be.
    const logo = await imageService.upload('logos', await picture(64, 64), me);
    check(/^logo-[A-Za-z0-9_-]+-\d+-[0-9a-f]{24}$/.test(logo), `logo name is unguessable: ${logo}`);
    check((await tierFilesExist('logos', logo)).every(Boolean), 'logo tiers written under public/logos');
    check(await isPending(logo), 'an upload is unsaved until a save claims it');

    const photo = await imageService.upload('profiles', await picture(300, 301, 'jpeg'), me);
    check((await tierFilesExist('profiles', photo)).every(Boolean), 'photo tiers written under secure/profiles (one pixel off square is allowed)');
    check(!!(await imageService.upload('profiles', await picture(64, 64, 'webp'), me)), 'WebP is accepted');

    await refused('a picture that is not square is refused', async () => imageService.upload('logos', await picture(200, 100), me));
    await refused('a picture over the size limit is refused', async () => imageService.upload('logos', await picture(UPLOAD_RULES.maxSide + 1, UPLOAD_RULES.maxSide + 1), me));
    await refused('a GIF is refused', async () => imageService.upload('logos', await picture(64, 64, 'gif'), me));
    await refused('a file that is not a picture is refused', () => imageService.upload('logos', Buffer.from('not a picture'), me));
    await refused('a picture sent inline is refused', () => imageService.stage('logos', 'data:image/png;base64,iVBORw0KGgo='));

    // Metadata goes unless the kind may keep it — and no kind may yet.
    const withGps = await sharp(await picture(64, 64, 'jpeg'))
        .withExif({ IFD0: { Make: 'TestCam' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '25/1 45/1 0/1' } })
        .toBuffer();
    check(!!(await sharp(withGps).metadata()).exif, 'the test picture carries EXIF');
    const stripped = await imageService.upload('profiles', withGps, me, { keepMetadata: true });
    const stored = await fs.readFile(path.join(assetStorage.localRoot!, imageService.keyFor('profiles', stripped, 'large')));
    check(!(await sharp(stored).metadata()).exif, 'a person\'s picture loses its metadata even when the upload asks to keep it');

    // A save claims its upload: the pending row goes, the files stay.
    const staged = await imageService.stage('logos', logo);
    check(staged.value === logo, 'staging an upload stores its name');
    await staged.commit(null);
    check(!(await isPending(logo)), 'saving claims the upload');
    check((await tierFilesExist('logos', logo)).every(Boolean), 'and keeps its files');

    await refused('an upload cannot be saved as another kind', () => imageService.stage('logos', photo));

    // A failed save keeps the upload, so the person can try again.
    const retry = await imageService.stage('profiles', photo);
    await retry.discard();
    check(await isPending(photo) && (await tierFilesExist('profiles', photo)).every(Boolean), 'a failed save keeps its upload');

    // Only the uploader can discard an unsaved upload, and never a saved one.
    check(!(await imageService.discardUpload(photo, someoneElse)), 'someone else cannot discard my upload');
    check((await tierFilesExist('profiles', photo)).every(Boolean), 'so its files stay');
    check(await imageService.discardUpload(photo, me), 'the uploader can');
    check((await tierFilesExist('profiles', photo)).every(e => !e), 'which deletes its files');
    check(!(await imageService.discardUpload(logo, me)), 'a saved image cannot be discarded as an upload');
    check(!(await imageService.discardUpload('../../etc/passwd', me)), 'a name that is not an upload name is ignored');

    // The sweep deletes old unsaved uploads.
    const forgotten = await imageService.upload('logos', await picture(64, 64), me);
    await pool.query(`UPDATE pending_uploads SET created_at = NOW() - INTERVAL '25 hours' WHERE name = $1`, [forgotten]);
    const fresh = await imageService.upload('logos', await picture(64, 64), me);
    await imageService.sweepPendingUploads();
    check(!(await isPending(forgotten)) && (await tierFilesExist('logos', forgotten)).every(e => !e), 'the sweep deletes an upload left unsaved for a day');
    check(await isPending(fresh), 'and leaves a recent one');

    // After a successful write, the previous image is released — deleted, as no row references it.
    const replacement = await imageService.stage('logos', fresh);
    await replacement.commit(logo);
    check((await tierFilesExist('logos', logo)).every(e => !e), 'commit releases the unreferenced previous image');

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
    check((await imageService.stage('logos', undefined)).value === undefined, 'undefined means no change');
    check((await imageService.stage('logos', '')).value === null, 'empty means clear');

    // A display URL sent back by a client reduces to the stored name, whatever host built it.
    const name = fresh;
    for (const url of [
        `http://localhost:3001/uploads/public/logos/${name}_medium.webp`,
        `https://cdn.example.com/sk/public/logos/${name}_thumb.webp?t=abc`,
        name,
    ]) {
        check(imageService.toStoredName(url, 'logos') === name, `${url.slice(0, 60)}… -> stored name`);
    }

    // Clean up everything this test made.
    const mine = (await pool.query(`SELECT name, kind FROM pending_uploads WHERE uploaded_by = $1`, [me])).rows;
    for (const row of mine) await imageService.discardUpload(row.name, me);
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
