import { getIo } from './sockets';
import { canJoinRoom } from './roomAccess';

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
