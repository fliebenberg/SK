import { Platform } from 'react-native';

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_WS_URL;
  if (envUrl) {
    // Ensure we use http/https instead of ws/wss
    return envUrl.replace(/^ws/, 'http');
  }

  const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envApiUrl) {
    return envApiUrl;
  }

  // Android emulator loopback address
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }
  return 'http://localhost:3001';
};

export const API_BASE_URL = getApiUrl();
console.log(`[API] Resolved base URL: ${API_BASE_URL}`);

export interface UserPayload {
  id: string;
  name: string;
  email: string;
  globalRole: 'user' | 'admin';
  hasPassword: boolean;
  avatarSource?: string | null;
  customImage?: string | null;
  theme?: string | null;
  picture?: string | null;
}

export interface AuthResponse {
  token: string;
  user: UserPayload;
}

export interface MeResponse {
  user: UserPayload;
}

export const apiService = {
  /**
   * Log in with email and password
   */
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const err = new Error(errorData.message || 'Failed to sign in') as any;
      err.tempToken = errorData.tempToken;
      throw err;
    }

    return response.json();
  },

  /**
   * Sign up with name, email, and password
   */
  async signup(name: string, email: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to sign up');
    }

    return response.json();
  },

  /**
   * Retrieve currently authenticated user profile
   */
  async getMe(token: string): Promise<MeResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to verify session');
    }

    return response.json();
  },

  /**
   * Fetch full user profile details including linked emails and social accounts
   */
  async getProfile(token: string): Promise<{ user: UserPayload; socialAccounts: any[]; emails: any[] }> {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to retrieve profile');
    }

    return response.json();
  },

  /**
   * Update name, custom base64 image avatar, avatar source, or theme preference
   */
  async updateProfile(
    token: string,
    data: { name?: string; customImage?: string; avatarSource?: string; theme?: string }
  ): Promise<{ success: boolean; user: UserPayload }> {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to update profile');
    }

    return response.json();
  },

  /**
   * Verify if the user's current password is correct (pre-verification check)
   */
  async verifyPassword(token: string, password: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/auth/profile/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to verify password');
    }

    return response.json();
  },

  /**
   * Update password securely (verifying old password first if existing)
   */
  async updatePassword(token: string, data: { password: string; oldPassword?: string }): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/auth/profile/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to update password');
    }

    return response.json();
  },

  /**
   * Request password recovery email (Privacy-first)
   */
  async requestForgotPassword(email: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to request recovery code');
    }

    return response.json();
  },

  /**
   * Reset password using passcode or token
   */
  async resetPassword(
    data: { passcode?: string; token?: string; password?: string },
    tempToken?: string
  ): Promise<{ success: boolean }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (tempToken) {
      headers['Authorization'] = `Bearer ${tempToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to reset password');
    }

    return response.json();
  },
};
