# Universal Sports Architecture

This document explores the architectural approach for supporting an arbitrary number of sports with varying structures, scoring systems, and participant types within the same application.

## 1. Core Data Model Strategy (Hybrid Approach)

To balance flexibility and query performance, we use a hybrid approach combining structured relational columns for key summary data and JSON for sport-specific details.

### **A. The `Sport` Entity**
Stores the generic configuration and rules for a sport.
- `id`, `name` (e.g., "100m Sprint", "Rugby")
- `category` (or `family`): Groups related sports together (e.g., `ATHLETICS`, `FIELD_HOCKEY`, `TARGET_SPORTS`).
- `participantType`: `TEAM` | `INDIVIDUAL`
- `matchTopology`: `HEAD_TO_HEAD` (2 participants battling) | `MULTI_COMPETITOR` (many participants ranked).
- `defaultSettings` (JSON):
  - `periods`: 2
  - `periodDurationMinutes`: 40
  - `scoringRules`: `[{ id: 'try', name: 'Try', points: 5 }, { id: 'conv', name: 'Conversion', points: 2 }]`
  - `allowFlexibleScoring`: `false` (If true, allows manual entry of points).
  - `positions`: `[{id: 'prop', name: 'Prop'}, ...]`
  - `eventTypes`: `['SCORE', 'PENALTY', 'SUBSTITUTION']`
  - **Match Resolution Rules:**
    - `canDraw`: `true` | `false`
    - `overtimeRule`: `NONE` | `EXTRA_TIME` (fixed duration) | `SUDDEN_DEATH` (golden point) | `SHOOTOUT` (penalties)
    - `overtimePeriods`: e.g., 2
    - `overtimeDurationMinutes`: e.g., 10

### **B. `SportPreset` (Variants)**
A table to hold variation templates for a specific sport.
- `id`, `sportId`, `name` (e.g., "U13 Rugby")
- `settingsOverride` (JSON): E.g., `{ periods: 2, periodDurationMinutes: 15 }`.
- When creating a Match, the user picks the Sport and optionally a Preset, making setup rapid.

### **C. The `Match` (or `Event`) Entity**
Represents a specific instance of a game.
- `id`, `sportId`, `matchDayId` (Groups matches together, e.g., an Athletics Meet).
- `status`: `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`
- **Structured Fields for Quick Access**:
  - `finalScoreTeamA` / `finalScoreTeamB`
  - `winningParticipantId`
- `customSettings` (JSON): The fully resolved settings for *this* match at creation time (Sport default + any Preset overrides + any manual tweaks for the specific match).

### **D. The `MatchEvent` Log (Granular & Flexible Tracking)**
Supports varying levels of detail, from simply entering a final score to tracking every pass.
- `timestamp`, `matchId`, `participantId`, `type`, `subType`, `pointsDelta`
- `eventData` (JSON): Optional extra details (e.g., who scored, location).

---

## 2. Real-Time State Management (Scoring Flow)

To ensure consistency and prevent double-entry (race conditions), we employ **Time & Type Deduplication** combined with a **Consensus Undo Mechanism**.

1. **Frontend Action:** A user clicks "Try" in the `ScoringPanel`.
2. **Event Emitted:** Frontend sends the `SCORE` event to the Backend.
3. **Backend Deduplication Filter:** The backend looks at incoming events. If it receives two identical `SCORE: TRY` events for `Team A` from two different users within a 5-second window, it silently ignores the second one, assuming it was a duplicate entry from separate coaches syncing up.
4. **Backend Processing:** Backend validates the non-duplicate event, inserts it into the `MatchEvent` log, and recalculates the *new official total score*.
5. **Broadcasting:** The backend broadcasts the official new score and play-by-play text to connected WebSocket rooms.

### **The Consensus Undo Mechanism**
To allow granular control without chaos, we allow any scorer to initiate an `UNDO` event for a recent action.
- When an `UNDO` is requested, the backend broadcasts a temporary "Undo Vote" state to all connected scorers.
- Scorers get a short window (e.g., 15 seconds) to "Approve" or "Reject".
- **Resolution:** If a majority approves, the backend creates a compensating `UNDO_ACTION` event to negate the points. In the event of a tie, the original scorer who logged the event gets the deciding vote. All votes and outcomes are permanently logged for transparency.

---

## 3. Multiple Independent Scorers (Judged Sports)

Certain sports (Gymnastics, Boxing, Surfing, Diving) fundamentally require multiple judges scoring the *exact same performance independently*.

### **Implementation for Judged Sports:**
- **Match Setup:** The `Sport.defaultSettings` define a `scoringStrategy`: `AGGREGATE_AVERAGE` | `AGGREGATE_SUM` | `DISCARD_HIGH_LOW_AVERAGE`.
- **The Event Pipeline:** 
  1. All 5 judges enter their individual scores for a participant.
  2. The backend records 5 discrete `JUDGE_SCORE` events.
  3. The backend does *not* instantly add these to the final Match Score. It waits until an official (e.g., the Head Judge) triggers a `FINALIZE_PERFORMANCE` event, or it automatically triggers when all assigned judges have submitted.
  4. The backend then calculates the consensus score according to the `scoringStrategy` (e.g., dropping the highest and lowest scores, averaging the remaining three) and emits the final `OFFICIAL_SCORE` event for that participant.

---

## 4. Match Resolution & Tie-Breakers

Some sports allow draws, while others demand a winner. The `Sport.defaultSettings` dictate the fallback path if a match reaches full-time with a tied score:

- **Normal Draw:** The match simply ends. Points are shared in the League/Competition table.
- **Extra Time / Additional Periods:** If tied at the end of regulation (`Tied && Settings.overtimeRule === 'EXTRA_TIME'`), the system prompts the officials to start `Overtime Period 1`. This uses the `Settings.overtimeDurationMinutes`.
- **Sudden Death (Golden Point):** If `Settings.overtimeRule === 'SUDDEN_DEATH'`, the match enters a special unfixed period. The next `SCORE` event entered into the system that breaks the tie automatically triggers a `MATCH_COMPLETED` event.
- **Shootout / Penalties:** A structured final phase where regular time stops, and the UI shifts into a `ShootoutPanel` (a specialized Component Registry slot) where scorers log binary Make/Miss events until a winner emerges.

---

## 5. Event Templates: Steps and Screens

Each sport's `eventTemplates` describe what a scorer is asked when they log an event. A template
holds an ordered `steps` array, and the scoring dialog renders **one screen per top-level step**,
in the order the spec declares them. There is no ordering, labelling or step logic hardcoded in the
client — moving a step in the seed moves it on screen.

### Step types

| Type | Renders |
|---|---|
| `PLAYER_SELECTION` | the team's roster grid |
| `REASON_SELECTION` | the infringement / detail options, grouped by `ReasonGroup` |
| `OUTCOME_SELECTION` | the outcome buttons; labelled "Next Action" when the outcomes carry triggers |
| `CUSTOM_WIDGET` | a counter, labelled from the step's `name` |
| `GROUP` | its child steps, together on **one** screen |

`GROUP` exists solely to put more than one control on a single screen — a scrum asks for its reset
count beside won/lost, because the two are one judgement. Anything that should be answered
independently is a top-level step instead. A step's optional `name` titles its screen; a group's
`name` titles the combined one.

### Triggered follow-up events

An outcome (or a whole template) may spawn a linked follow-up event via `triggerEventId`. The
follow-up is **not always the same team's**: a try's conversion is taken by the scoring team, but a
penalty is recorded *against* the offending team and the kick it awards belongs to their opponents.

`triggerTeam` states that, relative to the parent:

| Value | Meaning |
|---|---|
| `same` (default) | the follow-up is recorded for the parent's participant — `try` → `conversion` |
| `opponent` | the follow-up is recorded for the other participant — `penalty_awarded` → `penalty_kick` |

It sits beside `triggerEventId`, at whichever level that is declared, and is read through
`getTriggerFor`, which returns `{ eventId, team }` so no caller can learn what to spawn without
learning whose it is. This was previously a hardcoded list of rugby template ids in the scoring
client; a spec the client has never seen can now say it.

A child's side is decided **once, when it is created**. The mutation engine never rewrites a
child's `game_participant_id` when its parent is edited — see `applyMutation`'s cascade in
`GameEventManager`.

### Reading `steps` in code

`steps` is a tree, but almost every question about a template ("what outcomes exist?", "does this
collect a player?") concerns all steps regardless of grouping. Answering those by walking
`template.steps` directly means remembering to unwrap `GROUP` every time, and forgetting is silent
— the code finds nothing and skips its work rather than failing.

So the traversal lives in one place, `shared/src/utils/templateSteps.ts`, exported via `@sk/shared`:

- `findStep` / `findSteps` / `hasStep` — locate steps by type
- `getOutcomes` / `findOutcome` — outcome definitions, normalised
- `getReasonOptions` / `findReason` — reason options, flattened across groups
- `getTriggerFor(template, outcomeId)` — the linked child a selection spawns **and whose side it
  is** (`{ eventId, team }`), resolving outcome-level triggers before the template-level one
- `getScreens(template)` — the screen layout, for the dialog only

No flat step array is exported, so no caller can hold one and pass it where the grouped structure
belonged. Use these helpers rather than reading `steps` yourself.

### Applying a spec change

`eventTemplates` are stored in `sports.event_templates` in the database, so editing a seed file has
no effect until it is synced:

```sh
cd server && npx ts-node src/scripts/sync_db_rugby_templates.ts
```
