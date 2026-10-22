import { Linking, Platform, Share } from 'react-native';
import { useToastStore } from '../store/toastStore';

/**
 * The address anyone can open for a path in the app: on the web this page's own origin; on a phone
 * the public web address when one is configured (`EXPO_PUBLIC_WEB_URL`), else the app's own scheme,
 * which opens only where ScoreKeeper is installed. There is no production web address yet
 * (2026-10-22), so a phone's link is the scheme's until there is.
 */
export function publicUrl(path: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${path}`;
  const web = process.env.EXPO_PUBLIC_WEB_URL;
  return web ? `${web.replace(/\/$/, '')}${path}` : `scorekeeper:/${path}`;
}

/**
 * Hand a link to someone else: on the web it goes on the clipboard (browsers' share sheets are
 * patchy on desktop), on a phone the phone's own share sheet opens. `what` names it in the toast
 * ("The tournament's link is on your clipboard").
 */
export async function shareLink(path: string, what: string): Promise<void> {
  const url = publicUrl(path);
  if (Platform.OS === 'web') {
    try {
      await (navigator as any).clipboard.writeText(url);
      useToastStore.getState().showSuccess(`${what} is on your clipboard.`, 'Link copied');
    } catch {
      useToastStore.getState().showError(`The browser would not allow copying. The link is ${url}`, 'Not copied');
    }
    return;
  }
  Share.share({ message: url, url }).catch(() => {});
}

/** The phone's maps app, or Google Maps on the web, with directions to a pin or, without one, an address. */
export function openDirections(to: { latitude?: number | null; longitude?: number | null } | null, oneLine: string): void {
  const destination = to?.latitude != null && to?.longitude != null ? `${to.latitude},${to.longitude}` : oneLine;
  const url = Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${encodeURIComponent(destination)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  Linking.openURL(url).catch(() => useToastStore.getState().showError('No maps app could open the address.', 'Directions'));
}

/** Text onto the clipboard on the web; on a phone the share sheet, which offers Copy and needs no clipboard library. */
export async function copyText(text: string, what: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      await (navigator as any).clipboard.writeText(text);
      useToastStore.getState().showSuccess(`${what} is on your clipboard.`, 'Copied');
    } catch {
      useToastStore.getState().showError(`The browser would not allow copying. Select ${what.toLowerCase()} and copy it instead.`, 'Not Copied');
    }
    return;
  }
  Share.share({ message: text }).catch(() => {});
}
