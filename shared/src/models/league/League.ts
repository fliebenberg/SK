export interface LeagueSettings {
  pointsPerWin: number;
  pointsPerDraw: number;
  pointsPerLoss: number;
  bonusRules?: Record<string, any>;
}

export interface League {
  id: string;
  name: string;
  orgId: string;
  sportId: string;
  ageGroup?: string;
  joinPolicy: 'CLOSED' | 'INVITE' | 'OPEN';
  criteria?: Record<string, any>;
}

export interface Season {
  id: string;
  leagueId: string;
  name: string;
  startDate: string; // ISO String
  endDate: string; // ISO String
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  settings: LeagueSettings;
  cachedStandings?: LeagueStandingRow[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SeasonTeam {
  seasonId: string;
  teamId: string;
  status: 'approved' | 'pending';
}

export interface LeagueStandingRow {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDifference: number;
  points: number;
}
