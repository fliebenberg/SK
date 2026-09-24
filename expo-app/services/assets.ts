import { API_BASE_URL } from './api';
import { useAuthStore } from '../store/authStore';

/**
 * The one place that turns a stored image name into a URL (MEDIA-1).
 *
 * The database stores a base name (`logo-{id}-{ts}`), never a URL, and the server announces where
 * the files are served from (`GET /api/client-config`). Moving the images to another server is then
 * a server setting, with no app rebuild. `npm run check:images` fails if anything else builds an
 * upload URL itself.
 *
 * Logos are public. People's pictures are under `secure/` and load only with the signed-in user's
 * asset token (useAuthStore().assetToken), so a signed-out app gets no URL for them at all. The
 * folder is decided by the kind of image, never by the name — the same table lives in the server's
 * ImageService (IMAGE_KINDS).
 */

export type ImageTier = 'large' | 'medium' | 'thumb';
type ImageFolder = 'logos' | 'profiles';

const FOLDERS: Record<ImageFolder, { dir: string; secure: boolean }> = {
  logos: { dir: 'public/logos', secure: false },
  profiles: { dir: 'secure/profiles', secure: true },
};

/** Until the server says otherwise: where images have always been, on the API itself. */
let assetBaseUrl = `${API_BASE_URL}/uploads`;

const CONFIG_TIMEOUT_MS = 5000;

/**
 * Asks the server where images are served from. Call once before rendering anything that shows one.
 * Never throws: when the server cannot be reached the app keeps the default, which is correct for as
 * long as images live on the API server, and the failure is logged.
 */
export async function loadAssetConfig(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}/api/client-config`, { signal: controller.signal });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const config = await response.json();
    if (typeof config?.assetBaseUrl !== 'string' || !config.assetBaseUrl) {
      throw new Error('reply has no assetBaseUrl');
    }
    const base = config.assetBaseUrl.replace(/\/+$/, '');
    // A path means the API serves the images itself.
    assetBaseUrl = base.startsWith('/') ? `${API_BASE_URL}${base}` : base;
  } catch (error: any) {
    console.warn(`[Assets] Could not load the image location (${error?.message || error}). Using ${assetBaseUrl}.`);
  } finally {
    clearTimeout(timer);
  }
}

function imageUrl(folder: ImageFolder, name: string | null | undefined, tier: ImageTier): string {
  if (!name) return '';
  // Already a URI: a picture just picked on the device (data:, file:, blob:) or one hosted
  // elsewhere, e.g. a Google avatar (https:). Stored names never contain a scheme.
  if (/^[a-z][a-z0-9+.-]*:/i.test(name)) return name;
  const { dir, secure } = FOLDERS[folder];
  const url = `${assetBaseUrl}/${dir}/${name}_${tier}.webp`;
  if (!secure) return url;
  const token = useAuthStore.getState().assetToken?.token;
  // Without a token the request could only be refused; show the placeholder instead.
  return token ? `${url}?t=${encodeURIComponent(token)}` : '';
}

/** URL for an organisation, league or season logo. */
export function getOrgLogoUrl(logo?: string | null, tier: ImageTier = 'medium') {
  return imageUrl('logos', logo, tier);
}

/** URL for a person's picture (a user's custom image or an org profile's image). */
export function getAvatarUrl(avatar?: string | null, tier: ImageTier = 'medium') {
  return imageUrl('profiles', avatar, tier);
}
