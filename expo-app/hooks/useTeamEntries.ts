import { TeamEntry } from '@sk/shared';
import { useSocketQuery } from './useSocketQuery';

const NO_ENTRIES: TeamEntry[] = [];

/**
 * A team's places in tournaments (`get_data` `team_entries`, `FIX-31`) — its page's Events card — or,
 * with `orgId`, every team of an organisation still invited (`org_team_invitations`), for the
 * invitations box. A one-shot read: no room owns "a team across tournaments", so it is read again
 * after an answer, through `refresh`.
 *
 * `entries` being empty only means none when `error` is empty (`SYNC-9`). A failure is toasted, unless
 * the screen passes `suppressToast` because it draws `error`.
 */
export function useTeamEntries(query: { teamId?: string | null; orgId?: string | null }, options: { suppressToast?: boolean } = {}) {
  const { teamId, orgId } = query;
  const { data, isLoading, error, refetch } = useSocketQuery<TeamEntry[]>(
    teamId ? 'team_entries' : 'org_team_invitations',
    teamId ? { teamId } : { orgId },
    { enabled: !!teamId || !!orgId, suppressToast: options.suppressToast },
  );
  return { entries: Array.isArray(data) ? data : NO_ENTRIES, isLoading, error, refresh: refetch };
}
