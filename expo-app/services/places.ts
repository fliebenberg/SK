import { Platform } from 'react-native';
import { Address } from '@sk/shared';

/**
 * Google Places address search, for the shared address input
 * ([AddressInput](file:///c:/Fred/Coding/SK/expo-app/components/address/AddressInput.tsx)).
 *
 * The **Places API (New)** (`VENUE-12`, 2026-10-26): web through the Maps JavaScript SDK's
 * `AutocompleteSuggestion` and `Place`, native through its REST endpoints on
 * `places.googleapis.com`. Used for every address the app takes: an organisation's and a site's.
 * (Home's place search is our own list, not Google — `HOME-4`.)
 *
 * A **session token** groups one search's keystrokes with the details lookup that ends it. A
 * search that ends in a pick is billed as that one details lookup, the typing free; one abandoned
 * is billed per request. Only Essentials fields are asked for (address parts, formatted address,
 * position), the cheapest tier.
 */

export interface PlaceSuggestion {
  placeId: string;
  /** The first line, e.g. "Jasmyn Street". */
  main: string;
  /** The rest, e.g. "Doringkloof, Centurion, South Africa". */
  secondary: string;
}

/** The address fields without an id — what a pick or a hand-typed entry produces. */
export type AddressDraft = Omit<Address, 'id'>;

const WEB_SCRIPT_ID = 'google-maps-js-sdk';
const PLACES_REST = 'https://places.googleapis.com/v1';
/** What a pick asks for: Essentials fields only, so a details lookup is billed at that tier. */
const DETAIL_FIELDS = ['addressComponents', 'formattedAddress', 'location'];

/** Load the Maps JavaScript SDK once, with the places library. Web only. */
export function loadGoogleMaps(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    const google = (window as any).google;
    if (google?.maps?.places) return resolve(google);

    const existing = document.getElementById(WEB_SCRIPT_ID) as HTMLScriptElement | null;
    const onLoad = () => resolve((window as any).google);
    if (existing) {
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.id = WEB_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.EXPO_PUBLIC_WEB_GOOGLE_MAPS_API_KEY || ''}&libraries=places`;
    script.async = true;
    script.onload = onLoad;
    script.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(script);
  });
}

function randomToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
  return token;
}

function nativeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Goog-Api-Key': process.env.EXPO_PUBLIC_ANDROID_GOOGLE_MAPS_API_KEY || '', ...extra };
}

/** One search session: suggestions while typing, then the details of the one picked. */
export class PlacesSession {
  private webToken: any = null;
  private nativeToken = '';
  /** The SDK's own predictions, by place id: picking one through `toPlace()` ends its session. */
  private webPredictions = new Map<string, any>();

  /** Suggestions for what has been typed. Resolves to `[]` for nothing found; rejects when Google could not be asked. */
  async suggest(query: string): Promise<PlaceSuggestion[]> {
    if (Platform.OS === 'web') {
      const google = await loadGoogleMaps();
      if (!this.webToken) this.webToken = new google.maps.places.AutocompleteSessionToken();
      const { suggestions } = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        sessionToken: this.webToken,
      });
      const predictions: any[] = (suggestions || []).map((s: any) => s.placePrediction).filter(Boolean);
      this.webPredictions = new Map(predictions.map(p => [p.placeId, p]));
      return predictions.map(p => ({
        placeId: p.placeId,
        main: p.mainText?.text || p.text?.text || '',
        secondary: p.secondaryText?.text || '',
      }));
    }

    if (!this.nativeToken) this.nativeToken = randomToken();
    const response = await fetch(`${PLACES_REST}/places:autocomplete`, {
      method: 'POST',
      headers: nativeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ input: query, sessionToken: this.nativeToken }),
    });
    if (!response.ok) throw new Error(`Places search failed: HTTP ${response.status}`);
    const data = await response.json();
    const predictions: any[] = (data.suggestions || []).map((s: any) => s.placePrediction).filter(Boolean);
    return predictions.map(p => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text || p.text?.text || '',
      secondary: p.structuredFormat?.secondaryText?.text || '',
    }));
  }

  /** The full address of a suggestion. Ends the session. */
  async details(placeId: string): Promise<AddressDraft> {
    try {
      if (Platform.OS === 'web') {
        const google = await loadGoogleMaps();
        const prediction = this.webPredictions.get(placeId);
        const place = prediction ? prediction.toPlace() : new google.maps.places.Place({ id: placeId });
        await place.fetchFields({ fields: DETAIL_FIELDS });
        return parsePlace(place);
      }
      const url = `${PLACES_REST}/places/${encodeURIComponent(placeId)}?sessionToken=${this.nativeToken}`;
      const response = await fetch(url, { headers: nativeHeaders({ 'X-Goog-FieldMask': DETAIL_FIELDS.join(',') }) });
      if (!response.ok) throw new Error(`Place details failed: HTTP ${response.status}`);
      return parsePlace(await response.json());
    } finally {
      this.webToken = null;
      this.nativeToken = '';
      this.webPredictions = new Map();
    }
  }
}

/**
 * A Places (New) result — the SDK's `Place` or the REST answer — as our address fields. The suburb
 * goes to the second line — the site editor once folded it into the city, which turned
 * "Doringkloof, Centurion" into a town called Doringkloof.
 *
 * The unit or building comes only from Google's own `subpremise` and `premise` parts, and is
 * usually blank. It is never the place's name: a search for "Melkbos High School" finds the school,
 * but the name belongs on the site or organisation, not in its address (VENUE-2).
 */
export function parsePlace(place: any): AddressDraft {
  let unit = '';
  let premise = '';
  let houseNumber = '';
  let road = '';
  let suburb = '';
  let city = '';
  let province = '';
  let country = '';
  let postalCode = '';
  let district = '';

  for (const comp of place.addressComponents || []) {
    const types: string[] = comp.types || [];
    const name: string = comp.longText || '';
    if (types.includes('subpremise')) unit = name;
    else if (types.includes('premise')) premise = name;
    else if (types.includes('street_number')) houseNumber = name;
    else if (types.includes('route')) road = name;
    else if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) suburb = suburb || name;
    else if (types.includes('locality') || types.includes('postal_town')) city = name;
    else if (types.includes('administrative_area_level_2')) district = name;
    else if (types.includes('administrative_area_level_1')) province = name;
    else if (types.includes('country')) country = name;
    else if (types.includes('postal_code')) postalCode = name;
  }

  const formatted: string = place.formattedAddress || '';
  // The SDK's `Place` has a LatLng with lat() and lng(); the REST answer has latitude and longitude.
  const loc = place.location;
  const latitude = loc ? (typeof loc.lat === 'function' ? loc.lat() : Number(loc.latitude)) : undefined;
  const longitude = loc ? (typeof loc.lng === 'function' ? loc.lng() : Number(loc.longitude)) : undefined;

  return {
    fullAddress: formatted,
    building: [unit, premise].filter(Boolean).join(', '),
    addressLine1: road ? `${houseNumber} ${road}`.trim() : formatted.split(',')[0],
    addressLine2: suburb && suburb !== city ? suburb : '',
    city: city || district,
    province,
    postalCode,
    country,
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
  };
}

/** One line from the address fields, for an address typed in by hand (which has no formatted address). */
export function composeFullAddress(a: Partial<AddressDraft>): string {
  const cityLine = [a.city, a.postalCode].filter(Boolean).join(', ');
  return [a.building, a.addressLine1, a.addressLine2, cityLine, a.province, a.country]
    .map(part => (part || '').trim())
    .filter(Boolean)
    .join(', ');
}

/** "Centurion, Gauteng" — the short form the profile banner shows. */
export function addressLocality(a: Partial<Address> | null | undefined, includeProvince = true): string {
  if (!a) return '';
  return (includeProvince ? [a.city, a.province] : [a.city || a.province]).filter(Boolean).join(', ');
}

/** Whether an address has a pin on the map. */
export function hasPin(a: Partial<Address> | null | undefined): a is Address & { latitude: number; longitude: number } {
  return !!a && typeof a.latitude === 'number' && typeof a.longitude === 'number'
    && Number.isFinite(a.latitude) && Number.isFinite(a.longitude);
}
