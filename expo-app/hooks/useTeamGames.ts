import { useMemo } from 'react';
import { GameSummary, TeamSeasonResults } from '@sk/shared';
import { seasonRange } from '../utils/dates';
import { useOrgFixtures } from './useOrgFixtures';
import { useStaticRead } from './useStaticRead';

/**
 * One team's games and the competitions' names (docs/teams.md): what is current from its
 * organisation's fixtures room, live, and the finished games of the season being looked at, read
 * once (`LIST-1`). `gameCount` and `seasons` cover every game it has ever had.
 *
 * With `error` set the finished games and those counts are not known (`SYNC-9`): the page says so
 * rather than "no results", and does not offer deleting a team that may have games.
 */
export function useTeamGames(orgId?: string | null, teamId?: string | null, season?: number) {
  const { games: current, eventNames: currentNames, isLoading } = useOrgFixtures(orgId);
  const { data, error, retry } = useStaticRead<TeamSeasonResults>(
    'team_season_results',
    teamId && season ? { teamId, ...seasonRange(season) } : null,
    { suppressToast: true },
  );
  const games = useMemo(() => {
    const byId = new Map<string, GameSummary>((data?.games || []).map(g => [g.id, g]));
    // The room's copy is the live one.
    for (const g of current) if (teamId && g.participants?.some(p => p.teamId === teamId)) byId.set(g.id, g);
    return [...byId.values()];
  }, [current, data, teamId]);
  const eventNames = useMemo(
    () => new Map([...Object.entries(data?.eventNames ?? {}), ...currentNames]),
    [data, currentNames]
  );
  return {
    games,
    eventNames,
    isLoading,
    gameCount: Math.max(data?.gameCount ?? 0, games.length),
    seasons: data?.seasons ?? [],
    error,
    retry,
  };
}
