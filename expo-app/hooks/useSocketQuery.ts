import { useState, useEffect, useCallback, useRef } from 'react';
import { readData } from '../services/reads';
import { useWsStore } from '../store/wsStore';

/**
 * One `get_data` read, again whenever the connection or the question changes.
 *
 * **A failed read is not an empty answer (`SYNC-9`).** `error` holds what went wrong, as a sentence to
 * show. `data` keeps the last answer to this same question, so a failed refresh does not blank a list;
 * it is `null` when a failure leaves nothing to show for the question being asked. Retrying, logging
 * and the toast are `readData`'s, and `suppressToast` means the screen draws `error` itself.
 */
export function useSocketQuery<T = any>(
  type: string,
  payload: Record<string, any> = {},
  options: { timeoutMs?: number; suppressToast?: boolean; enabled?: boolean } = {}
) {
  // `enabled: false` sends nothing — for data the screen will not show. `refetch` is a no-op too.
  const enabled = options.enabled !== false;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const isConnected = useWsStore(state => state.isConnected);

  // Stringify payload to use as key in dependency array
  const payloadString = JSON.stringify(payload);
  const question = `${type}:${payloadString}`;

  /** Bumped by every new read, so that only the latest may answer. */
  const currentRead = useRef(0);
  /** The question `data` answers. */
  const answered = useRef<string | null>(null);

  const stopReading = useCallback(() => { currentRead.current++; }, []);

  const fetchData = useCallback(() => {
    if (!isConnected || !enabled) return;

    const read = ++currentRead.current;
    const isCurrent = () => currentRead.current === read;
    setIsLoading(true);
    setError(null);

    void readData<T>(type, payload, {
      timeoutMs: options.timeoutMs,
      suppressToast: options.suppressToast,
      stillWanted: isCurrent,
    }).then(result => {
      if (!isCurrent()) return;
      if (result.ok) {
        answered.current = question;
        setData(result.data);
      } else {
        setError(result.message);
        // An answer to a different question must not stand in for this one.
        if (answered.current !== question) setData(null);
      }
      setIsLoading(false);
    });
  }, [isConnected, enabled, type, payloadString, options.timeoutMs, options.suppressToast]);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      setIsLoading(false);
      return;
    }

    if (!isConnected) {
      setIsLoading(true);
      return;
    }

    fetchData();
    return stopReading;
  }, [isConnected, enabled, fetchData, stopReading]);

  return { data, isLoading, error, refetch: fetchData, setData };
}
