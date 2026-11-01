import { useEffect, useRef, useState } from 'react';
import { PaginatedResponse, TeamDirectoryEntry } from '@sk/shared';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

const PAGE_SIZE = 100;
const SEARCH_DELAY_MS = 300;

/**
 * One page of the public Teams list, filtered on the server (`get_data` `team_directory`). It is a
 * static list (okf/live_rooms.md): read when asked for and when the connection returns, with no room
 * to hold. A search goes back to the first page, and an answer that arrives after a newer question
 * is dropped.
 */
export function useTeamDirectory({ mine, search, page, enabled = true }: {
  mine: boolean;
  search: string;
  page: number;
  enabled?: boolean;
}) {
  const isConnected = useWsStore(state => state.isConnected);
  const [result, setResult] = useState<PaginatedResponse<TeamDirectoryEntry> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  // Typing waits for a pause; changing tab or page does not.
  const [term, setTerm] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (!isConnected) {
      setError("Can't load teams: not connected to the server.");
      setIsLoading(false);
      return;
    }
    const asked = ++latest.current;
    setIsLoading(true);
    setError(null);
    wsService.emit('get_data', { type: 'team_directory', mine, search: term.trim(), page, limit: PAGE_SIZE }, (res: any) => {
      if (asked !== latest.current) return;
      setIsLoading(false);
      if (res && Array.isArray(res.items)) {
        setResult(res);
      } else {
        setResult(null);
        setError(res?.message ? `Can't load teams: ${res.message}` : "Can't load teams: the server didn't answer.");
      }
    });
  }, [enabled, isConnected, mine, term, page, attempt]);

  return {
    teams: result?.items ?? [],
    total: result?.total ?? 0,
    limit: result?.limit ?? PAGE_SIZE,
    isLoading,
    error,
    /** Whether what is showing is for the search as typed, rather than one still on its way. */
    isSettled: term === search,
    term,
    retry: () => setAttempt(n => n + 1),
  };
}
