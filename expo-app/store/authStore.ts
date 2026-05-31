import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { apiService } from '../services/api';

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
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  verifySession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      login: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
      updateUser: (updatedFields) => set(state => ({
        user: state.user ? { ...state.user, ...updatedFields } : null
      })),
      verifySession: async () => {
        const { token } = get();
        if (!token) {
          set({ token: null, user: null, isAuthenticated: false });
          return;
        }
        try {
          const response = await apiService.getMe(token);
          set({ user: response.user, isAuthenticated: true });
        } catch (error) {
          console.warn('[AuthStore] Token verification failed. User session cleared:', error);
          set({ token: null, user: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
    }
  )
);
