export interface GameEvent {
  id: string;
  gameId: string;
  timestamp: string;
  gameParticipantId?: string;
  actorOrgProfileId?: string;
  initiatorOrgProfileId?: string;
  type: string;
  subType?: string;
  eventData?: any;
}
