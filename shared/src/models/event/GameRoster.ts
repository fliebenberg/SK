export interface GameRoster {
  id: string;
  gameParticipantId: string;
  orgProfileId: string;
  position?: string;
  isReserve: boolean;
}
