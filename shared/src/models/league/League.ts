import type { CalendarDate } from '../../utils/calendarDate';

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
  /** An entry in the sport's age-group list (see `AgeGroup`). What is written. */
  ageGroupId?: string | null;
  /** The age group's name, joined in on read for display. Ignored on write. */
  ageGroup?: string;
  joinPolicy: 'CLOSED' | 'INVITE' | 'OPEN';
  criteria?: Record<string, any>;
  /** `null` on an update removes it. */
  logo?: string | null;
}

export interface Season {
  id: string;
  leagueId: string;
  name: string;
  startDate: CalendarDate;
  endDate: CalendarDate;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  settings: LeagueSettings;
  cachedStandings?: LeagueStandingRow[];
  createdAt?: string;
  updatedAt?: string;
  /** `null` on an update removes it. */
  logo?: string | null;
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
