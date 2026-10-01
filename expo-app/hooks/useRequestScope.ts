import { useCallback, useMemo, useRef } from 'react';
import { newRequestId } from '../services/actions';

/**
 * A scope for the request ids of one save the user may retry — see `requestKeyFor`.
 *
 * Kept across retries of the same save, and renewed once it succeeds (or the form is reset), so the
 * *next* save is a new request rather than a replay of the last one.
 */
export function useRequestScope() {
  const scope = useRef(newRequestId());
  const current = useCallback(() => scope.current, []);
  const renew = useCallback(() => {
    scope.current = newRequestId();
  }, []);
  // The same object every render, so a callback or effect keyed on the scope stays put. A fresh one
  // each render made the import screen's discard callback new every render, and
  // `useUnsavedChanges` looped on it ("Maximum update depth exceeded").
  return useMemo(() => ({ current, renew }), [current, renew]);
}
