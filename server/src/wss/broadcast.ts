import type { Server, Socket } from 'socket.io';
import { getIo, setIo } from './sockets';
import { invalidateMembership } from './roomAccess';
import { revalidateUserRooms } from './revalidate';
import { logBroadcast } from './socketLog';

/**
 * Every live update leaves the server through here, so that all of them carry
 * the room they were published to.
 *
 * Socket.io does not tell a receiver which room delivered a message, so without
 * a `topic` a client can only filter on `type` — which is why a `GAME_UPDATED`
 * from a match screen used to make an unrelated fixtures list refetch itself.
 * With it, a listener ignores anything that is not addressed to a room it
 * actually joined.
 *
 * The payload is the data itself, never a nudge to refetch: one fan-out of a
 * few hundred bytes replaces N clients each issuing their own query.
 */
export interface UpdateMessage<T = any> {
  topic: string;
  type: string;
  data: T;
}

export function setBroadcastIo(server: Server) {
  setIo(server);
}

/** Publish to everyone in `topic`. */
export function broadcast(topic: string, type: string, data: any) {
  // `USER_MEMBERSHIPS_UPDATED` already means "this user's memberships changed",
  // and is published by every path that changes one. Hooking room access to it
  // here covers all of them, including any added later, rather than relying on
  // each action to remember.
  //
  // Order matters: drop the cached identity first, or the revalidation below
  // re-authorizes the user from the very entry that just went stale. The
  // revalidation is deliberately not awaited — a broadcast must not block on it
  // — but it runs before the next tick, so a revoked member's feed stops
  // effectively at once rather than at their next reconnect.
  //
  // `EVENT_CAPABILITIES_UPDATED` joins it for the same reason: an organiser grant is part of the
  // identity the read path caches, and withdrawing one has to close the rooms it opened.
  if (
    (type === 'USER_MEMBERSHIPS_UPDATED' || type === 'EVENT_CAPABILITIES_UPDATED') &&
    topic.startsWith('user:')
  ) {
    const changedUserId = topic.split(':')[1];
    invalidateMembership(changedUserId);
    revalidateUserRooms(changedUserId).catch(err =>
      console.error(`[Broadcast] Failed to revalidate rooms for ${changedUserId}:`, err)
    );
  }

  const io = getIo();
  if (!io) {
    console.warn(`[Broadcast] Dropped ${type} for ${topic}: io not set`);
    return;
  }
  io.to(topic).emit('update', { topic, type, data } as UpdateMessage);
  // Logged here because this is the only exit for a room fan-out, and a fan-out never passes
  // through any one socket's `emit` — so the per-socket wrapper in `attachSocketLogging` cannot
  // see it. The recipient count is the number this message actually reached, which is the thing
  // worth knowing when a room looks like it published to nobody (`FIX-4`).
  logBroadcast(topic, type, data, io.sockets.adapter.rooms.get(topic)?.size ?? 0);
}

/**
 * Push to one socket only — the state a room hands over on join. Carries the
 * same envelope as a broadcast so the client applies it through the same path.
 */
export function pushToSocket(socket: Socket, topic: string, type: string, data: any) {
  socket.emit('update', { topic, type, data } as UpdateMessage);
}
