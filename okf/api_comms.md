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
timestamp: 2026-08-03T07:00:00Z
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
   - Use `createSocketAction(type, payload)` from `@sk/types` and `wsService.emitAction(type, payload, callback)` on the client for compile-time type validation.
   - `wsService.emit` / `wsService.emitAction` are callback-based; do not `await` them.
3. **Client-Side Smart Subscription**:
   - Client components register to data streams using reference counting.
   - The WebSocket Service connects when subscriptions > 0 and automatically disconnects/unsubscribes when count hits 0 to preserve bandwidth.
4. **Offline Resilience**:
   - Connection statuses are actively monitored on the client to show offline banners when connections drop.
5. **Centralized Error Toast Interception**:
   - REST API calls (`apiService`), WebSocket emissions (`wsService.emit`), and data queries (`useSocketQuery`) automatically intercept non-ok status, error responses, and timeouts, broadcasting user-friendly toast notifications via `useToastStore`.
   - To suppress automatic toast notifications on specific requests, callers pass `{ suppressToast: true }` in request options.

## Local Scoring & Clock Engines

*   **Game Clock Engine**: Real-time timers (start, stop, period controls) run client-side, decoupled from continuous server loops, synchronizing occasionally to prevent latency lag.
*   **Dynamic Scoring Engine**: Complex scoring arithmetic (e.g. Try + Conversion in rugby) is computed locally before dispatching action events to the server.
*   **Modular Sport UI Registry**: Scoreboards and timeline events load dynamically depending on the `Sport` of the game. For details on defining new registries, refer to [multi_sport_architecture.md](file:///c:/Fred/Coding/SK/docs/multi_sport_architecture.md).

## Code Entrypoints

*   **Server Routes**: [server/src/index.ts](file:///c:/Fred/Coding/SK/server/src/index.ts) is the central Express server.
*   **WebSocket Handler**: [server/src/wss/](file:///c:/Fred/Coding/SK/server/src/wss/) manages socket protocols.
*   **Expo Services**: [expo-app/services/](file:///c:/Fred/Coding/SK/expo-app/services/) holds the WebSocket connection manager.
