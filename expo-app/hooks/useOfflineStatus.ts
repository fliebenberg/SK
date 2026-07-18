import { useState, useEffect, useRef } from 'react';
import { useWsStore } from '../store/wsStore';

/**
 * Hook to monitor the application's connection status.
 * It enforces a delay before declaring the app offline to handle minor network drops,
 * and briefly alerts the user when connection is re-established.
 */
export function useOfflineStatus(delayMs = 5000, recoveryShowMs = 2500) {
  const isConnected = useWsStore(state => state.isConnected);
  const [isOffline, setIsOffline] = useState(false);
  const [showOnlineAlert, setShowOnlineAlert] = useState(false);
  const prevConnectedRef = useRef(isConnected);

  // Effect 1: Handle connection transitions and offline debounce
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined = undefined;

    if (isConnected) {
      if (!prevConnectedRef.current) {
        // Just reconnected
        if (isOffline) {
          setIsOffline(false);
          setShowOnlineAlert(true);
        }
      }
    } else {
      // Just disconnected - hide online alert and set debounce timer
      setShowOnlineAlert(false);
      timer = setTimeout(() => {
        setIsOffline(true);
      }, delayMs);
    }

    prevConnectedRef.current = isConnected;

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isConnected, isOffline, delayMs]);

  // Effect 2: Handle resetting the online recovery alert after a brief delay
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined = undefined;

    if (showOnlineAlert) {
      timer = setTimeout(() => {
        setShowOnlineAlert(false);
      }, recoveryShowMs);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showOnlineAlert, recoveryShowMs]);

  return { isOffline, showOnlineAlert };
}

