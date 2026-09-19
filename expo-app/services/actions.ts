import {
  SocketAction,
  SocketActionPayload,
  SocketActionResponse,
  createSocketAction,
} from '@sk/shared';
import { wsService } from './websocket';
import { useToastStore } from '../store/toastStore';

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
 * with the server's `data`, or not `ok` with a message. A failure is always *announced* — the
 * socket wrapper toasts refusals, timeouts and being offline, and anything that is neither shape is
 * toasted here — unless the caller passes `suppressToast` to show the message inline instead, in
 * which case showing `result.message` is the caller's job. Every failure is also logged with the
 * action type, so it can be found afterwards.
 *
 * **A missing reply is a failure, but not a known one.** The server may have applied a change
 * whose acknowledgement was lost. `noAnswer` marks that case so a caller can say "check before
 * retrying" rather than "it did not save".
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; noAnswer?: boolean };

export interface SendActionOptions {
  /** Defaults to the socket wrapper's 7 seconds. */
  timeoutMs?: number;
  /** The caller shows `result.message` itself (e.g. inline in a modal); no toast is raised. */
  suppressToast?: boolean;
}

const NO_ANSWER_MESSAGE =
  'No answer from the server, so the change may not have been saved. Check before trying again.';

export function sendAction<K extends SocketAction>(
  type: K,
  payload: SocketActionPayload<K>,
  options: SendActionOptions = {}
): Promise<ActionResult<SocketActionResponse<K>>> {
  return new Promise((resolve) => {
    wsService.emit(
      'action',
      createSocketAction(type, payload),
      (reply: any) => {
        if (reply === null || reply === undefined) {
          // The wrapper has already announced the timeout or the lost connection.
          console.warn(`[action] ${type}: no answer from the server`);
          resolve({ ok: false, message: NO_ANSWER_MESSAGE, noAnswer: true });
          return;
        }
        if (reply.status === 'ok') {
          resolve({ ok: true, data: reply.data });
          return;
        }
        if (reply.status === 'error' || reply.error) {
          // Announced by the wrapper, which also copies the message into `error`.
          const message = reply.message || reply.error || 'The server refused that change.';
          console.warn(`[action] ${type} refused: ${message}`);
          resolve({ ok: false, message });
          return;
        }
        // Neither shape: the server broke the contract. Loud, because nothing else will be.
        const message = 'The server sent a reply the app does not understand. The change may not have been saved.';
        console.error(`[action] ${type}: unexpected reply shape`, reply);
        if (!options.suppressToast) useToastStore.getState().showError(message, 'Unexpected reply');
        resolve({ ok: false, message });
      },
      options.timeoutMs,
      { suppressToast: options.suppressToast }
    );
  });
}
