import { useEffect, useState } from 'react';
import { TeamEntry, TeamMember } from '@sk/shared';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

/**
 * What the public team page reads in place of the workspace's (2026-10-22, docs/teams.md §6): the
 * workspace's roster, members and invitations are members' reads, which an anonymous socket is
 * refused. Each is a one-shot read at the `org:{id}:teams` level.
 */

function useTeamRead<T>(type: string, teamId: string | null | undefined, empty: T): T {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [value, setValue] = useState<T>(empty);
  useEffect(() => {
    if (!isConnected || !teamId) return;
    let live = true;
    wsService.emit('get_data', { type, teamId, id: teamId }, (res: any) => {
      if (live) setValue(res && !res.status ? res : empty);
    });
    return () => { live = false; };
  }, [isConnected, type, teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

const NO_MEMBERS: TeamMember[] = [];
const NO_ENTRIES: TeamEntry[] = [];

/** The organisation a team belongs to — the public address names only the team. */
export function useTeamOrgId(teamId: string | null | undefined): string | null {
  const team = useTeamRead<any>('team', teamId, null);
  return team?.orgId || null;
}

/** Its players and staff by name and role — public until `PEOPLE-4` gives a way to hide players. */
export function useTeamSquad(teamId: string | null | undefined): TeamMember[] {
  const squad = useTeamRead<TeamMember[]>('team_squad', teamId, NO_MEMBERS);
  return Array.isArray(squad) ? squad : NO_MEMBERS;
}

/** The tournaments it has a place in — accepted places only; an invitation is its organisation's business. */
export function useTeamCompetitions(teamId: string | null | undefined): TeamEntry[] {
  const entries = useTeamRead<TeamEntry[]>('team_competitions', teamId, NO_ENTRIES);
  return Array.isArray(entries) ? entries : NO_ENTRIES;
}
