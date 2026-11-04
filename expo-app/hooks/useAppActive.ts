import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the viewer has the app in front of them: on the web, whether its browser tab is showing.
 * Nothing is read on a timer while this is false (live-data skill).
 *
 * iOS passes through `inactive` for a moment on the way to and from the background, and for the
 * control centre; only `background` counts as gone.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setActive(state !== 'background'));
    return () => subscription.remove();
  }, []);
  return active;
}
