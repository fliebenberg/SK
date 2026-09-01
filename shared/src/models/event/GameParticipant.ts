import { ParticipantSourceRule } from "./Tournament";

export interface GameParticipant {
  id: string;
  gameId: string;
  teamId?: string;
  name?: string;
  orgProfileId?: string;
  status?: 'active' | 'withdrawn' | 'disqualified' | 'did_not_start';
  sortOrder?: number;
  /**
   * Which competitor this side is, once known (data model §4.1).
   *
   * All four tournament fields are null for every single match and for every row that predates
   * tournaments, so nothing reading `teamId` today behaves differently: resolving a placeholder
   * writes `teamId`, and the row then looks like one that was known all along.
   */
  entrantId?: string;
  /** The fixture that decides this side, for a `winnerOf` / `loserOf` rule. */
  sourceGameId?: string;
  /** The stage whose table decides this side, for a `standing` rule. */
  sourceStageId?: string;
  sourceRule?: ParticipantSourceRule;
}
