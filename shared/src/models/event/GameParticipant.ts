export interface GameParticipant {
  id: string;
  gameId: string;
  teamId?: string;
  name?: string;
  orgProfileId?: string;
  status?: 'active' | 'withdrawn' | 'disqualified' | 'did_not_start';
  sortOrder?: number;
}
