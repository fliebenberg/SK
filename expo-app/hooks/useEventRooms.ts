import { useEffect, useMemo, useState } from 'react';
import { Event, EventStandings, GameSummary, Sport, TournamentDivision } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';
import { useWsStore } from '../store/wsStore';
import { wsService } from '../services/websocket';

/**
 * One hook per event room, each the only place its messages are read (2026-10-09). The tournament
 * page, its full pages, the division page and the organisation page all join some of these rooms;
 * when each kept its own copy of the handler, a new message type taught to one screen and not the
 * others would have shown the same tournament differently on each. Rooms are reference-counted
 * (`subscribeToRoom`), so screens joining the same one share it. `useTournamentData` puts the set a
 * tournament's pages need together.
 */

/** The event itself, from `event:{id}`. */
export function useEventRecord(eventId?: string | null) {
  const { items, isLoading, accessDenied } = useLiveRoom<Event>(eventId ? `event:${eventId}` : null, {
    reduce: message =>
      message.type === 'EVENT_ADDED' || message.type === 'EVENT_UPDATED'
        ? { kind: 'upsert', item: message.data }
        : message.type === 'EVENT_DELETED'
          ? { kind: 'remove', id: message.data?.id }
          : { kind: 'ignore' },
  });
  return { event: items.find(e => e?.id === eventId) || null, isLoading, accessDenied, items };
}

/** The tournament's divisions, from `event:{id}:divisions`, in their order. */
export function useEventDivisions(eventId?: string | null) {
  const { items } = useLiveRoom<TournamentDivision>(eventId ? `event:${eventId}:divisions` : null, {
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
  return useMemo(() => [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)), [items]);
}

/** The event's fixture summaries, from `event:{id}:fixtures`. */
export function useEventFixtures(eventId?: string | null) {
  const { items } = useLiveRoom<GameSummary>(eventId ? `event:${eventId}:fixtures` : null, {
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
  return items;
}

/**
 * The facilities in play (U47), from `event:{id}:facilities`: a **set**, and the base site beside
 * it is not a filter on it — a tournament based at the school may still play half its fixtures on
 * the fields next door. Held as `{ id }` rows because that is the shape `useLiveRoom` addresses
 * items by; the ids are what every consumer wants.
 */
export function useEventFacilityIds(eventId?: string | null) {
  const { items } = useLiveRoom<{ id: string }>(eventId ? `event:${eventId}:facilities` : null, {
    reduce: message =>
      message.type === 'EVENT_FACILITIES_SYNC'
        ? { kind: 'replace', items: (message.data?.facilityIds || []).map((id: string) => ({ id })) }
        : { kind: 'ignore' },
  });
  return useMemo(() => items.map(row => row.id), [items]);
}

/**
 * The Standings tab's data (stage 4), from `event:{id}:standings`: the organisation leaderboard and
 * each division's whole table. Held as one item, since the room always sends the pair together.
 */
export function useEventStandings(eventId?: string | null) {
  const { items, isLoading } = useLiveRoom<EventStandings & { id: string }>(eventId ? `event:${eventId}:standings` : null, {
    reduce: message =>
      message.type === 'EVENT_STANDINGS_UPDATED'
        ? { kind: 'replace', items: [{ id: 'standings', rows: message.data?.rows || [], divisions: message.data?.divisions || [], sports: message.data?.sports || [] }] }
        : { kind: 'ignore' },
  });
  const standings = items[0];
  return { rows: standings?.rows || NO_ROWS, divisions: standings?.divisions || NO_DIVISIONS, sports: standings?.sports || NO_SPORTS, isLoading };
}
const NO_ROWS: EventStandings['rows'] = [];
const NO_DIVISIONS: EventStandings['divisions'] = [];
const NO_SPORTS: NonNullable<EventStandings['sports']> = [];

/** Every sport: global reference data that no room owns, so a one-shot read. */
export function useSports() {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [sports, setSports] = useState<Sport[]>([]);
  useEffect(() => {
    if (!isConnected) return;
    let live = true;
    wsService.emit('get_data', { type: 'sports' }, (res: any) => { if (live && Array.isArray(res)) setSports(res); });
    return () => { live = false; };
  }, [isConnected]);
  return sports;
}
