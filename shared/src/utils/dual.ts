import type { GameSummary } from '../models/event/GameSummary';
import { hasLiveScore } from '../models/event/GameSummary';

/**
 * Head to Head (`H2H-1`, agreed 2026-10-13 on `mockups/head-to-head.html`): two organisations, each
 * team playing its counterpart from the other side once. These are the rules both the server's
 * automatic pairing and the screens read, so the two can never disagree about who meets whom or who
 * won the day.
 */

/** Compares team names the way a person reads them: "U9A" before "U10A", "A" before "B". */
const byName = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Pair two sides' teams **in name order** (agreed 2026-10-13): teams carry no A/B field, so the
 * first of each side's names meets the first of the other's — U13A v U13A, U13B v U13B. Whatever is
 * left over on the longer side has no counterpart and is returned unpaired, for the organiser to
 * give a game or leave out.
 */
export function pairInNameOrder<T>(
  host: T[],
  guest: T[],
  nameOf: (item: T) => string
): { pairs: Array<[T, T]>; unpaired: T[] } {
  const sort = (items: T[]) => [...items].sort((a, b) => byName.compare(nameOf(a), nameOf(b)));
  const h = sort(host);
  const g = sort(guest);
  const n = Math.min(h.length, g.length);
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < n; i++) pairs.push([h[i], g[i]]);
  return { pairs, unpaired: [...h.slice(n), ...g.slice(n)] };
}

/** How one game stands for a Head to Head's results, from the host's side. */
export type DualOutcome = 'host' | 'guest' | 'drawn' | 'live' | 'notPlayed';

/**
 * Who won a game, by its score: the higher score wins, equal scores draw — the same rule the
 * standings use. A live game is `live` whatever its score, and one finished with no score recorded
 * counts as played but decides nothing, so it is `notPlayed` rather than a draw nobody reported.
 */
export function dualOutcome(game: GameSummary, hostOrgId: string): DualOutcome {
  if (game.status === 'Live') return 'live';
  if (game.status !== 'Finished' || !hasLiveScore(game)) return 'notPlayed';
  const [a, b] = game.participants || [];
  if (!a || !b) return 'notPlayed';
  const score = (id: string) => game.scores?.[id] ?? 0;
  const hostSide = a.orgId === hostOrgId ? a : b.orgId === hostOrgId ? b : null;
  if (!hostSide) return 'notPlayed';
  const guestSide = hostSide === a ? b : a;
  const diff = score(hostSide.id) - score(guestSide.id);
  return diff > 0 ? 'host' : diff < 0 ? 'guest' : 'drawn';
}

export interface DualTally {
  /** Games the host's teams won. */
  host: number;
  /** Games the other organisation's teams won. */
  guest: number;
  drawn: number;
  live: number;
  /** Finished with a result: won by either side or drawn. */
  played: number;
  /** Every game not cancelled. */
  total: number;
}

/** The day's result, or one division's: games won by each side, and drawn. */
export function dualTally(games: GameSummary[], hostOrgId: string): DualTally {
  const t: DualTally = { host: 0, guest: 0, drawn: 0, live: 0, played: 0, total: 0 };
  for (const game of games) {
    if (game.status === 'Cancelled') continue;
    t.total++;
    const outcome = dualOutcome(game, hostOrgId);
    if (outcome === 'host') t.host++;
    else if (outcome === 'guest') t.guest++;
    else if (outcome === 'drawn') t.drawn++;
    else if (outcome === 'live') t.live++;
  }
  t.played = t.host + t.guest + t.drawn;
  return t;
}

/**
 * The teams entered in a Head to Head division with no game in it: what the pairing card lists
 * under *Choose opponent*, and what keeps Pairings from being done until each is given a game or
 * left out.
 */
export function dualUnpaired<E extends { id: string; status?: string | null }>(
  entrants: E[],
  games: Array<Pick<GameSummary, 'status' | 'participants'>>
): E[] {
  const playing = new Set<string>();
  for (const game of games) {
    if (game.status === 'Cancelled') continue;
    for (const side of game.participants || []) if (side.entrantId) playing.add(side.entrantId);
  }
  const entered = (status?: string | null) => status === 'invited' || status === 'accepted' || status === 'withdrawal_pending';
  return entrants.filter(e => entered(e.status) && !playing.has(e.id));
}
