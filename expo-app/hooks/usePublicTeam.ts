import { TeamEntry, TeamMember } from '@sk/shared';
import { useSocketQuery } from './useSocketQuery';

/**
 * What the public team page reads in place of the workspace's (2026-10-22, docs/teams.md §6): the
 * workspace's roster, members and invitations are members' reads, which an anonymous socket is
 * refused. Each is a one-shot read at the `org:{id}:teams` level. The page draws each `error`, since an
 * empty squad is only true when the read answered (`SYNC-9`).
 */

function useTeamRead<T>(type: string, teamId: string | null | undefined) {
  return useSocketQuery<T>(type, { teamId, id: teamId }, { enabled: !!teamId, suppressToast: true });
}

const NO_MEMBERS: TeamMember[] = [];
const NO_ENTRIES: TeamEntry[] = [];

/** The organisation a team belongs to — the public address names only the team. */
export function useTeamOrgId(teamId: string | null | undefined) {
  const { data, isLoading, error, refetch } = useTeamRead<any>('team', teamId);
  return { orgId: (data?.orgId as string | undefined) || null, isLoading, error, retry: refetch };
}

/** Its players and staff by name and role — public until `PEOPLE-4` gives a way to hide players. */
export function useTeamSquad(teamId: string | null | undefined) {
  const { data, error, refetch } = useTeamRead<TeamMember[]>('team_squad', teamId);
  return { squad: Array.isArray(data) ? data : NO_MEMBERS, error, retry: refetch };
}

/** The tournaments it has a place in — accepted places only; an invitation is its organisation's business. */
export function useTeamCompetitions(teamId: string | null | undefined) {
  const { data, error, refetch } = useTeamRead<TeamEntry[]>('team_competitions', teamId);
  return { entries: Array.isArray(data) ? data : NO_ENTRIES, error, retry: refetch };
}
