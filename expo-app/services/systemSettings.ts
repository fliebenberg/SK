import { wsService } from './websocket';

let cachedSettings: Record<string, any> | null = null;
let fetchPromise: Promise<Record<string, any>> | null = null;

/**
 * Fetches system settings once per session and caches them in memory.
 * Subsequent calls return the cached settings instantly without sending
 * network requests to the backend.
 */
export function getSystemSettingsOnce(): Promise<Record<string, any>> {
  if (cachedSettings) {
    return Promise.resolve(cachedSettings);
  }
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = new Promise((resolve) => {
    wsService.emit('get_data', { type: 'system_settings' }, (res: any) => {
      cachedSettings = res || {};
      fetchPromise = null;
      resolve(cachedSettings!);
    });
  });

  return fetchPromise;
}

/**
 * Synchronously get currently cached settings (if available).
 */
export function getCachedSystemSettings(): Record<string, any> | null {
  return cachedSettings;
}

/**
 * Invalidate cache if settings need to be refreshed.
 */
export function invalidateSystemSettingsCache(): void {
  cachedSettings = null;
  fetchPromise = null;
}
