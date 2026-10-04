import { useMemo } from 'react';
import { Facility } from '@sk/shared';
import { useOrgFixtures } from './useOrgFixtures';

/**
 * The organisation's games and events at one site (docs/sites.md): a game is here when it names
 * the site or one of its facilities, an event when it is based here.
 *
 * Only the organisation's own fixtures are on the client, so another organisation's game at this
 * site is not counted. The server's delete checks count everything, and say so when they refuse.
 */
export function useSiteGames(orgId: string | null | undefined, siteId: string | null | undefined, facilities: Facility[]) {
  const { games: all, events: allEvents, eventNames, isLoading } = useOrgFixtures(orgId);
  const facilityIds = useMemo(() => new Set(facilities.map(f => f.id)), [facilities]);
  const games = useMemo(
    () => (siteId ? all.filter(g => g.siteId === siteId || (!!g.facilityId && facilityIds.has(g.facilityId))) : []),
    [all, siteId, facilityIds]
  );
  const events = useMemo(() => (siteId ? allEvents.filter(e => e.siteId === siteId) : []), [allEvents, siteId]);
  /** Games played on each facility, for whether it can be deleted. */
  const gamesByFacility = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of games) if (g.facilityId) counts.set(g.facilityId, (counts.get(g.facilityId) || 0) + 1);
    return counts;
  }, [games]);
  return { games, events, eventNames, gamesByFacility, isLoading };
}
