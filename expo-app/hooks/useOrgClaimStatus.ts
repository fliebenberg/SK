import { useCallback, useEffect, useRef, useState } from 'react';
import { OrgClaimStatus } from '@sk/shared';
import { readData } from '../services/reads';
import { useWsStore } from '../store/wsStore';

/**
 * The caller's view of an organisation's claim state (`get_data org_claim_status`): whether it is
 * claimed, the nominations *they* have made for it, and whether they may take the empty admin role
 * themselves. Strictly their own view — another user's nomination is not reported.
 *
 * Only asked when `enabled` (an org known to be unclaimed): a claimed org needs no appeal.
 * `addPending` records a nomination just sent, so the caller sees green without asking again.
 *
 * **`status` being `null` does not mean "nothing pending, may not take it" when `error` is set
 * (`SYNC-9`).** A failure is toasted, unless the screen passes `suppressToast` because it draws `error`.
 */
export function useOrgClaimStatus(orgId: string | undefined, enabled: boolean, options: { suppressToast?: boolean } = {}) {
  const isConnected = useWsStore(state => state.isConnected);
  const [status, setStatus] = useState<OrgClaimStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suppressToast = options.suppressToast;
  /** Bumped by every new read, so that only the latest may answer. */
  const latest = useRef(0);

  const refresh = useCallback(() => {
    if (!orgId || !enabled || !isConnected) return;
    const asked = ++latest.current;
    const isCurrent = () => asked === latest.current;
    setError(null);
    void readData<OrgClaimStatus | null>('org_claim_status', { orgId }, { suppressToast, stillWanted: isCurrent }).then(result => {
      if (!isCurrent()) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // Only a status for this org is used.
      if (result.data?.orgId === orgId) setStatus(result.data);
    });
  }, [orgId, enabled, isConnected, suppressToast]);

  useEffect(() => {
    setStatus(null);
    setError(null);
    refresh();
    return () => { latest.current++; };
  }, [refresh]);

  const addPending = useCallback((email: string) => {
    setStatus(prev =>
      prev && !prev.myPendingEmails.includes(email)
        ? { ...prev, myPendingEmails: [...prev.myPendingEmails, email] }
        : prev
    );
  }, []);

  return { status, error, refresh, addPending };
}
