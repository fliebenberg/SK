import { useToastStore } from '../store/toastStore';

/**
 * Say so when a write did not happen.
 *
 * Every `action` is answered `{ status: 'ok' | 'error', message }` — the server calls the ack on
 * both branches — but a call site that passes no callback, or one that ignores its argument, cannot
 * tell the two apart. The screen then carries on as though the write landed: a list shows an
 * invitation that was never sent, a dismissed step comes back on the next load, a form clears its
 * dirty state over changes the database refused.
 *
 * That is not hypothetical. On 2026-09-15 a mis-subscribed room and a silently-failing save
 * presented **identically** — a floating save bar that would not go down and nothing said anywhere
 * — and telling them apart took reading the server handler. This exists so the next one announces
 * itself.
 *
 * Returns whether it *was* an error, so a caller that also has work to do on success can branch on
 * it rather than checking `status` a second time.
 *
 * Deliberately a plain function rather than a hook: most call sites are inside event handlers and
 * `emit` callbacks, where a hook cannot be used, and `useToastStore.getState()` is the same store
 * either way.
 */
export function reportActionError(response: any, fallback: string): boolean {
  if (response?.status !== 'error') return false;
  useToastStore.getState().showError(response.message || fallback);
  return true;
}
