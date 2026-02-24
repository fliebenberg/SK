export interface Organization {
  id: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  supportedSportIds: string[];
  shortName?: string;
  supportedRoleIds?: string[];
  teamCount?: number;
  venueCount?: number;
  eventCount?: number;
  memberCount?: number;
  isClaimed?: boolean;
  creatorId?: string;
  isActive?: boolean;
}
