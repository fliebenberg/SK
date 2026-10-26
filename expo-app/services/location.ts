import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { PlaceName, ViewerPosition, roundViewerPosition } from '@sk/shared';
import { wsService } from './websocket';

/**
 * The device's position, for Home's *Use my location* (`HOME-1`, docs/home.md).
 *
 * Asked for only when the viewer taps it, never when a page opens. Once allowed, the position is
 * read again each time Home opens — in the foreground only, never in the background. What the
 * phone or browser remembers about the permission decides whether it asks again: iPhone's *Allow
 * Once* and Android's *Only this time* ask the next time, *While using the app* does not.
 *
 * Every position leaves here rounded to about a kilometre.
 */

/**
 * - `granted`: allowed;
 * - `undetermined`: never asked, or *Allow once* ran out — asking shows the prompt;
 * - `denied`: refused, but asking again still shows the prompt;
 * - `blocked`: refused for good — only the phone's Settings, or the browser's site settings, can
 *   allow it now;
 * - `unavailable`: this device or browser cannot say where it is.
 */
export type DevicePermission = 'granted' | 'undetermined' | 'denied' | 'blocked' | 'unavailable';

/** How long to wait for a position before giving up — indoors a phone can take a while. */
const POSITION_TIMEOUT_MS = 12000;

function toPermission(response: Location.LocationPermissionResponse): DevicePermission {
  if (response.granted) return 'granted';
  if (response.status === Location.PermissionStatus.DENIED) return response.canAskAgain ? 'denied' : 'blocked';
  return 'undetermined';
}

/** What the device says about location now, without asking. */
export async function devicePermission(): Promise<DevicePermission> {
  try {
    return toPermission(await Location.getForegroundPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

async function readPosition(): Promise<ViewerPosition | null> {
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), POSITION_TIMEOUT_MS));
  const read = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    .then(p => roundViewerPosition({ lat: p.coords.latitude, lng: p.coords.longitude }))
    .catch(() => null);
  return Promise.race([read, timeout]);
}

/** The position, when location is already allowed. Never prompts. */
export async function currentDevicePosition(): Promise<ViewerPosition | null> {
  if ((await devicePermission()) !== 'granted') return null;
  return readPosition();
}

/** *Use my location*: asks if it must, then reads the position. */
export async function askDevicePosition(): Promise<{ permission: DevicePermission; position: ViewerPosition | null }> {
  let permission: DevicePermission;
  try {
    permission = toPermission(await Location.requestForegroundPermissionsAsync());
  } catch {
    return { permission: 'unavailable', position: null };
  }
  if (permission !== 'granted') return { permission, position: null };
  const position = await readPosition();
  return { permission: position ? 'granted' : 'unavailable', position };
}

/**
 * "Doringkloof, Centurion" for a position, or `null` when it has no name we can find. Asked of the
 * server's own place list (`HOME-4`) on every platform, so web and phones name a place alike and
 * no map service sees the position.
 */
export function placeNameAt(position: ViewerPosition): Promise<string | null> {
  return new Promise(resolve => {
    wsService.emit('get_data', { type: 'place_name', near: roundViewerPosition(position) }, (res: PlaceName | null) => {
      resolve(res && typeof res.label === 'string' ? res.label : null);
    }, undefined, { suppressToast: true });
  });
}

/** The phone's settings for this app, where a refused permission is turned back on. Not on web. */
export const canOpenSettings = Platform.OS !== 'web';
export function openAppSettings(): void {
  void Linking.openSettings();
}
