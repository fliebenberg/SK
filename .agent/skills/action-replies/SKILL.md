---
name: action-replies
description: How the client talks to the server and reads what comes back — every socket action goes through `sendAction`, the three reply formats (actions, `get_data`, REST), and the rule that no failure is silent. Read before writing or changing any code that sends an action, reads `get_data`, or calls the REST API.
---

# Action Replies — no silent failures

**We cannot fix what we do not know about.** Every write the app makes must either visibly succeed
or visibly fail, and every failure must be logged. This skill exists because on 2026-09-19 an audit
of ~115 action call sites found the reply being read four different wrong ways (see "What went
wrong" below), several of them failing with nothing on screen at all.

## The three reply formats

They are **not** the same, and code must not assume one for another.

| Channel | Success | Failure |
|---|---|---|
| **Socket `action`** — every write | `{ status: 'ok', data }` | `{ status: 'error', message }` |
| **Socket `get_data`** — reads | the data itself, unwrapped | `{ status: 'error', message }` when refused; `[]` / `null` when there is nothing |
| **REST** (`services/api.ts`, `apiFetch`) — auth, sport admin | the JSON body itself | non-2xx status, which `apiFetch` turns into a thrown `Error` (and a toast) |

`ActionAck<T>` in `@sk/shared` is the action type, and the server's single success exit is typed
against it (`satisfies ActionAck`), so the server cannot drift from it.

The socket wrapper (`wsService.emit`) adds a fourth case to both socket channels: **`null`** when no
reply came — a 7-second timeout, or no connection. A `null` is a failure *whose outcome is unknown*:
the server may have applied the change and lost the acknowledgement.

## Rule 1 — every action goes through `sendAction`

```ts
import { sendAction } from '@/services/actions';

sendAction(SocketAction.UPDATE_TEAM, { id, data }).then(result => {
  setIsSaving(false);                 // always: the request is over either way
  if (!result.ok) return;             // already toasted and logged; keep the edits, stay put
  setOriginal(result.data);           // the server's result is result.data — never the reply
  clearDirtyState();
  onDone?.();                         // navigation only ever on the success path
});
```

[`sendAction`](file:///c:/Fred/Coding/SK/expo-app/services/actions.ts) resolves (never rejects) to
`{ ok: true, data }` or `{ ok: false, message, noAnswer? }`. It announces every failure itself — a
refusal, no answer (after one automatic retry), a reply of neither shape — with a toast unless the
caller shows it inline, and logs and reports it (Rule 3).

**Do not** call `wsService.emit('action', …)` or `wsService.emitAction(…)`. `npm run check:actions`
(from `expo-app/`) fails on either, anywhere outside `services/`. Run it before committing client
changes.

### What a call site owes

1. **Success path only on `result.ok`**, reading `result.data`.
2. **On failure: nothing that implies success.** No navigation, no clearing the dirty flag or
   re-seeding the form baseline, no closing the form or modal, no "saved". Reset busy flags. A failed
   delete leaves the user where they were.
3. **Inline errors**: when the screen shows its own error text (a banner, a modal line), pass
   `{ suppressToast: true }` and show `result.message` — and check the error is actually *drawn*
   where the user is. Two screens were found setting an error state that only rendered on a
   different tab, or not at all.
4. **Multi-step writes** stop at the first failure and say which step failed.
5. **Fire-and-forget is still `sendAction`.** `void sendAction(...)` when there is nothing to do on
   success — the point is that a failure is still announced. An optimistic UI change made before
   sending must be reverted on failure.
6. **`noAnswer`** means "may have saved" — even after `sendAction`'s own retry. Its default message
   already says "check before trying again".

## Rule 2 — retries must not duplicate

Every action carries a `requestId`, and the server answers a repeated one from the first attempt
instead of applying it again (`runIdempotent`, per user, successes only). `sendAction` handles the
common cases by itself: it retries once with the same id after a lost reply, and an identical later
call reuses an unanswered attempt's id. **A save made of several writes, or one whose payload changes
between attempts (a live clock reading), must key its writes itself**:

```ts
const scope = useRequestScope();                 // renew() after success, and when the form resets
const payload = { id: `profile-${scope.current()}`, name, orgId };   // ids from the scope, not the clock
await sendAction(SocketAction.ADD_ORG_PROFILE, payload, {
  requestId: requestKeyFor(scope.current(), SocketAction.ADD_ORG_PROFILE, payload),
});
```

`requestKeyFor` changes when the content changes, so an edited retry is a new write rather than a
replay of the old one. Pass the payload minus anything that moves between attempts without changing
what is saved. The replay memory is in memory and short-lived — `SYNC-5` is the durable version.

## Rule 3 — failures are recorded where we can see them

`server/logs/failures-YYYY-MM-DD.jsonl` holds one JSON line per failure: every refusal the server
raises, and what the client reports that the server never sees (no answer, an unreadable reply —
`services/clientFailures.ts`). Nothing to do at a call site: `sendAction` reports. Never put payload
contents in a report — payloads carry people's details.

## Rule 4 — `get_data` and REST

- `get_data` answers the data unwrapped, so **validate the shape** (`Array.isArray(res)`, a known
  field) before using it; a refusal arrives as `{ status: 'error' }` and is toasted by the wrapper.
  Never treat a refusal object as data.
- REST calls go through `apiService` / `apiFetch`, which throws on failure. `await` inside
  `try/catch`, and on catch keep the user's input — the toast is already shown.

## What went wrong (so it is recognised next time)

- **Reading the ack as the result** — `if (res?.id)` on `{ status, data }`. A created team was
  reported as a failure and created again on retry (`FIX-18`).
- **`res?.data || res`** — on failure hands back the error object as if it were the record. A
  failed `ADD_GAME` navigated away as though saved.
- **No callback** — the wrapper only toasts when there is a callback, so a refusal was invisible.
  Starting or ending a game on the scoring screen was one of these.
- **`null` as success** — `if (res && res.error)` and the old `reportActionError(null)` both let a
  timeout through as a successful save, clearing the unsaved-changes guard.
- **Array result read off the ack** — `Array.isArray(res)` on `{ status, data: [...] }` is always
  false, so a nomination's real outcome was never shown.

## Server side

- **Throw** for anything the user should hear about; the handler turns a throw into
  `{ status: 'error', message }` and records it in the failures log.
- **Never answer success for an action that did nothing.** The handler's exit refuses an empty result
  (`null`, `undefined`, `false`) — which is what managers return when the target is gone — so a
  handler must set `result` to what it changed (the record, an id, `true`) on a genuine success.
- **Never encode a refusal inside a success** (`{ success: false, error }`, `{ status: 'error' }` as
  the result). Throw it.
- **A change and its record travel together.** A status or clock change carries its game-log entry
  (`log`), written by the server only once the change applied — never a second action from the client.
