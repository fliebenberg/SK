import { GameEvent, resolveUndoExpiryMs } from '@sk/types';
import { wsService } from '../services/websocket';

/**
 * Single source of truth for undo-window evaluation on the client.
 *
 * The window length is never recomputed here: the server stamps an absolute
 * `eventData.undoExpiresAt` at creation, and only for events that score right away.
 * We simply count down to it using server-aligned time. That keeps every scorer — and
 * the server guard in `GameEventManager.undoEvent()` — on the same instant. An event
 * with no stamp has no window, and the window is never re-opened or extended.
 *
 * Access rules mirrored from that guard:
 *  - only score-changing events are protected by the window
 *  - only the original scorer (initiator) may undo inside the window
 *  - once it expires, any scorer may remove the event / change the outcome
 *    (routed through the consensus/dispute flow)
 *
 * An event created without an outcome carries no stamp, so it is freely removable —
 * and its outcome freely supplied — by any scorer, which is the intended behaviour.
 */

/** Current server-aligned time in ms (never the device clock). */
export function getUndoNowMs(): number {
  return wsService.getServerTime();
}

/** Authoritative expiry (epoch ms) for an event's undo window, or null if it has none. */
export function getUndoExpiryMs(evt: GameEvent): number | null {
  return resolveUndoExpiryMs(evt.eventData || (evt as any).event_data);
}

/**
 * Does this event (together with its linked children) affect the score?
 * Mirrors the server's `isScoreChanging` computation.
 */
export function getScoreImpact(targetEvt: GameEvent, events: GameEvent[]) {
  const targetData = targetEvt.eventData || (targetEvt as any).event_data || {};

  const childEvents = events.filter((e) => {
    const eData = e.eventData || (e as any).event_data || {};
    return eData.linkedEventId === targetEvt.id && eData.status !== 'REMOVED';
  });

  const parentPoints = targetData.pointsDelta ?? targetData.points ?? 0;
  const childPoints = childEvents.reduce((acc, c) => {
    const cData = c.eventData || (c as any).event_data || {};
    return acc + (cData.pointsDelta ?? cData.points ?? 0);
  }, 0);

  const totalPointsEffect = parentPoints + childPoints;
  const parentSuccessful = targetData.outcome === 'successful' || parentPoints > 0;
  const hasSuccessfulChild = childEvents.some((c) => {
    const cData = c.eventData || (c as any).event_data || {};
    const cPts = cData.pointsDelta ?? cData.points ?? 0;
    return cPts > 0 || cData.outcome === 'successful';
  });

  return {
    childEvents,
    totalPointsEffect,
    isScoreChanging: totalPointsEffect > 0 || parentSuccessful || hasSuccessfulChild,
  };
}

/**
 * Is the current user the scorer who recorded this event?
 *
 * Every scorer acts through an org profile, so an event with no initiator profile has
 * no identifiable owner and is claimed by nobody — the undo window simply does not
 * apply to it, and it falls through to the normal removal/consensus rules. Defaulting
 * such events to "yes, you are the initiator" would hand the window's bypass to
 * whoever happened to open them.
 */
export function isEventInitiator(
  evt: GameEvent,
  myOrgProfileIds: Set<string> | string[]
): boolean {
  const initiator = evt.initiatorOrgProfileId;
  if (!initiator) return false;
  const ids = myOrgProfileIds instanceof Set ? myOrgProfileIds : new Set(myOrgProfileIds);
  return ids.has(initiator);
}

export interface UndoWindowState {
  /** Window is still open (regardless of who recorded the event). */
  inUndoWindow: boolean;
  isScoreChanging: boolean;
  isInitiator: boolean;
  /** Original scorer may undo directly right now. */
  canUndo: boolean;
  /** Another scorer's window is open — this event is locked for the current user. */
  isLockedByOtherScorer: boolean;
  remainingMs: number;
  remainingSecs: number;
}

export function evaluateUndoWindow(params: {
  event: GameEvent;
  events: GameEvent[];
  myOrgProfileIds: Set<string> | string[];
  now?: number;
}): UndoWindowState {
  const { event, events, myOrgProfileIds } = params;
  const now = params.now ?? getUndoNowMs();

  const expiresAt = getUndoExpiryMs(event);
  const remainingMs = expiresAt === null ? 0 : Math.max(0, expiresAt - now);
  const inUndoWindow = remainingMs > 0;

  const { isScoreChanging } = getScoreImpact(event, events);
  const isInitiator = isEventInitiator(event, myOrgProfileIds);
  const isProtected = inUndoWindow && isScoreChanging;

  return {
    inUndoWindow,
    isScoreChanging,
    isInitiator,
    canUndo: isProtected && isInitiator,
    isLockedByOtherScorer: isProtected && !isInitiator,
    remainingMs,
    remainingSecs: Math.ceil(remainingMs / 1000),
  };
}
