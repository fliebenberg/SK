import { GameEvent, resolveUndoExpiryMs } from '@sk/types';
import { wsService } from '../services/websocket';

/**
 * Single source of truth for undo-window evaluation on the client.
 *
 * The window length is never recomputed here: the server stamps an absolute
 * `eventData.undoExpiresAt` when the window opens (event creation, or when a pending
 * event's outcome is first applied) and we simply count down to it using server-aligned
 * time. That keeps every scorer — and the server guard in `GameEventManager.undoEvent()` —
 * on the same instant. An event with no stamp has no window.
 *
 * Access rules mirrored from that guard:
 *  - only score-changing events are protected by the window
 *  - only the original scorer (initiator) may undo inside the window
 *  - once it expires, any scorer may remove the event / change the outcome
 *    (routed through the consensus/dispute flow)
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
 * Events with no initiator profile (legacy / created by a global admin without an org
 * profile) are only claimed by global admins.
 */
export function isEventInitiator(
  evt: GameEvent,
  myOrgProfileIds: Set<string> | string[],
  isGlobalAdmin = false
): boolean {
  const initiator = evt.initiatorOrgProfileId;
  if (!initiator) return isGlobalAdmin;
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
  isGlobalAdmin?: boolean;
  now?: number;
}): UndoWindowState {
  const { event, events, myOrgProfileIds, isGlobalAdmin = false } = params;
  const now = params.now ?? getUndoNowMs();

  const expiresAt = getUndoExpiryMs(event);
  const remainingMs = expiresAt === null ? 0 : Math.max(0, expiresAt - now);
  const inUndoWindow = remainingMs > 0;

  const { isScoreChanging } = getScoreImpact(event, events);
  const isInitiator = isEventInitiator(event, myOrgProfileIds, isGlobalAdmin);
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
