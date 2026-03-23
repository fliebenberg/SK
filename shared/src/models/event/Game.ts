export interface GameClockState {
  isRunning: boolean;
  lastStartedAt?: string; // ISO UTC
  elapsedMS: number;
  periodLengthMS: number;
  isPeriodActive: boolean;
  periodIndex?: number; // 0-indexed
  scheduledPeriods?: number;
  totalActualElapsedMS?: number;
}

export interface Game {
  id: string;
  eventId: string;
  startTime?: string;
  scheduledStartTime?: string;
  status: 'Scheduled' | 'Live' | 'Finished' | 'Cancelled';
  siteId?: string;
  facilityId?: string;
  finalScoreData?: any;
  customSettings?: any;
  liveState?: {
    clock?: GameClockState;
    score?: { home: number, away: number };
    periodLabel?: string;
    [key: string]: any;
  };
  participants?: any[];
  updatedAt?: string;
  finishTime?: string;
}
