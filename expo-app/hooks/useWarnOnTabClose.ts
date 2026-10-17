import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * On web, asks the browser to confirm before the tab is closed, reloaded or sent to another site
 * while `shouldWarn` holds. Does nothing on native, where there is no tab to close.
 *
 * Navigation inside the app never reaches this — `beforeRemove` and the in-dialog discard prompt
 * cover that. This is the one way out of the app the router cannot see. Browsers show their own
 * fixed wording; the page cannot choose the message.
 */
export function useWarnOnTabClose(shouldWarn: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !shouldWarn || typeof window === 'undefined') return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // older Chrome and Edge ask only when this is set
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [shouldWarn]);
}
