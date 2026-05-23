import { create } from 'zustand';

interface WsState {
  isConnected: boolean;
  setConnected: (status: boolean) => void;
}

export const useWsStore = create<WsState>((set) => ({
  isConnected: false,
  setConnected: (status) => set({ isConnected: status }),
}));
