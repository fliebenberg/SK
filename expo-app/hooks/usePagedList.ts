import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { PaginatedResponse } from '@sk/shared';
import { onActionSucceeded } from '../services/actions';
import { readData } from '../services/reads';
import { useWsStore } from '../store/wsStore';

const PAGE_SIZE = 100;
const SEARCH_DELAY_MS = 300;

/**
 * One page of a static list, filtered on the server (`get_data`, okf/live_rooms.md). There is no room
 * to hold: it reads when asked, when the page comes back into view and when the connection returns,
 * because a tab stays mounted and would otherwise keep showing what it first read. An answer that
 * arrives after a newer question is dropped.
 *
 * @param type The `get_data` read.
 * @param noun What to call the records in an error ("teams").
 * @param params The list's own filters, such as `mine`.
 * @param enabled Off, it reads nothing: a dialog's list, until the dialog opens.
 * @param followActions Also read again after any action of this device's, for a list the viewer changes from the page it is on.
 */
export function usePagedList<T, R extends PaginatedResponse<T> = PaginatedResponse<T>>({ type, noun, params, search, page, enabled = true, followActions = false }: {
  type: string;
  noun: string;
  params?: Record<string, unknown>;
  search: string;
  page: number;
  enabled?: boolean;
  followActions?: boolean;
}) {
  const isConnected = useWsStore(state => state.isConnected);
  const [result, setResult] = useState<R | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const latest = useRef(0);

  // Typing waits for a pause; changing tab or page does not.
  const [term, setTerm] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const [attempt, setAttempt] = useState(0);
  const filters = JSON.stringify(params ?? {});
  useEffect(() => {
    if (!enabled) return;
    if (!isConnected) {
      setError(`Can't load ${noun}: not connected to the server.`);
      setIsLoading(false);
      return;
    }
    const asked = ++latest.current;
    const isCurrent = () => asked === latest.current;
    setIsLoading(true);
    setError(null);
    setRefused(false);
    // The list's screen draws `error`, so no toast as well.
    const request = { ...JSON.parse(filters), search: term.trim(), page, limit: PAGE_SIZE };
    void readData<R>(type, request, { suppressToast: true, stillWanted: isCurrent }).then(reply => {
      if (!isCurrent()) return;
      setIsLoading(false);
      if (reply.ok && Array.isArray(reply.data?.items)) {
        setResult(reply.data);
      } else {
        setResult(null);
        setRefused(!reply.ok && !reply.noAnswer);
        setError(`Can't load ${noun}: ${reply.ok ? 'the server sent an answer the app could not read.' : reply.message}`);
      }
    });
  }, [enabled, isConnected, type, noun, filters, term, page, attempt]);

  useEffect(() => {
    if (!enabled || !followActions) return;
    return onActionSucceeded(() => setAttempt(n => n + 1));
  }, [enabled, followActions]);

  // The first focus is the read above.
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focused.current) setAttempt(n => n + 1);
    focused.current = true;
  }, []));

  return {
    response: result,
    items: result?.items ?? [],
    total: result?.total ?? 0,
    limit: result?.limit ?? PAGE_SIZE,
    isLoading,
    error,
    /** The server answered no, rather than not answering: the list is not this viewer's to read. */
    refused,
    /** Whether what is showing is for the search as typed, rather than one still on its way. */
    isSettled: term === search,
    term,
    retry: () => setAttempt(n => n + 1),
  };
}
