import path from 'path';
import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import dotenv from 'dotenv';

// Ensure env vars are loaded: this module is created on import, before index.ts calls dotenv.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Where uploaded files (logos, profile pictures) are kept, and where clients fetch them from (MEDIA-1).
 *
 * Both are configuration so the files can later move to a different machine, bucket or CDN without
 * touching the code that writes them or the database that names them. Rows store a base name
 * (`logo-{id}-{ts}`), never a URL, so moving the files needs no data migration.
 *
 * - `ASSET_STORAGE` — the backend. Only `local` exists; add another implementation of
 *   `AssetStorage` (e.g. S3-compatible) when the files move.
 * - `ASSET_LOCAL_DIR` — the folder `local` writes to. Relative paths resolve against the server
 *   package, not the directory the process was started from. Default `public/uploads`.
 * - `ASSET_BASE_URL` — the URL clients fetch files from, announced to them by `GET /api/client-config`.
 *   A path (default `/uploads`) means this API serves the files itself from that path; a full URL
 *   means another server does, and this one does not serve them at all.
 */
export interface AssetStorage {
  /** Writes a file at `key`, a slash-separated path such as `logos/logo-x_thumb.webp`. */
  write(key: string, data: Buffer): Promise<void>;
  /** Deletes the file at `key`. A missing file is not an error. */
  delete(key: string): Promise<void>;
  /** Every file under `prefix` (e.g. `secure/profiles/`), for the audit script. */
  list(prefix: string): Promise<StoredAsset[]>;
  /** The folder holding the files when they are on this machine, so Express can serve them; else null. */
  readonly localRoot: string | null;
}

export interface StoredAsset {
  key: string;
  modifiedAt: Date;
}

const SERVER_ROOT = path.resolve(__dirname, '../..');

class LocalAssetStorage implements AssetStorage {
  constructor(readonly localRoot: string) {}

  private pathFor(key: string): string {
    const full = path.resolve(this.localRoot, key);
    // Keys are built by ImageService from ids, but a key must never escape the storage folder.
    if (!full.startsWith(this.localRoot + path.sep)) throw new Error(`Invalid asset key: ${key}`);
    return full;
  }

  async write(key: string, data: Buffer): Promise<void> {
    const full = this.pathFor(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.pathFor(key));
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }
  }

  async list(prefix: string): Promise<StoredAsset[]> {
    const out: StoredAsset[] = [];
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err: any) {
        if (err?.code === 'ENOENT') return;
        throw err;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else {
          const stat = await fs.stat(full);
          out.push({ key: path.relative(this.localRoot, full).split(path.sep).join('/'), modifiedAt: stat.mtime });
        }
      }
    };
    await walk(path.resolve(this.localRoot, prefix));
    return out;
  }
}

function createAssetStorage(): AssetStorage {
  const kind = process.env.ASSET_STORAGE || 'local';
  if (kind !== 'local') {
    throw new Error(`ASSET_STORAGE="${kind}" is not supported. The only storage implemented is "local".`);
  }
  const root = path.resolve(SERVER_ROOT, process.env.ASSET_LOCAL_DIR || 'public/uploads');
  mkdirSync(root, { recursive: true });
  return new LocalAssetStorage(root);
}

export const assetStorage = createAssetStorage();

/** The URL clients fetch assets from: a path on this API (e.g. `/uploads`) or a full URL elsewhere. */
export const assetBaseUrl = (process.env.ASSET_BASE_URL || '/uploads').replace(/\/+$/, '');

/** The path this API serves assets at, or null when another server serves them. */
export function localAssetMountPath(): string | null {
  if (!assetBaseUrl.startsWith('/')) return null;
  if (!assetStorage.localRoot) {
    throw new Error(`ASSET_BASE_URL "${assetBaseUrl}" is a path on this server, but ASSET_STORAGE is not local.`);
  }
  return assetBaseUrl;
}
