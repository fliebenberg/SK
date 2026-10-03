import { Team } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * An organisation's teams, kept live from `org:{id}:teams` (docs/teams.md).
 *
 * The room's join push is the initial load, and every change arrives carrying the whole team — a
 * roster change republishes it so its player and staff counts and head coach (`coachName`) stay
 * right. The teams list and the team page both read their team from here, so neither fetches it.
 */
export function useOrgTeams(orgId?: string | null) {
  const { items, isLoading, accessDenied } = useLiveRoom<Team>(orgId ? `org:${orgId}:teams` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'TEAMS_SYNC':
          return { kind: 'replace', items: Array.isArray(message.data) ? message.data : [] };
        case 'TEAM_ADDED':
        case 'TEAM_UPDATED':
          return message.data?.id ? { kind: 'upsert', item: message.data } : { kind: 'ignore' };
        case 'TEAM_DELETED':
          return message.data?.id ? { kind: 'remove', id: message.data.id } : { kind: 'ignore' };
        default:
          return { kind: 'ignore' };
      }
    },
  });
  return { teams: items, isLoading, accessDenied };
}
