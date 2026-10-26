import fs from 'fs';
import maxmind, { CityResponse, Reader } from 'maxmind';
import type { ApproximateLocation } from '@sk/shared';
import { roundViewerPosition } from '@sk/shared';

/**
 * Where a connection seems to come from, for Home's *Your location* before the viewer has set one
 * (`HOME-1`). Accurate to the town at best, and often only to the city a mobile network routes
 * through, so the app labels it *Approximate*.
 *
 * Looked up offline in a MaxMind GeoLite2 City database: no request leaves the server, and the
 * address is not kept. **The database is not in the repository.** Download `GeoLite2-City.mmdb`
 * (a free MaxMind account) and point `GEOIP_CITY_DB` at it; without it every lookup answers `null`
 * and Home asks the viewer to set their location instead.
 *
 * A private or local address — every connection in development — has no answer in the database.
 * `HOME_APPROX_LOCATION` (`"-25.85,28.19,Pretoria"`) stands in for those, so the approximate state
 * can be seen on a developer's machine.
 */

let reader: Reader<CityResponse> | null = null;
let opened = false;

async function getReader(): Promise<Reader<CityResponse> | null> {
  if (opened) return reader;
  opened = true;
  const path = process.env.GEOIP_CITY_DB;
  if (!path) {
    console.log('[ApproxLocation] GEOIP_CITY_DB is not set: approximate locations are off.');
    return null;
  }
  if (!fs.existsSync(path)) {
    console.warn(`[ApproxLocation] GEOIP_CITY_DB points at ${path}, which does not exist: approximate locations are off.`);
    return null;
  }
  try {
    reader = await maxmind.open<CityResponse>(path);
    console.log('[ApproxLocation] GeoLite2 City database loaded.');
  } catch (err) {
    console.error('[ApproxLocation] Could not open the GeoLite2 City database:', err);
  }
  return reader;
}

/** The development stand-in, from `HOME_APPROX_LOCATION`. */
function devStandIn(): ApproximateLocation | null {
  const raw = process.env.HOME_APPROX_LOCATION;
  if (!raw) return null;
  const [lat, lng, ...label] = raw.split(',');
  const position = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return null;
  return { near: roundViewerPosition(position), label: label.join(',').trim() || 'your area' };
}

/** The client's address as the server saw it: the first hop of a proxy's header, or the socket's own. */
export function clientAddress(forwardedFor: string | string[] | undefined, socketAddress: string | undefined): string | null {
  const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const first = (header || '').split(',')[0].trim() || socketAddress || '';
  return first.replace(/^::ffff:/, '') || null;
}

export async function approximateLocation(address: string | null): Promise<ApproximateLocation | null> {
  const db = address && maxmind.validate(address) ? await getReader() : null;
  const found = db && address ? db.get(address) : null;
  const lat = found?.location?.latitude;
  const lng = found?.location?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') {
    const label = found?.city?.names?.en || found?.subdivisions?.[0]?.names?.en || found?.country?.names?.en || 'your area';
    return { near: roundViewerPosition({ lat, lng }), label };
  }
  return devStandIn();
}
