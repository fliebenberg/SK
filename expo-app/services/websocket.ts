import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { useWsStore } from '../store/wsStore';

class WebSocketService {
  private socket: Socket | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    if (!this.socket) {
      this.socket = io(this.url, {
        autoConnect: false,
        reconnectionDelay: 3000,
      });

      this.socket.on('connect', () => {
        console.log(`[WS] Connected to Socket.io server at ${this.url}`);
        useWsStore.getState().setConnected(true);
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

  send(event: string, data: any) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('[WS] Cannot emit event. Socket is not connected.');
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
