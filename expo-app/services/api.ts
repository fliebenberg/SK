import { Platform } from 'react-native';
import { AgeGroup, AgeGroupAdminView, EventSection, EventTemplate } from '@sk/shared';
import { useToastStore } from '../store/toastStore';
import { wsService } from './websocket';

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
  isAdminOrCoach?: boolean;
}

/** The kinds of uploaded image: logos are public, profiles (people's pictures) are not. */
export type ImageKind = 'logos' | 'profiles';

/** Lets the app load people's pictures from secure/ (MEDIA-1); see services/assets.ts. */
export interface AssetToken {
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface AuthResponse {
  token: string;
  user: UserPayload;
  assetToken?: AssetToken;
}

export interface MeResponse {
  user: UserPayload;
  assetToken?: AssetToken;
}

export interface ApiRequestOptions {
  suppressToast?: boolean;
}

async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  requestOptions?: ApiRequestOptions
): Promise<T> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || `Request failed with status ${response.status}`;
      const err = new Error(message) as any;
      err.tempToken = errorData.tempToken;
      err.status = response.status;

      if (!requestOptions?.suppressToast) {
        useToastStore.getState().showError(message, 'API Request Error');
      }

      throw err;
    }

    // Sports and age groups are kept on the client for a while, and this is how they are edited.
    if (options?.method && options.method !== 'GET' && /\/api\/admin\/(sports|age-groups)/.test(url)) {
      wsService.forgetReferenceReads();
    }

    return await response.json();
  } catch (error: any) {
    // If it's a network/fetch level exception (no HTTP status yet)
    if (error.status === undefined && !requestOptions?.suppressToast) {
      const networkMsg = error.message || 'Unable to connect to backend server';
      useToastStore.getState().showError(networkMsg, 'Network Error');
    }
    throw error;
  }
}

export const apiService = {
  /**
   * Log in with email and password
   */
  async login(email: string, password: string, options?: ApiRequestOptions): Promise<AuthResponse> {
    return apiFetch<AuthResponse>(
      `${API_BASE_URL}/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      },
      options
    );
  },

  /**
   * Sign up with name, email, and password
   */
  async signup(name: string, email: string, password: string, options?: ApiRequestOptions): Promise<AuthResponse> {
    return apiFetch<AuthResponse>(
      `${API_BASE_URL}/auth/signup`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      },
      options
    );
  },

  /**
   * Retrieve currently authenticated user profile
   */
  async getMe(token: string, options?: ApiRequestOptions): Promise<MeResponse> {
    return apiFetch<MeResponse>(
      `${API_BASE_URL}/auth/me`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
      options
    );
  },

  /**
   * Renew the asset token for a session that outlives it
   */
  async getAssetToken(token: string, options?: ApiRequestOptions): Promise<AssetToken> {
    return apiFetch<AssetToken>(
      `${API_BASE_URL}/auth/asset-token`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      },
      options
    );
  },

  /**
   * Fetch full user profile details including linked emails and social accounts
   */
  async getProfile(
    token: string,
    options?: ApiRequestOptions
  ): Promise<{ user: UserPayload; socialAccounts: any[]; emails: any[] }> {
    return apiFetch(
      `${API_BASE_URL}/auth/profile`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
      options
    );
  },

  /**
   * Upload a cropped picture (see components/images/). Answers the name of an unsaved upload: send
   * it in the image field of the save, then `useImageUpload` stops tracking it. Unsaved uploads are
   * discarded with `discardUpload`, or by the server after a day.
   */
  async uploadImage(
    token: string,
    kind: ImageKind,
    file: { uri: string; mimeType: string },
    options?: ApiRequestOptions
  ): Promise<{ name: string }> {
    const body = await (await fetch(file.uri)).blob();
    return apiFetch(
      `${API_BASE_URL}/api/uploads?kind=${kind}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': file.mimeType,
          'Authorization': `Bearer ${token}`,
        },
        body,
      },
      options
    );
  },

  /**
   * Discard an unsaved upload. `keepalive` lets the request finish while the page is closing.
   * Never toasts: there is nothing the person can do about it, and the server sweeps what is left.
   */
  async discardUpload(token: string, name: string, keepalive = false): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/uploads/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
        keepalive,
      });
    } catch (err) {
      console.warn('[API] Could not discard an unsaved upload; the server will sweep it:', err);
    }
  },

  /**
   * Update name, custom image (the name of an upload), avatar source, or theme preference
   */
  async updateProfile(
    token: string,
    data: { name?: string; customImage?: string; avatarSource?: string; theme?: string },
    options?: ApiRequestOptions
  ): Promise<{ success: boolean; user: UserPayload }> {
    return apiFetch(
      `${API_BASE_URL}/auth/profile`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      },
      options
    );
  },

  /**
   * Verify if the user's current password is correct (pre-verification check)
   */
  async verifyPassword(token: string, password: string, options?: ApiRequestOptions): Promise<{ success: boolean }> {
    return apiFetch(
      `${API_BASE_URL}/auth/profile/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      },
      options
    );
  },

  /**
   * Update password securely (verifying old password first if existing)
   */
  async updatePassword(
    token: string,
    data: { password: string; oldPassword?: string },
    options?: ApiRequestOptions
  ): Promise<{ success: boolean }> {
    return apiFetch(
      `${API_BASE_URL}/auth/profile/password`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      },
      options
    );
  },

  /**
   * Request password recovery email (Privacy-first)
   */
  async requestForgotPassword(email: string, options?: ApiRequestOptions): Promise<{ success: boolean }> {
    return apiFetch(
      `${API_BASE_URL}/auth/forgot-password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      },
      options
    );
  },

  /**
   * Reset password using passcode or token
   */
  async resetPassword(
    data: { passcode?: string; token?: string; password?: string },
    tempToken?: string,
    options?: ApiRequestOptions
  ): Promise<{ success: boolean }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (tempToken) {
      headers['Authorization'] = `Bearer ${tempToken}`;
    }

    return apiFetch(
      `${API_BASE_URL}/auth/reset-password`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      },
      options
    );
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
    limit?: number,
    options?: ApiRequestOptions
  ): Promise<PaginatedAdminSearchUserResult> {
    const params = new URLSearchParams();
    if (name) params.append('name', name);
    if (email) params.append('email', email);
    if (id) params.append('id', id);
    if (page) params.append('page', page.toString());
    if (limit) params.append('limit', limit.toString());

    return apiFetch<PaginatedAdminSearchUserResult>(
      `${API_BASE_URL}/api/admin/users/search?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
      options
    );
  },

  /**
   * Fetch all sports configurations (Admin only)
   */
  async getAdminSports(token: string, options?: ApiRequestOptions): Promise<Sport[]> {
    return apiFetch<Sport[]>(
      `${API_BASE_URL}/api/admin/sports`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
      options
    );
  },

  /**
   * Fetch a single sport's details (Admin only)
   */
  async getAdminSport(token: string, id: string, options?: ApiRequestOptions): Promise<Sport> {
    return apiFetch<Sport>(
      `${API_BASE_URL}/api/admin/sports/${id}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
      options
    );
  },

  /**
   * Update a sport's settings (Admin only)
   */
  async updateAdminSport(
    token: string,
    id: string,
    data: SportWritePayload,
    options?: ApiRequestOptions
  ): Promise<Sport> {
    return apiFetch<Sport>(
      `${API_BASE_URL}/api/admin/sports/${id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      },
      options
    );
  },

  /*
   * A sport's age groups (Admin only). Each call writes immediately — the list is its own table,
   * not part of the sport form — and answers with the sport's whole list, so the tab re-renders
   * from what the server now holds.
   */
  async getAdminAgeGroups(token: string, sportId: string, options?: ApiRequestOptions): Promise<AgeGroupAdminView[]> {
    return apiFetch<AgeGroupAdminView[]>(
      `${API_BASE_URL}/api/admin/sports/${sportId}/age-groups`,
      { headers: { 'Authorization': `Bearer ${token}` } },
      options
    );
  },

  async addAdminAgeGroup(token: string, sportId: string, name: string, options?: ApiRequestOptions): Promise<AgeGroupAdminView[]> {
    return apiFetch<AgeGroupAdminView[]>(
      `${API_BASE_URL}/api/admin/sports/${sportId}/age-groups`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name }),
      },
      options
    );
  },

  async reorderAdminAgeGroups(token: string, sportId: string, ids: string[], options?: ApiRequestOptions): Promise<AgeGroupAdminView[]> {
    return apiFetch<AgeGroupAdminView[]>(
      `${API_BASE_URL}/api/admin/sports/${sportId}/age-groups/order`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ids }),
      },
      options
    );
  },

  /** Rename, promote (`isOfficial: true`) or demote. */
  async updateAdminAgeGroup(
    token: string,
    id: string,
    data: { name?: string; isOfficial?: boolean },
    options?: ApiRequestOptions
  ): Promise<AgeGroupAdminView[]> {
    return apiFetch<AgeGroupAdminView[]>(
      `${API_BASE_URL}/api/admin/age-groups/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(data),
      },
      options
    );
  },

  async deleteAdminAgeGroup(token: string, id: string, options?: ApiRequestOptions): Promise<AgeGroupAdminView[]> {
    return apiFetch<AgeGroupAdminView[]>(
      `${API_BASE_URL}/api/admin/age-groups/${id}`,
      { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } },
      options
    );
  },

  /** Moves every team, division and league on `id` to `intoId`, then deletes `id`. */
  async mergeAdminAgeGroup(
    token: string,
    id: string,
    intoId: string,
    options?: ApiRequestOptions
  ): Promise<{ moved: number; ageGroups: AgeGroupAdminView[] }> {
    return apiFetch<{ moved: number; ageGroups: AgeGroupAdminView[] }>(
      `${API_BASE_URL}/api/admin/age-groups/${id}/merge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ intoId }),
      },
      options
    );
  },

  /**
   * Create a new sport configuration (Admin only)
   */
  async createAdminSport(
    token: string,
    data: SportWritePayload,
    options?: ApiRequestOptions
  ): Promise<Sport> {
    return apiFetch<Sport>(
      `${API_BASE_URL}/api/admin/sports`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      },
      options
    );
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
  /** Periods a fixture is scheduled to run; games and events may override it under the same name. */
  scheduledPeriods?: number;
  periodLengthMS?: number;
  /** Phase 7: the break between periods and time allowed for running over — with the two above, a fixture's length for scheduling. */
  breakBetweenPeriodsMS?: number;
  extraTimeAllowanceMS?: number;
  yellowCardDurationMS?: number;
  redCardDurationMS?: number;
  allowTimedRedCard?: boolean;
}

/** Body accepted by the admin sport create and update endpoints. */
export interface SportWritePayload {
  name: string;
  facilityTerm: string;
  periodTerm: string;
  participantType?: Sport['participantType'];
  matchTopology?: Sport['matchTopology'];
  defaultSettings: SportSettings;
  /** Omit either to leave the sport's stored value untouched. */
  eventSections?: EventSection[];
  eventTemplates?: EventTemplate[];
}

export interface Sport {
  id: string;
  name: string;
  facilityTerm?: string;
  periodTerm?: string;
  participantType?: 'TEAM' | 'INDIVIDUAL';
  matchTopology?: 'HEAD_TO_HEAD' | 'MULTI_COMPETITOR';
  defaultSettings?: SportSettings;
  eventSections?: EventSection[];
  eventTemplates?: EventTemplate[];
  /** Official and custom, official first. The sport editor reads the fuller admin view instead. */
  ageGroups?: AgeGroup[];
}
