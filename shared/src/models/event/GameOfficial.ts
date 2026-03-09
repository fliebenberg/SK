export interface GameOfficial {
  id: string;
  gameId: string;
  orgProfileId: string;
  role: 'SCORER' | 'REFEREE' | 'TIMEKEEPER' | 'JUDGE' | string;
}
