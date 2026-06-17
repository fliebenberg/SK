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

export function getOrgLogoUrl(logo?: string, tier: 'large' | 'medium' | 'thumb' = 'medium') {
  if (!logo) return "";
  if (logo.startsWith('http') || logo.startsWith('data:')) return logo;
  return `${API_BASE_URL}/uploads/logos/${logo}_${tier}.webp`;
}

/**
 * Returns the URL for a member/user avatar stored on the server.
 * Falls through for already-absolute URLs (http/data:) so ImageEditor can display both.
 */
export function getAvatarUrl(avatar?: string, tier: 'large' | 'medium' | 'thumb' = 'medium') {
  if (!avatar) return "";
  if (avatar.startsWith('http') || avatar.startsWith('data:')) return avatar;
  return `${API_BASE_URL}/uploads/profiles/${avatar}_${tier}.webp`;
}

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
  isAdminOrCoach?: boolean;
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

  /**
   * Search all users and members (Admin only)
   */
  async searchAdminUsers(
    token: string,
    name?: string,
    email?: string,
    id?: string,
    page?: number,
    limit?: number
  ): Promise<PaginatedAdminSearchUserResult> {
    const params = new URLSearchParams();
    if (name) params.append('name', name);
    if (email) params.append('email', email);
    if (id) params.append('id', id);
    if (page) params.append('page', page.toString());
    if (limit) params.append('limit', limit.toString());

    const response = await fetch(`${API_BASE_URL}/api/admin/users/search?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to search users');
    }

    return response.json();
  },

  /**
   * Fetch all sports configurations (Admin only)
   */
  async getAdminSports(token: string): Promise<Sport[]> {
    const response = await fetch(`${API_BASE_URL}/api/admin/sports`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to fetch sports');
    }

    return response.json();
  },

  /**
   * Fetch a single sport's details (Admin only)
   */
  async getAdminSport(token: string, id: string): Promise<Sport> {
    const response = await fetch(`${API_BASE_URL}/api/admin/sports/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to fetch sport details');
    }

    return response.json();
  },

  /**
   * Update a sport's settings (Admin only)
   */
  async updateAdminSport(
    token: string,
    id: string,
    data: { name: string; facilityTerm: string; periodTerm: string; defaultSettings: any }
  ): Promise<Sport> {
    const response = await fetch(`${API_BASE_URL}/api/admin/sports/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to update sport');
    }

    return response.json();
  },
};

export interface PaginatedAdminSearchUserResult {
  results: AdminSearchUserResult[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminSearchUserResult {
  type: 'user' | 'member';
  id: string;
  name: string;
  email: string | null;
  globalRole?: 'user' | 'admin' | null;
  image?: string | null;
  profiles: Array<{
    id: string;
    orgId: string;
    orgName: string;
    name: string;
    email: string | null;
    nationalId?: string | null;
    identifier?: string | null;
  }>;
  linkedEmails: string[];
  matchScore: number;
}

export interface SportPosition {
  id: string;
  name: string;
}

export interface SportSettings {
  maxReserves?: number;
  positions?: SportPosition[];
  yellowCardDurationMS?: number;
  redCardDurationMS?: number;
  allowTimedRedCard?: boolean;
}

export interface Sport {
  id: string;
  name: string;
  facilityTerm?: string;
  periodTerm?: string;
  participantType?: 'TEAM' | 'INDIVIDUAL';
  matchTopology?: 'HEAD_TO_HEAD' | 'MULTI_COMPETITOR';
  defaultSettings?: SportSettings;
  eventTemplates?: any[];
}
