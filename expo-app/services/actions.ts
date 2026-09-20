import {
  SocketAction,
  SocketActionPayload,
  SocketActionResponse,
  createSocketAction,
} from '@sk/shared';
import { wsService } from './websocket';
import { useToastStore } from '../store/toastStore';
import { useWsStore } from '../store/wsStore';
import { reportClientFailure } from './clientFailures';

/**
 * The one way the app sends an `action` to the server. Nothing else may emit `'action'` —
 * `npm run check:actions` fails the build if anything does.
 *
 * **Why one path.** The server answers every action `{ status: 'ok', data }` or
 * `{ status: 'error', message }` (`ActionAck` in `@sk/shared`), and the socket wrapper answers
 * `null` when no reply came — a timeout, or no connection. Before this existed, each of ~115 call
 * sites interpreted that for itself, and several got it wrong in ways that failed silently:
 *
 *  - reading the ack as the result (`res.id` instead of `res.data.id`), so a team that *was*
 *    created was reported as a failure and created again on retry (`FIX-18`);
 *  - `res?.data || res`, which hands back the error object as though it were the saved record, so
 *    a failed save navigated away as if it had worked;
 *  - no callback at all, so a refusal was never even shown;
 *  - treating `null` as success, so a save that never reached the server cleared its form's dirty
 *    state.
 *
 * **What it guarantees.** The promise always resolves (never rejects) to an `ActionResult`: `ok`
 * with the server's `data`, or not `ok` with a message. Every failure is announced — toasted here,
 * unless the caller passes `suppressToast` to show `result.message` inline instead — and reported
 * to the server's log with its action type (`clientFailures.ts`, SYNC-2), so we hear about failures
 * in the field and not only on the device that had them.
 *
 * **Retries cannot duplicate (SYNC-3).** Every call carries a `requestId`, and the server returns
 * the first answer for a repeated one instead of applying the change again. Three things reuse an
 * id: this function's own single retry after a lost reply, once the connection is back; a later
 * call with an identical type and payload whose previous attempt went unanswered (the user pressing
 * Save again after "no answer"); and a screen passing its own `requestId` across the steps and
 * retries of one multi-step save (`requestKeyFor` with `useRequestScope`).
 *
 * **A missing reply is a failure, but not a known one.** If even the retry goes unanswered, the
 * server may still have applied the change. `noAnswer` marks that case, and the message says to
 * check before trying again.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; noAnswer?: boolean };

export interface SendActionOptions {
  /** Defaults to the socket wrapper's 7 seconds. */
  timeoutMs?: number;
  /** The caller shows `result.message` itself (e.g. inline in a modal); no toast is raised. */
  suppressToast?: boolean;
  /**
   * Keep the same id across the retries of one attempt, so the server applies it at most once.
   * Omit it and one is generated. See `requestKeyFor` for multi-step saves.
   */
  requestId?: string;
}

const NO_ANSWER_MESSAGE =
  'No answer from the server, so the change may not have been saved. Check before trying again.';
/** How long to wait for the connection to come back before the one automatic retry. */
const RECONNECT_WAIT_MS = 10000;
/** How long an unanswered attempt's id is kept for an identical retry — the server's replay window. */
const UNCONFIRMED_TTL_MS = 10 * 60 * 1000;

export function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Attempts whose outcome is unknown, by type + payload, so an identical retry reuses their id. */
const unconfirmed = new Map<string, { requestId: string; expiresAt: number }>();

function fingerprint(type: string, payload: unknown): string {
  // djb2 over the JSON: payloads can carry a base64 logo, so the key is kept small.
  const text = `${type}:${JSON.stringify(payload ?? null)}`;
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${type}:${text.length}:${hash}`;
}

function waitForConnection(ms: number): Promise<boolean> {
  if (useWsStore.getState().isConnected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, ms);
    const unsubscribe = useWsStore.subscribe((state) => {
      if (!state.isConnected) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

function emitOnce(action: object, timeoutMs?: number): Promise<any> {
  return new Promise((resolve) => {
    // The wrapper's own toasts are suppressed: this function decides what to say, so a timeout that
    // the retry then recovers does not flash an error first.
    wsService.emit('action', action, resolve, timeoutMs, { suppressToast: true });
  });
}

export async function sendAction<K extends SocketAction>(
  type: K,
  payload: SocketActionPayload<K>,
  options: SendActionOptions = {}
): Promise<ActionResult<SocketActionResponse<K>>> {
  const key = fingerprint(type, payload);
  const now = Date.now();
  const pending = unconfirmed.get(key);
  const requestId =
    options.requestId || (pending && pending.expiresAt > now ? pending.requestId : undefined) || newRequestId();
  const action = { ...createSocketAction(type, payload), requestId };

  let reply = await emitOnce(action, options.timeoutMs);
  if (reply === null || reply === undefined) {
    // One retry with the same id, once connected: the server replays rather than repeats.
    if (await waitForConnection(RECONNECT_WAIT_MS)) {
      console.warn(`[action] ${type}: no answer, retrying once`);
      reply = await emitOnce(action, options.timeoutMs);
    }
  }

  const fail = (message: string, kind: 'refused' | 'no-answer' | 'unexpected-reply', noAnswer?: boolean) => {
    const log = kind === 'unexpected-reply' ? console.error : console.warn;
    log(`[action] ${type} ${kind}: ${message}`);
    reportClientFailure({ actionType: type, kind, message, requestId });
    if (!options.suppressToast) {
      const title = kind === 'refused' ? 'Not saved' : kind === 'no-answer' ? 'No answer from the server' : 'Unexpected reply';
      useToastStore.getState().showError(message, title);
    }
    return { ok: false as const, message, ...(noAnswer ? { noAnswer: true } : {}) };
  };

  if (reply === null || reply === undefined) {
    unconfirmed.set(key, { requestId, expiresAt: Date.now() + UNCONFIRMED_TTL_MS });
    return fail(NO_ANSWER_MESSAGE, 'no-answer', true);
  }
  unconfirmed.delete(key);

  if (reply.status === 'ok') return { ok: true, data: reply.data };
  if (reply.status === 'error' || reply.error) {
    return fail(reply.message || reply.error || 'The server refused that change.', 'refused');
  }
  // Neither shape: the server broke the contract. Loud, because nothing else will be.
  return fail(
    'The server sent a reply the app does not understand. The change may not have been saved.',
    'unexpected-reply'
  );
}

/**
 * The request id for one write inside a save the user may retry (SYNC-3): the same while the scope
 * and the write's content are the same, so a retry replays on the server instead of writing twice;
 * different as soon as the content changes, so an edited retry is never answered with the old
 * result. `content` is what identifies the write — pass the payload, minus anything that differs
 * between attempts without changing what is saved (a live clock reading, say).
 *
 * Use it for multi-step saves — "create the person, then add them to the team" — where the first
 * step succeeds and the second fails: the retry re-sends the first step, gets the person already
 * created back, and carries on. The scope comes from `useRequestScope` and is renewed after success.
 */
export function requestKeyFor(scope: string, type: SocketAction, content: unknown): string {
  return `${scope}:${fingerprint(type, content)}`;
}
