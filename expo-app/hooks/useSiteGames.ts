import { useMemo } from 'react';
import { Facility, SiteGameCounts } from '@sk/shared';
import { useOrgFixtures } from './useOrgFixtures';
import { useStaticRead } from './useStaticRead';

/**
 * The organisation's games and events at one site (docs/sites.md): a game is here when it names
 * the site or one of its facilities, an event when it is based here.
 *
 * Only the organisation's current fixtures are on the client, so `games` is what is coming up. How
 * many games the site and each facility have ever had, whoever's, is read from the server
 * (`LIST-1`), for whether they can be deleted.
 */
export function useSiteGames(orgId: string | null | undefined, siteId: string | null | undefined, facilities: Facility[]) {
  const { games: all, events: allEvents, eventNames, isLoading } = useOrgFixtures(orgId);
  const { data: counts } = useStaticRead<SiteGameCounts>('site_game_counts', siteId ? { siteId } : null);
  const facilityIds = useMemo(() => new Set(facilities.map(f => f.id)), [facilities]);
  const games = useMemo(
    () => (siteId ? all.filter(g => g.siteId === siteId || (!!g.facilityId && facilityIds.has(g.facilityId))) : []),
    [all, siteId, facilityIds]
  );
  const events = useMemo(() => (siteId ? allEvents.filter(e => e.siteId === siteId) : []), [allEvents, siteId]);
  /** Games played on each facility, for whether it can be deleted. */
  const gamesByFacility = useMemo(() => new Map(Object.entries(counts?.byFacility ?? {})), [counts]);
  return { games, gameCount: Math.max(counts?.games ?? 0, games.length), events, eventNames, gamesByFacility, isLoading };
}
