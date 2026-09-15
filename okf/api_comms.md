---
type: concept
title: API & Real-time WebSockets
description: WebSocket-first communication model, client subscription rules, REST endpoints, and modular sport scoreboard registries.
tags:
  - concept
  - API
  - WebSockets
  - real-time
  - sport-registry
timestamp: 2026-09-03T00:00:00Z
---

# API & Real-time WebSockets

ScoreKeeper employs a WebSocket-first real-time messaging model for fast and efficient synchronization of sports events.

For the full detailed lists of routes and socket payloads, see [api_actions.md](file:///c:/Fred/Coding/SK/docs/api_actions.md).

## Communication Mechanics

1. **WebSocket-First Exchange**:
   - WebSockets are the preferred communication method for active games, scoring, and real-time feeds.
   - **REST API Fallback**: REST endpoints are reserved for heavy operations, user authentication (login/signup), or file uploads (avatars, logos).
2. **WebSocket Action Emission Standard**:
   - All state mutation operations sent over Socket.io MUST be emitted using the `'action'` event name with payload `{ type: SocketAction.ENUM_NAME, payload: { ... } }`.
   - Never emit `SocketAction.ENUM` directly as the socket event name.
   - Use `createSocketAction(type, payload)` from `@sk/shared` and `wsService.emitAction(type, payload, callback)` on the client for compile-time type validation.
   - `wsService.emit` / `wsService.emitAction` are callback-based; do not `await` them.
   - **Every action MUST read its acknowledgement, and a write that failed must never look like one that worked.** The server answers every `action` with `{ status: 'ok' | 'error', message }` and calls the ack on **both** branches, so an emit with no callback — or one that ignores its argument — cannot tell success from refusal. A screen that assumes success then lies to the person using it: an invitation is listed that was never sent, a dismissed step returns on the next load, a form drops its dirty state over changes the database rejected. Pass a handler, and on `status: 'error'` **say so** (via [`reportActionError`](file:///c:/Fred/Coding/SK/expo-app/utils/actionErrors.ts), which surfaces the server's own message) and **do not perform the success consequences** — do not clear the dirty state, do not reset the form, and above all **do not navigate away from the edit**, because that discards work the user believes is saved. Swept across `expo-app/` on 2026-09-15 (`LIVE-19`); there are currently **no** action emits without an ack handler, and a new one is a bug. Verify with a parser that counts top-level call arguments rather than with grep, which miscounted this twice.
   - **A dirty flag must be clearable by the save it triggers.** The companion rule, and the subtler half. A save bar shown on `isDirty` computed from server data can only come down if the write actually changes that data — so dirtiness derived from a field the write does not send, or compared against a room the screen is not subscribed to, produces a form that can never be put down however many times Save is pressed. Both happened on the tournament Basic Info screen in one week: a multi-day flag whose save wrote `endDate: null` over a column already null, and a facilities baseline read from `event:{id}` while `EVENT_FACILITIES_SYNC` is published to `event:{id}:facilities`. When adding a term to a dirty check, ask what write clears it and what room refreshes the thing it compares against.
3. **Client-Side Smart Subscription**:
   - Client components register to data streams using reference counting.
   - The WebSocket Service connects when subscriptions > 0 and automatically disconnects/unsubscribes when count hits 0 to preserve bandwidth.
   - **Updates carry their data.** A broadcast is never a nudge to refetch: with N clients on
     a room, "notify then everyone re-reads" costs one fan-out plus N round trips, where
     sending the object costs one fan-out of a few hundred bytes. Screens merge the payload.
   - **Joining a room is the initial load.** `join_room` pushes the room's current state back
     to the joining socket, so a screen that subscribes does not also query.
     [`useLiveRoom`](file:///c:/Fred/Coding/SK/expo-app/hooks/useLiveRoom.ts) is the client
     primitive; `useSocketQuery` remains correct only for one-shot reads no room owns.
   - **A late subscriber is replayed, not re-joined.** The join push reaches only the socket
     that joined, once, and screens hold room state locally rather than in a shared store — so a
     screen subscribing to a room a still-mounted parent already holds would otherwise start
     empty. [`roomLedger.ts`](file:///c:/Fred/Coding/SK/expo-app/services/roomLedger.ts) logs
     what each held room has delivered, and `subscribeToRoom(room, onReplay)` feeds that log to
     the newcomer. Screens using `useLiveRoom` get this without doing anything; a screen that
     calls `subscribeToRoom` directly does not, and should move to the hook (`LIVE-9`).
   - **Every message carries its `topic`.** Socket.io does not tell a receiver which room
     delivered a message, so the server stamps the room on
     ([wss/broadcast.ts](file:///c:/Fred/Coding/SK/server/src/wss/broadcast.ts)) and listeners
     drop anything addressed elsewhere.
   - **Rooms are the read boundary.** Because a broadcast carries data, whatever a socket can
     join it can read — so `join_room` authorizes before joining, against the identity proven
     by the handshake, and refuses any room name it does not recognise
     ([wss/roomAccess.ts](file:///c:/Fred/Coding/SK/server/src/wss/roomAccess.ts)).
   - **A handler's parameter type is a claim, not a guarantee.** `join_room`, `leave_room`,
     `unsubscribe`, `get_data` and `action` all declare the shape they expect, but the value
     arrives over a socket from an unauthenticated client, so each one **checks it at the top and
     returns**. This is not defensiveness for its own sake: those handlers are `async`, so a throw
     inside one is an unhandled rejection, and an unhandled rejection ends the Node process. A
     `join_room` sent as `{ room }` instead of `room` reached `room.split(':')` and took the whole
     server down (`SOCK-1`). `classifyRoom` refuses a non-string in its own right, since it is the
     choke point every room check passes through.
   - **A batch writes once, reports per item, and can be retried.** Every batch action obeys one
     contract (D13), written down in [api_actions.md](file:///c:/Fred/Coding/SK/docs/api_actions.md)
     and enforced in [wss/batch.ts](file:///c:/Fred/Coding/SK/server/src/wss/batch.ts): **one
     transaction** (a batch with any failed item writes nothing — the per-item report says which
     rows to fix, never which survived), **one permission scope** (a batch spanning two events is
     refused before any work), **one broadcast** (ninety fixtures are one message, or the cost
     removed on the server simply moves to the client), and **one idempotency key** (a retried
     batch does not double-write; the cache is in-memory, per process, and would need a table if
     this ever ran on two).
   - Full rules: [.agent/skills/live-data](file:///c:/Fred/Coding/SK/.agent/skills/live-data/SKILL.md).
4. **Offline Resilience**:
   - Connection statuses are actively monitored on the client to show offline banners when connections drop.
5. **Centralized Error Toast Interception**:
   - REST API calls (`apiService`), WebSocket emissions (`wsService.emit`), and data queries (`useSocketQuery`) automatically intercept non-ok status, error responses, and timeouts, broadcasting user-friendly toast notifications via `useToastStore`.
   - To suppress automatic toast notifications on specific requests, callers pass `{ suppressToast: true }` in request options.

## Local Scoring & Clock Engines

*   **Game Clock Engine**: Real-time timers (start, stop, period controls) run client-side, decoupled from continuous server loops, synchronizing occasionally to prevent latency lag.
*   **Dynamic Scoring Engine**: Complex scoring arithmetic (e.g. Try + Conversion in rugby) is computed locally before dispatching action events to the server.
*   **Modular Sport UI Registry**: Scoreboards and timeline events load dynamically depending on the `Sport` of the game. For details on defining new registries, refer to [multi_sport_architecture.md](file:///c:/Fred/Coding/SK/docs/multi_sport_architecture.md).
*   **Data-Driven Scoring Panels**: The control room's scoring panels are not registered per sport — [DynamicScoringPanels](file:///c:/Fred/Coding/SK/expo-app/components/sports/shared/DynamicScoringPanels.tsx) renders one per section the sport declares, in the sport's own order. Only genuinely bespoke pieces (the scoreboard) are still resolved by category through `SportComponentRegistry`.

## Code Entrypoints

*   **Server Routes**: [server/src/index.ts](file:///c:/Fred/Coding/SK/server/src/index.ts) is the central Express server.
*   **Sport Admin Writes**: `/api/admin/sports` (list, create, update) is the only path that writes a sport's rules, positions and event templates. Bodies are validated by [server/src/utils/sportValidation.ts](file:///c:/Fred/Coding/SK/server/src/utils/sportValidation.ts) before they reach `SportManager` — templates drive live scoring, so an invalid one is rejected rather than stored.
*   **WebSocket Handler**: Socket wiring lives in [server/src/index.ts](file:///c:/Fred/Coding/SK/server/src/index.ts);
    [server/src/wss/](file:///c:/Fred/Coding/SK/server/src/wss/) holds the publishing and access
    rules — `broadcast.ts` (the one exit for every update), `roomAccess.ts` (who may join what),
    `fixtures.ts` (who hears about a fixture change), `tournaments.ts` (who hears about a division
    change), `tournamentGate.ts` (the one authorization gate every tournament write passes) and
    `batch.ts` (the batch contract).
*   **Room inventory**: [okf/live_rooms.md](file:///c:/Fred/Coding/SK/okf/live_rooms.md) lists all
    23 joinable rooms in one table — access tier, join push, what is published afterwards, and the
    merge class of every message type. Consult it before adding a room, a broadcast or a reducer;
    the notes below cover the reasoning behind particular rooms, not the full set.
*   **Tournament writes**: [TournamentManager](file:///c:/Fred/Coding/SK/server/src/managers/TournamentManager.ts)
    owns divisions, stages, entrants, generation, scheduling — and `recalculateForGame`, **the one
    function that rewrites a standings table**. Every path that changes a result routes through
    `EventManager.recalculateStandingsForGame`, which calls it and publishes the outcome. There is
    no second recalculation path, deliberately: a cache is only as good as the writes that
    invalidate it, and two of them is how one goes stale.
*   **Division rooms**: `division:{id}:fixtures` and `division:{id}:standings` are public (a draw
    and a table are spectator information); `division:{id}` is `member`, because an entrant may be
    a person and an adjustment carries an organiser's reason and author. An **appointed convenor**
    also gets in, without any membership at all — otherwise they would be given a division to run
    and refused its roster. `event:{id}:entrants` is the event-level counterpart of the third one,
    at the same tier; `event:{id}` itself stays public.
*   **The event room hands over its facilities too** (U47). `event:{id}` pushes
    `EVENT_FACILITIES_SYNC` on join beside the event, its fixture summaries and its divisions
    — the set of fields the tournament may use, which `SET_EVENT_FACILITIES` had always published
    there on change without anything pushing it on join. A division's own subset travels **on the
    division** (`facilityIds`), so `SET_DIVISION_FACILITIES` republishes the division to the event
    room as well as its own: the event screen lists every division with the fields it uses, and a
    convenor narrowing their division must not leave that list stale (`LIVE-8`).
*   **Every recalculation republishes the stages** (Phase 6). The choke point calls
    `refreshStageStatus`, so a result can move a stage from `Ready` to `InProgress` or to
    `Complete` — and the stage tabs put that status in their sublabel. `publishRecalculation` now
    sends `STAGES_SYNC` alongside the tables, because a room that hands data over on join and never
    republishes it is `FIX-4` again.
*   **Permissions are per-user, so they are not broadcast** (Phase 4). A room broadcast reaches
    everyone in the room, so `{ canEditEvent, convenesDivisionIds }` is read per socket through
    `get_data { type: 'event_capabilities', eventId }` rather than stamped onto the event or the
    division. A grant change pushes `EVENT_CAPABILITIES_UPDATED` to that person's `user:{id}` room,
    which `broadcast()` also treats as an identity change — dropping their cached access and
    revalidating the rooms their sockets already hold. A **list** of events cannot afford that read
    per card, so it asks `get_data { type: 'my_event_grants' }` once — the grants this caller holds,
    with each division grant carrying its event id — and derives hosting and attending from data it
    already has. Display only; every write is still gated server-side.
*   **The roster has an event-level room too** (Phase 6). `event:{id}:entrants` carries **every**
    division's roster in one push, because the entry screens work two axes — by division and by
    organisation — over one dataset, and the organisation axis is a division x org grid that would
    otherwise need fifteen room joins on one screen open. Same `member` tier as `division:{id}`,
    and for the same reason. A roster edit publishes `DIVISION_ENTRANTS_SYNC` to **both** rooms
    with the same payload, so the reducer is the same in each; the event-level listener merges it
    with `useLiveRoom`'s `replaceWhere`, which replaces one division's slice rather than the whole
    collection.
*   **Entering a roster mirrors it into the stage that takes it** (Phase 6). `planFixtures` reads
    `stage_entrants`, never the roster — pool membership has to live somewhere and a knockout's
    field is filled by progression — but for an ordinary single-stage division the two are the same
    list. `setDivisionEntrants` therefore syncs the **first** stage when it draws from no earlier
    one, preserving any `pool_key` and `seed` already there. Without it, entering ten teams and
    pressing Generate would find an empty stage.
*   **Two reads that no room owns** (Phase 6): `event_entrants` defers to the room above, and
    `event_candidate_teams` — "teams that could be entered" — is a standalone
    `tournament-organiser` read scoped by **either** an `eventId` (the entry screen) or a
    `divisionId` (a convenor reaching the same editor through their division). It is deliberately
    unfiltered by sport and age group: the organisation axis shows one school against every
    division at once, so a per-division filter would be a query per division.
*   **A fixture's audience includes its event and division rooms** (Phase 5). `join_room` hands
    fixtures over to `event:{id}` and `division:{id}:fixtures`, so both must also receive
    `GAME_SUMMARY_UPDATED` — a room that hands data over on join and never republishes it goes
    stale the moment anything happens. See
    [wss/fixtures.ts](file:///c:/Fred/Coding/SK/server/src/wss/fixtures.ts).
*   **Expo Services**: [expo-app/services/](file:///c:/Fred/Coding/SK/expo-app/services/) holds the WebSocket connection manager.
