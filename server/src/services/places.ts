import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { PlaceMatch, ViewerPosition } from '@sk/shared';
import { roundViewerPosition } from '@sk/shared';

/**
 * South Africa's towns and suburbs, for Home (`HOME-4`, docs/home.md §3): the name of the viewer's
 * position ("Doringkloof, Centurion") and the place search in *Set my location*.
 *
 * Read from `server/data/places-za.json.gz`, built from OpenStreetMap and GeoNames by
 * `npm run places:build` and kept in the repository. Answered in memory: no request leaves the
 * server, and no third party sees the viewer's position. Both sources ask for a credit where the
 * names are shown; the location dialog carries it.
 */

type Kind = 'c' | 't' | 's' | 'v';
type Row = [name: string, kind: Kind, lat: number, lng: number, parent: number, province: number, population: number, osm: 0 | 1];

interface Place {
  name: string;
  kind: Kind;
  lat: number;
  lng: number;
  parent: Place | null;
  province: string | null;
  population: number;
  /** From OpenStreetMap. Its suburbs are the ones named first: GeoNames' read "Lyttleton L.H.". */
  osm: boolean;
  /** The name lower-cased, without accents, words split on anything else. */
  key: string;
}

const FILE = path.join(__dirname, '../../data/places-za.json.gz');
/** A suburb or village this close is where the viewer is. */
const LOCAL_KM = 3;
/** Beyond this, the nearest town is too far off to name. */
const TOWN_KM = 25;
const KIND_RANK: Record<Kind, number> = { c: 4, t: 3, s: 2, v: 1 };

let places: Place[] | null = null;

export function normalizePlaceName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function load(): Place[] {
  if (places) return places;
  try {
    const file = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString('utf8')) as { provinces: string[]; places: Row[] };
    const loaded: Place[] = file.places.map(([name, kind, lat, lng, , province, population, osm]) => ({
      name, kind, lat, lng, parent: null, province: file.provinces[province] ?? null, population,
      osm: osm === 1, key: normalizePlaceName(name),
    }));
    file.places.forEach((row, i) => { loaded[i].parent = loaded[row[4]] ?? null; });
    places = loaded;
    console.log(`[Places] ${places.length} places loaded.`);
  } catch (err) {
    console.error(`[Places] Could not read ${FILE}: place names and the place search are off.`, err);
    places = [];
  }
  return places;
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** How strongly a town draws a position: a city or a large town over a small one nearer by. */
function weight(p: Place): number {
  return Math.max(Math.log10(p.population + 10), p.kind === 'c' ? 6 : 1);
}

function isValidPosition(near: unknown): near is ViewerPosition {
  const p = near as ViewerPosition | null;
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

/**
 * "Doringkloof, Centurion" for a position: the suburb or village it is in — OpenStreetMap's when
 * it has one near, else GeoNames' — with the town a suburb belongs to; else the town that draws
 * it; `null` when nothing is near enough to name.
 */
export function placeNameAt(near: unknown): string | null {
  if (!isValidPosition(near)) return null;
  const position = roundViewerPosition(near);
  let local: Place | null = null;
  let localKm = LOCAL_KM;
  let fallback: Place | null = null;
  let fallbackKm = LOCAL_KM;
  let town: Place | null = null;
  let townScore = Infinity;
  for (const p of load()) {
    const d = km(position, p);
    if (p.kind === 's' || p.kind === 'v') {
      if (p.osm && d < localKm) { local = p; localKm = d; }
      if (!p.osm && d < fallbackKm) { fallback = p; fallbackKm = d; }
    }
    if ((p.kind === 'c' || p.kind === 't') && d < TOWN_KM && d / weight(p) < townScore) { town = p; townScore = d / weight(p); }
  }
  local = local ?? fallback;
  if (local) return local.parent && local.parent.key !== local.key ? `${local.name}, ${local.parent.name}` : local.name;
  return town?.name ?? null;
}

/**
 * Towns and suburbs whose name starts with the query, or has a word that does: whole-name matches
 * first, then the bigger places, then the closer ones. At most eight.
 */
export function searchPlaces(query: unknown, near?: unknown): PlaceMatch[] {
  const q = typeof query === 'string' ? normalizePlaceName(query) : '';
  if (q.length < 2) return [];
  const from = isValidPosition(near) ? roundViewerPosition(near) : null;
  const scored: { p: Place; score: number }[] = [];
  for (const p of load()) {
    const tier = p.key === q ? 0 : p.key.startsWith(q) ? 1 : p.key.includes(` ${q}`) ? 2 : -1;
    if (tier < 0) continue;
    // Tier first; within it a city over a town over a suburb over a village, and the closer, larger place.
    const nearness = from ? Math.min(km(from, p), 2000) / 2000 : 0;
    const size = Math.min(Math.log10(p.population + 1), 7) / 7;
    scored.push({ p, score: tier * 10 - KIND_RANK[p.kind] - size + nearness * 2 });
  }
  scored.sort((a, b) => a.score - b.score);
  // Places that share a name and a province read as one line, so only the best of them is kept.
  const matches: PlaceMatch[] = [];
  const shown = new Set<string>();
  for (const { p } of scored) {
    const context = [p.kind === 's' ? p.parent?.name : null, p.province].filter(Boolean).join(', ');
    if (shown.has(`${p.name}|${context}`)) continue;
    shown.add(`${p.name}|${context}`);
    matches.push({ name: p.name, context, near: roundViewerPosition(p) });
    if (matches.length === 8) break;
  }
  return matches;
}
