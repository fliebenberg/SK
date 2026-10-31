import { getIo } from './sockets';
import { canJoinRoom, classifyRoom } from './roomAccess';

/**
 * Re-apply room access to sockets that are *already* joined.
 *
 * `canJoinRoom` normally runs once, when a socket joins; after that socket.io
 * simply holds the socket in a room and no further decision is made. That is
 * fine for a membership that lapses on the clock — it gets picked up at the next
 * reconnect, and reconnects are frequent — but not for a deliberate revocation.
 * Removing someone from an org should stop their live feed at once, not whenever
 * their app next changes network.
 *
 * This walks the rooms a user's sockets currently hold and drops the ones the
 * policy no longer allows, reusing `canJoinRoom` so the join rule and the
 * revocation rule cannot drift apart.
 *
 * Call it *after* invalidating that user's cached memberships, or it will
 * re-authorize them from the stale entry. `broadcast()` does both, in order.
 */
export async function revalidateUserRooms(userId: string): Promise<number> {
  const io = getIo();
  if (!io || !userId) return 0;

  let revoked = 0;
  const sockets = await io.fetchSockets();

  for (const socket of sockets) {
    if (socket.data?.userId !== userId) continue;

    // `socket.rooms` always contains the socket's own id; that is not a
    // subscription and has no policy.
    for (const room of socket.rooms) {
      if (room === socket.id) continue;
      if (await canJoinRoom(userId, room)) continue;

      socket.leave(room);
      socket.emit('update', { topic: room, type: 'ROOM_ACCESS_REVOKED', data: { room } });
      revoked++;
      console.warn(`[Socket] Revoked room=${room} user=${userId} socket=${socket.id}`);
    }
  }
  return revoked;
}

/**
 * Re-apply room access to **every** connected socket after an organisation goes private
 * (`ORG-14`), so its public rooms stop feeding people who no longer belong there at once — not at
 * their next reconnect.
 *
 * Only rooms whose subject could have changed are asked about — public rooms with a `subject` —
 * and each room's answer is worked out once for the whole pass, not once per socket holding it.
 */
export async function revalidateRoomsForPrivateOrg(): Promise<number> {
  const io = getIo();
  if (!io) return 0;

  const decisions = new Map<string, boolean>();
  let revoked = 0;
  const sockets = await io.fetchSockets();

  for (const socket of sockets) {
    const userId: string = socket.data?.userId || 'anonymous';
    for (const room of socket.rooms) {
      if (room === socket.id) continue;
      const policy = classifyRoom(room);
      if (policy?.access !== 'public' || !policy.subject) continue;

      const key = `${userId}|${room}`;
      let allowed = decisions.get(key);
      if (allowed === undefined) {
        allowed = await canJoinRoom(userId, room);
        decisions.set(key, allowed);
      }
      if (allowed) continue;

      socket.leave(room);
      socket.emit('update', { topic: room, type: 'ROOM_ACCESS_REVOKED', data: { room } });
      revoked++;
    }
  }
  if (revoked) console.warn(`[Socket] Private organisation: revoked ${revoked} room subscription(s)`);
  return revoked;
}
