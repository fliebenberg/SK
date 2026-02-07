export interface User {
  id: string;
  name?: string;
  email?: string;
  emailVerified?: Date;
  image?: string;
  passwordHash?: string;
  globalRole: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
  preferences: Record<string, any>;
}

export interface UserEmail {
  id: string;
  userId: string;
  email: string;
  isPrimary: boolean;
  verifiedAt?: Date;
  createdAt: Date;
}
