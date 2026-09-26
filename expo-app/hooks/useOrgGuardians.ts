import { useMemo } from 'react';
import { ProfileGuardian } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * Every active guardian link in an organisation, from `org:{id}:guardians` (`MEMBER-3`).
 *
 * Scoped at the org rather than per player because the People list and the rosters show a guardian
 * beside every player at once; one room, joined once, rather than a join per row. A change publishes
 * `PROFILE_GUARDIANS_UPDATED` with one player's whole current list, which replaces that player's
 * slice — a merge would keep a link the change ended.
 *
 * The room is the member list's tier: pass `enabled: false` for a viewer who cannot join it.
 */
export function useOrgGuardians(orgId?: string | null, enabled = true) {
  const { items, isLoading, accessDenied } = useLiveRoom<ProfileGuardian>(
    orgId ? `org:${orgId}:guardians` : null,
    {
      enabled,
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
export function guardianSummary(links: ProfileGuardian[] | undefined): string | null {
  if (!links?.length) return null;
  const first = links[0].guardianName || 'Guardian';
  return links.length > 1 ? `${first} +${links.length - 1}` : first;
}
