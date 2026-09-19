import { CandidateTeam } from '../models/event/Tournament';

/**
 * Whether a team is eligible for a division.
 *
 * A division names a sport and an age group; a team names both too. An unset field on the division
 * is deliberately permissive — a `Festival` division created before a sport was chosen should offer
 * every team rather than none, because an organiser who has not said "u14 rugby" yet has not said
 * "nothing qualifies" either.
 *
 * Age groups are compared case- and space-insensitively because they are free text typed by two
 * different people at two different times: "U14" on the team and "u14 " on the division are the
 * same age group, and treating them as different is how a school appears to have no team.
 */
export function teamQualifies(
  team: Pick<CandidateTeam, 'sportId' | 'ageGroup'>,
  division: { sportId?: string; ageGroup?: string }
): boolean {
  if (division.sportId && team.sportId !== division.sportId) return false;
  if (division.ageGroup && normaliseAgeGroup(team.ageGroup) !== normaliseAgeGroup(division.ageGroup)) {
    return false;
  }
  return true;
}

export function normaliseAgeGroup(value?: string): string {
  return (value || '').trim().toLowerCase();
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
  division: { sportId?: string; ageGroup?: string },
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
