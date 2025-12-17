import { io, Socket } from "socket.io-client";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

class SocketService {
  public socket: Socket;

  constructor() {
    this.socket = io(SERVER_URL, {
      autoConnect: false, // We'll connect explicitly in the app or store
    });

    this.socket.on("connect", () => {
      console.log("Connected to data server");
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from data server");
    });
  }

  connect() {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  disconnect() {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }
}

export const socketService = new SocketService();
export const socket = socketService.socket;
