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

/** A team the division's list shows, and whether it is there by override. */
export interface DivisionTeamOption {
  team: CandidateTeam;
  /** Plays the division's sport but is from another age group — entered by override. */
  otherAgeGroup: boolean;
}

/**
 * Which of an organisation's teams a division offers — the age-group override (2026-09-19).
 *
 * The age group narrows the list; it is not a rule. A strong U13 side playing up, or a school short
 * of U14s fielding a mixed team, is normal, so a team of the right **sport** from another age group
 * can still be entered. Two lists come back:
 *
 * - `listed` — every qualifying team, **plus any other-age-group team already entered**, so an
 *   override stays visible on both axes of the entrants screen instead of vanishing from the list
 *   it was added from.
 * - `others` — the right sport, another age group, not entered. The screens keep these behind an
 *   "other age groups" control, so entering one is a deliberate step rather than a slip.
 *
 * The **sport stays strict**: a hockey team in a rugby division is a mistake, not an exception, so
 * nothing offers it. Enforced here only — the server accepts any team, as it always has.
 */
export function divisionTeamOptions(
  teams: CandidateTeam[],
  division: { sportId?: string; ageGroupId?: string | null },
  enteredTeamIds: Set<string>
): { listed: DivisionTeamOption[]; others: CandidateTeam[] } {
  const listed: DivisionTeamOption[] = [];
  const others: CandidateTeam[] = [];
  for (const team of teams) {
    if (teamQualifies(team, division)) {
      listed.push({ team, otherAgeGroup: false });
    } else if (!division.sportId || team.sportId === division.sportId) {
      if (enteredTeamIds.has(team.id)) listed.push({ team, otherAgeGroup: true });
      else others.push(team);
    }
  }
  return { listed, others };
}
