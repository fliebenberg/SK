export interface ScoreLog {
  id: string;
  gameId: string;
  time: string; // Game time e.g. "12:30"
  type: 'Goal' | 'Try' | 'Point' | 'Foul' | 'Other';
  playerId?: string;
  description: string;
}
