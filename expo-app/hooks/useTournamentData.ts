import { useEventDivisions, useEventFacilityIds, useEventFixtures, useEventRecord, useSports } from './useEventRooms';
import { useEventEntrants } from './useEventEntrants';
import { useEventCapabilities } from './useEventCapabilities';
import { useOrgSummary } from './useOrgSummary';
import { useOrgSites } from './useOrgSites';
import { useAuthStore } from '../store/authStore';

/**
 * What a tournament's pages need of it — the tournament page and its full pages
 * (`events/[eventId]/sports`, `events/[eventId]/organisations`; 2026-10-09): the event, its fixtures,
 * divisions and facilities from their rooms, the roster for an organiser, the host's sites and
 * facilities, the sports, the viewer's capabilities and the host. Built from the one-room hooks in
 * `useEventRooms`, so every screen reads each room's messages the same way.
 */
export function useTournamentData(orgId?: string, eventId?: string) {
  const { event, isLoading: eventLoading, accessDenied } = useEventRecord(eventId);
  const games = useEventFixtures(eventId);
  const divisions = useEventDivisions(eventId);
  const facilityIds = useEventFacilityIds(eventId);
  // The host's venues: the tournament is played at its sites, whoever is looking (a guest's own are not it).
  const { sites, facilities } = useOrgSites(event?.orgId);
  const sports = useSports();

  const { capabilities } = useEventCapabilities(eventId);
  const canEdit = !!capabilities?.canEditEvent;
  // The roster is the members' tier: the organisers, and the members of an organisation taking part
  // or invited — a coach finds their own teams in it (`FIX-31`), as the server's room allows.
  const memberOrgIds = useAuthStore((state: any) => (state.orgMemberships || []).map((m: any) => m.orgId)) as string[];
  const takesPart = !!event?.participatingOrgs?.some(o =>
    memberOrgIds.includes(o.id) && (o.invitation === 'invited' || o.invitation === 'accepted' || o.invitation === 'withdrawal_pending'));
  const { entrants, byDivision: entrantsByDivision } = useEventEntrants(eventId, canEdit || takesPart);
  const { org: hostOrg } = useOrgSummary(event?.orgId);

  return { event, eventLoading, accessDenied, games, divisions, facilityIds, sites, facilities, sports, capabilities, canEdit, entrants, entrantsByDivision, hostOrg };
}
