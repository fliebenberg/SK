import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { useWsStore } from '../store/wsStore';
import { useToastStore } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';

import { SocketAction, SocketActionPayload, SocketActionResponse, createSocketAction } from '@sk/types';

export interface EmitOptions {
  suppressToast?: boolean;
}

class WebSocketService {
  private socket: Socket | null = null;
  private url: string;
  private serverOffset: number = 0;

  constructor(url: string) {
    this.url = url;
  }

  getServerTime(): number {
    return Date.now() + this.serverOffset;
  }

  getServerOffset(): number {
    return this.serverOffset;
  }

  syncTime() {
    if (this.socket && this.socket.connected) {
      const sendTime = Date.now();
      this.socket.emit('time_sync', {}, (res: { serverTime: number }) => {
        if (res?.serverTime) {
          const receiveTime = Date.now();
          const rtt = receiveTime - sendTime;
          this.serverOffset = (res.serverTime + Math.floor(rtt / 2)) - receiveTime;
          console.log(`[WS] Time synced via ping-pong. Offset: ${this.serverOffset}ms (RTT: ${rtt}ms)`);
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
          const token = useAuthStore.getState().token;
          cb({ token: token || null });
        },
      });

      this.socket.on('connect', () => {
        console.log(`[WS] Connected to Socket.io server at ${this.url}`);
        useWsStore.getState().setConnected(true);
        this.syncTime();

        // Re-subscribe to all active rooms upon connect/reconnect
        this.roomSubscriptions.forEach((subscribers, room) => {
          if (subscribers.size > 0 && this.socket && this.socket.connected) {
            console.log(`[WS] Re-joining room on connect: ${room}`);
            this.socket.emit('join_room', room);
          }
        });
      });

      this.socket.on('server_time', (data: { serverTime: number }) => {
        if (data?.serverTime) {
          this.serverOffset = data.serverTime - Date.now();
          console.log(`[WS] Server time received. Offset: ${this.serverOffset}ms`);
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

  private roomSubscriptions = new Map<string, Set<string>>();

  subscribeToRoom(room: string): () => void {
    const token = Math.random().toString(36).substring(2);
    let subscribers = this.roomSubscriptions.get(room);
    
    if (!subscribers) {
      subscribers = new Set();
      this.roomSubscriptions.set(room, subscribers);
    }
    
    if (subscribers.size === 0) {
      console.log(`[WS] Subscribing to room: ${room}`);
      this.send('join_room', room);
    }
    
    subscribers.add(token);

    return () => {
      const currentSubscribers = this.roomSubscriptions.get(room);
      if (currentSubscribers) {
        currentSubscribers.delete(token);
        if (currentSubscribers.size === 0) {
          this.roomSubscriptions.delete(room);
          console.log(`[WS] Unsubscribing from room: ${room}`);
          this.send('leave_room', room);
        }
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
          if (res && typeof res === 'object') {
            if (res.status === 'error' || res.error) {
              const errorMsg = res.message || res.error || 'Operation failed on server';
              if (!options?.suppressToast) {
                useToastStore.getState().showError(errorMsg, 'Server Action Error');
              }
            }
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
