import type { BatchItemError, BatchResponse } from '@sk/shared';

/**
 * The batch contract (D13), in one place.
 *
 * Written before the second batch action copied the first, because that is the moment a contract
 * stops being a contract. Four rules; each is enforced here or stated here and enforced by the
 * caller, and `docs/api_actions.md` documents them for the client.
 *
 * 1. **One transaction.** All of it applies or none of it does. `BaseManager.transaction` supplies
 *    the transaction; this module supplies the *report*. The two are not in tension: a batch whose
 *    report carries any error wrote nothing at all. A half-applied roster is not a state the
 *    organiser asked for, and not one a screen can render honestly — the report says which rows to
 *    fix, not which rows survived.
 * 2. **One permission scope.** {@link singleScope} — every item must resolve to the same event, and
 *    a batch spanning two is refused *before* any work, rather than authorized against whichever
 *    item happened to sort first.
 * 3. **One broadcast.** The caller publishes once, with the whole batch as the payload. Ninety
 *    messages would relocate to the client exactly the cost this contract removes on the server.
 * 4. **One idempotency key.** {@link runIdempotent}.
 *
 * `runIdempotent` also backs every other action: the action handler in `index.ts` runs any action
 * carrying a `requestId` through it (SYNC-3), keyed per user, so a retried create is not applied twice.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THE IDEMPOTENCY CACHE IS, AND WHAT IT IS NOT
 *
 * It is in memory, per server process, with a short TTL. That is sized to the failure it exists
 * for: a client that did not receive its acknowledgement and sends the same batch again — a
 * dropped socket at a sports ground, seconds apart, against the same process it was talking to.
 *
 * It is **not** durable. A restart between the two attempts forgets the key; so does a second
 * server process. Both are acceptable today (one process, and a restart drops the socket anyway)
 * and neither would be if this app ever ran more than one node — at which point the answer is a
 * table, not a bigger map. Written down rather than left to be discovered.
 * The durable version is logged as `SYNC-5` in TODO.md.
 *
 * The in-flight map matters as much as the completed one: a retry usually arrives *because* the
 * first attempt is slow, so a duplicate that lands mid-write awaits the original's promise rather
 * than racing a second transaction against it.
 * ---------------------------------------------------------------------------------------------
 */

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const MAX_KEYS = 2000;

interface CachedBatch {
  result: any;
  expiresAt: number;
}

const completed = new Map<string, CachedBatch>();
const inFlight = new Map<string, Promise<any>>();

function sweep(now: number) {
  for (const [key, value] of completed) {
    if (value.expiresAt <= now) completed.delete(key);
  }
}

/**
 * Run `work` at most once per `key`.
 *
 * A repeat within the TTL returns the first attempt's result with `replayed: true` rather than
 * writing again. No key means no replay protection — the caller gets exactly one attempt, which is
 * the correct behaviour for a client that did not ask for the guarantee.
 *
 * A *failed* attempt is not cached. Retrying something that errored is the one case where the
 * client genuinely does want it to run again.
 */
export async function runIdempotent<T extends object>(
  key: string | undefined,
  work: () => Promise<T>
): Promise<T & { replayed?: boolean }> {
  if (!key) return work();

  const now = Date.now();
  const cached = completed.get(key);
  if (cached && cached.expiresAt > now) {
    console.log(`[Idempotency] Replayed key ${key}; nothing was written.`);
    return { ...cached.result, replayed: true };
  }

  const pending = inFlight.get(key);
  if (pending) {
    console.log(`[Idempotency] Key ${key} is still in flight; awaiting the original.`);
    return { ...(await pending), replayed: true };
  }

  const promise = work();
  inFlight.set(key, promise);
  try {
    const result = await promise;
    if (completed.size >= MAX_KEYS) sweep(now);
    // Still full of live keys (every action carries one since SYNC-3): drop the oldest, which a Map
    // iterates first. The cache stays bounded; the price under load is a shorter replay window.
    while (completed.size >= MAX_KEYS) {
      const oldest = completed.keys().next().value;
      if (oldest === undefined) break;
      completed.delete(oldest);
    }
    completed.set(key, { result, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
    return result;
  } finally {
    inFlight.delete(key);
  }
}

/** Thrown when a batch would span two permission scopes, or carries nothing to do. */
export class BatchRefused extends Error {
  constructor(message: string, public readonly errors: BatchItemError[] = []) {
    super(message);
    this.name = 'BatchRefused';
  }
}

/**
 * Rule 2. Reduce a batch's items to the one scope that authorizes all of them, or refuse.
 *
 * `scopeOf` returns the item's event id, or null when the item names nothing resolvable — which is
 * itself a refusal rather than a free pass, because "no scope" is the shape an item takes when it
 * points at a row that does not exist.
 */
export function singleScope<T>(items: T[], scopeOf: (item: T, index: number) => string | null): string {
  if (!items.length) throw new BatchRefused('A batch must contain at least one item.');

  const errors: BatchItemError[] = [];
  const scopes = new Set<string>();
  items.forEach((item, index) => {
    const scope = scopeOf(item, index);
    if (!scope) errors.push({ index, message: 'Item names no event to authorize against.' });
    else scopes.add(scope);
  });

  if (errors.length) throw new BatchRefused('Some items name no event.', errors);
  if (scopes.size > 1) {
    throw new BatchRefused(
      `A batch may only touch one event; this one spans ${scopes.size} (${[...scopes].join(', ')}). ` +
        `Split it, so that one permission decision covers the whole of it.`
    );
  }
  return [...scopes][0];
}

/** A batch that applied cleanly. */
export function batchOk<T>(applied: T[]): BatchResponse<T> {
  return { applied, errors: [] };
}

/**
 * A batch that wrote nothing, with the per-item report saying why.
 *
 * Thrown rather than returned: the socket layer answers `{ status: 'error' }`, and the report
 * rides on the error so a client can point at the offending rows.
 */
export class BatchFailed extends Error {
  constructor(public readonly errors: BatchItemError[]) {
    super(
      errors.length === 1
        ? `Item ${errors[0].index + 1}: ${errors[0].message}`
        : `${errors.length} items could not be applied, so none were. First: item ` +
          `${errors[0].index + 1} — ${errors[0].message}`
    );
    this.name = 'BatchFailed';
  }
}
