export interface Team {
  id: string;
  name: string;
  ageGroup: string;
  sportId: string;
  orgId: string;
  isActive?: boolean;
  playerCount?: number;
  staffCount?: number;
  creatorId?: string;
}
