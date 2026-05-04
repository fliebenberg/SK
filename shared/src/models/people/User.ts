export interface UserPreferences {
  followedOrganizations: string[];
  followedTeams: string[];
  favoriteSports: string[];
  location?: { city: string; country: string };
  lastKnownTimezone?: string;
}

export interface User {
  id: string;
  name?: string;
  email?: string;
  emailVerified?: string; // ISO UTC
  image?: string;
  passwordHash?: string; // Should not be sent to client
  globalRole: 'user' | 'admin';
  createdAt: string; // ISO UTC
  updatedAt: string; // ISO UTC
  preferences: UserPreferences;
}

export interface UserEmail {
  id: string;
  userId: string;
  email: string;
  isPrimary: boolean;
  verifiedAt?: string; // ISO UTC
  createdAt: string; // ISO UTC
}
