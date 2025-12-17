export interface Organization {
  id: string;
  name: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  supportedSportIds: string[];
  shortName?: string;
}

export interface Sport {
  id: string;
  name: string;
}

export interface TeamRole {
  id: string;
  name: string;
}

export interface OrganizationRole {
  id: string;
  name: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  organizationId: string;
}

export interface Team {
  id: string;
  name: string;
  ageGroup: string;
  sportId: string;
  organizationId: string;
  isActive?: boolean;
}

export interface Person {
  id: string;
  name: string;
}

export interface OrganizationMembership {
  id: string;
  personId: string;
  organizationId: string;
  roleId: string;
  startDate?: string;
  endDate?: string;
}

export interface TeamMembership {
  id: string; // Unique ID for this specific tenure/role
  personId: string;
  teamId: string;
  roleId: string;
  startDate?: string;
  endDate?: string;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  venueId: string;
  organizationId: string;
}

export interface Game {
  id: string;
  eventId: string;
  homeTeamId: string;
  awayTeamId: string; // Could be external team name if not in system
  awayTeamName?: string; // For external teams
  startTime: string;
  status: 'Scheduled' | 'Live' | 'Finished';
  homeScore: number;
  awayScore: number;
}

export interface ScoreLog {
  id: string;
  gameId: string;
  time: string; // Game time e.g. "12:30"
  type: 'Goal' | 'Try' | 'Point' | 'Foul' | 'Other';
  playerId?: string;
  description: string;
}
