import { io, Socket } from "socket.io-client";
import { API_URL } from "../constants/api";

class SocketService {
  public socket: Socket;

  constructor() {
    this.socket = io(API_URL, {
      autoConnect: false, // We'll connect explicitly in the app or store
    });

    this.socket.on("connect", () => {
      console.log("Connected to data server:", API_URL);
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
