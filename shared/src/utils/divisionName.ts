/**
 * A division's automatic name (U50, revised by `FIX-27` on 2026-10-09) — in shared because the
 * client and the server both make one.
 *
 * **A division is named within its sport.** It is nearly always read under its sport — the
 * tournament page lists one sport at a time, with its divisions as tiles — so its name does not
 * repeat the sport: the netball U12 is "U12", and a division with no age group is "Open". Where the
 * sport is not already on screen, {@link divisionFullName} puts it back: "Netball U12".
 *
 * **Two divisions may play the same sport at the same age group** — two U14 rugby pools, an A and
 * a B competition — so the automatic name has to tell them apart: the second is `U14 B`, the third
 * `U14 C`. The letter is the first one free, and a division that already holds a lettered name
 * keeps it for as long as nobody else has taken it, so a name does not change under the organiser
 * just because a sibling was renamed or deleted.
 *
 * Divisions named before this — "Rugby U14", "Rugby U14 - 2", upper-cased by the old rule
 * (`SPORT-11`) — keep their names, and are still recognised as automatic (compared ignoring case),
 * so they follow a change of age group like any automatic name.
 */

/**
 * **A division's name is unique within its sport in a tournament, ignoring case and surrounding
 * space.** "U14" and "u14 " are the same name to anyone reading a draw or a table, so they are the
 * same name here; netball's "U14" and hockey's "U14" are not, because each is read under its sport.
 * The server refuses a duplicate; the division page checks as the name is typed; the automatic
 * name never produces one.
 */
export function normaliseDivisionName(name?: string | null): string {
  return (name || '').trim().toLowerCase();
}

/**
 * The name in `takenNames` that `name` collides with, or undefined when it is free. `takenNames`
 * are the names of the other divisions **of the same sport** in the tournament.
 */
export function findTakenDivisionName(name: string | null | undefined, takenNames: string[]): string | undefined {
  const wanted = normaliseDivisionName(name);
  if (!wanted) return undefined;
  return takenNames.find(taken => normaliseDivisionName(taken) === wanted);
}

/** What a division with no age group is called. */
export const OPEN_DIVISION_NAME = 'Open';

/** "U14" — the age group as the sport's list spells it, or "Open" without one. */
function baseName(ageGroup?: string | null): string {
  return ageGroup?.trim() || OPEN_DIVISION_NAME;
}

const LETTERS = 'BCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Whether `name` is `base` itself or one of its lettered variants, `base B` and on — ignoring case. */
function isVariantOf(name: string, base: string): boolean {
  const n = normaliseDivisionName(name);
  const b = normaliseDivisionName(base);
  if (!b) return false;
  if (n === b) return true;
  return n.length === b.length + 2 && n.startsWith(`${b} `) && LETTERS.toLowerCase().includes(n.slice(-1));
}

/** The names the app gave divisions before `FIX-27`: "Rugby U14", "Rugby U14 - 2", "Rugby". */
function isLegacyAutomatic(name: string, sportName?: string | null, ageGroup?: string | null): boolean {
  const legacy = normaliseDivisionName([sportName?.trim(), ageGroup?.trim()].filter(Boolean).join(' '));
  if (!legacy) return false;
  const n = normaliseDivisionName(name);
  if (n === legacy) return true;
  const prefix = `${legacy} - `;
  return n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length));
}

/**
 * The automatic name for a division.
 *
 * @param ageGroup the division's age group, as the sport's list names it
 * @param taken    the other divisions' names **in the same sport** — never this division's own
 * @param current  this division's saved name, kept when it is already a free variant of the base
 */
export function divisionAutoName(
  ageGroup?: string | null,
  taken: string[] = [],
  current?: string | null
): string {
  const base = baseName(ageGroup);
  // Compared the way uniqueness is judged — ignoring case — so the automatic name can never be one
  // the server would refuse.
  const used = new Set(taken.map(normaliseDivisionName));
  const kept = current?.trim();
  if (kept && isVariantOf(kept, base) && !used.has(normaliseDivisionName(kept))) return kept;
  if (!used.has(normaliseDivisionName(base))) return base;
  for (const letter of LETTERS) {
    const candidate = `${base} ${letter}`;
    if (!used.has(normaliseDivisionName(candidate))) return candidate;
  }
  return `${base} ${taken.length + 1}`;
}

/**
 * Whether a saved name is one the app would have produced, and so may be replaced by the app.
 *
 * Nothing is stored to say which kind a name is. A name counts as automatic when it is empty; the
 * derived name for the division's age group or a lettered variant of it (`U14 B`); a name the app
 * gave before `FIX-27` (`Rugby U14`, `Rugby U14 - 2`, `RUGBY U14` — compared ignoring case); the
 * tournament's name (what an early first division was created with); or the `Division 2` that
 * *Add a division* used to hand out. A hand-typed "U14" is indistinguishable from the automatic one,
 * which is fine: it is the same name, and following the age group is what its author would expect.
 */
export function isAutomaticDivisionName(
  name: string | null | undefined,
  context: { sportName?: string | null; ageGroup?: string | null; eventName?: string | null }
): boolean {
  const value = (name || '').trim();
  if (!value) return true;
  if (isVariantOf(value, baseName(context.ageGroup))) return true;
  if (isLegacyAutomatic(value, context.sportName, context.ageGroup)) return true;
  if (context.eventName && value === context.eventName.trim()) return true;
  return /^Division \d+$/.test(value);
}

/**
 * A division's name where its sport is not already on screen — a fixture on the tournament's
 * schedule, a team's page: "Netball U12". A name that already starts with the sport (one given
 * before `FIX-27`, or typed that way) is left as it is, so nothing reads "Netball Netball U12".
 */
export function divisionFullName(name?: string | null, sportName?: string | null): string {
  const value = (name || '').trim();
  const sport = (sportName || '').trim();
  if (!sport) return value;
  if (!value) return sport;
  if (normaliseDivisionName(value).startsWith(normaliseDivisionName(sport))) return value;
  return `${sport} ${value}`;
}

/**
 * How a division is labelled *beside its siblings of the same sport* — the entry grid's age pills.
 *
 * The entrants screen navigates sport, then division, so the pill only has to say which division
 * within one sport. `All ages` looked right for a division with no age group until a tournament
 * had two of them: a Rugby tab over two pills both reading `All ages`, naming neither. The label
 * has to be whatever actually *differs*, in this order:
 *
 *  1. **A name somebody typed** — `Cup`, `Plate`, `Boys A`. It was written to carry exactly this
 *     distinction, so nothing the app derives can beat it.
 *  2. **The age group**, where there is one. Shorter than the name and, unlike it, does not repeat
 *     the sport already shown on the tab above.
 *  3. **The automatic name**, for a division with neither — `Rugby` and `Rugby - 2`. It repeats
 *     the sport, which is a cost worth paying: two pills that read the same are not a label at
 *     all. The sport prefix is deliberately *not* stripped, because stripping turns that pair into
 *     `Rugby` and `2`, and a set of labels where one is a word and the next is a digit reads worse
 *     than one that is merely redundant.
 *
 * `All ages` survives only for the case it was right for all along: a lone unnamed division, where
 * there is nothing to distinguish and the pill is saying the division is open to every age.
 */
export function divisionSiblingLabel(
  division: { name?: string | null; ageGroup?: string | null },
  context: { sportName?: string | null; eventName?: string | null } = {}
): string {
  const name = (division.name || '').trim();
  const automatic = isAutomaticDivisionName(name, {
    sportName: context.sportName,
    ageGroup: division.ageGroup,
    eventName: context.eventName,
  });

  if (!automatic) return name;
  if (division.ageGroup?.trim()) return division.ageGroup.trim();
  return name || 'All ages';
}

/**
 * {@link divisionSiblingLabel} for a whole sport at once, with collisions resolved.
 *
 * Labelling each division on its own is not enough, and the second case is the more likely of the
 * two: an A/B split at the same age — `Rugby U14` and `Rugby U14 - 2` — reduces to `U14` twice,
 * which is the same unreadable pair as two `All ages` pills, reached by a different route. Since a
 * division's name is unique within its tournament, falling back to the name always separates them.
 *
 * The fallback is applied **only to the labels that collide**, so one clash does not turn a tidy
 * row of `U13 U14 U15` into three repetitions of the sport.
 */
export function divisionSiblingLabels(
  divisions: Array<{ id: string; name?: string | null; ageGroup?: string | null }>,
  context: { sportName?: string | null; eventName?: string | null } = {}
): Map<string, string> {
  const first = divisions.map(division => ({
    division,
    label: divisionSiblingLabel(division, context),
  }));

  const seen = new Map<string, number>();
  for (const { label } of first) seen.set(label, (seen.get(label) ?? 0) + 1);

  const labels = new Map<string, string>();
  for (const { division, label } of first) {
    const clashes = (seen.get(label) ?? 0) > 1;
    labels.set(division.id, clashes ? (division.name || '').trim() || label : label);
  }
  return labels;
}
