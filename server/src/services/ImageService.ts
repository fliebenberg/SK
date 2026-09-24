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
export const IMAGE_KINDS: Record<ImageFolder, { dir: string; prefix: string; columns: Array<[table: string, column: string]> }> = {
    logos: {
        dir: 'public/logos',
        prefix: 'logo',
        columns: [['organizations', 'logo'], ['leagues', 'logo'], ['seasons', 'logo']],
    },
    profiles: {
        dir: 'secure/profiles',
        prefix: 'profile',
        columns: [['users', 'custom_image'], ['users', 'image'], ['org_profiles', 'image']],
    },
};

export const IMAGE_TIERS = ['large', 'medium', 'thumb'] as const;

const TIER_SIZES: Record<(typeof IMAGE_TIERS)[number], number> = { large: 1024, medium: 256, thumb: 64 };

/** A stored name: ours, rather than an external URL or an unsaved upload. */
function isStoredName(value: string | null | undefined): value is string {
    return !!value && !/^[a-z][a-z0-9+.-]*:/i.test(value);
}

/**
 * An image value on its way into the database, from `ImageService.stage`.
 *
 * The protocol that keeps storage and database in step:
 *
 *     const image = await imageService.stage('logos', incoming, id);   // writes any upload
 *     try { ...database write using image.value... }
 *     catch (e) { await image.discard(); throw e; }                     // nothing links to it
 *     await image.commit(previousValue);                                // old image now unused?
 *
 * Files are written before the row and deleted only after it, so a failure at any step leaves at
 * worst an unlinked file — never a row pointing at a missing one. The audit script finds those.
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
     * Turns an incoming image value into the one to store, writing an upload to storage.
     *
     * `undefined` means the field is not being changed; `''` or `null` clears it; a `data:` URI is a
     * new upload; anything else is an existing value sent back (reduced to its stored name).
     */
    async stage(folder: ImageFolder, incoming: string | null | undefined, ownerId: string): Promise<StagedImage> {
        let value: string | null | undefined;
        let written: string | null = null;

        if (incoming === undefined) {
            value = undefined;
        } else if (!incoming) {
            value = null;
        } else if (incoming.startsWith('data:image')) {
            written = await this.processImage(folder, ownerId, incoming);
            value = written;
        } else {
            value = this.toStoredName(incoming, folder);
        }

        return {
            value,
            discard: async () => {
                if (written) await this.deleteFiles(folder, written);
            },
            commit: async (previous) => {
                if (value !== undefined && previous && previous !== value) {
                    await this.release(folder, previous);
                }
            },
        };
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

    /**
     * Saves an upload in 3 tiers (large, medium, thumb) as WebP.
     * @returns The base name. Its random part makes it unguessable, which `secure/` relies on.
     */
    private async processImage(folder: ImageFolder, ownerId: string, base64: string): Promise<string> {
        // Remove data:image/...;base64, prefix if present
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const name = `${IMAGE_KINDS[folder].prefix}-${ownerId}-${Date.now()}-${crypto.randomBytes(12).toString('hex')}`;

        try {
            for (const tier of IMAGE_TIERS) {
                const data = await sharp(buffer)
                    .resize(TIER_SIZES[tier], TIER_SIZES[tier], {
                        fit: 'cover',
                        withoutEnlargement: true
                    })
                    .webp({ quality: 80 })
                    .toBuffer();
                await assetStorage.write(this.keyFor(folder, name, tier), data);
            }
        } catch (err) {
            // A half-written set is no use to anyone.
            await this.deleteFiles(folder, name);
            throw err;
        }

        return name;
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
