import { useCallback, useEffect, useState } from 'react';
import { EventCapabilities, EventGrants } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';
import { readData } from '../services/reads';
import { useWsStore } from '../store/wsStore';
import { useAuthStore } from '../store/authStore';
import { useIsPublicTournament } from '../components/tournament/tournamentLinks';

/**
 * What *this user* may do in *this tournament* — asked of the server, because the client cannot
 * work it out (UI doc §4).
 *
 * Two things about the shape, both from Phase 4 and both load-bearing:
 *
 * - **It is its own read, not a field on the event.** A `canEdit` on the event or division object
 *   would be published to `event:{id}` and `division:{id}` like everything else, and those are
 *   *rooms* — one viewer's answer would be delivered to every other viewer, and the next broadcast
 *   of that object would silently overwrite it client-side.
 * - **The identity is the socket's**, proven by the handshake. There is no way to ask what somebody
 *   else may do, which is why the request carries no user id.
 *
 * Refreshed on `EVENT_CAPABILITIES_UPDATED`, which the server pushes to `user:{id}:capabilities`
 * when a grant changes. That room is held here rather than by the root layout: it is one dataset
 * of its own (rule 4), and the hook that depends on it is the honest place to hold it. A withdrawn
 * convenor's controls disappear at once rather than at their next reconnect.
 *
 * On the public tournament page (`FIX-25`) there is nothing to ask: it is read-only whoever is
 * looking, an organiser included — their workspace is where they edit.
 *
 * **A failed read is not "no rights" (`SYNC-9`).** `capabilities` stays what the server last said for
 * this event and user, through a failed read and a dropped connection alike; it is `null` when nothing
 * has been answered yet. So null with `error` set means *not known*, and a screen must not deny anyone
 * on it. It toasts unless `suppressToast` says the screen draws `error` itself.
 */
export function useEventCapabilities(eventId?: string | null, options: { suppressToast?: boolean } = {}) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const isPublic = useIsPublicTournament();
  const userId = useAuthStore((state: any) => (isPublic ? undefined : state.user?.id));
  const [capabilities, setCapabilities] = useState<EventCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  // What is held answers for one event and one user, and nothing else.
  useEffect(() => {
    setCapabilities(null);
    setError(null);
  }, [eventId, userId]);

  useEffect(() => {
    if (!isConnected || !eventId || !userId) {
      setIsLoading(!!eventId);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);

    void readData<EventCapabilities | null>('event_capabilities', { eventId }, {
      suppressToast: options.suppressToast,
      stillWanted: () => active,
    }).then(result => {
      if (!active) return;
      if (result.ok) setCapabilities(result.data || null);
      else setError(result.message);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isConnected, eventId, userId, attempt]);

  // The push carries the freshly computed capabilities, so this is a merge rather than a nudge to
  // refetch — rule 1 of the live-data skill. It is filtered to this event because one socket may hold
  // grants on several. Held tagged with the event, so another event's answer is never adopted.
  const live = useLiveRoom<EventCapabilities & { id: string }>(eventId && userId ? `user:${userId}:capabilities` : null, {
    reduce: message =>
      message.type === 'EVENT_CAPABILITIES_UPDATED' && message.data?.eventId === eventId
        ? { kind: 'replace', items: [{ ...message.data, id: eventId! }] }
        : { kind: 'ignore' },
  });
  const pushed = live.items[0]?.id === eventId ? live.items[0] : undefined;
  useEffect(() => {
    if (pushed) setCapabilities(pushed);
  }, [pushed]);

  return { capabilities, isLoading, error, retry, room: live.room };
}

const EMPTY_GRANTS: EventGrants = { eventIds: [], sports: [], divisions: [] };

/**
 * The same question asked across a *list* of events, in one read.
 *
 * A fixtures list showing role chips on thirty cards cannot afford `event_capabilities` per card —
 * that is thirty round trips on a screen load, which is the cost the whole live-data design exists
 * to remove. So the list asks for the one thing it cannot derive: the grants this user holds.
 * Hosting and attending are computed from data the client already has (see `deriveEventRoles`),
 * exactly as UI doc §4 says they can be.
 *
 * This is display only. Every write is gated server-side regardless of what a chip says, and the
 * event screen still asks `event_capabilities` for the authoritative answer before showing a
 * control.
 *
 * `user:{id}:capabilities` hands the grants over on join and republishes them whenever one changes,
 * so this issues no query at all (rule 2) and never re-reads on a notification (rule 1). It used to
 * do both: a `get_data my_event_grants` per mounted consumer, repeated on every
 * `EVENT_CAPABILITIES_UPDATED` — two reads on a single screen open, and more as consumers mounted.
 */
export function useMyEventGrants() {
  const userId = useAuthStore((state: any) => state.user?.id);
  const { items, room } = useLiveRoom<{ id: string; grants: EventGrants }>(userId ? `user:${userId}:capabilities` : null, {
    reduce: message =>
      message.type === 'EVENT_GRANTS_SYNC'
        ? { kind: 'replace', items: [{ id: 'grants', grants: message.data && Array.isArray(message.data.eventIds) ? message.data : EMPTY_GRANTS }] }
        : { kind: 'ignore' },
  });
  // A refused room is held as nothing (`useLiveRoom` empties it), which is no grants.
  const grants: EventGrants = (userId && items[0]?.grants) || EMPTY_GRANTS;

  return { grants, room };
}
