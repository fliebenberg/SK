export interface Team {
  id: string;
  name: string;
  ageGroup: string;
  sportId: string;
  organizationId: string;
  isActive?: boolean;
  playerCount?: number;
  staffCount?: number;
}
