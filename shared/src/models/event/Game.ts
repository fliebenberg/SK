export interface Game {
  id: string;
  eventId: string;
  startTime?: string;
  status: 'Scheduled' | 'Live' | 'Finished' | 'Cancelled';
  siteId?: string;
  facilityId?: string;
  finalScoreData?: any;
  customSettings?: any;
  liveState?: any;
  participants?: any[];
}
