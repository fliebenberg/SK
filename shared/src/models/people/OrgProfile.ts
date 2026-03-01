export interface OrgProfile {
  id: string;
  orgId: string;
  userId?: string;
  name: string;
  email?: string;
  birthdate?: string;
  nationalId?: string;
  identifier?: string;
  image?: string;
  primaryRoleId?: string;
}
