import { useWsStore } from '../store/wsStore';

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval = 3000;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log(`[WS] Connected to ${this.url}`);
      useWsStore.getState().setConnected(true);
    };

    this.ws.onclose = () => {
      console.log(`[WS] Disconnected. Reconnecting in ${this.reconnectInterval}ms...`);
      useWsStore.getState().setConnected(false);
      setTimeout(() => this.connect(), this.reconnectInterval);
    };

    this.ws.onerror = (error) => {
      console.error(`[WS] Error:`, error);
      this.ws?.close();
    };

    this.ws.onmessage = (event) => {
      console.log(`[WS] Message received:`, event.data);
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WS] Cannot send data. WebSocket is not open.');
    }
  }
}

// Ensure the local dev URL maps to your machine's IP if testing on a physical device.
const wsUrl = process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
export const wsService = new WebSocketService(wsUrl);
