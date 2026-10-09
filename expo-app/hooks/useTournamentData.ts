import { useEventDivisions, useEventFacilityIds, useEventFixtures, useEventRecord, useSports } from './useEventRooms';
import { useEventEntrants } from './useEventEntrants';
import { useEventCapabilities } from './useEventCapabilities';
import { useOrgSummary } from './useOrgSummary';
import { useOrgSites } from './useOrgSites';

/**
 * What a tournament's pages need of it — the tournament page and its full pages
 * (`events/[eventId]/sports`, `events/[eventId]/organisations`; 2026-10-09): the event, its fixtures,
 * divisions and facilities from their rooms, the roster for an organiser, the org's sites and
 * facilities, the sports, the viewer's capabilities and the host. Built from the one-room hooks in
 * `useEventRooms`, so every screen reads each room's messages the same way.
 */
export function useTournamentData(orgId?: string, eventId?: string) {
  const { event, isLoading: eventLoading, accessDenied } = useEventRecord(eventId);
  const games = useEventFixtures(eventId);
  const divisions = useEventDivisions(eventId);
  const facilityIds = useEventFacilityIds(eventId);
  const { sites, facilities } = useOrgSites(orgId);
  const sports = useSports();

  const { capabilities } = useEventCapabilities(eventId);
  const canEdit = !!capabilities?.canEditEvent;
  // The roster is the organiser's tier.
  const { entrants, byDivision: entrantsByDivision } = useEventEntrants(eventId, canEdit);
  const { org: hostOrg } = useOrgSummary(event?.orgId);

  return { event, eventLoading, accessDenied, games, divisions, facilityIds, sites, facilities, sports, capabilities, canEdit, entrants, entrantsByDivision, hostOrg };
}
