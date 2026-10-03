import { Platform } from 'react-native';
import { Address } from '@sk/shared';

/**
 * Google Places address search, for the shared address input
 * ([AddressInput](file:///c:/Fred/Coding/SK/expo-app/components/address/AddressInput.tsx)).
 *
 * The logic is the site editor's ([sites/[siteId].tsx](file:///c:/Fred/Coding/SK/expo-app/app/admin/%5BorgId%5D/sites/%5BsiteId%5D.tsx)),
 * lifted out unchanged in what it asks Google for: web goes through the Maps JavaScript SDK (the
 * REST endpoints refuse a browser origin), native through the REST endpoints. The site editor still
 * carries its own copy until it moves onto the shared input (`VENUE-2`).
 *
 * A **session token** groups one search's keystrokes with the details lookup that ends it, which is
 * how Google bills a search as one session rather than per keystroke. A search starts one; picking
 * a result ends it.
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

/** One search session: suggestions while typing, then the details of the one picked. */
export class PlacesSession {
  private webToken: any = null;
  private nativeToken = '';

  /** Suggestions for what has been typed. Resolves to `[]` for nothing found; rejects when Google could not be asked. */
  async suggest(query: string): Promise<PlaceSuggestion[]> {
    if (Platform.OS === 'web') {
      const google = await loadGoogleMaps();
      if (!this.webToken) this.webToken = new google.maps.places.AutocompleteSessionToken();
      return new Promise((resolve, reject) => {
        new google.maps.places.AutocompleteService().getPlacePredictions(
          { input: query, sessionToken: this.webToken },
          (predictions: any[], status: string) => {
            const S = google.maps.places.PlacesServiceStatus;
            if (status === S.OK && Array.isArray(predictions)) resolve(predictions.map(toSuggestion));
            else if (status === S.ZERO_RESULTS) resolve([]);
            else reject(new Error(`Places search failed: ${status}`));
          }
        );
      });
    }

    if (!this.nativeToken) this.nativeToken = randomToken();
    const key = process.env.EXPO_PUBLIC_ANDROID_GOOGLE_MAPS_API_KEY || '';
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${key}&sessiontoken=${this.nativeToken}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Places search failed: HTTP ${response.status}`);
    const data = await response.json();
    if (data.status === 'OK' && Array.isArray(data.predictions)) return data.predictions.map(toSuggestion);
    if (data.status === 'ZERO_RESULTS') return [];
    throw new Error(`Places search failed: ${data.status}`);
  }

  /** The full address of a suggestion. Ends the session. */
  async details(placeId: string): Promise<AddressDraft> {
    try {
      if (Platform.OS === 'web') {
        const google = await loadGoogleMaps();
        return await new Promise((resolve, reject) => {
          new google.maps.places.PlacesService(document.createElement('div')).getDetails(
            { placeId, sessionToken: this.webToken, fields: ['address_components', 'formatted_address', 'geometry'] },
            (place: any, status: string) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && place) resolve(parsePlace(place));
              else reject(new Error(`Place details failed: ${status}`));
            }
          );
        });
      }
      const key = process.env.EXPO_PUBLIC_ANDROID_GOOGLE_MAPS_API_KEY || '';
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${key}&sessiontoken=${this.nativeToken}&fields=address_components,formatted_address,geometry`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Place details failed: HTTP ${response.status}`);
      const data = await response.json();
      if (data.status === 'OK' && data.result) return parsePlace(data.result);
      throw new Error(`Place details failed: ${data.status}`);
    } finally {
      this.webToken = null;
      this.nativeToken = '';
    }
  }
}

function toSuggestion(p: any): PlaceSuggestion {
  return {
    placeId: p.place_id,
    main: p.structured_formatting?.main_text || p.description,
    secondary: p.structured_formatting?.secondary_text || '',
  };
}

/**
 * A Places result as our address fields. The suburb goes to the second line — the site editor
 * folded it into the city, which turned "Doringkloof, Centurion" into a town called Doringkloof.
 */
export function parsePlace(place: any): AddressDraft {
  let houseNumber = '';
  let road = '';
  let suburb = '';
  let city = '';
  let province = '';
  let country = '';
  let postalCode = '';
  let district = '';

  for (const comp of place.address_components || []) {
    const types: string[] = comp.types || [];
    if (types.includes('street_number')) houseNumber = comp.long_name;
    else if (types.includes('route')) road = comp.long_name;
    else if (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood')) suburb = suburb || comp.long_name;
    else if (types.includes('locality') || types.includes('postal_town')) city = comp.long_name;
    else if (types.includes('administrative_area_level_2')) district = comp.long_name;
    else if (types.includes('administrative_area_level_1')) province = comp.long_name;
    else if (types.includes('country')) country = comp.long_name;
    else if (types.includes('postal_code')) postalCode = comp.long_name;
  }

  const formatted: string = place.formatted_address || '';
  const loc = place.geometry?.location;
  const latitude = loc ? (typeof loc.lat === 'function' ? loc.lat() : parseFloat(loc.lat)) : undefined;
  const longitude = loc ? (typeof loc.lng === 'function' ? loc.lng() : parseFloat(loc.lng)) : undefined;

  return {
    fullAddress: formatted,
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

/** One line from the address fields, for an address typed in by hand (which has no `formatted_address`). */
export function composeFullAddress(a: Partial<AddressDraft>): string {
  const cityLine = [a.city, a.postalCode].filter(Boolean).join(', ');
  return [a.addressLine1, a.addressLine2, cityLine, a.province, a.country]
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
