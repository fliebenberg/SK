import type { Server } from 'socket.io';

/**
 * The one handle on the socket server.
 *
 * Kept apart from `broadcast.ts` so that both publishing and room revalidation
 * can reach it without importing each other — `broadcast` invalidates and
 * revalidates on a membership change, and `revalidate` needs to publish nothing
 * but does need the server.
 */
let io: Server | null = null;

export function setIo(server: Server) {
  io = server;
}

export function getIo(): Server | null {
  return io;
}

/**
 * Identity proven by the handshake, stored on `socket.data` rather than as an
 * ad-hoc property so it survives onto the `RemoteSocket` objects that
 * `io.fetchSockets()` returns. Anything reading a socket's identity must read
 * it from here, never from a client-supplied payload.
 */
export interface SocketData {
  userId?: string;
}
