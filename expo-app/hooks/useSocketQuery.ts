import { useState, useEffect, useCallback, useRef } from 'react';
import { NoAnswer, wsService } from '../services/websocket';
import { reportClientFailure } from '../services/clientFailures';
import { useWsStore } from '../store/wsStore';
import { useToastStore } from '../store/toastStore';

/** How long after no answer to ask again. Asked twice in all, as `sendAction` does (`SYNC-9`). */
const RETRY_AFTER_MS = 2000;

const NO_ANSWER_MESSAGES: Record<NoAnswer['noAnswer'], string> = {
  offline: 'Not connected to the server.',
  timeout: 'The server did not answer in time.',
};

/**
 * One `get_data` read, again whenever the connection or the question changes.
 *
 * **A failed read is not an empty answer (`SYNC-9`).** `error` holds what went wrong, as a sentence to
 * show. `data` keeps the last answer to this same question, so a failed refresh does not blank a list;
 * it is `null` when a failure leaves nothing to show for the question being asked. No answer is asked
 * again once by itself and then reported to the failures log. Unless `suppressToast` is set, which
 * means the screen shows `error` itself, the final failure is toasted once.
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
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The question `data` answers. */
  const answered = useRef<string | null>(null);

  const stopReading = useCallback(() => {
    currentRead.current++;
    clearTimeout(retryTimer.current);
  }, []);

  const fetchData = useCallback(() => {
    if (!isConnected || !enabled) return;

    stopReading();
    const read = currentRead.current;
    setIsLoading(true);
    setError(null);

    const fail = (message: string) => {
      setError(message);
      // An answer to a different question must not stand in for this one.
      if (answered.current !== question) setData(null);
      setIsLoading(false);
      if (!options.suppressToast) useToastStore.getState().showError(message, 'Could not load');
    };

    const ask = (mayRetry: boolean) => {
      wsService.emit(
        'get_data',
        { type, ...payload },
        (res: any, none?: NoAnswer) => {
          if (currentRead.current !== read) return;
          if (none) {
            if (mayRetry) {
              retryTimer.current = setTimeout(() => ask(false), RETRY_AFTER_MS);
              return;
            }
            const message = NO_ANSWER_MESSAGES[none.noAnswer];
            // The type only: a read's payload can hold a position or someone's details.
            reportClientFailure({ actionType: `get_data:${type}`, kind: 'no-answer', message });
            fail(message);
          } else if (res && res.error) {
            fail(typeof res.error === 'string' ? res.error : 'The server refused the request.');
          } else {
            answered.current = question;
            setData(res);
            setIsLoading(false);
          }
        },
        options.timeoutMs,
        // This hook announces the final failure, once, so a retry that works says nothing.
        { suppressToast: true }
      );
    };
    ask(true);
  }, [isConnected, enabled, type, payloadString, options.timeoutMs, options.suppressToast, stopReading]);

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
