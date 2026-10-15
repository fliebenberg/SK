import { GameSummary } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * One game's summary, live: the teams with their crests, the score, the status and the clock.
 * `game:{id}:summary` answers a join with the summary and republishes it on every change, so the
 * game page's scoreboard moves with the match without reading the full record again.
 */
export function useGameSummary(gameId?: string | null) {
  const { items, isLoading, accessDenied } = useLiveRoom<GameSummary>(gameId ? `game:${gameId}:summary` : null, {
    reduce: (message) =>
      message.type === 'GAME_SUMMARY_UPDATED' && message.data?.id === gameId
        ? { kind: 'replace', items: [message.data] }
        : { kind: 'ignore' },
  });
  return { summary: items[0] as GameSummary | undefined, isLoading, accessDenied };
}
