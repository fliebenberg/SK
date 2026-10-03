import { useEffect } from 'react';
import { OrgMember } from '@sk/shared';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';
import { useSocketQuery } from './useSocketQuery';

/**
 * An organisation's members, kept current from `org:{id}:members`.
 *
 * The People list and the person page each carried a copy of this; it moved here unchanged when
 * they became read-first (docs/people.md). `ORG_MEMBER_UPDATED` carries either a whole member (a
 * role change, an add) or only the profile's columns (a profile edit), so it is **merged** into the
 * member with that profile id rather than replacing it. One with an `endDate` is a removal.
 */
export function useOrgMembers(orgId?: string | null) {
  const isConnected = useWsStore(state => state.isConnected);
  const { data, isLoading, setData } = useSocketQuery<OrgMember[]>('org_members', { orgId });

  useEffect(() => {
    if (!isConnected || !orgId) return;
    const unsubscribe = wsService.subscribeToRoom(`org:${orgId}:members`);

    const handleUpdate = (event: any) => {
      if (!event) return;
      if (event.type === 'ORG_MEMBERS_SYNC') {
        setData(event.data);
      } else if (event.type === 'ORG_MEMBER_UPDATED' && event.data) {
        const updated = event.data;
        if (updated.endDate) {
          setData(prev => prev ? prev.filter(m => m.membershipId !== updated.id && m.membershipId !== updated.membershipId) : prev);
        } else if (updated.id) {
          setData(prev => {
            if (!prev) return prev;
            const idx = prev.findIndex(m => m.id === updated.id);
            if (idx !== -1) {
              const copy = [...prev];
              copy[idx] = { ...copy[idx], ...updated };
              return copy;
            }
            return updated.membershipId ? [...prev, updated] : prev;
          });
        }
      }
    };

    wsService.on('update', handleUpdate);
    return () => {
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId, setData]);

  return { members: data, isLoading, setMembers: setData };
}
