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

### Real-time Updates
When an official starts or pauses the clock:
1. The client emits an `UPDATE_GAME_CLOCK` action.
2. The server calculates the new `elapsedMS` and `lastStartedAt`, updates the database, and broadcasts the updated `Game` object to all clients in the game's room.
3. Every connected client receives the update and their local `useGameTimer` hook immediately reflects the change.

### Clock Drift & Skew
To ensure that "CurrentTime" is consistent across clients:
- **Server Time as Source of Truth**: On initial connection, the client calculates the offset between its local system clock and the server's clock.
- **Handshake**: The server includes its current time in the socket handshake or a heartbeat.
- **Adjustment**: `CurrentTime` in the calculation above is adjusted by this offset: `AdjustedTime = Date.now() + serverOffset`.

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
