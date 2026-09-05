import { useEffect, useRef, useState } from 'react';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

/**
 * Subscribe to a room and hold whatever it publishes.
 *
 * The room's join push *is* the initial load — this hook never issues a
 * `get_data`, and neither should a screen that uses it. Every update carries
 * its data, so one server fan-out replaces N clients each firing their own
 * query the moment they are notified.
 *
 * Messages are matched on `topic`, so a screen only ever reacts to rooms it
 * actually joined. Socket.io does not tag a message with its room, which is
 * why the server stamps one on (see `wss/broadcast.ts`); without it a listener
 * cannot tell a fixtures update from an unrelated match screen's.
 */

export interface LiveMessage<T = any> {
  topic?: string;
  type: string;
  data: T;
}

/** How one message changes the collection a room is holding. */
export type LiveAction<T> =
  | { kind: 'replace'; items: T[] }
  | { kind: 'upsert'; item: T }
  /**
   * Many items, merged in **one** state update (U32).
   *
   * Generating a stage's fixtures produces ninety of them, and the server publishes them as a
   * single `STAGE_FIXTURES_SYNC` for exactly that reason (D13). Reducing them one at a time here
   * would relocate to the client the cost the batch contract removed on the server — ninety
   * upserts, ninety renders — which is why this kind lands with the batch messages rather than
   * after them.
   */
  | { kind: 'upsertMany'; items: T[] }
  /**
   * Replace one *slice* of the collection — the rows matching `where` go, and `items` take their
   * place.
   *
   * An event-level room can carry a message about one of its parts: `event:{id}:entrants` holds
   * every division's roster, and a roster edit publishes `DIVISION_ENTRANTS_SYNC` for the one
   * division that changed. That is neither a `replace` (it would blank the other fourteen
   * divisions) nor an `upsertMany` (it would keep entrants the edit removed). Both of those
   * mistakes are silent, which is why this is a kind of its own rather than something each screen
   * open-codes with `setItems`.
   */
  | { kind: 'replaceWhere'; items: T[]; where: (item: T) => boolean }
  | { kind: 'remove'; id: string }
  | { kind: 'ignore' };

export interface LiveRoomOptions<T> {
  /** Interpret a message. Return `ignore` for anything this room does not own. */
  reduce: (message: LiveMessage) => LiveAction<T>;
  /** Identity of an item, for upsert and remove. Defaults to `item.id`. */
  getId?: (item: T) => string;
  /** Skip joining without unmounting the hook (e.g. while an id is unresolved). */
  enabled?: boolean;
}

const defaultGetId = (item: any) => item?.id;

export function useLiveRoom<T = any>(
  room: string | null,
  { reduce, getId = defaultGetId, enabled = true }: LiveRoomOptions<T>
) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Read through refs so a caller need not memoise its reducer for the
  // subscription to stay put — re-joining a room on every render would undo
  // the whole point of subscribing.
  const reduceRef = useRef(reduce);
  const getIdRef = useRef(getId);
  reduceRef.current = reduce;
  getIdRef.current = getId;

  useEffect(() => {
    if (!isConnected || !room || !enabled) return;

    let active = true;
    setIsLoading(true);
    setAccessDenied(false);

    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (message: LiveMessage) => {
      if (!active || !message) return;
      // Older server builds send no topic; treating that as "not mine" would
      // silently blank the screen, so fall through to the reducer instead.
      if (message.topic && message.topic !== room) return;

      // DENIED refuses a join; REVOKED removes us from a room we already held,
      // which is what an org membership being withdrawn looks like from here.
      if (message.type === 'ROOM_ACCESS_DENIED' || message.type === 'ROOM_ACCESS_REVOKED') {
        setAccessDenied(true);
        setIsLoading(false);
        setItems([]);
        return;
      }

      const action = reduceRef.current(message);
      if (action.kind === 'ignore') return;

      if (action.kind === 'replace') {
        setItems(action.items || []);
        setIsLoading(false);
        return;
      }

      if (action.kind === 'upsert' || action.kind === 'upsertMany') {
        const incoming = action.kind === 'upsert' ? [action.item] : action.items || [];
        if (!incoming.length) return;
        setItems(prev => {
          // One pass over the existing rows, then one append of whatever was new — rather than a
          // findIndex per incoming item, which is what makes a ninety-fixture batch quadratic.
          const byId = new Map<string, T>();
          for (const item of incoming) byId.set(getIdRef.current(item), item);
          const next = prev.map(existing => {
            const id = getIdRef.current(existing);
            const replacement = byId.get(id);
            if (!replacement) return existing;
            byId.delete(id);
            return replacement;
          });
          return byId.size ? [...next, ...byId.values()] : next;
        });
        return;
      }

      if (action.kind === 'replaceWhere') {
        setItems(prev => [...prev.filter(existing => !action.where(existing)), ...(action.items || [])]);
        setIsLoading(false);
        return;
      }

      setItems(prev => prev.filter(existing => getIdRef.current(existing) !== action.id));
    };

    wsService.on('update', handleUpdate);

    return () => {
      active = false;
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, room, enabled]);

  return { items, isLoading, accessDenied, setItems };
}
