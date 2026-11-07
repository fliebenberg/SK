import type { LeagueSettings } from '../models/league/League';

/** What a new season awards when its points are left blank: the form starts on these. */
export const DEFAULT_SEASON_POINTS = { pointsPerWin: 4, pointsPerDraw: 2, pointsPerLoss: 0 } as const;

/**
 * The points typed into a season's form. A blank field takes the default; anything else must be a
 * whole number of zero or more, so a typed 0 stays 0 (`SYNC-10`) rather than falling back to the
 * default the way `parseInt(x) || 2` did.
 *
 * @returns The settings, or the reason they cannot be saved.
 */
export function seasonPointsFromInput(input: { win: string; draw: string; loss: string }):
  { ok: true; points: Pick<LeagueSettings, 'pointsPerWin' | 'pointsPerDraw' | 'pointsPerLoss'> } | { ok: false; message: string } {
  const read = (text: string, fallback: number): number | null => {
    const trimmed = text.trim();
    if (!trimmed) return fallback;
    return /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : null;
  };
  const pointsPerWin = read(input.win, DEFAULT_SEASON_POINTS.pointsPerWin);
  const pointsPerDraw = read(input.draw, DEFAULT_SEASON_POINTS.pointsPerDraw);
  const pointsPerLoss = read(input.loss, DEFAULT_SEASON_POINTS.pointsPerLoss);
  if (pointsPerWin === null || pointsPerDraw === null || pointsPerLoss === null) {
    return { ok: false, message: 'Points must be whole numbers, 0 or more.' };
  }
  return { ok: true, points: { pointsPerWin, pointsPerDraw, pointsPerLoss } };
}
