# Rugby Events

This document details all the game events (types and subtypes) that are logged during a Rugby match, along with their associated data structures. Every event records the core information (like `gameId`, `participantId`, `initiatorOrgProfileId`, etc.), but the `type`, `subType`, and `eventData` structures vary uniquely as defined below.

For *why* an event was awarded rather than what it stores, see
[laws-infringements.md](file:///c:/Fred/Coding/SK/docs/rugby/laws-infringements.md) — a catalogue of
the infringements in the Laws of the Game and the sanction each carries, written as the reference
for the `SCORE-11` review of the `reasons` lists.

## Control room sections

Every template names a `section`, and the control room stacks one panel per section in this order:

| `section` | Panel badge | Templates |
| --- | --- | --- |
| `Scoring` | Scoring Events | `try`, `penalty_try`, `penalty_kick`, `drop_goal` (`conversion` is spawned by a try, never tapped) |
| `Game Events` | Game Events | `kickoff`, `dropout_22m`, `dropout_goalline`, `scrum`, `lineout`, `line_kick` |
| `Infringements` | Infringement Events | `penalty_awarded`, `free_kick`, `yellow_card`, `red_card` |
| `Stats` | Stats Events | `knock_on`, `turnover`, `tackle_made`, `tackle_missed` |

**The split is by whose button you press.** Everything in Infringements is recorded against the
*offending* team; everything in Game Events is recorded for the team taking the restart or set
piece. Keeping one rule per panel is what the grouping is for — `line_kick` stays with the
restarts even though a penalty or free kick can trigger it, because the team kicking to touch is
the one it is recorded for.

The key and the badge are allowed to differ, and `Scoring` is why: it is not only a grouping, it is
what marks an event as affecting the score — `DynamicScoringContext` and `getEventLabel` both read
`section === 'Scoring'` — so it keeps its name while its badge reads "Scoring Events". The other
three are grouping alone. Section membership is a **display** decision and nothing else: it does
not change an event's `type`, its points, or what it triggers.

## Linked events

Some events spawn a follow-up event that carries `linkedEventId` pointing back at its parent. A
parent declares the follow-up in one of two ways in the sport spec:

* **Template-level `triggerEventId`** — the follow-up always applies, e.g. `try` → `conversion`.
* **Outcome-level `triggerEventId`** — the follow-up depends on which outcome was chosen, e.g.
  `penalty_awarded` → `penalty_kick` / `line_kick` / `scrum`, while `tap_go` spawns nothing.

**Whose event it is.** `triggerTeam` accompanies `triggerEventId` and is `same` unless the spec says
otherwise. `penalty_awarded` and `free_kick` are recorded **against the offending team**, so their
`penalty_kick`, `line_kick` and `scrum` outcomes are marked `opponent` and the follow-up is logged
for the other team. A conversion stays with the team that scored the try.

The child's side is fixed when it is created. Editing the parent afterwards — its reason, its
player, even its outcome — never moves the child to another team.

**What it starts with.** `triggerEventData` on the outcome is `eventData` the child opens with, so
the scorer is not asked something the chain has already answered. Rugby uses it for one thing today:
a scrum awarded by `penalty_awarded` opens with reason `penalty_scrum` ("Penalty"), and one awarded
by `free_kick` with reason `free_kick` ("Free Kick"). The scrum dialog therefore opens on its
outcome screen with the reason already selected — and still editable. Note this is the *child's*
reason; the penalty or free kick keeps the infringement the scorer picked for it.

**Creation.** The client opens the follow-up dialog only when the parent's outcome is being set for
the first time or is actually changing. Editing an unrelated field (the reason, the player) on an
event whose outcome already stands does not re-open it. To re-create a follow-up that was removed,
use the `+ Add …` action on the parent in the event feed.

**Removal.** When a parent is mutated, the mutation engine re-checks every child against the
parent's current trigger. A child whose `subType` is no longer triggered is marked
`eventData.status = 'REMOVED'` in the same mutation — this covers both switching to a different
outcome and clearing the outcome back to unset. Scores are then re-derived from the earliest
affected sequence, so the removed child's points drop out automatically.

**Consensus.** Nothing is written until the change is authorised. Inside the undo window the
event's creator applies it directly; otherwise it goes to a vote and the proposed change waits in
`game_disputes.update_data`. The parent edit and its child removals apply together on approval, and
on rejection neither is applied — so there is no partial state to roll back.

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

---

## Game Action Events (type: `GAME_EVENT`)

These events track specific actions and infringements during the match. The reason and outcome
**ids** below are the contract — the stored event holds the id, and the display name is resolved
from the template. The full list, and the reasoning behind it, is
[laws-infringements.md](file:///c:/Fred/Coding/SK/docs/rugby/laws-infringements.md) Part 6.

**Reasons are grouped by phase, and every id carries its phase.** `penalty_awarded` and `free_kick`
share one vocabulary — Tackle · Ruck · Scrum · Lineout · Maul · Open Play · Restart · In-goal ·
Technical — and a reason id is prefixed with the phase it belongs to (`tackle_offside`,
`ruck_offside`, `scrum_offside`). Five phases have an "Offside"; the prefix is what keeps them
apart in the data, and it means a stored event still says which phase it happened in even if the
picker is regrouped later. Every reason sets `specifyPlayer: true` for now.

### Penalty Awarded
* **subType:** `penalty_awarded`
* **Reasons:** 40 across 9 phase groups, e.g. `tackle_dangerous`, `ruck_illegal_entry`,
  `scrum_illegal_binding`, `lineout_contact`, `maul_obstruction`, `open_professional_foul`,
  `tech_not_10m_back`.
* **Outcomes:** `penalty_kick` · `line_kick` · `scrum` · `tap_go`. The first three are recorded for
  the **opponent** (`triggerTeam: "opponent"`); `scrum` prefills the child's reason as `penalty`.
* **Event Data:** `reason`, `outcome`.

### Free Kick Awarded
* **subType:** `free_kick`
* **Reasons:** 21 across 6 phase groups, e.g. `scrum_illegal_feed`, `lineout_early_jump`,
  `open_mark`.
* **Outcomes:** `scrum` (prefills the child's reason as `free_kick`) · `line_kick` · `tap_go`.
* **Event Data:** `reason`, `outcome`.

### Scrum
* **subType:** `scrum`
* **Reasons:** 16 — what put the scrum on the field: `knock_on`, `forward_pass`,
  `accidental_offside`, `ruck_unplayable`, `maul_unplayable`, `lineout_not_straight`,
  `lineout_short_throw`, `lineout_quick_throw`, `held_up`, `carried_back`, `dead_ball`,
  `restart_offence`, `tech_offside`, `tech_other`, and the two prefilled ones, `penalty` and
  `free_kick`.
* **Outcomes:** `won` · `lost`.
* **Event Data:** `reason`, `outcome`, `scrumResets` (from the `ScrumResetsCounter` widget).

### Lineout
* **subType:** `lineout`
* **Reasons:** `out` · `penalty` · `free_kick` · `restart_offence` · `not_straight` ·
  `short_throw` · `quick_throw`. Nothing prefills them — `line_kick` deliberately chains into
  nothing, so a lineout is recorded by hand.
* **Outcomes:** `won` (`winnerSide: "same"`) · `lost` · `not_straight` · `short_throw`. **Every
  outcome except `won` carries `winnerSide: "other"`**: anything that hands the next throw to the
  opposition counts as a loss, which is what the `lineoutsWon` stat reads.
* **Event Data:** `reason`, `outcome`, `winnerSide`.

### Kick-off and drop-outs
* **subTypes:** `kickoff`, `dropout_22m`, `dropout_goalline`
* **Outcomes (one shared list):** `successful` · `directly_out` · `too_short` · `too_long` ·
  `not_a_drop` · `wrong_place` · `in_front_of_ball` · `other`.
* **Event Data:** `outcome`, `successful`.

### Cards
* **subTypes:** `yellow_card`, `red_card`. There is no `timed_red_card` template: the 20-minute red
  is an **outcome**, not a third card.
* **Reasons:** one group each, 9 apiece. A card is always attributed to a player, so every reason
  sets `specifyPlayer: true` — `repeated_offence` included, where the offence is the team's but the
  card goes to somebody.
* **`yellow_card` outcomes:** `stands` · `under_review` · `upgraded_timed_red` · `upgraded_red`.
  This is how a 20-minute red actually happens: the referee shows a yellow and signals a review, and
  the TMO confirms or upgrades it. `under_review` is a real outcome rather than an unset one, so
  "the TMO is looking at it" cannot be confused with "the scorer has not answered yet".
* **`red_card` outcomes:** `permanent` · `timed`, for a red shown directly.
* **Event Data:** `reason`, `outcome`, `actorOrgProfileId` (the carded player).

**Cards and `live_state.sinBins`.** A card event writes an entry holding its `type`
(`yellow` | `red`) and `durationMS` (`0` meaning permanent), and the scoreboard counts it down.
Both values are derived from the card's **outcome**, not its subType — an upgraded yellow is a red
serving 20 minutes or gone for good. `allowTimedRedCard` is `true` in the rugby defaults, so a
20-minute red serves `redCardDurationMS`; a competition that sets it `false` degrades one to a
permanent red instead. Because the outcome can change after the fact, `GameEventManager.syncSinBin` re-derives
the entry on every card mutation as well as on creation, preserving the original `awardedAtMS` so an
edit never restarts a clock the player is already serving.

### Miscellaneous Actions
* **subTypes:** `knock_on`, `turnover` ("Turnover Won"), `tackle_made`, `tackle_missed`,
  `line_kick`, `replacement`
* **Event Data:** Varies by event (e.g. `playerOffId`/`playerOnId` for replacements).
* **No outcome on the counting stats.** `knock_on`, `turnover`, `tackle_made` and `tackle_missed`
  record a player and nothing else: the event happening *is* the whole fact, so they define no
  `outcomes` and carry no `OUTCOME_SELECTION` step. They used to offer a single "Confirmed"
  outcome, which was a screen with one button that answered nothing. `line_kick` keeps its
  `out` / `stayed_in` outcomes, which do distinguish two real results.
