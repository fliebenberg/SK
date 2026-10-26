import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MapPage } from '../../../../../components/address/MapPage';
import { useEventDivisions, useEventFacilityIds, useEventRecord, useSports } from '../../../../../hooks/useEventRooms';
import { useOrgSites } from '../../../../../hooks/useOrgSites';
import { useSafeBack } from '../../../../../hooks/useSafeBack';
import { useTournamentLinks } from '../../../../../components/tournament/tournamentLinks';

/**
 * Where a tournament is played, on a full map (`VENUE-10`): its base site's pin and the facilities it
 * uses, opened from the *Where* card's map. With `?division=<id>` — from a division's site map — only
 * that division's courts. Public under `/events/[eventId]/map` like the tournament page, from the same
 * rooms: the event, its facilities and divisions, and the host's sites.
 */
export default function TournamentMap() {
  const { orgId, eventId, division: divisionId } = useLocalSearchParams<{ orgId: string; eventId: string; division?: string }>();
  const links = useTournamentLinks(orgId);
  const safeBack = useSafeBack();
  const { event, isLoading, accessDenied } = useEventRecord(eventId);
  const facilityIds = useEventFacilityIds(eventId);
  const divisions = useEventDivisions(eventId);
  const { sites, facilities } = useOrgSites(event?.orgId);
  const sports = useSports();

  const division = divisionId ? divisions.find(d => d.id === divisionId) || null : null;
  const site = sites.find(s => s.id === event?.siteId) || null;
  // A division's own courts only — or, when it has none, "any of the tournament's", as its page says.
  // Either set may be off the base site.
  const shownIds = division?.facilityIds?.length ? division.facilityIds : facilityIds;
  const shown = useMemo(() => facilities.filter(f => shownIds.includes(f.id)), [facilities, shownIds]);

  const back = divisionId
    ? { label: division?.name || 'Division', to: links.event(eventId, `/divisions/${divisionId}`) }
    : { label: 'Overview', to: links.event(eventId) };

  return (
    <MapPage
      backLabel={back.label}
      onBack={() => safeBack(back.to)}
      context={event?.name}
      isLoading={isLoading && !event}
      emptyText={accessDenied || (!isLoading && !event) ? 'This tournament could not be found.' : !site && !shown.length ? 'No venue has been set for this tournament yet.' : null}
      name={site?.name || event?.name || ''}
      address={site?.address || null}
      facilities={shown}
      sports={sports}
    />
  );
}
