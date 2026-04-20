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
* **Description:** A conversion kick attempt following a standard Try.
* **Event Data Saved:**
  * `successful`: Boolean value indicating if the kick was successful (`true`) or missed (`false`).
  * `pointsDelta`: `2` if successful, `0` if missed.
  * `elapsedMS`: The time elapsed in the match.
  * `period`: Current period label.
  * `linkedEventId`: The unique `eventId` of the corresponding `Try`.

### Final Score
* **subType:** `Final Score`
* **Description:** A manual override defining the final score of the match.
* **Event Data Saved:**
  * `scores`: An object mapping each `participantId` to their total manually assigned score (e.g., `{ "part-1": 15, "part-2": 10 }`).
  * `reason`: An optional description providing context for the manual override/sync.
  * `elapsedMS`: The time elapsed in the match.
  * `period`: Current period label.

---

## Game Timing & Status Events

These events track the progression and administrative state of the match.

### Game Status Events
* **type:** `STATUS`
* **subType:** `GAME_STARTED`, `GAME_ENDED`, `GAME_CANCELLED`, `GAME_UPDATED`
* **Description:** Triggers when the top-level status of the match changes.
* **Event Data Saved:**
  * `status`: The new resulting status (`Live`, `Finished`, or `Cancelled`).
  * `reason`: Optional reason logged for cancellation.
  * `timestamp`: ISO string of the exact machine time it was pressed.
  * `elapsedMS`: Match clock in MS.
  * `period`: Current period label.

### Clock Action Events
* **type:** `TIME`
* **subType:** `CLOCK_PAUSED`, `CLOCK_RESUMED`, `PERIOD_STARTED`, `PERIOD_ENDED`
* **Description:** Triggers when the official match timer is paused, resumed, or when halves respectively begin and end.
* **Event Data Saved:**
  * `action`: The system interpretation of what happened (`START`, `PAUSE`, `RESUME`, `END_PERIOD`, etc.).
  * `elapsedMS`: The recorded clock time when the action was taken to sync local client states and provide an audit.
  * `period`: The precise period in which the clock change occurred.
85: 
86: ---
87: 
88: ## Game Action Events (type: `GAME_EVENT`)
89: 
90: These events track specific actions and infringements during the match.
91: 
92: ### Penalty Awarded
93: * **subType:** `Penalty Awarded`
94: * **Event Data:**
95:   * `reason`: The reason for the penalty (e.g., "High Tackle").
96:   * `decision`: The chosen option ("Penalty Kick", "Line Kick", "Scrum", or "Tap n Go").
97: 
98: ### Free Kick Awarded
99: * **subType:** `Free Kick Awarded`
100: * **Event Data:**
101:   * `reason`: The reason for the free kick (e.g., "Scrum - Early Push").
102:   * `decision`: The chosen option ("Line Kick", "Scrum", or "Tap n Go").
103: 
104: ### Scrum
105: * **subType:** `Scrum`
106: * **Event Data:**
107:   * `reason`: The reason the scrum was called (e.g., "Knock-on").
108:   * `winnerSide`: "home" or "away" (if recorded).
109:   * `winnerName`: The name of the winning team (if recorded).
110: 
111: ### Lineout
112: * **subType:** `Lineout`
113: * **Event Data:**
114:   * `winnerSide`: "home" or "away" (if recorded).
115:   * `winnerName`: The name of the winning team (if recorded).
116: 
117: ### Miscellaneous Actions
118: * **subType:** `Yellow Card`, `Red Card`, `Knock-on`, `Turnover`, `Replacement`, `Kick-off`, `22m Dropout`, `Goalline Dropout`
119: * **Event Data:** Varies by event (e.g., `actorId` for cards, `playerOffId`/`playerOnId` for replacements).
