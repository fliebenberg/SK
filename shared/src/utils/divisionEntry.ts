import { CandidateTeam } from '../models/event/Tournament';

/**
 * Whether a team is eligible for a division.
 *
 * A division names a sport and an age group; a team names both too. An unset field on the division
 * is deliberately permissive — a `Festival` division created before a sport was chosen should offer
 * every team rather than none, because an organiser who has not said "u14 rugby" yet has not said
 * "nothing qualifies" either.
 *
 * Age groups are compared by id. Each is an entry in the sport's age-group list, so "U14" on the
 * team and "U14" on the division are the same row — and a custom "Under 14" is a different one until
 * an admin merges it into "U14", at which point both hold the same id.
 */
export function teamQualifies(
  team: Pick<CandidateTeam, 'sportId' | 'ageGroupId'>,
  division: { sportId?: string; ageGroupId?: string | null }
): boolean {
  if (division.sportId && team.sportId !== division.sportId) return false;
  if (division.ageGroupId && team.ageGroupId !== division.ageGroupId) return false;
  return true;
}

/**
 * Which divisions a competitor may be entered into — the entry table's division column.
 *
 * The inverse of {@link divisionTeamOptions}, and the inversion is the point. The grid this
 * replaced asked "which teams for this division", which made *where a team plays* something the
 * screen had to reconstruct by looking in every division at once — and made "a team plays in one
 * division" a rule defended with dimmed chips and a move dialog. Asked the other way round, a
 * competitor has one division cell and the invariant stops being sayable.
 *
 * - `qualifying` — the right sport, and the right age group or a division that names none. These
 *   are the ordinary answer and appear first.
 * - `others` — the same sport, another age group. The **override**: a strong u13 side playing up,
 *   or a school short of u14s. Kept in a separate group at the foot of the list so that choosing
 *   one stays a deliberate act rather than a mis-tap, which is what the old "other age groups"
 *   control bought and what a single flat list would have thrown away.
 *
 * Another sport is never offered. A hockey team in a rugby division is a mistake, not an exception.
 *
 * A competitor with **no team behind it** — a placeholder (D7), or a person in an individual sport
 * — qualifies nowhere in particular, so it is offered every division and nothing is held back.
 * `null` rather than an empty object is what says so: a team whose sport is merely unset is a
 * different thing, and passing one would quietly get the placeholder treatment.
 */
export function divisionsForTeam<D extends { sportId?: string; ageGroupId?: string | null }>(
  team: Pick<CandidateTeam, 'sportId' | 'ageGroupId'> | null,
  divisions: D[]
): { qualifying: D[]; others: D[] } {
  if (!team) return { qualifying: [...divisions], others: [] };

  const qualifying: D[] = [];
  const others: D[] = [];
  for (const division of divisions) {
    if (teamQualifies(team, division)) qualifying.push(division);
    else if (!division.sportId || team.sportId === division.sportId) others.push(division);
  }
  return { qualifying, others };
}
