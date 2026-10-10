import { useCallback, useEffect, useState } from 'react';
import { TeamEntry } from '@sk/shared';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

/**
 * A team's places in tournaments (`get_data` `team_entries`, `FIX-31`) — its page's Events card — or,
 * with `orgId`, every team of an organisation still invited (`org_team_invitations`), for the
 * invitations box. A one-shot read: no room owns "a team across tournaments", so it is read again
 * after an answer, through `refresh`.
 */
export function useTeamEntries(query: { teamId?: string | null; orgId?: string | null }) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [entries, setEntries] = useState<TeamEntry[]>([]);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  const { teamId, orgId } = query;
  useEffect(() => {
    if (!isConnected || (!teamId && !orgId)) return;
    let live = true;
    const request = teamId ? { type: 'team_entries', teamId } : { type: 'org_team_invitations', orgId };
    wsService.emit('get_data', request, (res: any) => { if (live) setEntries(Array.isArray(res) ? res : []); });
    return () => { live = false; };
  }, [isConnected, teamId, orgId, tick]);
  return { entries, refresh };
}
