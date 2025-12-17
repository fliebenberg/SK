"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  loginMethod: 'email' | 'google' | 'facebook';
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithFacebook: () => Promise<void>;
  signup: (name: string, email: string, password: string, avatar?: string) => Promise<void>;
  signupWithGoogle: () => Promise<void>;
  signupWithFacebook: () => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('scorekeeper_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('scorekeeper_user');
      }
    }
  }, []);

  // Mock login with email/password
  const login = async (email: string, password: string): Promise<void> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock validation (accept any non-empty credentials)
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Check if there's a stored user with this email to simulate persistence across sessions
    // In a real app, this would be a DB lookup
    const storedUserStr = localStorage.getItem('scorekeeper_user');
    let mockUser: User;

    if (storedUserStr) {
      const storedUser = JSON.parse(storedUserStr);
      if (storedUser.email === email) {
        mockUser = storedUser;
      } else {
        // New login, different user
        mockUser = {
          id: '1',
          name: email.split('@')[0], // Use email prefix as name
          email,
          loginMethod: 'email',
        };
      }
    } else {
      mockUser = {
        id: '1',
        name: email.split('@')[0], // Use email prefix as name
        email,
        loginMethod: 'email',
      };
    }

    setUser(mockUser);
    setIsAuthenticated(true);
    localStorage.setItem('scorekeeper_user', JSON.stringify(mockUser));
  };

  // Mock Google login
  const loginWithGoogle = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const mockUser: User = {
      id: '2',
      name: 'Google User',
      email: 'user@gmail.com',
      avatar: 'https://lh3.googleusercontent.com/a/default-user',
      loginMethod: 'google',
    };

    setUser(mockUser);
    setIsAuthenticated(true);
    localStorage.setItem('scorekeeper_user', JSON.stringify(mockUser));
  };

  // Mock Facebook login
  const loginWithFacebook = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const mockUser: User = {
      id: '3',
      name: 'Facebook User',
      email: 'user@facebook.com',
      avatar: 'https://graph.facebook.com/v12.0/me/picture',
      loginMethod: 'facebook',
    };

    setUser(mockUser);
    setIsAuthenticated(true);
    localStorage.setItem('scorekeeper_user', JSON.stringify(mockUser));
  };

  // Mock signup with email/password
  const signup = async (name: string, email: string, password: string, avatar?: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (!name || !email || !password) {
      throw new Error('All fields are required');
    }

    const mockUser: User = {
      id: '4',
      name,
      email,
      avatar,
      loginMethod: 'email',
    };

    setUser(mockUser);
    setIsAuthenticated(true);
    localStorage.setItem('scorekeeper_user', JSON.stringify(mockUser));
  };

  // Mock signup with Google
  const signupWithGoogle = async (): Promise<void> => {
    await loginWithGoogle(); // Same as login for mock
  };

  // Mock signup with Facebook
  const signupWithFacebook = async (): Promise<void> => {
    await loginWithFacebook(); // Same as login for mock
  };

  // Update profile
  const updateProfile = async (data: Partial<User>): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (!user) throw new Error('No user logged in');

    const updatedUser = { ...user, ...data };
    setUser(updatedUser);
    localStorage.setItem('scorekeeper_user', JSON.stringify(updatedUser));
  };

  // Logout
  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('scorekeeper_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        login,
        loginWithGoogle,
        loginWithFacebook,
        signup,
        signupWithGoogle,
        signupWithFacebook,
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
