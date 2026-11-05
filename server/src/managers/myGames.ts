import { MY_GAMES_LIMIT } from '@sk/shared';

/**
 * Which games make Home's *My games* (docs/home.md §5), decided 2026-11-04. Kept apart from the query
 * so the rules can be read, and checked, on their own.
 */

/**
 * Why a game is on the viewer's list, most relevant first: 1 their own team or a child's, 2 a
 * tournament, sport or division they were appointed to run, 3 a team of an organisation they are an
 * Admin of.
 */
export type MyGameTier = 1 | 2 | 3;

/** One team in one game that could be listed. A game has a row for each of its teams. */
export interface MyGameCandidate {
  gameId: string;
  teamId: string;
  /** The highest reason this team gives; `null` for a side that is only the opposition. */
  tier: MyGameTier | null;
  status: 'Live' | 'Scheduled' | 'Finished';
  /** Epoch seconds: when it kicks off, or when it finished. */
  at: number;
}

/**
 * The games to list:
 *
 * - **The most relevant reason first.** Own teams fill the list, and only what is left goes to the
 *   tournaments they run, then to their organisation's teams.
 * - **Within a reason, live first, then whatever is closest to now**, before or after.
 * - **At most one result and one upcoming game per team**, so one busy week cannot fill the list. A
 *   live game is on top of those. A team is used up by any game it plays in that is listed, also as
 *   the opposition.
 * - **A game is listed once**, under its highest reason.
 */
export function chooseMyGames(candidates: MyGameCandidate[], now: number, limit: number = MY_GAMES_LIMIT): string[] {
  const games = new Map<string, MyGameCandidate[]>();
  for (const row of candidates) games.set(row.gameId, [...(games.get(row.gameId) ?? []), row]);

  const ranked = [...games.values()].flatMap(sides => {
    const tiers = sides.flatMap(side => (side.tier === null ? [] : [side.tier]));
    if (!tiers.length) return [];
    const tier = Math.min(...tiers);
    const { gameId, status, at } = sides[0];
    return [{ gameId, status, at, tier, sides, ours: sides.filter(side => side.tier === tier) }];
  });
  ranked.sort((a, b) =>
    a.tier - b.tier
    || Number(b.status === 'Live') - Number(a.status === 'Live')
    || Math.abs(a.at - now) - Math.abs(b.at - now)
    || a.gameId.localeCompare(b.gameId));

  const used = new Set<string>();
  const chosen: string[] = [];
  for (const game of ranked) {
    if (chosen.length >= limit) break;
    const slot = game.status === 'Live' ? null : game.status === 'Finished' ? 'result' : 'upcoming';
    if (slot && game.ours.some(side => used.has(`${side.teamId}:${slot}`))) continue;
    chosen.push(game.gameId);
    if (slot) for (const side of game.sides) used.add(`${side.teamId}:${slot}`);
  }
  return chosen;
}
