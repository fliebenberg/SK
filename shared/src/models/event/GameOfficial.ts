export interface GameOfficial {
  id: string;
  gameId: string;
  orgProfileId: string;
  /** `SCORER`, `REFEREE` (shown as *Match official*) or `TIMEKEEPER` (`PERM-7`). */
  role: 'SCORER' | 'REFEREE' | 'TIMEKEEPER' | string;
}

/** A game official as a screen lists them: the appointment, with the person's name. */
export interface GameOfficialEntry extends GameOfficial {
  name: string;
}

/** What each official role is called on screen. */
export const GAME_OFFICIAL_LABELS: Record<string, string> = {
  SCORER: 'Scorer',
  REFEREE: 'Match official',
  TIMEKEEPER: 'Timekeeper',
};
