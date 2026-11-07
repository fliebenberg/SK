import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomStatus, wsService } from '../services/websocket';

/**
 * Subscribe to a room and hold whatever it publishes. The hold outlasts a dropped connection
 * (`LIVE-13`): the screen keeps what it has, and the room's push on reconnecting brings it up to date.
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
 *
 * No room leaves its screen loading for ever (`LIVE-25`). The server answers every join after the
 * join push, so the hook stops loading when the room has spoken even if it sent nothing; a room
 * for one record that does not exist says `ENTITY_NOT_FOUND` (`notFound`); and a join that is not
 * answered, cannot be sent or fails on the server comes back as `failure`, with `isLoading` left as it
 * was. Saying so is not this hook's job: a screen that shows the room's main content puts a
 * `RoomFailure` for `room` there, and any failed room no screen covers is said once by the app-wide
 * `RoomFailureNotice`.
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

/** A room that did not arrive: the reason to show, and whether what is held is from before. */
export interface RoomFailure {
  reason: string;
  /** The room had delivered before this attempt, so what the screen shows is last known, not nothing. */
  stale: boolean;
}

export function useLiveRoom<T = any>(
  room: string | null,
  { reduce, getId = defaultGetId, enabled = true }: LiveRoomOptions<T>
) {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [failure, setFailure] = useState<RoomFailure | null>(null);
  /** Whether this room has delivered anything — a push, an answer — since it was joined. */
  const deliveredRef = useRef(false);

  // Read through refs so a caller need not memoise its reducer for the
  // subscription to stay put — re-joining a room on every render would undo
  // the whole point of subscribing.
  const reduceRef = useRef(reduce);
  const getIdRef = useRef(getId);
  reduceRef.current = reduce;
  getIdRef.current = getId;

  useEffect(() => {
    if (!room || !enabled) return;

    let active = true;
    deliveredRef.current = false;
    setIsLoading(true);
    setAccessDenied(false);
    setNotFound(false);
    setFailure(null);

    const handleUpdate = (message: LiveMessage) => {
      if (!active || !message) return;
      // Older server builds send no topic; treating that as "not mine" would
      // silently blank the screen, so fall through to the reducer instead.
      if (message.topic && message.topic !== room) return;

      // DENIED refuses a join; REVOKED removes us from a room we already held,
      // which is what an org membership being withdrawn looks like from here.
      if (message.type === 'ROOM_ACCESS_DENIED' || message.type === 'ROOM_ACCESS_REVOKED') {
        deliveredRef.current = true;
        setAccessDenied(true);
        setIsLoading(false);
        setItems([]);
        return;
      }

      // The room's one record does not exist (`LIVE-25`). Said here, once, rather than by each
      // reducer, so no screen built on a record room can miss it and wait for ever.
      if (message.type === 'ENTITY_NOT_FOUND') {
        deliveredRef.current = true;
        setNotFound(true);
        setIsLoading(false);
        setItems([]);
        return;
      }

      const action = reduceRef.current(message);
      if (action.kind === 'ignore') return;
      deliveredRef.current = true;
      // The hold outlasts a change of who is signed in: the same room may let them in now.
      setAccessDenied(false);
      setNotFound(false);

      if (action.kind === 'replace') {
        setItems(action.items || []);
        setIsLoading(false);
        return;
      }

      if (action.kind === 'upsert' || action.kind === 'upsertMany') {
        const incoming = action.kind === 'upsert' ? [action.item] : action.items || [];
        if (!incoming.length) return;
        // A room that carries one entity has nothing to "replace": `event:{id}` hands its event
        // over as `EVENT_UPDATED`, and a division room its division as `DIVISION_UPDATED`. That
        // push is the initial load as much as a `*_SYNC` is, so it ends loading too — otherwise a
        // screen that waits on this flag spins forever with the entity already in hand.
        setIsLoading(false);
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

    // Listen first, then hold the room. If another screen already holds it, the join push went
    // to that screen and will not come again; the service replays what the room has delivered
    // so far into this same handler, so a late subscriber starts from the same state as the
    // first one (`LIVE-9`).
    // Where the room's join stands. The server answers after the join push, so by `ready` every
    // message the join brought has been reduced; a room that brought nothing has still answered.
    const handleStatus = (status: RoomStatus) => {
      if (!active) return;
      if (status.state === 'waiting') {
        setFailure(null);
        // A retry with nothing held shows the spinner again; with something held, the screen keeps it.
        if (!deliveredRef.current) setIsLoading(true);
        return;
      }
      if (status.state === 'ready') {
        deliveredRef.current = true;
        setFailure(null);
        setIsLoading(false);
        return;
      }
      if (status.reason === 'denied') {
        // Normally said by the `ROOM_ACCESS_DENIED` push already; this covers it arriving alone.
        deliveredRef.current = true;
        setAccessDenied(true);
        setIsLoading(false);
        setItems([]);
        return;
      }
      // `isLoading` stays as it is: with nothing held, the room has still not arrived, and ending the
      // load would let the screen draw its empty state ("No leagues yet") over a failure.
      setFailure({ reason: status.message, stale: deliveredRef.current });
    };

    wsService.on('update', handleUpdate);
    const unsubscribe = wsService.subscribeToRoom(room, handleUpdate, handleStatus);

    return () => {
      active = false;
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [room, enabled]);

  const retry = useCallback(() => {
    if (room && enabled) wsService.retryRoom(room);
  }, [room, enabled]);

  return { items, isLoading, accessDenied, notFound, failure, retry, room: room && enabled ? room : null, setItems };
}

/**
 * Hold a room for its updates, with the same status as `useLiveRoom` (`LIVE-25`), for a screen whose
 * first data comes from a read and whose merging does not fit `LiveAction` — the scoring screens,
 * which fold partial `liveState` updates into the game they read. `onMessage` hears every message
 * for this room, the replay a late subscriber is owed included (`LIVE-9`), so the screen needs no
 * `'update'` listener of its own for it; leave it out to hold the room for a listener the screen
 * already has. Returns `room` for a `RoomFailure`.
 */
export function useRoom(
  room: string | null,
  onMessage?: (message: LiveMessage) => void,
  { enabled = true }: { enabled?: boolean } = {}
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const { isLoading, accessDenied, notFound, failure, retry, room: held } = useLiveRoom(room, {
    enabled,
    reduce: message => {
      onMessageRef.current?.(message);
      return { kind: 'ignore' };
    },
  });
  return { isLoading, accessDenied, notFound, failure, retry, room: held };
}
