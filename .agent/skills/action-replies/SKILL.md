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
`{ ok: true, data }` or `{ ok: false, message, noAnswer?, tooLarge? }`. It announces every failure itself — a
refusal, no answer (after one automatic retry), a reply of neither shape, an action over
`SOCKET_MAX_ACTION_BYTES` (which it never sends: the server would drop the connection) — with a toast unless the
caller shows it inline, and logs and reports it (Rule 3).

**Do not** call `wsService.emit('action', …)` or `wsService.emitAction(…)`. `npm run check:actions`
(from `expo-app/`) fails on either, anywhere outside `services/`. Run it before committing client
changes.

**Never cast a payload.** The server refuses a payload with a field its type does not name, a field
of the wrong type, or a missing required one (`SYNC-6`), so the payload type in
[Protocol.ts](file:///c:/Fred/Coding/SK/shared/src/types/Protocol.ts) is the contract, checked at
both ends. `sendAction` rejects unknown fields at compile time even in a payload built in a variable;
`as any` or `as SomeType` inside a `sendAction(…)` call switches that off, and `check:actions` fails
on it. When the compiler says a field does not fit, fix whichever side is wrong: the screen if it
sends something the server ignores, the type if the server really reads it. A field that can be
cleared is typed `T | null` — the server sends `null` for an unset column, and so does a screen
clearing one.

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
7. **`conflict`** (`SYNC-11`) on a refusal means the record changed since the form was opened: who
   changed what, and the values now. Show it in `<EditConflictModal>`, not a toast — see the
   [saving-edits skill](file:///c:/Fred/Coding/SK/.agent/skills/saving-edits/SKILL.md).

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
raises, and what the client reports that the server never sees (no answer, an unreadable reply, too large to send —
`services/clientFailures.ts`). Nothing to do at a call site: `sendAction` reports. Never put payload
contents in a report — payloads carry people's details.

## Rule 4 — `get_data` and REST

- `get_data` answers the data unwrapped, so **validate the shape** of `result.data`
  (`Array.isArray`, a known field) before using it.
- **Every read goes through [`readData`](file:///c:/Fred/Coding/SK/expo-app/services/reads.ts)**, or
  a hook built on it: `useSocketQuery`, `useStaticRead`, `usePagedList`. `check:actions` fails on
  `emit('get_data', …)` anywhere else. It resolves (never rejects) to `{ ok: true, data }` or
  `{ ok: false, message, noAnswer }`, retries no answer once, and logs it.
- **A failed read is not an empty answer** (`SYNC-9`). Only an `ok` result may produce "none", "not
  found", "invalid", "no access" or a default. On failure, keep what is held and overwrite no state,
  baseline or cache: a failed team sheet read that became an empty sheet could have been saved over
  the real one. Hooks expose this as `error`, with `data` keeping the last answer to the same question.
- **Show it where the content would have been**, with
  [`ReadFailure`](file:///c:/Fred/Coding/SK/expo-app/components/ReadFailure.tsx) and a retry. A failure
  is toasted unless `suppressToast` is set, and **`suppressToast` means the screen draws the failure
  itself**: a box and a toast is saying it twice. Only an optional extra may stay quiet, and only if
  nothing on screen becomes false.
- **A failure that leaves a decision unsafe blocks it, and says why**: a duplicate check that failed
  blocks creating the organisation (decided 2026-11-05, user), and a team sheet that was not read
  blocks saving one. A failed person search blocks adding a *new* person wherever a typed name would
  create one (*Add person*, a new guardian, a tournament's individual entrant): pass
  `onSearchFailure` to `PersonnelAutocomplete`.
- **A room refusal is not an empty room either.** `ROOM_ACCESS_DENIED` / `REVOKED` clear what is
  held (it is not this viewer's) and say so with `ReadFailure`; only the room's own push may say
  "no leagues". A room that never answers is `LIVE-25`.
- **A paged list keeps its page on a failed refresh** of the same question (`usePagedList`'s
  `stale`, with `reason` for the box), and drops it for a different search, page or filter, or a
  refusal.
- **On the server, a `get_data` that throws answers `{ status: 'error', message }`**, never `null`,
  which means there is nothing.
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

- **The payload is checked before anything reads it.** The first gate in the action handler checks
  it against a schema generated from the payload types
  ([wss/actionPayloads.ts](file:///c:/Fred/Coding/SK/server/src/wss/actionPayloads.ts)); an action
  with no entry in `ProtocolMap` is refused outright. After changing anything in `shared/src`, run
  `npm run gen:action-schemas` in `server/` — `check:action-schemas` in the pre-commit hook fails
  until you do, and a server started with stale schemas logs `[Payloads] … OUT OF DATE` at startup.
- **Throw** for anything the user should hear about; the handler turns a throw into
  `{ status: 'error', message }` and records it in the failures log.
- **Never answer success for an action that did nothing.** The handler's exit refuses an empty result
  (`null`, `undefined`, `false`) — which is what managers return when the target is gone — so a
  handler must set `result` to what it changed (the record, an id, `true`) on a genuine success.
- **Never encode a refusal inside a success** (`{ success: false, error }`, `{ status: 'error' }` as
  the result). Throw it.
- **A change and its record travel together.** A status or clock change carries its game-log entry
  (`log`), written by the server only once the change applied — never a second action from the client.
