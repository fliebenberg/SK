import { OrgBadge } from '../models/organization/Organization';
import { CandidateTeam, TournamentEntrant } from '../models/event/Tournament';

/**
 * One line of the entry table: a competitor, and the division it is in if any.
 *
 * `team` is the thing the division column keys off — `null` when there is no team behind the row,
 * which is how a placeholder (D7) and a person entrant say "offer me every division".
 */
export interface EntrantRow {
  /** Stable across re-renders: the team's id where there is one, the entrant's row id otherwise. */
  key: string;
  kind: 'team' | 'person' | 'placeholder';
  name: string;
  orgId?: string;
  /** The team behind this row, or `null` for a placeholder or a person. */
  team: CandidateTeam | null;
  /** Present when the competitor is entered; its `divisionId` is where. */
  entrant?: TournamentEntrant;
}

/**
 * The rows of the entry table: **every candidate team, plus every entrant that is not one of
 * them.**
 *
 * One rule rather than three special cases, which is what lets the table be a single uniform list:
 *
 * - **Team sports** list their candidates whether entered or not, because the table is where you
 *   enter them — a list of only what is already in would have nothing to tick.
 * - **A placeholder** is an entrant with a label and no team, so no candidate produces it and the
 *   second half of the rule picks it up.
 * - **An individual sport** has no candidate teams at all, so its rows are exactly the entrants
 *   somebody has added. Nothing is prepopulated, which is the intended behaviour and falls out
 *   rather than being coded for.
 *
 * The second half also catches a team that is entered but no longer a candidate — a school removed
 * from the tournament with its team still in a division. Leaving it out would hide a competitor
 * that is really there and really playing, which is worse than showing a row that looks odd.
 *
 * Sorted by organisation, then by name, so the table reads the way an organiser's paperwork does.
 */
export function buildEntrantRows(
  teams: CandidateTeam[],
  entrants: TournamentEntrant[],
  orgs: OrgBadge[]
): EntrantRow[] {
  const entrantByTeamId = new Map<string, TournamentEntrant>();
  for (const entrant of entrants) {
    if (entrant.teamId) entrantByTeamId.set(entrant.teamId, entrant);
  }

  const rows: EntrantRow[] = teams.map(team => ({
    key: team.id,
    kind: 'team',
    name: team.name,
    orgId: team.orgId,
    team,
    entrant: entrantByTeamId.get(team.id),
  }));

  const candidateIds = new Set(teams.map(team => team.id));
  for (const entrant of entrants) {
    if (entrant.teamId && candidateIds.has(entrant.teamId)) continue;
    rows.push({
      key: entrant.id,
      kind: entrant.orgProfileId ? 'person' : entrant.teamId ? 'team' : 'placeholder',
      name: entrant.name || entrant.label || 'TBC',
      orgId: entrant.orgId,
      // Even for a team, `null`: this row exists because the team is *not* a candidate, so its
      // sport and age group were never read and no division can be ruled out on them.
      team: null,
      entrant,
    });
  }

  const orgName = new Map(orgs.map(org => [org.id, org.name]));
  return rows.sort((a, b) => {
    const byOrg = (orgName.get(a.orgId || '') || '').localeCompare(orgName.get(b.orgId || '') || '');
    return byOrg !== 0 ? byOrg : a.name.localeCompare(b.name);
  });
}
