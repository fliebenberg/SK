import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { onActionSucceeded } from '../services/actions';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

/**
 * One `get_data` read of something static (okf/live_rooms.md): no room, so it reads when the page
 * opens or comes back into view, when the connection returns, and after any change made from this
 * device. Passing no `params` reads nothing. A list a page at a time is `usePagedList`.
 */
export function useStaticRead<T>(type: string, params: Record<string, unknown> | null) {
  const isConnected = useWsStore(state => state.isConnected);
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(!!params);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  const request = params ? JSON.stringify(params) : null;

  useEffect(() => {
    if (!request) {
      setData(null);
      setIsLoading(false);
      return;
    }
    if (!isConnected) {
      setIsLoading(false);
      return;
    }
    const asked = ++latest.current;
    wsService.emit('get_data', { ...JSON.parse(request), type }, (res: any) => {
      if (asked !== latest.current) return;
      setIsLoading(false);
      setData(res && !res.error ? res : null);
    });
  }, [type, request, isConnected, attempt]);

  useEffect(() => onActionSucceeded(() => setAttempt(n => n + 1)), []);

  // The first focus is the read above.
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focused.current) setAttempt(n => n + 1);
    focused.current = true;
  }, []));

  return { data, isLoading };
}
