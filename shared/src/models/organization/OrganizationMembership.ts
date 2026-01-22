export interface OrganizationMembership {
  id: string;
  personId: string;
  organizationId: string;
  roleId: string;
  startDate?: string;
  endDate?: string;
}
