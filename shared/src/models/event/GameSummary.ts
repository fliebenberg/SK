import { GameClockState } from "./Game";

/**
 * A participant as a list needs it: who is playing, and under whose badge.
 *
 * Carrying `orgShortName` here is what lets a fixtures list render
 * "SBHS 1st XV vs PBHS 1st XV" from the broadcast alone. Resolving it on the
 * client meant fetching every involved org's teams and org record separately,
 * which was both N round trips per list and stale the moment a team was renamed.
 */
export interface GameSummaryParticipant {
  id: string;
  teamId?: string;
  /** Team name. */
  name?: string;
  orgId?: string;
  orgShortName?: string;
  status?: 'active' | 'withdrawn' | 'disqualified' | 'did_not_start';
  sortOrder?: number;
}

/**
 * Everything a fixture list, a match card or a scoreboard header needs, and
 * nothing else. This is the payload of every live update published to an org's
 * fixtures room and to `game:{id}:summary`.
 *
 * Deliberately excluded, because they are the detail tier and belong to
 * `game:{id}` / `game:{id}:events`: recorded game events, disputes, rosters,
 * sin bins, and the `finalScoreData` blob.
 */
export interface GameSummary {
  id: string;
  eventId: string;
  sportId: string;
  status: 'Scheduled' | 'Live' | 'Finished' | 'Cancelled';
  scheduledStartTime?: string;
  startTime?: string;
  finishTime?: string;
  siteId?: string;
  facilityId?: string;
  /** Kick-off deliberately not set yet, as opposed to simply absent. */
  timeTbd?: boolean;
  participants: GameSummaryParticipant[];
  /** Points by `gameParticipantId`. */
  scores?: Record<string, number>;
  clock?: GameClockState;
  periodLabel?: string;
  updatedAt?: string;
}

/** Score for one side, 0 when the game has not been scored yet. */
export function getParticipantScore(summary: GameSummary | undefined, participantId: string | undefined): number {
  if (!summary || !participantId) return 0;
  return summary.scores?.[participantId] ?? 0;
}

/** A game is worth showing a score for once it has started. */
export function hasLiveScore(summary: GameSummary | undefined): boolean {
  return !!summary && (summary.status === 'Live' || summary.status === 'Finished');
}

/** "<org code> <team name>", falling back to whichever half is known. */
export function participantLabel(participant: GameSummaryParticipant | undefined): string | undefined {
  if (!participant) return undefined;
  const name = participant.name;
  if (!name) return undefined;
  return participant.orgShortName ? `${participant.orgShortName} ${name}` : name;
}
