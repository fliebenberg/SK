import { useCallback, useEffect, useState } from 'react';
import { EventCapabilities, EventGrants } from '@sk/shared';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';
import { useAuthStore } from '../store/authStore';

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
 * Refreshed on `EVENT_CAPABILITIES_UPDATED`, which the server pushes to `user:{id}` when a grant
 * changes — the room the root layout already joined. A withdrawn convenor's controls disappear at
 * once rather than at their next reconnect.
 */
export function useEventCapabilities(eventId?: string | null) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const userId = useAuthStore((state: any) => state.user?.id);
  const [capabilities, setCapabilities] = useState<EventCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isConnected || !eventId || !userId) {
      setCapabilities(null);
      setIsLoading(!!eventId);
      return;
    }

    let active = true;
    setIsLoading(true);

    const load = () => {
      wsService.emit('get_data', { type: 'event_capabilities', eventId }, (res: any) => {
        if (!active) return;
        setCapabilities(res || null);
        setIsLoading(false);
      });
    };

    load();

    // The push carries the freshly computed capabilities, so this is a merge rather than a nudge
    // to refetch — rule 1 of the live-data skill. It is filtered to this event because one socket
    // may hold grants on several.
    const handleUpdate = (message: any) => {
      if (!active) return;
      if (message?.type === 'EVENT_CAPABILITIES_UPDATED' && message.data?.eventId === eventId) {
        setCapabilities(message.data);
      }
    };

    wsService.on('update', handleUpdate);
    return () => {
      active = false;
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, eventId, userId]);

  return { capabilities, isLoading };
}

const EMPTY_GRANTS: EventGrants = { eventIds: [], divisions: [] };

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
 */
export function useMyEventGrants() {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const userId = useAuthStore((state: any) => state.user?.id);
  const [grants, setGrants] = useState<EventGrants>(EMPTY_GRANTS);

  const load = useCallback(() => {
    wsService.emit('get_data', { type: 'my_event_grants' }, (res: any) => {
      setGrants(res && Array.isArray(res.eventIds) ? res : EMPTY_GRANTS);
    });
  }, []);

  useEffect(() => {
    if (!isConnected || !userId) {
      setGrants(EMPTY_GRANTS);
      return;
    }

    let active = true;
    const refresh = () => {
      if (active) load();
    };
    refresh();

    // The push carries capabilities for *one* event, and this holds grants across all of them, so
    // the whole set is re-read rather than patched. One query, only when a grant actually changes.
    const handleUpdate = (message: any) => {
      if (message?.type === 'EVENT_CAPABILITIES_UPDATED') refresh();
    };

    wsService.on('update', handleUpdate);
    return () => {
      active = false;
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, userId, load]);

  return grants;
}
