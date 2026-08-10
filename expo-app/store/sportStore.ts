import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Sport } from '@sk/types';

interface SportStoreState {
  sportsCache: Record<string, Sport>;
  setCachedSport: (sport: Sport) => void;
  getCachedSport: (sportId: string) => Sport | undefined;
}

export const useSportStore = create<SportStoreState>()(
  persist(
    (set, get) => ({
      sportsCache: {},

      setCachedSport: (sport: Sport) => {
        if (!sport || !sport.id) return;
        const normalizedId = sport.id.replace(/^sport-/, '');
        set((state) => ({
          sportsCache: {
            ...state.sportsCache,
            [normalizedId]: sport,
            [sport.id]: sport,
          },
        }));
      },

      getCachedSport: (sportId: string) => {
        if (!sportId) return undefined;
        const normalizedId = sportId.replace(/^sport-/, '');
        const state = get();
        return state.sportsCache[normalizedId] || state.sportsCache[sportId];
      },
    }),
    {
      name: 'sport-cache-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
