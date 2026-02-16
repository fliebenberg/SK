"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { signIn, signOut, useSession } from "next-auth/react";
import { useTheme } from 'next-themes';
import { toast } from '@/hooks/use-toast';
import { store } from '@/app/store/store';

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  globalRole: 'user' | 'admin';
  hasPassword: boolean;
  avatarSource?: string;
  customImage?: string;
  theme?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status, update } = useSession();
  const isLoading = status === "loading";
  const isAuthenticated = !!session;
  
  const user: User | null = session?.user ? {
    id: (session.user as any).id,
    name: session.user.name || "",
    email: session.user.email || "",
    image: session.user.image || undefined,
    globalRole: (session.user as any).globalRole || 'user',
    hasPassword: (session.user as any).hasPassword || false,
    avatarSource: (session.user as any).avatarSource || undefined,
    customImage: (session.user as any).customImage || undefined,
    theme: (session.user as any).theme || undefined,
  } : null;

  const login = async (email: string, password: string): Promise<void> => {
    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (result?.error) {
      throw new Error(result.error);
    }
  };

  const loginWithGoogle = async (): Promise<void> => {
    await signIn("google", { callbackUrl: "/" });
  };

  const signup = async (name: string, email: string, password: string): Promise<void> => {
    // We need to implement a signup API route on the server
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Signup failed");
    }

    // After signup, log them in
    await login(email, password);
  };

  const updateProfile = async (data: Partial<User>): Promise<void> => {
    if (!user) throw new Error("No user logged in");

    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Update failed");
    }

    // Refresh session to reflect changes (e.g., name, hasPassword)
    await update(data);
  };

  const logout = async () => {
    await signOut({ callbackUrl: "/" });
  };

  const { theme, setTheme } = useTheme();

  // 1. Initial Sync: When logging in, if DB has a theme, apply it locally.
  // DB preference ALWAYS wins over guest selection (localStorage).
  // If DB has no theme set, then we save the current local theme to the DB.
  React.useEffect(() => {
    if (isAuthenticated && user) {
      const dbTheme = user.theme;
      const localTheme = localStorage.getItem('theme');
      
      if (dbTheme) {
        // User already has a preference saved in the DB.
        // This overrides whatever the guest might have selected.
        if (dbTheme !== localTheme) {
          setTheme(dbTheme);
        }
      } else if (localTheme && localTheme !== 'system') {
        // No DB theme set yet, so we persist the guest's selection to their profile.
        updateProfile({ theme: localTheme } as any);
      }

      // Fetch memberships for RBAC
      store.fetchUserMemberships(user.id);
    }
  }, [isAuthenticated, user?.id]);

  // 2. Continuous Sync: If user is logged in and MANUALLY changes theme, update DB.
  // This ensures the custom choice is saved for other devices.
  React.useEffect(() => {
    // We only trigger this if the theme state actually changes to something different from the user profile
    // AND if we are mounted/initialized (next-themes handles the initial state).
    if (isAuthenticated && user && theme && theme !== user.theme) {
      // Small delay or check to ensure we don't race with the initial sync above
      const timer = setTimeout(() => {
        // Re-check user.theme in case Effect #1 just finished updating it
        if (theme !== user.theme) {
          updateProfile({ theme } as any);
          toast({
            description: `Theme updated to ${theme.replace('-', ' ')}`,
            variant: "success",
            duration: 3000
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [theme, isAuthenticated, user?.theme]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        loginWithGoogle,
        signup,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
