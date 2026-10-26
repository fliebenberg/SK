import type { ViewerPosition } from '@sk/shared';

/**
 * Distances for Home (`HOME-1`): straight lines, as the server works them out.
 */

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Kilometres between two positions, in a straight line. */
export function distanceKm(a: ViewerPosition, b: ViewerPosition): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * How far away something is, for a row — "800 m", "2.4 km", "14 km". Empty when it is not known,
 * so a row with no distance prints nothing rather than a dash.
 */
export function formatDistance(km?: number | null): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return '';
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  if (km < 10) return `${Math.round(km * 10) / 10} km`;
  return `${Math.round(km)} km`;
}
