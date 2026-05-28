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

const API_BASE_URL = getApiUrl();
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
      throw new Error(errorData.message || 'Failed to sign in');
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
};
