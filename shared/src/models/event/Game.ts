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
  /**
   * The tournament stage this fixture belongs to. Null for a single match, and for any fixture
   * an organiser added outside a stage.
   *
   * A real column rather than something derived from the participants: an entrant belongs to the
   * *division*, and `stage_entrants` puts the same entrant in the pool stage and the knockout, so
   * "which stage is this?" resolved through participants returns both.
   */
  stageId?: string;
  /**
   * The division this fixture is in, resolved through its stage.
   *
   * Derived, never stored — `division_stages` already holds the relationship, and duplicating it
   * on the fixture would be a second copy to keep in step. It travels on the payload because a
   * screen has to answer "may this person score this?" without a lookup: a division convenor's
   * rights are scoped to exactly this id, and the client-side permission check would otherwise
   * hide the scoring control from somebody the server would let through.
   */
  divisionId?: string;
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
