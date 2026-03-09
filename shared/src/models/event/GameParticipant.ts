export interface GameParticipant {
  id: string;
  gameId: string;
  teamId?: string;
  orgProfileId?: string;
  status: 'active' | 'withdrawn' | 'disqualified' | 'did_not_start';
}
