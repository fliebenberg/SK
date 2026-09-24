import { GameSummary } from "../models/event/GameSummary";
import { TournamentEntrant, TournamentStage } from "../models/event/Tournament";

/**
 * How a division's roster has moved since its draw was made (2026-09-24).
 *
 * Generation never tops up a draw (D9), so once fixtures exist the roster and the draw can drift
 * apart in two ways, and the Fixtures step has to say so rather than let an organiser find out on
 * the day:
 *
 * - **Not in the draw** — an active entrant with no fixture in the stage that takes the roster.
 *   Entered after the draw, usually as somebody's replacement.
 * - **Left the draw** — a withdrawn entrant that still has fixtures to play. It pulled out after
 *   playing, so it was kept for its results; what it had still to play needs a new owner.
 *
 * One of each is the case a swap settles (`REPLACE_ENTRANT` with `replacementEntrantId`); anything
 * else is a redraw or hand edits, which is the organiser's call.
 *
 * Read off the **first** stage, because that is the one that takes the roster — a later stage is
 * filled by progression, and an entrant not in a knockout it has not qualified for is not a change.
 * A fixture counts as played when it is finished or live, as elsewhere on the client.
 */
export interface DrawChanges {
  /** The first stage has fixtures, so there is a draw to compare with. */
  drawn: boolean;
  notInDraw: TournamentEntrant[];
  leftDraw: Array<{ entrant: TournamentEntrant; unplayed: number }>;
  /** `notInDraw.length + leftDraw.length` — what a status line counts. */
  count: number;
}

export function isPlayedFixture(game: Pick<GameSummary, 'status'>): boolean {
  return game.status === 'Finished' || game.status === 'Live';
}

/**
 * `stages` may be the division's stages, or just the id of its first one — which is what
 * `TournamentDivision.firstStageId` carries for a screen that holds no stages (the checklist).
 */
export function drawChanges(
  stages: TournamentStage[] | string | null | undefined,
  games: GameSummary[],
  entrants: TournamentEntrant[]
): DrawChanges {
  const firstId =
    typeof stages === 'string' || !stages
      ? stages || undefined
      : [...stages].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))[0]?.id;
  const drawGames = firstId ? games.filter(game => game.stageId === firstId) : [];
  if (!drawGames.length) return { drawn: false, notInDraw: [], leftDraw: [], count: 0 };

  const drawnIds = new Set<string>();
  const unplayedBy = new Map<string, number>();
  for (const game of drawGames) {
    for (const side of game.participants || []) {
      if (!side.entrantId) continue;
      drawnIds.add(side.entrantId);
      if (!isPlayedFixture(game) && !side.sourceRule) {
        unplayedBy.set(side.entrantId, (unplayedBy.get(side.entrantId) || 0) + 1);
      }
    }
  }

  const notInDraw = entrants.filter(e => e.status !== 'withdrawn' && !drawnIds.has(e.id));
  const leftDraw = entrants
    .filter(e => e.status === 'withdrawn' && (unplayedBy.get(e.id) || 0) > 0)
    .map(entrant => ({ entrant, unplayed: unplayedBy.get(entrant.id) || 0 }));

  return { drawn: true, notInDraw, leftDraw, count: notInDraw.length + leftDraw.length };
}
