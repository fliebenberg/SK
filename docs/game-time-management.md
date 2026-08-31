# Game Time Management

This document explains how game time (clock) is managed, stored, and synchronized across multiple clients and the server in the SK platform.

## 1. Core State Model

The "Game Clock" is not a ticking value in the database. Instead, it is a set of parameters that allow any client to calculate the current elapsed time. This state is stored in the `liveState.clock` property of a `Game`.

### `GameClockState` Interface

```typescript
interface GameClockState {
  isRunning: boolean;     // Whether the clock is currently ticking
  lastStartedAt?: string; // ISO UTC timestamp of when the clock was last clicked 'Start' or 'Resume'
  elapsedMS: number;      // Total milliseconds accumulated BEFORE the current 'lastStartedAt'
  periodLengthMS: number; // Configured length of a period (e.g., 40 mins for Rugby half)
}
```

## 2. Calculation Logic

Both the server (for event logging) and the client (for display) use the same logic to determine the "Current Game Time".

### If `isRunning` is `false`:
The game is paused. The time is exactly the accumulated milliseconds.
**`Time = elapsedMS`**

### If `isRunning` is `true`:
The game is active. The time is the accumulated milliseconds plus the duration since the last start.
**`Time = elapsedMS + (CurrentTime - lastStartedAt)`**

## 3. Client-Side Synchronization

### Real-time Updates & Push Efficiency
When an official starts or pauses the clock:
1. The client emits an `UPDATE_GAME_CLOCK` action.
2. The server calculates the new `elapsedMS` and `lastStartedAt`, updates the database, and broadcasts a **minimal delta payload** (containing `{ id, liveState: { clock } }`) to all clients in the game's room.
3. **No Per-Second Broadcasts**: The server does NOT broadcast WebSocket messages every second. Broadcasts only occur on discrete actions (Start, Pause, Reset, Period Change). Between actions, clients calculate the continuous ticking locally via `requestAnimationFrame`.
4. **Direct Delta Merging**: Every connected client receives the delta payload and directly merges it into its local state without executing a follow-up `get_data` refetch query. This is the app-wide rule, not a clock special case — see [.agent/skills/live-data](file:///c:/Fred/Coding/SK/.agent/skills/live-data/SKILL.md). The clock is the one place a **partial** payload is still sent; everything else broadcasts the whole object, which makes merging a plain replace-by-id.
   A clock change also publishes a `GameSummary` to the org fixtures rooms, so a list showing a running match stays in step without joining the match's own room.
5. The local `useGameTimer` hook immediately reflects the change.

### Clock Drift & Skew
To ensure that "CurrentTime" is consistent across clients:
- **Server Time as Source of Truth**: On connect, the client measures the offset between its
  local system clock and the server's, and every reader goes through
  `wsService.getServerTime()` — `Date.now() + serverOffset` — rather than `Date.now()`.
- **Measurement**: `syncTime()` emits `time_sync` and times the round trip, so the offset is
  latency-compensated: `serverOffset = (serverTime + rtt/2) - receiveTime`. Assuming the two legs
  were equal bounds the worst-case error at **half the RTT**; `getServerTimeAccuracyMS()` returns
  that bound.
- **The `server_time` seed**: the server also pushes `server_time` the moment a socket attaches.
  This is a *coarse seed only* — the client cannot know when it was sent, so the offset it yields
  is slow by a full one-way latency. It is applied only while no measured sample exists, and can
  never overwrite one. Both paths fire on every connect and their ordering is not guaranteed, so
  this guard is what keeps the uncompensated value from winning a reconnect (`LIVE-6`).

> **Precision ceiling.** The sync is a single unfiltered sample taken once per connect on a
> non-monotonic base. That is right-sized for a clock that displays whole seconds, and is *not*
> sufficient for measuring durations to better than a few hundred milliseconds on a poor link.
> See `LIVE-7` in [TODO.md](file:///c:/Fred/Coding/SK/TODO.md) before building anything that
> needs more.

## 4. Workflows

### Starting the Match / Resuming
1. `isRunning` becomes `true`.
2. `lastStartedAt` is set to `Server.Now`.
3. `elapsedMS` remains unchanged.

### Pausing the Match
1. `isRunning` becomes `false`.
2. `elapsedMS` is updated: `elapsedMS = elapsedMS + (Server.Now - lastStartedAt)`.
3. `lastStartedAt` is cleared (optional).

### Resetting / Period Change
1. `isRunning` becomes `false`.
2. `elapsedMS` is set to `0` (or the start time of the next period if needed).
3. `lastStartedAt` is cleared.

## 5. Persistence

- The `GameClockState` is stored as a JSONB object in the `games` table.
- This ensures that if the server restarts or a new client joins mid-game, they immediately have the correct parameters to calculate the current clock time.

## 6. UI Implementation (`useGameTimer`)

The `useGameTimer` hook uses `requestAnimationFrame` to provide a smooth ticking display (typically updating every 100-500ms for performance, but displaying HH:mm:ss). It recalculates the time string continuously based on the mathematical formula in Section 2, ensuring that no "drift" accumulates in the UI over time.

## 7. Optimistic UI & Debouncing

To ensure the interface feels responsive and to prevent accidental double-triggers, we implement two specific patterns:

### Optimistic Updates
When a user presses a timer control (e.g., "Start Match"):
1. The client **optimistically** updates its local state cache (in `store.ts`) immediately.
2. The `useGameTimer` hook picks up this local change and the clock starts or pauses visually before the server has even responded.
3. When the server broadcast arrives (usually <200ms), the store merges the authoritative server state. Any slight discrepancy in the calculated `elapsedMS` is resolved silently.

### Button Debouncing
To prevent "button mashing" or accidental double-clicks:
1. Upon any timer action, all primary timer buttons (Start/Pause/Resume) are disabled for **1.0 seconds**.
2. This is implemented via a local `isDebouncing` state in the `TimerPanelSlot` component.
3. This lockout period is acceptable because game timing events (like starting a half) rarely occur in rapid succession.
