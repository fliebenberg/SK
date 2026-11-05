import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { onActionSucceeded } from '../services/actions';
import { readData } from '../services/reads';
import { useWsStore } from '../store/wsStore';

/**
 * One `get_data` read of something static (okf/live_rooms.md): no room, so it reads when the page
 * opens or comes back into view, when the connection returns, and after any change made from this
 * device. Passing no `params` reads nothing. A list a page at a time is `usePagedList`.
 *
 * **`data` being `null` only means "nothing" when `error` is empty (`SYNC-9`).** A failed read keeps
 * the last answer to the same question, says why in `error`, and toasts unless `suppressToast` is
 * set. With no connection and nothing to show it stays loading: the offline banner says why, and the
 * read happens when the connection returns.
 */
export function useStaticRead<T>(type: string, params: Record<string, unknown> | null, options: { suppressToast?: boolean } = {}) {
  const isConnected = useWsStore(state => state.isConnected);
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(!!params);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);
  /** The question `data` answers. */
  const answered = useRef<string | null>(null);
  const request = params ? JSON.stringify(params) : null;
  const question = request ? `${type}:${request}` : null;

  useEffect(() => {
    if (!request) {
      latest.current++;
      answered.current = null;
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    if (!isConnected) {
      setIsLoading(answered.current !== question);
      return;
    }
    const asked = ++latest.current;
    const isCurrent = () => asked === latest.current;
    void readData<T>(type, JSON.parse(request), { suppressToast: options.suppressToast, stillWanted: isCurrent }).then(result => {
      if (!isCurrent()) return;
      setIsLoading(false);
      if (result.ok) {
        answered.current = question;
        setData(result.data ?? null);
        setError(null);
      } else {
        setError(result.message);
        // An answer to a different question must not stand in for this one.
        if (answered.current !== question) setData(null);
      }
    });
  }, [type, request, isConnected, attempt]);

  useEffect(() => onActionSucceeded(() => setAttempt(n => n + 1)), []);

  // The first focus is the read above.
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focused.current) setAttempt(n => n + 1);
    focused.current = true;
  }, []));

  const retry = useCallback(() => {
    setError(null);
    if (answered.current !== question) setIsLoading(true);
    setAttempt(n => n + 1);
  }, [question]);

  return { data, isLoading, error, retry };
}
