import { CandidateTeam, OrgBadge, Team } from '@sk/shared';

/**
 * A team created inline, shaped as a candidate so it appears without a second read.
 *
 * `event_candidate_teams` is a one-shot read (no room owns "teams that could enter"), so nothing
 * otherwise tells an open entry screen that the team now exists. Both screens that mount
 * `DivisionEntrantsEditor` — the event-level entrants screen and the division panel — did this
 * conversion inline and identically, which meant two places to keep a field in step with
 * `CandidateTeam`; they had already drifted apart on the org lookup, which one of them ran twice.
 */
export function candidateFromTeam(team: Team, orgs: OrgBadge[]): CandidateTeam {
  // The org is always one of `orgs`: a team is created from that organisation's own group, and the
  // button that creates it is rendered per org from this same list. The fallbacks satisfy the type
  // checker rather than describing a state anybody reaches.
  const org = orgs.find(o => o.id === team.orgId);
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    orgId: team.orgId,
    orgName: org?.name || team.orgId,
    orgShortName: org?.shortName || team.orgId,
    sportId: team.sportId,
    ageGroupId: team.ageGroupId,
    ageGroup: team.ageGroup,
  };
}
