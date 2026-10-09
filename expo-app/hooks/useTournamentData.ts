import { useEffect, useMemo, useState } from 'react';
import { Event, Facility, GameSummary, Site, Sport, TournamentDivision } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';
import { useEventEntrants } from './useEventEntrants';
import { useEventCapabilities } from './useEventCapabilities';
import { useOrgSummary } from './useOrgSummary';
import { useWsStore } from '../store/wsStore';
import { wsService } from '../services/websocket';

/**
 * What a section's full page needs of its tournament (`events/[eventId]/sports`,
 * `events/[eventId]/organisations`; 2026-10-09): the event, its fixtures, divisions and facilities
 * from their rooms, the roster for an organiser, the org's sites and facilities, the sports, the
 * viewer's capabilities and the host. The same rooms the tournament page joins, so a full page
 * opened over it shares their subscriptions (live-data skill: rooms are the read boundary).
 */
export function useTournamentData(orgId?: string, eventId?: string) {
  const isConnected = useWsStore((state: any) => state.isConnected);

  const { items: eventItems, isLoading: eventLoading, accessDenied } = useLiveRoom<Event>(eventId ? `event:${eventId}` : null, {
    reduce: message =>
      message.type === 'EVENT_ADDED' || message.type === 'EVENT_UPDATED'
        ? { kind: 'upsert', item: message.data }
        : message.type === 'EVENT_DELETED'
          ? { kind: 'remove', id: message.data?.id }
          : { kind: 'ignore' },
  });
  const event = eventItems.find(e => e?.id === eventId) || null;

  const { items: games } = useLiveRoom<GameSummary>(eventId ? `event:${eventId}:fixtures` : null, {
    reduce: message => {
      switch (message.type) {
        case 'GAME_SUMMARIES_SYNC': return { kind: 'replace', items: message.data || [] };
        case 'STAGE_FIXTURES_SYNC': return { kind: 'upsertMany', items: message.data?.games || [] };
        case 'GAME_SUMMARY_UPDATED': return { kind: 'upsert', item: message.data };
        case 'GAME_SUMMARY_REMOVED':
        case 'GAME_DELETED': return { kind: 'remove', id: message.data?.id };
        default: return { kind: 'ignore' };
      }
    },
  });

  const { items: divisionItems } = useLiveRoom<TournamentDivision>(eventId ? `event:${eventId}:divisions` : null, {
    reduce: message => {
      switch (message.type) {
        case 'DIVISIONS_SYNC': return { kind: 'replace', items: message.data || [] };
        case 'DIVISION_ADDED':
        case 'DIVISION_UPDATED': return { kind: 'upsert', item: message.data };
        case 'DIVISION_DELETED': return { kind: 'remove', id: message.data?.id };
        default: return { kind: 'ignore' };
      }
    },
  });
  const divisions = useMemo(() => [...divisionItems].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)), [divisionItems]);

  const { items: facilityRows } = useLiveRoom<{ id: string }>(eventId ? `event:${eventId}:facilities` : null, {
    reduce: message =>
      message.type === 'EVENT_FACILITIES_SYNC'
        ? { kind: 'replace', items: (message.data?.facilityIds || []).map((id: string) => ({ id })) }
        : { kind: 'ignore' },
  });
  const facilityIds = useMemo(() => facilityRows.map(row => row.id), [facilityRows]);

  const { items: sites } = useLiveRoom<Site>(orgId ? `org:${orgId}:sites` : null, {
    reduce: message => {
      switch (message.type) {
        case 'SITES_SYNC': return { kind: 'replace', items: message.data || [] };
        case 'SITE_ADDED':
        case 'SITE_UPDATED': return { kind: 'upsert', item: message.data };
        case 'SITE_DELETED': return { kind: 'remove', id: message.data?.id };
        default: return { kind: 'ignore' };
      }
    },
  });
  const { items: facilities } = useLiveRoom<Facility>(orgId ? `org:${orgId}:facilities` : null, {
    reduce: message => {
      switch (message.type) {
        case 'FACILITIES_SYNC': return { kind: 'replace', items: message.data || [] };
        case 'FACILITY_ADDED':
        case 'FACILITY_UPDATED': return { kind: 'upsert', item: message.data };
        case 'FACILITY_DELETED': return { kind: 'remove', id: message.data?.id };
        default: return { kind: 'ignore' };
      }
    },
  });

  // Sports are global reference data that no room owns, so this stays a one-shot read.
  const [sports, setSports] = useState<Sport[]>([]);
  useEffect(() => {
    if (!isConnected) return;
    let live = true;
    wsService.emit('get_data', { type: 'sports' }, (res: any) => { if (live && Array.isArray(res)) setSports(res); });
    return () => { live = false; };
  }, [isConnected]);

  const { capabilities } = useEventCapabilities(eventId);
  const canEdit = !!capabilities?.canEditEvent;
  // The roster is the organiser's tier, as on the tournament page.
  const { entrants, byDivision: entrantsByDivision } = useEventEntrants(eventId, canEdit);
  const { org: hostOrg } = useOrgSummary(event?.orgId);

  return { event, eventLoading, accessDenied, games, divisions, facilityIds, sites, facilities, sports, capabilities, canEdit, entrants, entrantsByDivision, hostOrg };
}
