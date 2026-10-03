import { TeamMember } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * A team's players and staff, kept live from `team:{id}:members`. Every roster change republishes
 * the whole roster (`TEAM_MEMBERS_SYNC`), so it simply replaces what is held.
 */
export function useTeamRoster(teamId?: string | null) {
  const { items, isLoading, accessDenied } = useLiveRoom<TeamMember>(teamId ? `team:${teamId}:members` : null, {
    reduce: (message) => message.type === 'TEAM_MEMBERS_SYNC' && Array.isArray(message.data)
      ? { kind: 'replace', items: message.data }
      : { kind: 'ignore' },
    getId: member => member.membershipId,
  });
  return { roster: items, isLoading, accessDenied };
}
