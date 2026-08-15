import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { OrgMembership, TeamMembership } from '@sk/shared';
import { apiService } from '../services/api';
import { useSettingsStore } from './settingsStore';
import { wsService } from '../services/websocket';

const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(name);
      }
      return null;
    }
    return await SecureStore.getItemAsync(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(name, value);
      }
      return;
    }
    await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(name);
      }
      return;
    }
    await SecureStore.deleteItemAsync(name);
  },
};

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  globalRole: 'user' | 'admin';
  hasPassword?: boolean;
  avatarSource?: string | null;
  customImage?: string | null;
  theme?: string | null;
  picture?: string | null;
  isAdminOrCoach?: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  orgMemberships: OrgMembership[];
  teamMemberships: TeamMembership[];
  /** True once persisted storage has been read back into the store. */
  isHydrated: boolean;
  /** True once any persisted token has been checked against the server. */
  isSessionVerified: boolean;
  /** True once memberships have been fetched for the current session. */
  membershipsLoaded: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  verifySession: () => Promise<void>;
  setMemberships: (orgs: OrgMembership[], teams: TeamMembership[]) => void;
  /** Resolve the membership fetch without data, so guards stop waiting on it. */
  markMembershipsResolved: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      orgMemberships: [],
      teamMemberships: [],
      isHydrated: false,
      isSessionVerified: false,
      membershipsLoaded: false,
      // Deliberately leaves the existing lists alone: a failed fetch is not
      // evidence that the user lost their memberships.
      markMembershipsResolved: () => set({ membershipsLoaded: true }),
      setMemberships: (orgs, teams) => set((state) => {
        const hasAdminOrCoachRole = state.user?.globalRole === 'admin' ||
          (orgs || []).some(m => m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff') ||
          (teams || []).some(m => m.roleId === 'role-coach' || m.roleId === 'role-assistant-coach');
        
        const updatedUser = state.user ? { ...state.user, isAdminOrCoach: hasAdminOrCoachRole } : null;

        return {
          orgMemberships: orgs || [],
          teamMemberships: teams || [],
          membershipsLoaded: true,
          user: updatedUser
        };
      }),
      login: (token, user) => {
        // Sanitize theme string
        if (user.theme === 'null' || user.theme === 'undefined') {
          user.theme = null;
        }
        // Memberships belong to the previous session until they are re-fetched.
        set({
          token,
          user,
          isAuthenticated: true,
          isSessionVerified: true,
          orgMemberships: [],
          teamMemberships: [],
          membershipsLoaded: false,
        });

        // Sync theme preference on login
        try {
          const localTheme = useSettingsStore.getState().localOverrides.theme;
          const dbTheme = user.theme;
          
          const isValidTheme = (t: any): t is 'system' | 'dark' | 'light' => t === 'system' || t === 'dark' || t === 'light';
          
          if (isValidTheme(dbTheme)) {
            // Backend has a valid theme preference, overwrite local override
            if (dbTheme !== localTheme) {
              useSettingsStore.getState().setLocalOverride('theme', dbTheme);
            }
          } else {
            // Backend theme is empty/invalid.
            if (isValidTheme(localTheme)) {
              // Sync the local guest theme up to the backend database
              apiService.updateProfile(token, { theme: localTheme })
                .then(res => {
                  if (res.success && res.user) {
                    let sanitizedUser = res.user;
                    if (sanitizedUser.theme === 'null' || sanitizedUser.theme === 'undefined') {
                      sanitizedUser.theme = null;
                    }
                    set({ user: sanitizedUser });
                  }
                })
                .catch(err => console.error('[AuthStore] Failed to sync local theme to DB on login:', err));
            } else {
              // No DB theme and no guest theme — clear any stale override so selector shows Auto
              useSettingsStore.getState().removeLocalOverride('theme');
            }
          }
        } catch (err) {
          console.error('[AuthStore] Theme sync logic failed during login:', err);
        }
        // Reconnect socket so handshake picks up the new token
        wsService.reconnect();
      },
      logout: () => {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          orgMemberships: [],
          teamMemberships: [],
          isSessionVerified: true,
          membershipsLoaded: false,
        });
        // Reconnect socket so handshake reverts to anonymous mode
        wsService.reconnect();
      },
      updateUser: (updatedFields) => set(state => {
        if (updatedFields.theme === 'null' || updatedFields.theme === 'undefined') {
          updatedFields = { ...updatedFields, theme: null };
        }
        return {
          user: state.user ? { ...state.user, ...updatedFields } : null
        };
      }),
      verifySession: async () => {
        const { token } = get();
        if (!token) {
          set({ token: null, user: null, isAuthenticated: false, isSessionVerified: true });
          return;
        }
        try {
          const response = await apiService.getMe(token);
          let freshUser = response.user;
          if (freshUser.theme === 'null' || freshUser.theme === 'undefined') {
            freshUser = { ...freshUser, theme: null };
          }
          set({ user: freshUser, isAuthenticated: true, isSessionVerified: true });

          // Sync theme preference on session verify
          try {
            const localTheme = useSettingsStore.getState().localOverrides.theme;
            const dbTheme = freshUser.theme;
            
            const isValidTheme = (t: any): t is 'system' | 'dark' | 'light' => t === 'system' || t === 'dark' || t === 'light';
            
            if (isValidTheme(dbTheme)) {
              // Backend has a valid theme preference, overwrite local override
              if (dbTheme !== localTheme) {
                useSettingsStore.getState().setLocalOverride('theme', dbTheme);
              }
            } else {
              // Backend theme is empty/invalid.
              if (isValidTheme(localTheme)) {
                // Sync the local guest theme up to the backend database
                apiService.updateProfile(token, { theme: localTheme })
                  .then(res => {
                    if (res.success && res.user) {
                      let sanitizedUser = res.user;
                      if (sanitizedUser.theme === 'null' || sanitizedUser.theme === 'undefined') {
                        sanitizedUser.theme = null;
                      }
                      set({ user: sanitizedUser });
                    }
                  })
                  .catch(err => console.error('[AuthStore] Failed to sync local theme to DB on session verify:', err));
              } else {
                // No DB theme and no guest theme — clear any stale override so selector shows Auto
                useSettingsStore.getState().removeLocalOverride('theme');
              }
            }
          } catch (err) {
            console.error('[AuthStore] Theme sync logic failed during session verification:', err);
          }
        } catch (error) {
          console.warn('[AuthStore] Token verification failed. User session cleared:', error);
          set({
            token: null,
            user: null,
            isAuthenticated: false,
            orgMemberships: [],
            teamMemberships: [],
            isSessionVerified: true,
            membershipsLoaded: false,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
      // Only the session itself is durable. The resolution flags below describe
      // *this* app launch and must always start false, otherwise a guard would
      // trust a stale "verified" flag before the token has been re-checked.
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        orgMemberships: state.orgMemberships,
        teamMemberships: state.teamMemberships,
      }),
    }
  )
);

/**
 * Route guards must not treat a not-yet-rehydrated store as "signed out", so
 * flag the moment persisted state has been read back (or failed to read).
 */
const markHydrated = () => useAuthStore.setState({ isHydrated: true });
useAuthStore.persist.onFinishHydration(markHydrated);
if (useAuthStore.persist.hasHydrated()) {
  markHydrated();
}

wsService.setTokenGetter(() => useAuthStore.getState().token);
