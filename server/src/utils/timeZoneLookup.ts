import { find } from 'geo-tz';
import { TimeZone, isTimeZone } from '@sk/shared';

/**
 * The timezone at a point on the map, for a venue whose pin has just been placed or moved (`DATE-2`).
 *
 * Looked up once, when the location is saved, and stored on the site; nothing looks it up again
 * after that. `geo-tz` answers offline from timezone boundary data bundled with it — no API key, no
 * network call, nothing to fail at the moment of saving.
 *
 * `null` when there is no answer worth storing, and the site then keeps its organisation's
 * timezone:
 * - no coordinates, or not numbers;
 * - a point at sea, which `geo-tz` answers with a nautical `Etc/GMT±n` zone. A venue in the ocean is
 *   a pin dropped in the wrong place, and the organisation's timezone is a better guess than that;
 * - a name this Node's `Intl` does not know, which the app could not convert with either.
 */
export function timeZoneAt(latitude: unknown, longitude: unknown): TimeZone | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  try {
    const zone = find(latitude, longitude)[0];
    if (!zone || zone.startsWith('Etc/')) return null;
    return isTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}
