import { Platform } from 'react-native';
import { wsService } from './websocket';
import { useWsStore } from '../store/wsStore';

/**
 * Tells the server about failures it cannot see for itself (SYNC-2).
 *
 * The server already logs every refusal it raises. What it never sees is the other side: an action
 * whose reply never arrived (a timeout, being offline) and a reply the app could not read. Those
 * used to be logged only to the device's console, where nobody in the field ever looks — so they
 * are queued here and sent to the server's failures log (`server/logs/failures-*.jsonl`), next to
 * the refusals, for the fault analyser to read.
 *
 * Best effort by design: reporting a failure must never become a failure the user sees. The queue
 * is held while offline — which is exactly when these happen — and sent once the socket is back.
 * It is bounded, so a device stuck offline does not grow it without end. No payload contents are
 * sent: payloads carry people's names and contact details.
 */

export interface ClientFailure {
  actionType: string;
  kind: 'refused' | 'no-answer' | 'unexpected-reply';
  message: string;
  requestId?: string;
}

const MAX_QUEUED = 50;
const BATCH_SIZE = 20;
const FLUSH_DELAY_MS = 2000;

const queue: Array<ClientFailure & { occurredAt: string; platform: string; screen?: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let waitingForConnection = false;

function currentScreen(): string | undefined {
  // The route on web; native has no global location, and the action type says most of it anyway.
  return Platform.OS === 'web' && typeof window !== 'undefined' ? window.location?.pathname : undefined;
}

function flush() {
  flushTimer = null;
  if (!queue.length) return;
  if (!useWsStore.getState().isConnected) {
    if (waitingForConnection) return;
    waitingForConnection = true;
    const unsubscribe = useWsStore.subscribe((state) => {
      if (!state.isConnected) return;
      unsubscribe();
      waitingForConnection = false;
      schedule();
    });
    return;
  }
  wsService.emit('client_failures', queue.splice(0, BATCH_SIZE), undefined, undefined, { suppressToast: true });
  if (queue.length) schedule();
}

function schedule() {
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
}

export function reportClientFailure(failure: ClientFailure): void {
  // The server logged its own refusal when it raised it; reporting it again would count it twice.
  if (failure.kind === 'refused') return;
  queue.push({
    ...failure,
    message: failure.message.slice(0, 500),
    occurredAt: new Date().toISOString(),
    platform: Platform.OS,
    screen: currentScreen(),
  });
  if (queue.length > MAX_QUEUED) queue.shift();
  schedule();
}
