import { useMemo } from 'react';
import { Event, GameSummary } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * An organisation's games and events, kept live: its fixtures room — which carries an away game
 * too, since its audience is the host and every org playing — and its events room, which likewise
 * includes any event its teams play in. Both push everything on join and every change after, so
 * nothing here fetches. The team page and the site page each take their slice of it
 * (`useTeamGames`, `useSiteGames`).
 */
export function useOrgFixtures(orgId?: string | null) {
  const { items: games, isLoading } = useLiveRoom<GameSummary>(orgId ? `org:${orgId}:fixtures` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'GAME_SUMMARIES_SYNC':
          return { kind: 'replace', items: Array.isArray(message.data) ? message.data : [] };
        case 'GAME_SUMMARY_UPDATED':
          return message.data?.id ? { kind: 'upsert', item: message.data } : { kind: 'ignore' };
        case 'GAME_SUMMARY_REMOVED':
          return message.data?.id ? { kind: 'remove', id: message.data.id } : { kind: 'ignore' };
        default:
          return { kind: 'ignore' };
      }
    },
  });
  const { items: events } = useLiveRoom<Event>(orgId ? `org:${orgId}:events` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'EVENTS_SYNC':
          return { kind: 'replace', items: Array.isArray(message.data) ? message.data : [] };
        case 'EVENT_ADDED':
        case 'EVENT_UPDATED':
          return message.data?.id ? { kind: 'upsert', item: message.data } : { kind: 'ignore' };
        case 'EVENT_DELETED':
          return message.data?.id ? { kind: 'remove', id: message.data.id } : { kind: 'ignore' };
        default:
          return { kind: 'ignore' };
      }
    },
  });
  const eventNames = useMemo(() => new Map(events.map(e => [e.id, e.name])), [events]);
  return { games, events, eventNames, isLoading };
}
