import { useMemo } from 'react';
import { ProfileGuardian } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * The guardians of one team's players, from `team:{id}:guardians` (`MEMBER-3`, `PEOPLE-8`): one room,
 * joined once, rather than a join per row. A change publishes `PROFILE_GUARDIANS_UPDATED` with one
 * player's whole current list, which replaces that player's slice — a merge would keep a link the
 * change ended.
 */
export function useTeamGuardians(teamId?: string | null) {
  const { items, isLoading, accessDenied } = useLiveRoom<ProfileGuardian>(
    teamId ? `team:${teamId}:guardians` : null,
    {
      reduce: (message) => {
        if (message.type === 'GUARDIANS_SYNC') {
          return { kind: 'replace', items: message.data || [] };
        }
        if (message.type === 'PROFILE_GUARDIANS_UPDATED' && message.data?.playerProfileId) {
          const player = message.data.playerProfileId;
          return {
            kind: 'replaceWhere',
            items: message.data.guardians || [],
            where: (link: ProfileGuardian) => link.playerProfileId === player,
          };
        }
        return { kind: 'ignore' };
      },
    }
  );

  /** Active links by player, primary first — the order the server sends them in. */
  const byPlayer = useMemo(() => {
    const map = new Map<string, ProfileGuardian[]>();
    for (const link of items) {
      if (link.endDate) continue;
      const list = map.get(link.playerProfileId) || [];
      list.push(link);
      map.set(link.playerProfileId, list);
    }
    for (const list of map.values()) list.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    return map;
  }, [items]);

  return { links: items, byPlayer, isLoading, accessDenied };
}

/** "Karin Kotzé" or "Karin Kotzé +1" — the short form a list row has room for. */
export function guardianSummary(names: string[] | undefined): string | null {
  if (!names?.length) return null;
  const first = names[0] || 'Guardian';
  return names.length > 1 ? `${first} +${names.length - 1}` : first;
}
