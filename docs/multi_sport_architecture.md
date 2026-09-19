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
  - `scheduledPeriods`: 2 (same key name the game- and event-level overrides use)
  - `periodLengthMS`: 2400000
  - `scoringRules`: `[{ id: 'try', name: 'Try', points: 5 }, { id: 'conv', name: 'Conversion', points: 2 }]`
  - `allowFlexibleScoring`: `false` (If true, allows manual entry of points).
  - `positions`: `[{id: 'prop', name: 'Prop'}, ...]`
  - `eventTypes`: `['SCORE', 'PENALTY', 'SUBSTITUTION']`
  - **Match Resolution Rules:**
    - `canDraw`: `true` | `false`
    - `overtimeRule`: `NONE` | `EXTRA_TIME` (fixed duration) | `SUDDEN_DEATH` (golden point) | `SHOOTOUT` (penalties)
    - `overtimePeriods`: e.g., 2
    - `overtimeDurationMinutes`: e.g., 10

> **The event log is a record, not a reference**: a recorded event stores the *words* it was
> captured with — `templateName`, `outcomeName`, `reasonName` — alongside the ids it chose, the
> same way `period` stores "1st Half". A feed row therefore reads exactly as it did on the day,
> whatever is renamed or deleted afterwards. `captureEventLabels` in
> [capturedEvent.ts](file:///c:/Fred/Coding/SK/shared/src/utils/capturedEvent.ts) stamps them and
> `getEventLabel` prefers them, falling back to the template only for rows recorded before this
> existed. An outcome's `displayOverride: ""` is a value, not an absence — it is captured as an
> empty string so a successful conversion keeps reading "CONVERSION" rather than gaining a
> "→ SUCCESSFUL" it never had.
>
> **Sections**: the panels the scoring control room stacks are per sport, stored on
> `sports.event_sections` as `[{ id, name, affectsScore? }]` and read through `getEventSections`
> in [sportSections.ts](file:///c:/Fred/Coding/SK/shared/src/utils/sportSections.ts). A sport that
> declares none derives them from the sections its templates name. `affectsScore` replaced the
> hardcoded `section === 'Scoring'` test that used to appear in four call sites — ask
> `isScoringTemplate(sport, template)` instead, which also counts anything worth points.
>
> Sections are stored beside the templates rather than wrapped around them — `event_templates`
> stays a flat array whose entries name their section by id. Templates are resolved by id far
> more often than they are listed by section (the mutation engine alone does it eight times, and
> triggers cross sections: a penalty in Infringements spawns a kick in Scoring), and a section
> has to exist before any event is filed under it. The cost of that choice is that an event can
> name a section that does not exist, so both the editor and
> [sportValidation.ts](file:///c:/Fred/Coding/SK/server/src/utils/sportValidation.ts) check for it.
>
> **Authoring**: a sport's event templates are seeded from the specs under
> [server/src/scripts/setup/seeds/sports/](file:///c:/Fred/Coding/SK/server/src/scripts/setup/seeds/sports/)
> and are editable from the system admin sport screen's **Events** tab
> ([expo-app/components/admin/sports/](file:///c:/Fred/Coding/SK/expo-app/components/admin/sports/)).
> Two capture-flow details are still code-bound: a `CUSTOM_WIDGET` can only name a widget that
> exists in the client widget registry, and a `FORM_INPUT` step's `fields` have no fixed shape,
> so the editor takes them as JSON.

### **B. `SportPreset` (Variants)**
A table to hold variation templates for a specific sport.
- `id`, `sportId`, `name` (e.g., "U13 Rugby")
- `settingsOverride` (JSON): E.g., `{ scheduledPeriods: 2, periodLengthMS: 900000 }`.
- When creating a Match, the user picks the Sport and optionally a Preset, making setup rapid.

> **Not built** — `SPORT-3` in TODO.md. Two things to design with it, settled 2026-09-19:
> - **A preset is a rules variant, not an age group.** "U13 Rugby" above mixes the two. Age groups
>   are now their own per-sport list (§B2); a preset may *default* rules for an age group, but the
>   same age group can play under several presets (U13 fifteens and U13 sevens) and one preset
>   covers many age groups.
> - **A preset may carry its own age-group list.** A governing body can use age groups the sport's
>   standard list does not — South African and New Zealand rugby, say. The intended shape is a
>   nullable `preset_id` on `sport_age_groups`, NULL meaning sport-wide, added when presets exist.

### **B2. Age groups**
Each sport has one list in `sport_age_groups` ([database_structure.md §2d](file:///c:/Fred/Coding/SK/docs/database_structure.md)):
**official** entries an admin curates on the sport editor's **Age Groups** tab, and **custom** ones
users add under "Other…" in [AgeGroupPicker](file:///c:/Fred/Coding/SK/expo-app/components/AgeGroupPicker.tsx)
when nothing official fits. Custom entries are visible to everyone playing the sport, so they
double as a record of what the official list is missing: the admin promotes one, or merges it into
the official entry it duplicates. Teams, divisions and leagues hold the entry's id, under a foreign
key that requires it to belong to their own sport.

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

## 5. Event Templates: Meaning and Capture

Each sport's `eventTemplates` describe both what an event *means* and what a scorer is *asked*, and
the two are kept apart:

- **Meaning** — `outcomes` and `reasons` sit on the template itself. What an outcome is worth, what
  `eventData` it merges and what follow-up it spawns is the definition of the event.
- **Capture** — `steps` is an ordered list of prompts, and the scoring dialog renders **one screen
  per top-level step** in spec order. Moving a step in the seed moves it on screen.

The split is what keeps the layers from leaking. The server resolves points and triggers from
`template.outcomes` and **never reads `steps` at all**, so grouping, ordering and screen labels are
a purely client-side concern. A step says *where* the outcome picker appears; it cannot change what
the outcomes are.

### Step types

| Type | Renders |
|---|---|
| `PLAYER_SELECTION` | the team's roster grid |
| `REASON_SELECTION` | the picker for `template.reasons`, under their group headings |
| `OUTCOME_SELECTION` | the picker for `template.outcomes`; labelled "Next Action" when they carry triggers |
| `CUSTOM_WIDGET` | the widget named by `widgetName`, resolved through the client's registry |
| `GROUP` | its child steps, together on **one** screen |

`GROUP` exists solely to put more than one control on a single screen — a scrum asks for its reset
count beside won/lost, because the two are one judgement. Anything that should be answered
independently is a top-level step instead. A step's optional `name` titles its screen; a group's
`name` titles the combined one.

### Required and skipped steps

Steps are **optional by default**. `required: true` blocks the save until the step is answered, and
the dialog names what is outstanding above the footer. It is meaningful on the three selection
steps only — a widget always holds a value. No rugby step sets it today.

Independently of that, the event feed flags any unanswered step as a missing detail, and tapping
the chip reopens the dialog at the screen holding that step. Optional therefore does not mean
invisible: it means the event can be saved and completed later.

A step can also be **skipped** — dropped from the flow entirely because the answers so far make it
inapplicable. `getScreens(template, { reason })` returns the live flow, and a screen whose every
step is skipped disappears. The one rule today is player attribution:

`ReasonOption.specifyPlayer` (default `true`) says whether an individual is at fault. This is
per-*reason* rather than per-template because it varies within one template: a penalty for a
dangerous tackle has an offender, one for a collapsed scrum does not — `penalty_awarded` wants a
player for 10 of its 14 reasons, `free_kick` for 2 of its 13. Three layers honour it and must
agree, so the default lives in `reasonRequiresPlayer`:

| Layer | Behaviour when `specifyPlayer: false` |
|---|---|
| scoring dialog | the player screen is dropped from the flow, and no player is submitted |
| event feed | no "missing player" chip |
| server, on create (`ingestEvent`) | the actor is dropped before the insert |
| server, on edit (`applyMutation`) | clears any `actor_org_profile_id` that was set |

Both server paths matter, and for the same reason: a scorer can pick a player and *then* change
the reason to one with no individual offender. The dialog keeps the selection so switching back
restores it, but resolves the submitted actor to `null` — not simply omitting it, since on an edit
an omitted actor means "unchanged" and would leave a previously saved player in place.

There is deliberately **no outcome-level equivalent**. `Outcome.excludePlayer` existed as a declared
flag and was removed on 2026-08-18: no sport ever set it, and because the outcome screen comes
*after* the player screen it could never skip a screen — only retract an attribution the scorer had
already, correctly, made. If a sport one day needs an outcome that nullifies fault (a reversed
penalty, a rescinded card), reintroduce it deliberately rather than assuming the old flag worked.

### Custom widgets

A `CUSTOM_WIDGET` step names a component with `widgetName` and a storage key with `dataKey`. The
dialog resolves the name through `expo-app/components/sports/shared/widgets`, hands the widget its
current value and a setter, and writes whatever comes back to `eventData[dataKey]`. It never learns
what the control is for.

Rugby's only widget is `ScrumResetsCounter` writing to `scrumResets`. `dataKey` is per step rather
than per widget type, so one template can carry two widgets without them sharing state, and the
stored field name survives the widget being swapped out. An unregistered `widgetName` renders an
explicit error rather than falling back to another control — a spec asking for a stopwatch and
silently getting a counter records the wrong number.

A registry entry may also declare `summarise(value, step)`, returning a few words describing the
value for the scoring dialog's step bar, or `undefined` when there is nothing worth showing — an
untouched counter adds no noise. This keeps *reading* a widget's value the widget's business, just
as rendering it is: the step bar asks "describe this" and prints whatever comes back, so it never
learns that `scrumResets` means resets.

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
`getTriggerFor`, which returns `{ eventId, team, eventData }` so no caller can learn what to spawn
without learning whose it is. This was previously a hardcoded list of rugby template ids in the
scoring client; a spec the client has never seen can now say it.

A child's side is decided **once, when it is created**. The mutation engine never rewrites a
child's `game_participant_id` when its parent is edited — see `applyMutation`'s cascade in
`GameEventManager`.

#### What the follow-up already knows

`triggerEventData` is `eventData` the **child** opens with. A scrum awarded from a free kick is a
scrum *for a free kick*, and the chain already knows that, so:

```ts
{ id: "scrum", triggerEventId: "scrum", triggerTeam: "opponent",
  triggerEventData: { reason: "free_kick" } }
```

opens the scrum dialog with its reason already selected, and — since the reason screen is answered —
lands the scorer on the next screen instead. Prefilled values are answers, not decisions: every one
is editable before the child is saved.

It is deliberately **not** `Outcome.eventData`, which describes the event being scored and is merged
onto *it* when the outcome is chosen (`successful: true`). Rugby had the two confused: the scrum
outcomes carried `eventData: { reason: "Penalty" }`, so setting a free kick's outcome to Scrum
overwrote the free kick's own infringement reason.

The keys are ordinary `eventData` keys, so `reason`, `outcome` and `playerId` prefill their steps.
A prefilled `reason` must be an id the **child** template defines, or it resolves to nothing and the
picker opens unselected — `check_rugby_templates.ts` warns when one does not.

The same values seed the event feed's `+ Add …` pill, so re-creating a follow-up by hand records it
identically to the automatic chain.

### Reading a template in code

Every question about a template goes through `shared/src/utils/templateSteps.ts`, exported via
`@sk/shared`:

- `getOutcomes` / `findOutcome` / `hasOutcomes` — outcome definitions, normalised
- `getReasonGroups` / `getReasonOptions` / `findReason` / `hasReasons` — reason definitions, grouped
  or flattened
- `reasonRequiresPlayer(template, reasonId)` — whether to record an individual, defaulting to yes
- `getTriggerFor(template, outcomeId)` — the linked child a selection spawns, **whose side it is**
  and **what it starts with** (`{ eventId, team, eventData }`), resolving outcome-level triggers
  before the template-level one
- `findStep` / `findSteps` / `hasStep` — locate steps by type, ignoring grouping
- `getScreens(template, context?)` — the live screen layout, for the dialog only

`steps` remains a tree, and walking it directly means remembering to unwrap `GROUP` every time —
forgetting is silent, because the code finds nothing and skips its work rather than failing. No
flat step array is exported, so no caller can hold one and pass it where the grouped structure
belonged. Use these helpers rather than reading `steps` yourself.

### Applying a spec change

`eventTemplates` are stored in `sports.event_templates` in the database, so editing a seed file has
no effect until it is synced:

```sh
cd server && npx ts-node src/scripts/sync_db_rugby_templates.ts
```

`check_rugby_templates.ts` prints what is actually stored, including a warning if any step still
carries `outcomes` or `reasons` — the pre-split shape, which resolves no points and no triggers.
