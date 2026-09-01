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
timestamp: 2026-09-01T21:30:00Z
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
    rules — `broadcast.ts` (the one exit for every update), `roomAccess.ts` (who may join what)
    and `fixtures.ts` (who hears about a fixture change).
*   **Expo Services**: [expo-app/services/](file:///c:/Fred/Coding/SK/expo-app/services/) holds the WebSocket connection manager.
