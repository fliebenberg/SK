import { EventTemplate } from "./EventTemplate";
import { AgeGroup } from "./AgeGroup";

/**
 * A panel in the scoring control room, and the group a sport's event templates are filed under.
 *
 * Sections are per sport rather than a fixed list, because what a sport records in one group
 * another does not record at all. A template names its section by `id`; `name` is only the
 * heading drawn above the panel, so renaming a section never disturbs the templates in it.
 */
export interface EventSection {
  /** What a template's `section` names. Stable — templates reference it. */
  id: string;
  /** The heading the scoring panel draws. */
  name: string;
  /**
   * Whether recording an event from this section changes the score.
   *
   * This is what used to be hardcoded as `section === 'Scoring'` in four separate places. It
   * decides whether the event is sent as a `SCORE` or a `GAME_EVENT`, whether an unanswered
   * outcome shows as pending, and whether the panel offers the final-score override.
   */
  affectsScore?: boolean;
}

export interface SportSettings {
  positions?: { id: string, name: string }[];
  maxReserves?: number;
  periodLengthMS?: number;
  /** How many periods a fixture is scheduled to run — the sport-level default for
   *  `game.customSettings.scheduledPeriods` and `clock.scheduledPeriods`. */
  scheduledPeriods?: number;
  yellowCardDurationMS?: number;
  redCardDurationMS?: number;
  allowTimedRedCard?: boolean;
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
  /** The scoring panels this sport shows, in the order they are stacked. */
  eventSections?: EventSection[];
  eventTemplates?: EventTemplate[];
  /** Official and custom age groups, official first in their curated order. */
  ageGroups?: AgeGroup[];
}
