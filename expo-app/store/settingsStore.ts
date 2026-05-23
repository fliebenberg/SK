import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

interface GlobalPreferences {
  theme: ThemePreference;
  [key: string]: any;
}

interface LocalOverrides {
  theme?: ThemePreference;
  [key: string]: any;
}

interface SettingsState {
  globalPreferences: GlobalPreferences;
  localOverrides: LocalOverrides;
  
  setGlobalPreference: <K extends keyof GlobalPreferences>(key: K, value: GlobalPreferences[K]) => void;
  setLocalOverride: <K extends keyof LocalOverrides>(key: K, value: LocalOverrides[K]) => void;
  removeLocalOverride: <K extends keyof LocalOverrides>(key: K) => void;
  syncGlobalPreferences: (prefs: Partial<GlobalPreferences>) => void;
  
  getEffectivePreference: <K extends keyof GlobalPreferences>(key: K) => GlobalPreferences[K];
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      globalPreferences: {
        theme: 'system',
      },
      localOverrides: {},

      setGlobalPreference: (key, value) => set((state) => ({
        globalPreferences: { ...state.globalPreferences, [key]: value }
      })),

      setLocalOverride: (key, value) => set((state) => ({
        localOverrides: { ...state.localOverrides, [key]: value }
      })),

      removeLocalOverride: (key) => set((state) => {
        const newOverrides = { ...state.localOverrides };
        delete newOverrides[key];
        return { localOverrides: newOverrides };
      }),

      syncGlobalPreferences: (prefs) => set((state) => ({
        globalPreferences: { ...state.globalPreferences, ...prefs }
      })),

      getEffectivePreference: (key) => {
        const state = get();
        return state.localOverrides[key] !== undefined 
          ? (state.localOverrides[key] as any) 
          : state.globalPreferences[key];
      }
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ localOverrides: state.localOverrides }),
    }
  )
);

export const useActiveTheme = (): 'light' | 'dark' => {
  const themePref = useSettingsStore((state) => state.getEffectivePreference('theme'));
  const systemTheme = Appearance.getColorScheme();
  const active = themePref === 'system' ? (systemTheme || 'dark') : themePref;
  return active === 'light' || active === 'dark' ? active : 'dark';
};
