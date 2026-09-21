import { Game, gameResultScores, isResultNotProvided } from '@sk/shared';

/**
 * A finished match's score line from the full `Game`: "3 - 1" in participant order, "Score not
 * provided" when the result was recorded that way, or `undefined` when there is nothing to say.
 *
 * Read through `gameResultScores`, the order the standings use, so a card cannot show a different
 * result from the table. These screens read `finalScoreData.home` / `.away`, which a recorded
 * result does not write (2026-09-21).
 */
export function finishedScoreLine(game: Game | null | undefined): string | undefined {
  if (!game || game.status !== 'Finished') return undefined;
  if (isResultNotProvided(game.finalScoreData)) return 'Score not provided';
  const scores = gameResultScores(game);
  const [home, away] = game.participants || [];
  if (!scores || !home || !away) return undefined;
  return `${scores[home.id] ?? 0} - ${scores[away.id] ?? 0}`;
}
