import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Game, RecordGameResultPayload, SocketAction } from '@sk/shared';
import { sendAction } from './actions';
import { useWsStore } from '../store/wsStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';

/**
 * Results entered without a connection (tournaments Phase 7, U20).
 *
 * A result is what an organiser at a field must not lose to a dropped signal, so *Record result*
 * never fails for want of a connection: offline — or when the server did not answer — the result is
 * kept here, on the device (it survives closing the app), and shown as **waiting to send**. When the
 * connection is back it is sent, in the order entered, with the request id it was first given, so a
 * result that did reach the server is not applied twice.
 *
 * Each carries `resultWas`, the match's result when it was entered: if somebody else has changed the
 * result since, the server refuses it rather than overwrite their correction, and it stays here,
 * **not sent**, with why, until the person who entered it discards it. The same result already
 * recorded counts as sent.
 *
 * Only results queue. Live scoring, drawing, scheduling and moving fixtures need a connection.
 * Kept per signed-in person: another person signing in on the device does not send them.
 */
export interface QueuedResult {
  requestId: string;
  userId: string;
  gameId: string;
  payload: RecordGameResultPayload;
  /** The match and result in words, for the messages: "DKL U16A 12–7 KSC U16 Comets". */
  label: string;
  queuedAt: string;
  /** Refused when sent, with the server's reason. */
  refused?: string;
}

interface ResultQueueState {
  items: QueuedResult[];
  /** A newer result for the same match replaces one still waiting. */
  add: (item: QueuedResult) => void;
  remove: (requestId: string) => void;
  markRefused: (requestId: string, reason: string) => void;
}

export const useResultQueue = create<ResultQueueState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => ({ items: [...s.items.filter((i) => !(i.gameId === item.gameId && i.userId === item.userId)), item] })),
      remove: (requestId) => set((s) => ({ items: s.items.filter((i) => i.requestId !== requestId) })),
      markRefused: (requestId, reason) => set((s) => ({ items: s.items.map((i) => (i.requestId === requestId ? { ...i, refused: reason } : i)) })),
    }),
    { name: 'result-queue', storage: createJSONStorage(() => AsyncStorage) }
  )
);

/** The signed-in person's queued result for a match, if any — waiting or refused. */
export function usePendingResult(gameId?: string): QueuedResult | undefined {
  const userId = useAuthStore((s: any) => s.user?.id);
  return useResultQueue((s) => s.items.find((i) => i.gameId === gameId && i.userId === userId));
}

/** How many of the signed-in person's results are waiting to send (not the refused ones). */
export function useWaitingResultCount(): number {
  const userId = useAuthStore((s: any) => s.user?.id);
  return useResultQueue((s) => s.items.filter((i) => i.userId === userId && !i.refused).length);
}

export function queueResult(item: Omit<QueuedResult, 'userId' | 'queuedAt'>): boolean {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return false;
  useResultQueue.getState().add({ ...item, userId, queuedAt: new Date().toISOString() });
  return true;
}

/** Screens holding a match, told when its queued result has been recorded — as `onRecorded` is. */
const sentListeners = new Set<(gameId: string, game: Game) => void>();

/** Calls `onSent` with the match once a queued result for it is recorded, so a page loaded before it shows it. */
export function useResultSent(gameId: string | undefined, onSent: (game: Game) => void): void {
  const latest = useRef(onSent);
  latest.current = onSent;
  useEffect(() => {
    if (!gameId) return;
    const listener = (id: string, game: Game) => { if (id === gameId) latest.current(game); };
    sentListeners.add(listener);
    return () => { sentListeners.delete(listener); };
  }, [gameId]);
}

let flushing = false;

/** Sends the signed-in person's waiting results, oldest first; stops at the first unanswered one. */
export async function flushResultQueue(): Promise<void> {
  if (flushing || !useWsStore.getState().isConnected) return;
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;
  flushing = true;
  const toast = useToastStore.getState();
  try {
    const waiting = useResultQueue.getState().items.filter((i) => i.userId === userId && !i.refused);
    for (const item of waiting) {
      if (!useWsStore.getState().isConnected) break;
      const res = await sendAction(SocketAction.RECORD_GAME_RESULT, item.payload, { requestId: item.requestId, suppressToast: true });
      if (res.ok) {
        useResultQueue.getState().remove(item.requestId);
        sentListeners.forEach((listener) => listener(item.gameId, res.data));
        toast.showSuccess(item.label, 'Result sent');
      } else if (res.noAnswer) {
        break;
      } else {
        useResultQueue.getState().markRefused(item.requestId, res.message);
        toast.showWarning(res.message, `Result not sent: ${item.label}`, { duration: 10000 });
      }
    }
  } finally {
    flushing = false;
  }
}

let started = false;

/** Sends what is waiting whenever the connection comes back, someone signs in, or the app opens. */
export function startResultQueue(): void {
  if (started) return;
  started = true;
  // A moment after connecting, so the rooms rejoin and the screens show the server's state first.
  const soon = () => setTimeout(flushResultQueue, 1500);
  useWsStore.subscribe((s: any, prev: any) => { if (s.isConnected && !prev.isConnected) soon(); });
  useAuthStore.subscribe((s: any, prev: any) => { if (s.user?.id && s.user?.id !== prev.user?.id) soon(); });
  if (useResultQueue.persist.hasHydrated()) soon();
  else useResultQueue.persist.onFinishHydration(soon);
}
