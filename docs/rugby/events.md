# Rugby Events

This document details all the game events (types and subtypes) that are logged during a Rugby match, along with their associated data structures. Every event records the core information (like `gameId`, `participantId`, `initiatorOrgProfileId`, etc.), but the `type`, `subType`, and `eventData` structures vary uniquely as defined below.

## Scoring Events (type: `SCORE`)

These events directly affect the match points of the participants and are generated from the primary Rugby Scoring Panel.

### Try
* **subType:** `Try`
* **Description:** A standard try scored by a team.
* **Event Data Saved:**
  * `pointsDelta`: `5`
  * `elapsedMS`: The time elapsed in the match (in milliseconds) when recorded.
  * `period`: The current period label (e.g., "1st Half").

### Penalty Try
* **subType:** `Penalty Try`
* **Description:** A penalty try automatically awarded to a team when a probable try was prevented by foul play.
* **Event Data Saved:**
  * `pointsDelta`: `7`
  * `elapsedMS`: The time elapsed in the match.
  * `period`: Current period label.

### Penalty
* **subType:** `Penalty`
* **Description:** A penalty kick successfully converted for points.
* **Event Data Saved:**
  * `pointsDelta`: `3`
  * `elapsedMS`: The time elapsed in the match.
  * `period`: Current period label.

### Drop Goal
* **subType:** `Drop Goal`
* **Description:** A drop goal successfully converted for points during open play.
* **Event Data Saved:**
  * `pointsDelta`: `3`
  * `elapsedMS`: The time elapsed in the match.
  * `period`: Current period label.

### Conversion
* **subType:** `Conversion`
* **Description:** A successful conversion kick following a standard Try.
* **Event Data Saved:**
  * `pointsDelta`: `2`
  * `elapsedMS`: The time elapsed in the match.
  * `period`: Current period label.
  * `linkedEventId`: The unique `eventId` of the corresponding `Try`.
  * `successful`: `true`

### Conversion Missed
* **subType:** `Conversion Missed`
* **Description:** An unsuccessful conversion kick following a Try.
* **Event Data Saved:**
  * `pointsDelta`: `0`
  * `elapsedMS`: The time elapsed in the match.
  * `period`: Current period label.
  * `linkedEventId`: The unique `eventId` of the corresponding `Try`.
  * `successful`: `false`

### Final Score
* **subType:** `Final Score`
* **Description:** A manual override defining the final score of the match, typically triggered at the end of the game to sync up the official scores.
* **Event Data Saved:**
  * `scores`: An object mapping each `participantId` to their total manually assigned score (e.g., `{ "part-1": 15, "part-2": 10 }`).
  * `reason`: `"Manual Final Score"`
  * `elapsedMS`: The time elapsed in the match.
  * `period`: Current period label.
  * `scoreSnapshot`: The DB trigger injects this snapshot into all score events.
  
---

## Timeline & Status Events

While these events are shared across all sports, they are heavily integrated into a Rugby match timeline. They lack a `subType` but have a distinct primary `type`.

### Game State Events
* **type:** `GAME_STARTED`, `GAME_ENDED`, `GAME_CANCELLED`, `GAME_UPDATED`
* **Description:** Triggers when the top-level status of the match changes (e.g., an official moves it from Scheduled to Live, or cancels it).
* **Event Data Saved:**
  * `status`: The new resulting status (`Live`, `Finished`, or `Cancelled`).
  * `reason`: Optional reason logged for cancellation.
  * `timestamp`: ISO string of the exact machine time it was pressed.
  * `elapsedMS`: Match clock in MS.
  * `period`: Current period label.

### Clock Action Events
* **type:** `CLOCK_PAUSED`, `CLOCK_RESUMED`, `PERIOD_STARTED`, `PERIOD_ENDED`
* **Description:** Triggers when the official match timer is paused, resumed, or when halves respectively begin and end.
* **Event Data Saved:**
  * `action`: The system interpretation of what happened (`START`, `PAUSE`, `RESUME`, `END_PERIOD`, etc.).
  * `elapsedMS`: The recorded clock time when the action was taken to sync local client states and provide an audit.
  * `period`: The precise period in which the clock change occurred.
