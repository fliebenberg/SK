export interface Game {
  id: string;
  eventId: string;
  homeTeamId: string;
  awayTeamId: string; // Could be external team name if not in system
  awayTeamName?: string; // For external teams
  startTime?: string;
  status: 'Scheduled' | 'Live' | 'Finished' | 'Cancelled';
  venueId?: string;
  homeScore: number;
  awayScore: number;
}
