import { useCallback, useEffect, useState } from 'react';
import { OrgClaimStatus } from '@sk/shared';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

/**
 * The caller's view of an organisation's claim state (`get_data org_claim_status`): whether it is
 * claimed, the nominations *they* have made for it, and whether they may take the empty admin role
 * themselves. Strictly their own view — another user's nomination is not reported.
 *
 * Only asked when `enabled` (an org known to be unclaimed): a claimed org needs no appeal.
 * `addPending` records a nomination just sent, so the caller sees green without asking again.
 */
export function useOrgClaimStatus(orgId: string | undefined, enabled: boolean) {
  const isConnected = useWsStore(state => state.isConnected);
  const [status, setStatus] = useState<OrgClaimStatus | null>(null);

  const refresh = useCallback(() => {
    if (!orgId || !enabled || !isConnected) return;
    wsService.emit(
      'get_data',
      { type: 'org_claim_status', orgId },
      (res: OrgClaimStatus | null) => {
        // A refusal is `{ status: 'error' }`; only a status for this org is used.
        if (!res || (res as any).status === 'error' || res.orgId !== orgId) return;
        setStatus(res);
      },
      7000,
      { suppressToast: true }
    );
  }, [orgId, enabled, isConnected]);

  useEffect(() => {
    setStatus(null);
    refresh();
  }, [refresh]);

  const addPending = useCallback((email: string) => {
    setStatus(prev =>
      prev && !prev.myPendingEmails.includes(email)
        ? { ...prev, myPendingEmails: [...prev.myPendingEmails, email] }
        : prev
    );
  }, []);

  return { status, refresh, addPending };
}
