import { Platform, Share } from 'react-native';
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
