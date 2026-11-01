import sharp from 'sharp';
import crypto from 'crypto';
import { assetStorage } from './assetStorage';
import { query } from '../db';

/** The kinds of uploaded image. Clients build the same paths in expo-app/services/assets.ts. */
export type ImageFolder = 'logos' | 'profiles';

/**
 * Where each kind is stored, and every column that may hold one of its names.
 *
 * The kind — and so the area — is decided by the column, never by the name: a value in a `logo`
 * column is always a public logo. `public/` is served to anyone; `secure/` needs an asset token
 * (see assetAccess.ts). Add a column here when a new table stores an image, or `release` will delete
 * files that table still uses and the audit script will report its images as unlinked.
 */
export const IMAGE_KINDS: Record<ImageFolder, {
    dir: string;
    prefix: string;
    columns: Array<[table: string, column: string]>;
    /** WebP quality of the stored tiers. Logos are mostly lettering and hard edges, which blur at 80. */
    quality: number;
    /**
     * Whether an upload of this kind may keep its metadata (camera, time, GPS) when it asks to. When
     * false, metadata is always removed, whatever the client sends: a person's picture must never
     * carry where it was taken.
     */
    mayKeepMetadata: boolean;
}> = {
    logos: {
        dir: 'public/logos',
        prefix: 'logo',
        columns: [['organizations', 'logo'], ['leagues', 'logo'], ['seasons', 'logo']],
        quality: 90,
        mayKeepMetadata: false,
    },
    profiles: {
        dir: 'secure/profiles',
        prefix: 'profile',
        columns: [['users', 'custom_image'], ['users', 'image'], ['org_profiles', 'image']],
        quality: 80,
        mayKeepMetadata: false,
    },
};

export function isImageFolder(value: unknown): value is ImageFolder {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(IMAGE_KINDS, value);
}

/**
 * What an upload must be. The app crops and shrinks a picture before sending it (see
 * expo-app/components/images/), so these are checks, not processing: anything else is refused.
 */
export const UPLOAD_RULES = {
    formats: ['jpeg', 'png', 'webp'] as const,
    maxBytes: 5 * 1024 * 1024,
    maxSide: 1024,
    minSide: 16,
    /** Unsaved uploads one person may hold at once. */
    maxPendingPerUser: 20,
    /** How long an unsaved upload lives before the sweep deletes it. */
    pendingLifetimeMs: 24 * 3600e3,
};

/** An upload that breaks a rule. Its message is meant for the person uploading. */
export class UploadError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

export const IMAGE_TIERS = ['large', 'medium', 'thumb'] as const;

const TIER_SIZES: Record<(typeof IMAGE_TIERS)[number], number> = { large: 1024, medium: 256, thumb: 64 };

/** Upload names are made only by `newName`, so anything else is not one. */
const UPLOAD_NAME = /^[a-z]+-[A-Za-z0-9_-]+-\d+-[0-9a-f]{24}$/;

/** A stored name: ours, rather than an external URL or an unsaved upload. */
function isStoredName(value: string | null | undefined): value is string {
    return !!value && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

/**
 * An image value on its way into the database, from `ImageService.stage`.
 *
 * The protocol that keeps storage and database in step:
 *
 *     const image = await imageService.stage('logos', incoming);   // checks any upload it names
 *     try { ...database write using image.value... }
 *     catch (e) { await image.discard(); throw e; }
 *     await image.commit(previousValue);   // claims the upload; old image now unused?
 *
 * Files are written (by `upload`) before the row and deleted only after it, so a failure at any step
 * leaves at worst an unlinked file — never a row pointing at a missing one. An unsaved upload is
 * deleted when its uploader leaves without saving, or by the sweep; the audit script finds the rest.
 */
export interface StagedImage {
    /** What to write to the column: `undefined` leaves it alone, `null` clears it. */
    value: string | null | undefined;
    /** Call when the database write failed: removes files this stage wrote. */
    discard(): Promise<void>;
    /** Call after the database write succeeded: releases the image the row held before. */
    commit(previous: string | null | undefined): Promise<void>;
}

export class ImageService {
    /**
     * Turns an incoming image value into the one to store.
     *
     * `undefined` means the field is not being changed; `''` or `null` clears it; the name of an
     * unsaved upload (from `upload`) is claimed by this save; anything else is an existing value
     * sent back (reduced to its stored name). Pictures are never sent inline: a `data:` URI is
     * refused, so no message carries an image.
     */
    async stage(folder: ImageFolder, incoming: string | null | undefined): Promise<StagedImage> {
        let value: string | null | undefined;
        let claimed = false;

        if (incoming === undefined) {
            value = undefined;
        } else if (!incoming) {
            value = null;
        } else if (incoming.startsWith('data:')) {
            throw new UploadError('Pictures are uploaded on their own now. Choose the picture again.');
        } else {
            value = this.toStoredName(incoming, folder);
            const pending = await query('SELECT kind FROM pending_uploads WHERE name = $1', [value]);
            if (pending.rowCount) {
                if (pending.rows[0].kind !== folder) {
                    throw new UploadError('That picture was uploaded for something else. Choose it again.');
                }
                claimed = true;
            }
        }

        return {
            value,
            // A failed save keeps its upload: the person can try again, and leaving the page or the
            // sweep deletes it if they do not.
            discard: async () => {},
            commit: async (previous) => {
                if (claimed) await query('DELETE FROM pending_uploads WHERE name = $1', [value]);
                if (value !== undefined && previous && previous !== value) {
                    await this.release(folder, previous);
                }
            },
        };
    }

    /**
     * Checks and stores an uploaded picture as an unsaved upload, returning its name for a save to
     * claim (`stage`). The picture must already be what the app makes: a square JPEG, PNG or WebP of
     * at most 1024px. Metadata is kept only if asked for and the kind allows it.
     */
    async upload(folder: ImageFolder, source: Buffer, uploadedBy: string, options: { keepMetadata?: boolean } = {}): Promise<string> {
        if (source.length > UPLOAD_RULES.maxBytes) {
            throw new UploadError('That picture is too large to upload. Choose a smaller one.', 413);
        }
        let meta: sharp.Metadata;
        try {
            meta = await sharp(source).metadata();
        } catch {
            throw new UploadError('That file is not a picture we can read. Use a JPEG, PNG or WebP image.');
        }
        if (!(UPLOAD_RULES.formats as readonly string[]).includes(meta.format ?? '')) {
            throw new UploadError('That file is not a picture we can read. Use a JPEG, PNG or WebP image.');
        }
        if ((meta.pages ?? 1) > 1) {
            throw new UploadError('Moving pictures cannot be used here. Choose a still picture.');
        }
        const width = meta.width ?? 0;
        const height = meta.height ?? 0;
        if (Math.abs(width - height) > 1) {
            throw new UploadError('The picture must be square. Crop it again.');
        }
        if (width > UPLOAD_RULES.maxSide || height > UPLOAD_RULES.maxSide) {
            throw new UploadError(`The picture can be at most ${UPLOAD_RULES.maxSide} pixels across. Crop it again.`);
        }
        if (width < UPLOAD_RULES.minSide) {
            throw new UploadError('That picture is too small to use.');
        }

        const pending = await query('SELECT COUNT(*)::int AS n FROM pending_uploads WHERE uploaded_by = $1', [uploadedBy]);
        if (pending.rows[0].n >= UPLOAD_RULES.maxPendingPerUser) {
            throw new UploadError('You have too many pictures waiting to be saved. Save or cancel one first.', 429);
        }

        const name = this.newName(folder, uploadedBy);
        await this.writeTiers(folder, name, source, {
            keepMetadata: !!options.keepMetadata && IMAGE_KINDS[folder].mayKeepMetadata,
        });
        try {
            await query('INSERT INTO pending_uploads (name, kind, uploaded_by) VALUES ($1, $2, $3)', [name, folder, uploadedBy]);
        } catch (err) {
            await this.deleteFiles(folder, name);
            throw err;
        }
        return name;
    }

    /**
     * Deletes an unsaved upload, for the person who uploaded it: when they cancel, replace it or
     * leave without saving. Anything else (a saved image, someone else's upload) is left alone.
     * @returns Whether there was such an upload.
     */
    async discardUpload(name: string, uploadedBy: string): Promise<boolean> {
        if (!UPLOAD_NAME.test(name)) return false;
        const res = await query(
            'DELETE FROM pending_uploads WHERE name = $1 AND uploaded_by = $2 RETURNING kind',
            [name, uploadedBy]
        );
        if (!res.rowCount || !isImageFolder(res.rows[0].kind)) return false;
        await this.release(res.rows[0].kind, name);
        return true;
    }

    /**
     * Deletes uploads nobody saved within `UPLOAD_RULES.pendingLifetimeMs`: a closed app, a lost
     * connection. Files a row uses are kept, in case a save claimed the upload but stopped before
     * it could delete the pending row.
     * @returns How many were swept.
     */
    async sweepPendingUploads(now = Date.now()): Promise<number> {
        const res = await query(
            'DELETE FROM pending_uploads WHERE created_at < $1 RETURNING name, kind',
            [new Date(now - UPLOAD_RULES.pendingLifetimeMs)]
        );
        for (const row of res.rows) {
            if (isImageFolder(row.kind)) await this.release(row.kind, row.name);
        }
        return res.rowCount ?? 0;
    }

    /**
     * Deletes an image's files if no row references it any more. Safe to call with any value:
     * external URLs, empty values and images still in use are left alone.
     */
    async release(folder: ImageFolder, name: string | null | undefined): Promise<void> {
        if (!isStoredName(name)) return;
        if (await this.isReferenced(folder, name)) return;
        await this.deleteFiles(folder, name);
    }

    /** Every stored name of this kind that some row references, for the audit script. */
    async referencedNames(folder: ImageFolder): Promise<Set<string>> {
        const names = new Set<string>();
        for (const [table, column] of IMAGE_KINDS[folder].columns) {
            const res = await query(`SELECT DISTINCT ${column} AS name FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`);
            for (const row of res.rows) if (isStoredName(row.name)) names.add(row.name);
        }
        return names;
    }

    /** Storage key of one tier of an image. */
    keyFor(folder: ImageFolder, name: string, tier: (typeof IMAGE_TIERS)[number]): string {
        return `${IMAGE_KINDS[folder].dir}/${name}_${tier}.webp`;
    }

    /**
     * The base name to store for an image value a client sent back unchanged.
     *
     * Clients should send the base name, but an image URL they built for display — from whatever
     * asset base URL they were given, with or without a query string — is reduced to it too, so a
     * row never pins itself to one asset host. Anything else (an external http URL) is kept as is.
     */
    toStoredName(value: string | undefined | null, folder: ImageFolder): string {
        if (!value) return "";
        const match = value.match(new RegExp(`/${folder}/([^/?#]+?)_(?:large|medium|thumb)\\.\\w+(?:[?#].*)?$`));
        return match ? match[1] : value;
    }

    private async isReferenced(folder: ImageFolder, name: string): Promise<boolean> {
        for (const [table, column] of IMAGE_KINDS[folder].columns) {
            const res = await query(`SELECT 1 FROM ${table} WHERE ${column} = $1 LIMIT 1`, [name]);
            if (res.rowCount) return true;
        }
        return false;
    }

    /** A new stored name. Its random part makes it unguessable, which `secure/` relies on. */
    private newName(folder: ImageFolder, uploadedBy: string): string {
        const owner = uploadedBy.replace(/[^A-Za-z0-9_-]/g, '');
        return `${IMAGE_KINDS[folder].prefix}-${owner}-${Date.now()}-${crypto.randomBytes(12).toString('hex')}`;
    }

    /**
     * Writes an image's tiers (large, medium, thumb) as WebP under `name`, replacing any already
     * there. Uploads go through `upload`; this is public for the test organisations, whose images
     * have fixed names (fixtures/images).
     */
    async writeTiers(folder: ImageFolder, name: string, source: Buffer, options: { keepMetadata?: boolean } = {}): Promise<void> {
        try {
            for (const tier of IMAGE_TIERS) {
                // sharp removes all metadata unless told to keep it; `rotate()` applies any EXIF
                // orientation first, so the picture does not turn sideways when that goes.
                let image = sharp(source).rotate();
                if (options.keepMetadata) image = image.keepMetadata();
                const data = await image
                    .resize(TIER_SIZES[tier], TIER_SIZES[tier], {
                        fit: 'cover',
                        withoutEnlargement: true
                    })
                    .webp({ quality: IMAGE_KINDS[folder].quality })
                    .toBuffer();
                await assetStorage.write(this.keyFor(folder, name, tier), data);
            }
        } catch (err) {
            // A half-written set is no use to anyone.
            await this.deleteFiles(folder, name);
            throw err;
        }
    }

    private async deleteFiles(folder: ImageFolder, name: string) {
        for (const tier of IMAGE_TIERS) {
            const key = this.keyFor(folder, name, tier);
            try {
                await assetStorage.delete(key);
            } catch (err) {
                console.error(`Failed to delete image file: ${key}`, err);
            }
        }
    }
}

export const imageService = new ImageService();
