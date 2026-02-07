"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { signIn, signOut, useSession } from "next-auth/react";

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  globalRole: 'user' | 'admin';
  hasPassword: boolean;
  avatarSource?: string;
  customImage?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
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

  const logout = () => {
    signOut();
  };

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
