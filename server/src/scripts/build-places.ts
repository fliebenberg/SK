/**
 * Builds the place list Home names a position from and searches (`HOME-4`, docs/home.md §3):
 * `server/data/places-za.json.gz`, read by `services/places.ts`.
 *
 *   npm run places:build
 *
 * Two free sources, merged:
 * - **GeoNames** (CC BY 4.0): South Africa's populated places, with a population and a province.
 * - **OpenStreetMap** (ODbL): cities, towns, villages and — what GeoNames is thin on — suburbs,
 *   through the Overpass API.
 *
 * Both ask for a credit where the names are shown; the location dialog carries it. Run again from
 * time to time to pick up new suburbs, and commit the file it writes.
 *
 * Never fill this list from Google's results: the Maps Platform terms forbid using Google content
 * to build or add to a mapping dataset of our own.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const COUNTRY = 'ZA';
const OUT = path.join(__dirname, '../../data/places-za.json.gz');
const USER_AGENT = 'ScoreKeeper-places-build/1.0';
const OVERPASS_HOSTS = ['https://overpass-api.de', 'https://overpass.kumi.systems'];

/** `c` city, `t` town, `s` suburb (OSM suburb, neighbourhood, quarter; GeoNames PPLX), `v` village. */
type Kind = 'c' | 't' | 's' | 'v';

interface Place {
  name: string;
  kind: Kind;
  lat: number;
  lng: number;
  population: number;
  province: string | null;
  parent: number;
  /** From OpenStreetMap, whose suburb names read better than GeoNames' ("Lyttleton L.H."). */
  osm: boolean;
}

function normalize(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init?.headers || {}) } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

/** One file out of a zip archive, by name — enough for GeoNames' country files. */
function unzipEntry(zip: Buffer, wanted: string): Buffer {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Not a zip archive');
  let at = zip.readUInt32LE(eocd + 16);
  const count = zip.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const compressedSize = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const localOffset = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    if (name === wanted) {
      const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
      const data = zip.subarray(start, start + compressedSize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${wanted} is not in the archive`);
}

/** GeoNames feature codes we keep; abandoned, historical and destroyed places are left out. */
function geonamesKind(code: string, population: number): Kind | null {
  if (code === 'PPLC' || code === 'PPLA' || code === 'PPLA2') return 'c';
  if (code === 'PPLA3') return population >= 1000 ? 't' : 'v';
  if (code === 'PPL') return population >= 100_000 ? 'c' : population >= 5000 ? 't' : 'v';
  if (code === 'PPLX') return 's';
  if (code === 'PPLL' || code === 'PPLF') return 'v';
  return null;
}

async function loadGeonames(): Promise<Place[]> {
  console.log('GeoNames: provinces…');
  const admin = await (await fetchOk('https://download.geonames.org/export/dump/admin1CodesASCII.txt')).text();
  const provinces = new Map<string, string>();
  for (const line of admin.split('\n')) {
    const [code, name] = line.split('\t');
    if (code?.startsWith(`${COUNTRY}.`)) provinces.set(code.slice(COUNTRY.length + 1), name);
  }
  console.log(`GeoNames: ${COUNTRY}.zip…`);
  const zip = Buffer.from(await (await fetchOk(`https://download.geonames.org/export/dump/${COUNTRY}.zip`)).arrayBuffer());
  const places: Place[] = [];
  for (const line of unzipEntry(zip, `${COUNTRY}.txt`).toString('utf8').split('\n')) {
    const f = line.split('\t');
    if (f[6] !== 'P') continue;
    const population = Number(f[14]) || 0;
    const kind = geonamesKind(f[7], population);
    if (!kind) continue;
    places.push({
      name: f[1], kind, lat: Number(f[4]), lng: Number(f[5]), population,
      province: provinces.get(f[10]) || null, parent: -1, osm: false,
    });
  }
  console.log(`GeoNames: ${places.length} places.`);
  return places;
}

async function loadOsm(): Promise<Place[]> {
  const query = `[out:csv(::lat,::lon,name,place;false;"\\t")][timeout:300];`
    + `area["ISO3166-1"="${COUNTRY}"][admin_level=2]->.country;`
    + `nwr["place"~"^(city|town|village|suburb|neighbourhood|quarter)$"]["name"](area.country);out center;`;
  const kinds: Record<string, Kind> = { city: 'c', town: 't', village: 'v', suburb: 's', neighbourhood: 's', quarter: 's' };
  // The public Overpass servers are often busy: try each in turn, waiting longer every round.
  for (let attempt = 0; attempt < 6; attempt++) {
    const host = OVERPASS_HOSTS[attempt % OVERPASS_HOSTS.length];
    try {
      console.log(`OpenStreetMap: ${host}…`);
      const response = await fetchOk(`${host}/api/interpreter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      const places: Place[] = [];
      for (const line of (await response.text()).split('\n')) {
        const [lat, lng, name, place] = line.split('\t');
        const kind = kinds[place?.trim()];
        if (!kind || !name || !Number.isFinite(Number(lat))) continue;
        places.push({ name: name.trim(), kind, lat: Number(lat), lng: Number(lng), population: 0, province: null, parent: -1, osm: true });
      }
      if (places.length < 1000) throw new Error(`only ${places.length} places came back`);
      console.log(`OpenStreetMap: ${places.length} places.`);
      return places;
    } catch (err) {
      const wait = 15 * 2 ** attempt;
      console.warn(`OpenStreetMap: ${(err as Error).message}; trying again in ${wait}s.`);
      await new Promise(resolve => setTimeout(resolve, wait * 1000));
    }
  }
  throw new Error('OpenStreetMap: no Overpass server answered. Try again later.');
}

/**
 * One entry per place: the same name within 3 km is the same place in both sources. OSM's kind
 * wins — it is the one that knows a suburb from a town — and GeoNames lends its population and
 * province.
 */
function merge(osm: Place[], geonames: Place[]): Place[] {
  const byName = new Map<string, Place[]>();
  const places: Place[] = [];
  const add = (p: Place) => {
    const key = normalize(p.name);
    const same = (byName.get(key) || []).find(q => km(p, q) < 3);
    if (same) {
      same.population = Math.max(same.population, p.population);
      same.province = same.province || p.province;
      return;
    }
    places.push(p);
    byName.set(key, [...(byName.get(key) || []), p]);
  };
  osm.forEach(add);
  geonames.forEach(add);
  return places;
}

/** How strongly a town draws its suburbs: a city or a large town over a small one nearer by. */
function weight(p: Place): number {
  return Math.max(Math.log10(p.population + 10), p.kind === 'c' ? 6 : 1);
}

function link(places: Place[]): void {
  const withProvince = places.filter(p => p.province);
  const towns = places.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'c' || p.kind === 't');
  for (const place of places) {
    if (!place.province) {
      let best: Place | null = null;
      let bestKm = Infinity;
      for (const q of withProvince) {
        const d = km(place, q);
        if (d < bestKm) { bestKm = d; best = q; }
      }
      place.province = best?.province || null;
    }
    if (place.kind !== 's') continue;
    let bestScore = Infinity;
    for (const { p, i } of towns) {
      if (p === place || normalize(p.name) === normalize(place.name)) continue;
      const d = km(place, p);
      if (d > 25) continue;
      const score = d / weight(p);
      if (score < bestScore) { bestScore = score; place.parent = i; }
    }
  }
}

async function main() {
  const [geonames, osm] = await Promise.all([loadGeonames(), loadOsm()]);
  const places = merge(osm, geonames);
  link(places);
  const provinces = [...new Set(places.map(p => p.province).filter((p): p is string => !!p))].sort();
  const file = {
    country: COUNTRY,
    built: new Date().toISOString().slice(0, 10),
    sources: ['© OpenStreetMap contributors (ODbL)', 'GeoNames (CC BY 4.0)'],
    provinces,
    // [name, kind, lat, lng, parent index or -1, province index or -1, population, 1 from OSM else 0]
    places: places.map(p => [
      p.name, p.kind, Math.round(p.lat * 1e4) / 1e4, Math.round(p.lng * 1e4) / 1e4,
      p.parent, p.province ? provinces.indexOf(p.province) : -1, p.population, p.osm ? 1 : 0,
    ]),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify(file), { level: 9 }));
  const counts = places.reduce((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] || 0) + 1 }), {} as Record<string, number>);
  console.log(`Wrote ${places.length} places to ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB):`, counts);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
