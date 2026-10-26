import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApproximateLocation, ViewerPosition } from '@sk/shared';

/**
 * Where Home looks (`HOME-1`, docs/home.md). **Kept on this device only**: nothing here is sent to
 * the server except as the rounded `near` of a request, which the server does not keep.
 *
 * - `chosen` is what the viewer set — their device's position, refreshed each time the app opens
 *   while permission stands, or a place they typed, which stays until they choose *Use my
 *   location* again. Remembered between visits, so Home opens on it straight away.
 * - `approximate` is the server's guess from the connection, asked once a visit and not remembered:
 *   `undefined` until asked, `null` when there is no guess.
 */
export interface ChosenLocation {
  source: 'device' | 'typed';
  near: ViewerPosition;
  /** "Doringkloof, Centurion"; `null` when the device's position has no name we could find. */
  label: string | null;
}

interface LocationState {
  chosen: ChosenLocation | null;
  approximate: ApproximateLocation | null | undefined;
  setChosen: (chosen: ChosenLocation | null) => void;
  setApproximate: (approximate: ApproximateLocation | null) => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    set => ({
      chosen: null,
      approximate: undefined,
      setChosen: chosen => set({ chosen }),
      setApproximate: approximate => set({ approximate }),
    }),
    {
      name: 'home-location',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ chosen: state.chosen }),
    }
  )
);

/** Resolves once the remembered location has been read back from the device. */
export function locationStoreHydrated(): Promise<void> {
  if (useLocationStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise(resolve => {
    const stop = useLocationStore.persist.onFinishHydration(() => {
      stop();
      resolve();
    });
  });
}
