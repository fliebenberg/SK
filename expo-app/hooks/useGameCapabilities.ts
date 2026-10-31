import { useEffect, useState } from 'react';
import { GameCapabilities } from '@sk/shared';
import { wsService } from '../services/websocket';
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
 */
export function useGameCapabilities(gameId?: string | null) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const userId = useAuthStore((state: any) => state.user?.id);
  const [capabilities, setCapabilities] = useState<GameCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(!!gameId);

  useEffect(() => {
    if (!isConnected || !gameId || !userId) {
      setCapabilities(null);
      setIsLoading(false);
      return;
    }
    let active = true;
    setIsLoading(true);
    wsService.emit('get_data', { type: 'game_capabilities', gameId }, (res: any) => {
      if (!active) return;
      setCapabilities(res || null);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [isConnected, gameId, userId]);

  return { capabilities, isLoading };
}
