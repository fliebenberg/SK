import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventListRow, GameListRow } from '@sk/shared';
import { wsService } from '../services/websocket';

/**
 * The live part of a list's rows, one light room each (live-data skill, *A row in a list*). The list
 * itself comes from a read, which says what to show and who is playing; these keep the score and
 * status moving on the few rows that can change now. `useLiveRoom` is for a room known when the
 * screen is written, and here the rooms come and go with the list.
 *
 * Holds an entry only while its room is held, so a list read taken since it let go is never
 * overwritten by something older. `null` means the row was removed.
 */
function useRowRooms<T>(
  ids: string[],
  roomOf: (id: string) => string,
  updated: string,
  removed: string | null,
  enabled: boolean,
) {
  const [rows, setRows] = useState<ReadonlyMap<string, T | null>>(() => new Map());
  const held = useRef(new Map<string, () => void>());

  const handle = useCallback((message: { topic?: string; type: string; data: any }) => {
    if (message?.type !== updated && message?.type !== removed) return;
    const id = message.topic?.split(':')[1];
    if (!id || !held.current.has(id) || message.topic !== roomOf(id)) return;
    setRows(prev => new Map(prev).set(id, message.type === updated ? message.data : null));
  }, [roomOf, updated, removed]);

  const wanted = enabled ? [...new Set(ids)].sort().join(',') : '';

  useEffect(() => {
    if (!enabled) return;
    const mine = held.current;
    wsService.on('update', handle);
    return () => {
      wsService.off('update', handle);
      mine.forEach(release => release());
      mine.clear();
      setRows(new Map());
    };
  }, [enabled, handle]);

  // Only the difference: a refreshed list that still shows the same rows joins nothing.
  useEffect(() => {
    if (!enabled) return;
    const next = new Set(wanted ? wanted.split(',') : []);
    let dropped = false;
    held.current.forEach((release, id) => {
      if (next.has(id)) return;
      release();
      held.current.delete(id);
      dropped = true;
    });
    if (dropped) {
      setRows(prev => new Map([...prev].filter(([id]) => next.has(id))));
    }
    next.forEach(id => {
      if (held.current.has(id)) return;
      // Set before subscribing: a room another screen holds replays into `handle` straight away.
      held.current.set(id, () => {});
      held.current.set(id, wsService.subscribeToRoom(roomOf(id), handle));
    });
  }, [enabled, wanted, roomOf, handle]);

  return rows;
}

const gameRowRoom = (id: string) => `game:${id}:row`;
const eventRowRoom = (id: string) => `event:${id}:row`;

/** The live status, score and times of these games, by id. `null` for one that has been deleted. */
export function useGameRows(gameIds: string[], enabled: boolean) {
  return useRowRooms<GameListRow>(gameIds, gameRowRoom, 'GAME_ROW_UPDATED', 'GAME_ROW_REMOVED', enabled);
}

/** How many games these tournaments have, and how many are live, by id. */
export function useEventRows(eventIds: string[], enabled: boolean) {
  return useRowRooms<EventListRow>(eventIds, eventRowRoom, 'EVENT_ROW_UPDATED', null, enabled);
}
