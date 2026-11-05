import { NoAnswer, wsService } from './websocket';
import { reportClientFailure } from './clientFailures';
import { useToastStore } from '../store/toastStore';

/**
 * The one way the app reads from the server, as `sendAction` is for writes. Nothing else may emit
 * `'get_data'`: `npm run check:actions` fails if anything does. `useSocketQuery`, `useStaticRead` and
 * `usePagedList` are built on it, and a read a screen makes by hand uses it directly.
 *
 * **Why one path (`SYNC-9`).** A read's reply is the data itself, unwrapped; a refusal is an object
 * with `error`; and no answer is `null`, which is also what the server sends when there is nothing.
 * Before this existed, each of 88 call sites interpreted that for itself. A timeout became *This
 * invitation link is invalid or has expired*, or an empty team sheet that Save could then write over,
 * and a refusal was stored as though it were the record.
 *
 * **What it guarantees.** The promise always resolves (never rejects) to a `ReadResult`. `ok` means the
 * server answered, so `data` is what it said, and only then may a screen say there is nothing. Not `ok`
 * means nobody knows, so a screen keeps what it has and says so. Every failure is toasted here, unless
 * the caller passes `suppressToast` because it draws `result.message` itself. No answer is asked again
 * once by itself and then reported to the failures log; the server logs its own refusals.
 */

export type ReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; noAnswer: boolean };

export interface ReadOptions {
  /** Defaults to the socket wrapper's 7 seconds. */
  timeoutMs?: number;
  /** The caller shows `result.message` itself; no toast is raised. */
  suppressToast?: boolean;
  /** Asked before retrying and before announcing a failure: a read nobody wants any more stays quiet. */
  stillWanted?: () => boolean;
}

/** How long after no answer to ask again. */
const RETRY_AFTER_MS = 2000;

const NO_ANSWER_MESSAGES: Record<NoAnswer['noAnswer'], string> = {
  offline: 'Cannot connect to the server.',
  timeout: 'The server did not answer in time.',
};

function askOnce(request: object, timeoutMs?: number) {
  return new Promise<{ res: any; none?: NoAnswer }>(resolve => {
    wsService.emit('get_data', request, (res: any, none?: NoAnswer) => resolve({ res, none }), timeoutMs, { suppressToast: true });
  });
}

export async function readData<T>(type: string, params: Record<string, unknown> = {}, options: ReadOptions = {}): Promise<ReadResult<T>> {
  const request = { ...params, type };
  const wanted = () => !options.stillWanted || options.stillWanted();

  let reply = await askOnce(request, options.timeoutMs);
  if (reply.none && wanted()) {
    await new Promise(resolve => setTimeout(resolve, RETRY_AFTER_MS));
    if (wanted()) reply = await askOnce(request, options.timeoutMs);
  }

  const fail = (message: string, noAnswer: boolean): ReadResult<T> => {
    if (wanted()) {
      if (noAnswer) {
        // The type only: a read's parameters can hold a position or someone's details.
        reportClientFailure({ actionType: `get_data:${type}`, kind: 'no-answer', message });
      }
      if (!options.suppressToast) useToastStore.getState().showError(message, 'Could not load');
    }
    return { ok: false, message, noAnswer };
  };

  if (reply.none) return fail(NO_ANSWER_MESSAGES[reply.none.noAnswer], true);
  if (reply.res && reply.res.error) {
    return fail(typeof reply.res.error === 'string' ? reply.res.error : 'The server refused the request.', false);
  }
  return { ok: true, data: reply.res as T };
}
