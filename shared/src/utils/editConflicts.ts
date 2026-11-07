import type { Season } from '../models/league/League';
import { DEFAULT_SEASON_POINTS } from './seasonPoints';

/**
 * Two people editing the same thing (`SYNC-11`, decided 2026-11-07: check on save, not locks).
 *
 * A save carries the old values of the fields it changes — what the form was opened on — and the
 * server refuses it when one of those fields has changed since. A change to *other* fields is not a
 * clash, which is why a form sends only the fields it changed. The refusal carries an
 * {@link EditConflict}, so the screen can say who changed what and offer *Save mine anyway*: the
 * same save again, now based on the values just reported — still refused if a third change lands
 * in between.
 */
export interface EditConflict {
  /** Who last saved it, as their organisation knows them. `null` when not known. */
  changedBy: string | null;
  /** The fields that changed under the save, by payload name. */
  fields: string[];
  /** What is saved now, for those fields only. */
  current: Record<string, unknown>;
}

/** Blank is blank: a missing logo arrives as `undefined`, `null` or `''` depending on who read it. */
const blank = (value: unknown) => value === undefined || value === null || value === '';

/** JSON with object keys sorted, so a JSONB column read twice compares equal. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as object).sort()
      .filter(key => !blank((value as Record<string, unknown>)[key]))
      .map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sameEditValue(a: unknown, b: unknown): boolean {
  if (blank(a) || blank(b)) return blank(a) && blank(b);
  return stable(a) === stable(b);
}

/** The fields of `was` whose value is no longer what is saved. No `was`: nothing to check. */
export function clashingFields(was: Record<string, unknown> | undefined, now: Record<string, unknown>): string[] {
  if (!was) return [];
  return Object.keys(was).filter(key => !sameEditValue(was[key], now[key]));
}

/** "a", "a and b", "a, b and c". */
export function listInWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------------------------
// Season settings (`UPDATE_SEASON`)

/** The season fields its settings form edits, flat, in the shape a save's `was` names them. */
export interface SeasonEditFields {
  name: string;
  startDate: string;
  endDate: string;
  pointsPerWin: number;
  pointsPerDraw: number;
  pointsPerLoss: number;
  logo: string | null;
}

/** How each field is named in a sentence ("changed the end date"). */
export const SEASON_EDIT_LABELS: Record<keyof SeasonEditFields, string> = {
  name: 'name',
  startDate: 'start date',
  endDate: 'end date',
  pointsPerWin: 'points for a win',
  pointsPerDraw: 'points for a draw',
  pointsPerLoss: 'points for a loss',
  logo: 'logo',
};

/** A season as its settings form edits it. Missing points read as the form's own default. */
export function seasonEditFields(season: Pick<Season, 'name' | 'startDate' | 'endDate' | 'settings' | 'logo'>): SeasonEditFields {
  return {
    name: season.name ?? '',
    startDate: season.startDate ?? '',
    endDate: season.endDate ?? '',
    pointsPerWin: season.settings?.pointsPerWin ?? DEFAULT_SEASON_POINTS.pointsPerWin,
    pointsPerDraw: season.settings?.pointsPerDraw ?? DEFAULT_SEASON_POINTS.pointsPerDraw,
    pointsPerLoss: season.settings?.pointsPerLoss ?? DEFAULT_SEASON_POINTS.pointsPerLoss,
    logo: season.logo || null,
  };
}

// ---------------------------------------------------------------------------------------------
// A side's team sheet for one game (`SAVE_GAME_ROSTER`)

export interface TeamSheetItem {
  orgProfileId: string;
  position?: string;
  jerseyNumber?: string;
  isReserve: boolean;
}

const sheetEntry = (item: TeamSheetItem) => ({
  orgProfileId: item.orgProfileId,
  position: item.position || null,
  jerseyNumber: item.jerseyNumber || null,
  isReserve: !!item.isReserve,
});

/** The same sheet, whatever order it was picked in. */
export function sameTeamSheet(a: TeamSheetItem[], b: TeamSheetItem[]): boolean {
  const key = (rows: TeamSheetItem[]) =>
    JSON.stringify(rows.map(sheetEntry).sort((x, y) => x.orgProfileId.localeCompare(y.orgProfileId)));
  return a.length === b.length && key(a) === key(b);
}

/**
 * Each player whose place differs between two sheets: on one and not the other, or on both in a
 * different position, number or reserve place. What *Save mine anyway* lists before replacing.
 */
export function teamSheetChanges(theirs: TeamSheetItem[], yours: TeamSheetItem[]):
  Array<{ orgProfileId: string; theirs: TeamSheetItem | null; yours: TeamSheetItem | null }> {
  const byId = (rows: TeamSheetItem[]) => new Map(rows.map(row => [row.orgProfileId, row]));
  const theirsById = byId(theirs);
  const yoursById = byId(yours);
  const ids = [...new Set([...theirsById.keys(), ...yoursById.keys()])];
  return ids
    .map(orgProfileId => ({ orgProfileId, theirs: theirsById.get(orgProfileId) ?? null, yours: yoursById.get(orgProfileId) ?? null }))
    .filter(({ theirs: t, yours: y }) => !t || !y || stable(sheetEntry(t)) !== stable(sheetEntry(y)));
}
