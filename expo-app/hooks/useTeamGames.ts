import { useMemo } from 'react';
import { useOrgFixtures } from './useOrgFixtures';

/**
 * One team's games, from its organisation's fixtures, and the competitions' names
 * (docs/teams.md).
 */
export function useTeamGames(orgId?: string | null, teamId?: string | null) {
  const { games: all, eventNames, isLoading } = useOrgFixtures(orgId);
  const games = useMemo(
    () => (teamId ? all.filter(g => g.participants?.some(p => p.teamId === teamId)) : []),
    [all, teamId]
  );
  return { games, eventNames, isLoading };
}
