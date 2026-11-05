import { useCallback, useEffect, useState } from 'react';
import { GameCapabilities } from '@sk/shared';
import { readData } from '../services/reads';
import { useWsStore } from '../store/wsStore';
import { useAuthStore } from '../store/authStore';

/**
 * What *this user* may do at *this game* — asked of the server, because an appointed official
 * (scorer, match official, timekeeper) shows in no membership the client holds (`PERM-6`, `PERM-7`).
 * Its own read rather than a field on the game, for the reason `useEventCapabilities` gives: the game
 * is published to a room, and one viewer's answer must not reach the others.
 *
 * Asked once per game and connection; an appointment made while the screen is open shows on the
 * next visit.
 *
 * **A failed read is not "no rights" (`SYNC-9`).** As with `useEventCapabilities`, `capabilities` stays
 * what the server last said through a failed read and a dropped connection, so null with `error` set
 * means *not known*. It toasts unless `suppressToast` says the screen draws `error` itself.
 */
export function useGameCapabilities(gameId?: string | null, options: { suppressToast?: boolean } = {}) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const userId = useAuthStore((state: any) => state.user?.id);
  const [capabilities, setCapabilities] = useState<GameCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(!!gameId);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  // What is held answers for one game and one user, and nothing else.
  useEffect(() => {
    setCapabilities(null);
    setError(null);
  }, [gameId, userId]);

  useEffect(() => {
    if (!isConnected || !gameId || !userId) {
      // Without a connection nothing is known yet; with no game or no user there is nothing to ask.
      setIsLoading(!!gameId && !!userId);
      return;
    }
    let active = true;
    setIsLoading(true);
    setError(null);
    void readData<GameCapabilities | null>('game_capabilities', { gameId }, {
      suppressToast: options.suppressToast,
      stillWanted: () => active,
    }).then(result => {
      if (!active) return;
      if (result.ok) setCapabilities(result.data || null);
      else setError(result.message);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [isConnected, gameId, userId, attempt]);

  return { capabilities, isLoading, error, retry };
}
