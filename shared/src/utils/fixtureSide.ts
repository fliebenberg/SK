import { GameParticipant } from "../models/event/GameParticipant";
import { ParticipantSourceRule, TournamentEntrant } from "../models/event/Tournament";

/**
 * The three states of a fixture side (data model §2.0).
 *
 * Every surface renders one of these — the fixtures list, the schedule, the bracket, the game
 * screen, the standings, anything printed — so the text is derived here once rather than in each.
 */
export type FixtureSideState =
  /** A real team or individual: the competitor's own name prints. */
  | 'known'
  /** Nobody yet; a human will decide. `division_entrants.label` prints. */
  | 'awaitingEntrant'
  /** Nobody yet; a fixture will decide. The text is derived from the fill rule and never stored. */
  | 'awaitingResult';

/** Shown for a registered entrant that has no competitor attached yet. */
export const AWAITING_ENTRANT_LABEL = 'TBC — awaiting confirmation';

/** Shown for a side that is neither entered nor ruled — an unfilled slot on an ordinary fixture. */
export const EMPTY_SIDE_LABEL = 'TBD';

/**
 * Names for the things a fill rule points at, so "Winner QF1" can be written out.
 *
 * A rule stores ids, never text — storing the label too would be a second copy to keep in step —
 * so the caller supplies whatever it has and the derivation degrades gracefully without it.
 */
export interface FixtureSourceNames {
  /** Fixture labels by game id: `{ 'game-7': 'QF1' }`. */
  games?: Record<string, string>;
  /** Stage names by stage id: `{ 'stg-1': 'Group Stage' }`. */
  stages?: Record<string, string>;
  /** Pool names by pool key: `{ 'A': 'Pool A' }`. */
  pools?: Record<string, string>;
}

export interface FixtureSideInput {
  /** The side of the fixture, as stored. */
  participant?: Partial<GameParticipant>;
  /** The entrant `participant.entrantId` names, when the caller has it. */
  entrant?: Partial<TournamentEntrant>;
  /** The competitor's name, when it is not on the participant (a `GameSummary`, say). */
  name?: string;
  /** Prefixed to a known name, matching `participantLabel`: "SBHS 1st XV". */
  orgShortName?: string;
  names?: FixtureSourceNames;
}

export interface FixtureSide {
  state: FixtureSideState;
  /** What prints. Never empty. */
  label: string;
  /** True while nobody is playing yet, for callers that dim or italicise a placeholder. */
  isPlaceholder: boolean;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th". */
export function ordinal(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const lastTwo = abs % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/**
 * "Winner QF1", "Loser SF2", "Pool A winner", "3rd in Pool C" — derived from the rule alone.
 *
 * Returns `undefined` when there is no rule to describe, so a caller can fall through to the
 * other two states.
 */
export function describeParticipantSource(
  rule: ParticipantSourceRule | undefined,
  opts: { sourceGameId?: string; sourceStageId?: string; names?: FixtureSourceNames } = {}
): string | undefined {
  if (!rule) return undefined;
  const { sourceGameId, sourceStageId, names } = opts;

  if (rule.type === 'winnerOf' || rule.type === 'loserOf') {
    const word = rule.type === 'winnerOf' ? 'Winner' : 'Loser';
    const gameName = sourceGameId ? names?.games?.[sourceGameId] : undefined;
    return gameName ? `${word} ${gameName}` : `${word} of an earlier fixture`;
  }

  // `standing`: a stage, an optional pool, and a position. The same mechanism expresses a pool
  // winner, a runner-up and an A1-v-B2 crossover, which is what rules buy over a bracket.
  const poolName = rule.poolKey
    ? (names?.pools?.[rule.poolKey] ?? `Pool ${rule.poolKey}`)
    : undefined;
  const stageName = sourceStageId ? names?.stages?.[sourceStageId] : undefined;
  const container = poolName ?? stageName;

  if (!container) {
    return rule.position === 1 ? 'Stage winner' : `${ordinal(rule.position)} place`;
  }
  return rule.position === 1
    ? `${container} winner`
    : `${ordinal(rule.position)} in ${container}`;
}

/**
 * Which of the three states a side is in, and what prints for it.
 *
 * Resolution order is deliberate: a competitor that is known wins over everything, because a
 * resolved slot must be indistinguishable from one that was never a placeholder. An entrant comes
 * next — a slot filled by an entrant is filled, even if that entrant is still "a fourth school,
 * name to follow". Only then the fill rule.
 */
export function resolveFixtureSide(input: FixtureSideInput = {}): FixtureSide {
  const { participant, entrant, name, orgShortName, names } = input;

  const knownName =
    name ??
    participant?.name ??
    (entrant?.teamId || entrant?.orgProfileId ? entrant?.label : undefined);
  const isKnownCompetitor = !!(
    participant?.teamId ||
    participant?.orgProfileId ||
    entrant?.teamId ||
    entrant?.orgProfileId
  );

  if (isKnownCompetitor && knownName) {
    return {
      state: 'known',
      label: orgShortName ? `${orgShortName} ${knownName}` : knownName,
      isPlaceholder: false,
    };
  }
  // A competitor we can identify but cannot name yet still counts as known — the name arrives
  // with the next payload, and calling it TBC would be wrong.
  if (isKnownCompetitor) {
    return { state: 'known', label: EMPTY_SIDE_LABEL, isPlaceholder: false };
  }

  if (participant?.entrantId || entrant) {
    return {
      state: 'awaitingEntrant',
      label: entrant?.label || AWAITING_ENTRANT_LABEL,
      isPlaceholder: true,
    };
  }

  const derived = describeParticipantSource(participant?.sourceRule, {
    sourceGameId: participant?.sourceGameId,
    sourceStageId: participant?.sourceStageId,
    names,
  });
  if (derived) {
    return { state: 'awaitingResult', label: derived, isPlaceholder: true };
  }

  // Nothing entered and nothing ruled: an ordinary fixture with a side still to be picked.
  return { state: 'awaitingEntrant', label: EMPTY_SIDE_LABEL, isPlaceholder: true };
}
