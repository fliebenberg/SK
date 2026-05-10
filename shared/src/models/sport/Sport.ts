import { EventTemplate } from "./EventTemplate";

export interface SportSettings {
  positions?: { id: string, name: string }[];
  maxReserves?: number;
  periodLengthMS?: number;
  periods?: number;
}

export enum SportParticipantType {
  /** The sport is played between teams */
  TEAM = 'TEAM',
  /** The sport is played between individual participants */
  INDIVIDUAL = 'INDIVIDUAL',
}

export enum MatchTopology {
  /** A direct competition between two sides (e.g., Team A vs Team B) */
  HEAD_TO_HEAD = 'HEAD_TO_HEAD',
  /** A competition involving multiple sides simultaneously (e.g., a race or tournament bracket) */
  MULTI_COMPETITOR = 'MULTI_COMPETITOR',
}

export interface SportTemplate {
  id: string;
  name: string;
  categoryId?: string;
  participantType?: SportParticipantType;
  matchTopology?: MatchTopology;
  defaultSettings?: SportSettings;
  facilityTerm?: string;
  periodTerm?: string;
  timerShowHours?: boolean;
}

export interface Sport extends SportTemplate {
  eventTemplates?: EventTemplate[];
}
