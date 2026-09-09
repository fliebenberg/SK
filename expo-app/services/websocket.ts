import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { useWsStore } from '../store/wsStore';
import { useToastStore } from '../store/toastStore';
import { RoomLedger, RoomMessage } from './roomLedger';

import { SocketAction, SocketActionPayload, SocketActionResponse, createSocketAction } from '@sk/shared';

export interface EmitOptions {
  suppressToast?: boolean;
}

class WebSocketService {
  private socket: Socket | null = null;
  private url: string;
  private serverOffset: number = 0;
  /**
   * Round-trip time of the ping-pong sample that produced `serverOffset`.
   * `Infinity` means no measured sample has landed yet, so the offset is either
   * unset or came from the uncompensated `server_time` seed.
   */
  private serverOffsetRTT: number = Infinity;
  private tokenGetter: (() => string | null) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  setTokenGetter(getter: () => string | null) {
    this.tokenGetter = getter;
  }

  getServerTime(): number {
    return Date.now() + this.serverOffset;
  }

  getServerOffset(): number {
    return this.serverOffset;
  }

  /**
   * Worst-case error on `getServerTime()`, in ms. The ping-pong assumes the two
   * legs of the round trip were equal; if one leg carried all of it, we are out
   * by half the RTT. `Infinity` until a measured sample lands.
   */
  getServerTimeAccuracyMS(): number {
    return this.serverOffsetRTT === Infinity ? Infinity : Math.ceil(this.serverOffsetRTT / 2);
  }

  syncTime() {
    if (this.socket && this.socket.connected) {
      const sendTime = Date.now();
      this.socket.emit('time_sync', {}, (res: { serverTime: number }) => {
        if (res?.serverTime) {
          const receiveTime = Date.now();
          const rtt = receiveTime - sendTime;
          this.serverOffset = (res.serverTime + Math.floor(rtt / 2)) - receiveTime;
          this.serverOffsetRTT = rtt;
          console.log(
            `[WS] Time synced via ping-pong. Offset: ${this.serverOffset}ms ` +
            `(RTT: ${rtt}ms, worst case ±${this.getServerTimeAccuracyMS()}ms)`
          );
        }
      });
    }
  }

  connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    if (!this.socket) {
      this.socket = io(this.url, {
        autoConnect: false,
        reconnectionDelay: 3000,
        auth: (cb) => {
          const token = this.tokenGetter ? this.tokenGetter() : null;
          cb({ token: token || null });
        },
      });

      // Registered before anything else listens, so the ledger has recorded a message by the
      // time any screen reduces it.
      this.socket.on('update', (message: RoomMessage) => this.rooms.record(message));

      this.socket.on('connect', () => {
        console.log(`[WS] Connected to Socket.io server at ${this.url}`);
        useWsStore.getState().setConnected(true);
        this.syncTime();

        // Re-subscribe to all active rooms upon connect/reconnect. Each re-join pushes the
        // room's state afresh, so whatever was logged on the old connection is superseded.
        this.rooms.resetLogs();
        for (const room of this.rooms.heldRooms()) {
          if (this.socket && this.socket.connected) {
            console.log(`[WS] Re-joining room on connect: ${room}`);
            this.socket.emit('join_room', room);
          }
        }
      });

      // Coarse seed the server pushes at connection time. We cannot know when it
      // was sent, so the offset it yields is slow by a full one-way latency
      // rather than the half-RTT a ping-pong costs. It must never overwrite a
      // measured sample: `syncTime()` fires from the same 'connect' handler and
      // nothing orders its ack against this event, so before this guard a
      // reconnect could leave the uncompensated value in place.
      this.socket.on('server_time', (data: { serverTime: number }) => {
        if (data?.serverTime) {
          if (this.serverOffsetRTT !== Infinity) return;
          this.serverOffset = data.serverTime - Date.now();
          console.log(`[WS] Server time seed applied. Offset: ${this.serverOffset}ms (uncompensated)`);
        }
      });

      this.socket.on('disconnect', () => {
        console.log('[WS] Disconnected from Socket.io server');
        useWsStore.getState().setConnected(false);
      });

      this.socket.on('connect_error', (error) => {
        console.warn('[WS] Connection error:', error.message);
        useWsStore.getState().setConnected(false);
      });
    }

    this.socket.connect();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  reconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.connect();
    }
  }

  send(event: string, data: any) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('[WS] Cannot emit event. Socket is not connected.');
    }
  }

  /**
   * Who holds which room, and what each room has delivered so far. See `roomLedger.ts` for why
   * the second half exists: the join push reaches only the socket that joined, once, so a
   * subscriber arriving while the room is already held has to be caught up from here.
   */
  private rooms = new RoomLedger();

  /**
   * Hold a room. The first holder makes the socket join it; the last one to let go makes it
   * leave. Pages call this and the returned release function and need not care which they are.
   *
   * `onReplay` receives what the room has already delivered when the room was held before this
   * call — the same messages the caller's `'update'` listener would have seen had it been there
   * for the join push. A caller that passes no handler gets the old behaviour and, if it arrives
   * late, no initial state. `useLiveRoom` passes its reducer; direct callers should move to it.
   */
  subscribeToRoom(room: string, onReplay?: (message: RoomMessage) => void): () => void {
    const { token, isFirst, replay } = this.rooms.subscribe(room);

    if (isFirst) {
      console.log(`[WS] Subscribing to room: ${room}`);
      this.send('join_room', room);
    } else if (replay === 'overflow') {
      // The log grew past what is worth replaying. Socket.io's join is idempotent, so asking
      // again costs one re-push of the room's state, which every holder absorbs as a replace.
      console.log(`[WS] Re-joining room for a late subscriber (replay log overflowed): ${room}`);
      this.send('join_room', room);
    } else if (replay && onReplay) {
      if (replay.length) console.log(`[WS] Replaying ${replay.length} message(s) to a late subscriber: ${room}`);
      for (const message of replay) onReplay(message);
    }

    return () => {
      if (this.rooms.unsubscribe(room, token)) {
        console.log(`[WS] Unsubscribing from room: ${room}`);
        this.send('leave_room', room);
      }
    };
  }

  emit(
    event: string,
    data: any,
    callback?: (...args: any[]) => void,
    timeoutMs: number = 7000,
    options?: EmitOptions
  ) {
    if (this.socket && this.socket.connected) {
      if (!callback) {
        this.socket.emit(event, data);
        return;
      }
      let called = false;
      const timer = setTimeout(() => {
        if (!called) {
          called = true;
          console.warn(`[WS] Ack timeout (${timeoutMs}ms) for event: ${event}`, data);
          if (!options?.suppressToast) {
            useToastStore.getState().showError('Server request timed out. Please try again.', 'Connection Timeout');
          }
          callback(null);
        }
      }, timeoutMs);

      this.socket.emit(event, data, (...args: any[]) => {
        if (!called) {
          called = true;
          clearTimeout(timer);
          const res = args[0];
          if (res && typeof res === 'object' && (res.status === 'error' || res.error)) {
            const errorMsg = res.message || res.error || 'Operation failed on server';
            if (!options?.suppressToast) {
              useToastStore.getState().showError(errorMsg, 'Server Action Error');
            }
            // The server rejects with { status: 'error', message }, while callers
            // throughout the app test for `res.error`. Normalize so a rejected
            // action is never mistaken for a successful one.
            callback({ ...res, error: errorMsg }, ...args.slice(1));
            return;
          }
          callback(...args);
        }
      });
    } else {
      console.warn('[WS] Cannot emit event. Socket is not connected.');
      if (!options?.suppressToast) {
        useToastStore.getState().showError('Cannot complete request. Network connection offline.', 'Offline');
      }
      if (callback) {
        callback(null);
      }
    }
  }

  emitAction<K extends SocketAction>(
    type: K,
    payload: SocketActionPayload<K>,
    callback?: (response: SocketActionResponse<K>) => void,
    timeoutMs: number = 7000,
    options?: EmitOptions
  ) {
    const actionObj = createSocketAction(type, payload);
    return this.emit('action', actionObj, callback, timeoutMs, options);
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

// Ensure the local dev URL maps to your machine's IP if testing on a physical device.
// Socket.io uses HTTP/HTTPS endpoints for initial handshake.
const getWsUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_WS_URL;
  if (envUrl) {
    return envUrl;
  }
  // Android emulator cannot access localhost directly, so use 10.0.2.2.
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }
  return 'http://localhost:3001';
};

const wsUrl = getWsUrl();
export const wsService = new WebSocketService(wsUrl);
