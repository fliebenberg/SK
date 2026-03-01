export interface TeamMembership {
  id: string; // Unique ID for this specific tenure/role
  orgProfileId: string;
  teamId: string;
  roleId: string;
  startDate?: string;
  endDate?: string;
}
