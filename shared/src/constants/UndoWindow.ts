/**
 * Undo window constants shared by the server guard and the client UI.
 *
 * The expiry for an individual event is authoritative and stamped by the server onto
 * `eventData.undoExpiresAt` (ISO string) when the window opens — at event creation, and
 * again when a pending event's outcome is first applied. Clients count down to that value
 * and never compute a window of their own.
 */

/**
 * Canonical undo window length. `system_settings.undo_delay_ms` (seeded from this value)
 * overrides it, so the setting can be tuned per deployment without a code change.
 */
export const DEFAULT_UNDO_DELAY_MS = 15000;

/**
 * Latency tolerance the server allows past `undoExpiresAt`, so an undo tapped with
 * a fraction of a second left isn't rejected because of the round trip.
 */
export const UNDO_GRACE_MS = 2000;

/** The event's undo expiry (epoch ms), or null if the server never stamped one. */
export function resolveUndoExpiryMs(eventData: any): number | null {
  if (!eventData?.undoExpiresAt) return null;
  const expiresAt = new Date(eventData.undoExpiresAt).getTime();
  return isNaN(expiresAt) ? null : expiresAt;
}
