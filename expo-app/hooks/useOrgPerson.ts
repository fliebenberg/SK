import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { OrgPerson } from '@sk/shared';
import { onActionSucceeded } from '../services/actions';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

/**
 * One person on an organisation's books, with their guardians, for Admin and Staff (`LIST-1`). People
 * are a static list (okf/live_rooms.md), so there is no room: it reads when the page opens or comes
 * back into view, when the connection returns, and after any change made from this device.
 */
export function useOrgPerson(orgId?: string | null, membershipId?: string | null) {
  const isConnected = useWsStore(state => state.isConnected);
  const [person, setPerson] = useState<OrgPerson | null>(null);
  const [isLoading, setIsLoading] = useState(!!orgId);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!orgId || !membershipId || !isConnected) {
      setIsLoading(false);
      return;
    }
    const asked = ++latest.current;
    wsService.emit('get_data', { type: 'org_person', orgId, membershipId }, (res: any) => {
      if (asked !== latest.current) return;
      setIsLoading(false);
      setPerson(res?.id ? res : null);
    });
  }, [orgId, membershipId, isConnected, attempt]);

  useEffect(() => onActionSucceeded(() => setAttempt(n => n + 1)), []);

  // The first focus is the read above.
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focused.current) setAttempt(n => n + 1);
    focused.current = true;
  }, []));

  return { person, isLoading };
}
