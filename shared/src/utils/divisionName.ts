/**
 * A division's automatic name (U50) — in shared because the client and the server both make one.
 *
 * The division screen fills the name in from the sport and age group until the organiser types
 * their own, and the Sports & Divisions screen names a division it adds the same way.
 *
 * **Two divisions may play the same sport at the same age group** — two U14 rugby pools, an A and
 * a B competition — so the automatic name has to tell them apart: the second is `Rugby U14 - 2`,
 * the third `Rugby U14 - 3`. The number is the lowest one free, and a division that already holds a
 * numbered name keeps it for as long as nobody else has taken it, so a name does not change under
 * the organiser just because a sibling was renamed or deleted.
 */

/**
 * **A division's name is unique within its tournament, ignoring case and surrounding space.**
 * "Rugby U14" and "rugby u14 " are the same name to anyone reading a draw or a table, so they are
 * the same name here. The server refuses a duplicate; the division screen checks as the name is
 * typed; the automatic name never produces one.
 */
export function normaliseDivisionName(name?: string | null): string {
  return (name || '').trim().toLowerCase();
}

/** The name in `takenNames` that `name` collides with, or undefined when it is free. */
export function findTakenDivisionName(name: string | null | undefined, takenNames: string[]): string | undefined {
  const wanted = normaliseDivisionName(name);
  if (!wanted) return undefined;
  return takenNames.find(taken => normaliseDivisionName(taken) === wanted);
}

/** "Rugby U14" — sport first, then age group; either may be missing. */
function baseName(sportName?: string | null, ageGroup?: string | null): string {
  return [sportName?.trim(), ageGroup?.trim().toUpperCase()].filter(Boolean).join(' ');
}

/** Whether `name` is `base` itself or one of its numbered variants, `base - 2` and on. */
function isVariantOf(name: string, base: string): boolean {
  if (!base) return false;
  if (name === base) return true;
  const prefix = `${base} - `;
  return name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length));
}

/**
 * The automatic name for a division.
 *
 * @param taken   the other divisions' names in the same tournament — never this division's own
 * @param current this division's saved name, kept when it is already a free variant of the base
 */
export function divisionAutoName(
  sportName?: string | null,
  ageGroup?: string | null,
  taken: string[] = [],
  current?: string | null
): string {
  const base = baseName(sportName, ageGroup);
  if (!base) return '';
  // Compared the way uniqueness is judged — ignoring case — so the automatic name can never be one
  // the server would refuse.
  const used = new Set(taken.map(normaliseDivisionName));
  const kept = current?.trim();
  if (kept && isVariantOf(kept, base) && !used.has(normaliseDivisionName(kept))) return kept;
  if (!used.has(normaliseDivisionName(base))) return base;
  let n = 2;
  while (used.has(normaliseDivisionName(`${base} - ${n}`))) n++;
  return `${base} - ${n}`;
}

/**
 * Whether a saved name is one the app would have produced, and so may be replaced by the app.
 *
 * Nothing is stored to say which kind a name is. A name counts as automatic when it is empty, the
 * derived name for the division's current sport and age group or a numbered variant of it
 * (`Rugby U14 - 2`), the tournament's name (what an early first division was created with), or the
 * `Division 2` that *Add a division* used to hand out. A hand-typed "Rugby U14" is
 * indistinguishable from the automatic one, which is fine: it is the same name, and following the
 * sport is what its author would expect.
 */
export function isAutomaticDivisionName(
  name: string | null | undefined,
  context: { sportName?: string | null; ageGroup?: string | null; eventName?: string | null }
): boolean {
  const value = (name || '').trim();
  if (!value) return true;
  if (isVariantOf(value, baseName(context.sportName, context.ageGroup))) return true;
  if (context.eventName && value === context.eventName.trim()) return true;
  return /^Division \d+$/.test(value);
}
