import { GameParticipant } from "./GameParticipant";

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

export interface SinBin {
  id: string; // matches the game_event_id
  playerId: string;
  teamId: string;
  awardedAtMS: number; // game.liveState.clock.totalActualElapsedMS at time of award
  durationMS: number;
  type: 'yellow' | 'red';
  reason?: string;
}

export interface Game {
  id: string;
  eventId: string;
  sportId: string;
  startTime?: string;
  scheduledStartTime?: string;
  status: 'Scheduled' | 'Live' | 'Finished' | 'Cancelled';
  siteId?: string;
  facilityId?: string;
  finalScoreData?: any;
  customSettings?: any;
  liveState?: {
    clock?: GameClockState;
    scores?: Record<string, number>;
    periodLabel?: string;
    sinBins?: SinBin[];
    [key: string]: any;
  };
  participants?: GameParticipant[];
  updatedAt?: string;
  finishTime?: string;
}
