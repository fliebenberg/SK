export interface TeamMember {
  id: string; // profile id
  userId?: string;
  name: string;
  membershipId: string;
  teamId: string;
  roleId: string;
  roleName?: string;
  startDate: string; // ISO UTC
  endDate?: string; // ISO UTC
}
