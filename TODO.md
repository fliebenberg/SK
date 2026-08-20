# Application To-Do List

This list tracks the tasks we need to accomplish in your application.

## Pending Tasks

- [x] Automatically add the sport type to a team that is newly created when setting up a match.
- [x] Add delete button to match edit screen (only when match has already been saved and has not been played yet)
- [x] Only show match details under team events (include event name in the match details)
- [ ] Add address input to the org and venue pages
- [ ] Add the ability to make a copy of an event
- [ ] Prevent saving duplicate events (i.e. events that are exactly the same)
- [ ] Ability to select players for a match from the team view
- [ ] Consolidate Sportsday and Tournament view. Sportsday will just become one type of tournament. Based on the tournament type the details tab will change.
- [x] Add Offline indicator when the app is not connected to the server/websocket
- [ ] Implement robust email infrastructure:
    - Add email verification for new secondary email addresses.
    - Trigger Referral Scan/Notification Sync when a new email is verified.
    - Implement full password reset functionality (send reset codes to verified emails).
- [ ] Add ability to add a "Training" event type that can be scheduled to repeat
    - allow to add other teams to the same training event
    - can either add "all players" of selected teams or subset of players to attend the training (this then also allows for a roll call functionality)
- [ ] Add Venue Location (a group of Venues) e.g. "School Grounds" may have Field A, Field B and then "Sports Fields" might also have Field A, Field B
- [ ] Ensure tests never run in production environment (prevent data pollution in production database).
- [ ] Handle image deletion to make sure the number of images stored does not grow infintiely over time
- [ ] Audit and refactor all entity subscriptions (Events, Games, Sites, etc.) to use granular summary/data rooms with symmetric batch subscribe/unsubscribe utilities and automatic cleanup.
- [ ] Look at how to make widget use more general in sport scoring. `SCORE-4` gave `CUSTOM_WIDGET` a registry and a per-step `dataKey`, so a widget is now self-contained as far as the scoring dialog is concerned — but only as far as *capture*. Open questions for a session of its own: how a widget's value reaches a sport's stats screen without that screen hardcoding the key (rugby's `RugbyGameStats` still reads `scrumResets` by name); whether widgets should be able to return several fields, drive validation, or read the event in progress; and whether the registry should be per sport rather than one global map. Worth doing before a second sport needs a control rugby does not have.


## Known Issues & Tech Debt

Issues found during other work that we have deliberately parked rather than fixed on the spot —
usually because the fix depends on a design decision we have not made yet. Each carries a stable
ID so we can refer to it in conversation.

**Before starting work on a feature, scan the section(s) below that touch it** and pull in any
item that belongs in the same change. Fixing these alongside related work is cheaper than a
dedicated cleanup pass.

### Reports & Moderation
*Blocked on: how we want admin functionality to work as a whole. Feature overview: [docs/reports.md](file:///c:/Fred/Coding/SK/docs/reports.md).*

- [ ] `REP-1` **No resolution workflow.** `status` supports `open / investigating / resolved / dismissed` and the `resolved_by_user_id` / `resolved_at` columns exist, but nothing ever writes them — every report sits at the `'open'` insert default forever. Needs actions (investigate / resolve / dismiss) and a socket action to drive them.
- [ ] `REP-2` **Admin list UI keys off the wrong fields.** The list renders `report.reason` as the card title and sniffs it for the substrings `'Discrepancy'` / `'Audit'` to choose an icon, but `reason` only ever holds one of the four lowercase enum values — so the icon always falls through to the same case. Likewise the status badge only styles `resolved` / `pending`, neither of which the DB produces. Decide whether the UI should key off `entity_type` or whether the schema should carry a separate human-readable title.
- [ ] `REP-3` **The expo-app screen is a mockup.** [admin/reports.tsx](file:///c:/Fred/Coding/SK/expo-app/app/(tabs)/admin/reports.tsx) renders a hardcoded array and never calls the server, so reports are unreachable from the active client. Its metric tiles ("Audit Accuracy", "Avg Resolution"), `impact` field and pending/resolved filters have no backing data — decide which of those we actually want before wiring it up.
- [ ] `REP-4` **Reporting is only reachable for organizations.** `ReportDialog` is mounted solely on the org detail page in the deprecated client, and has no expo-app equivalent. `event` and `user` reporting exist in the types but were never built.
- [ ] `REP-5` **`getReportsForEntity` is unreachable.** Exposed on `DataManager` but routed to no socket action, so per-entity report history cannot be fetched.
- [ ] `REP-6` **`resolved_by_user_id` has no FK** to `users(id)`, unlike `reporter_user_id`. Add the constraint when the resolution workflow lands.
- [x] `REP-7` **Moderation reports and system audits share one screen with no filter.** ~~Audit rows accumulate one per drifting org per run and will drown real moderation items.~~ Resolved 2026-08-14: the audit job was removed with the counters it maintained, so the table holds moderation reports only.
- [ ] `REP-8` **No dedup or rate limiting on submission.** A user can submit unlimited identical reports against the same entity. Decide the policy (one open report per user per entity, cooldown, or silent merge).

### Live Scoring & Linked Events

- [x] `SCORE-1` **Clearing an outcome to null left its linked child event orphaned.** ~~`applyMutation`'s cascade removes a child whose `sub_type` no longer matches the new outcome's `triggerEventId`, but the check was guarded by the outcome being truthy, so clearing it back to unset skipped the guard and the child survived, still scoring.~~ Resolved 2026-08-15: the cascade now treats a cleared outcome as triggering nothing, and recognises template-level triggers (`try` → `conversion`) alongside outcome-level ones so unrelated chains are unaffected.
- [x] `SCORE-2` **The mutation engine looked up `OUTCOME_SELECTION` inconsistently.** ~~`applyMutation`'s outcome-merge and cascade blocks used `template.steps.find(...)`, missing outcome steps nested inside a `GROUP`, while the child-undo path a few lines above flattened groups first.~~ Resolved 2026-08-15: every consumer now goes through the helpers in [templateSteps.ts](file:///c:/Fred/Coding/SK/shared/src/utils/templateSteps.ts), which own the traversal. No flat step array is exported, so the "forgot to unwrap" failure mode cannot recur.
- [x] `SCORE-3` **`ActionStepType.GROUP` was ignored by expo-app.** ~~Every consumer flattened groups away and never read the group's `name`, so grouped steps rendered as separate entries in the step bar.~~ Resolved 2026-08-15: the dialog derives its screens from `getScreens(template)`, so a `GROUP` renders as one screen (scrum's resets counter now sits beside won/lost) and the legacy groups that meant nothing were removed from the rugby seed.
- [x] `SCORE-4` **`widgetName` is not dispatched on.** ~~`CUSTOM_WIDGET` steps always render a counter, whatever `widgetName` says, and collect into a single `scrumResets` field rather than one keyed per widget.~~ Resolved 2026-08-15: widgets resolve through a registry in [widgets/index.tsx](file:///c:/Fred/Coding/SK/expo-app/components/sports/shared/widgets/index.tsx), and an unregistered name renders an explicit error instead of silently falling back to a counter. Each step names its own `dataKey` (rugby's is `scrumResets`, so stored events and the stats row are unchanged), so two widgets on one template cannot share state. The dialog holds values as an opaque `Record<string, any>` and never learns what a widget is for.
- [x] `SCORE-5` **`dependsOnReason` and `optional` are declared but unread.** ~~Honoured nowhere in expo-app — only the deprecated web client implemented skip logic — and `groupWithNext` was unused everywhere.~~ Resolved 2026-08-15: `optional`, `groupWithNext` and `dependsOnReason` are all deleted. `optional` is replaced by `required` (default false), which blocks the save until answered and names what is outstanding above the footer; missing-detail chips still flag every unanswered step regardless, and no rugby step sets `required` yet. The player screen is now gated on the chosen reason's `specifyPlayer` with no flag needed, matching the server and feed, which already worked that way — so a free kick for "Too Many Players" no longer offers a roster the server would discard.
- [x] `SCORE-7` **Editing a penalty moved its penalty kick — and the kick's points — to the wrong team.** ~~`applyMutation`'s cascade passed the parent's `gameParticipantId` down to every linked child, so correcting a penalty's reason or player rewrote the kick's participant to the offending team and `recalculateEventScores` re-attributed the 3 points with it. The cascade stripped `actorOrgProfileId` and `eventData` for exactly this reason but missed the participant. It went unnoticed because a try and its conversion share a team — only the flipped chains corrupted.~~ Resolved 2026-08-15: the cascade no longer touches `game_participant_id`. A child's side is settled when it is created and no parent edit can move it, on both the direct-update and consensus-approved paths, which share the engine.
- [x] `SCORE-8` **The team a triggered follow-up belongs to was hardcoded in the client.** ~~`DynamicScoringContext` flipped to the other team for template ids `penalty_awarded` and `free_kick` and nowhere else, so the rule was invisible to the server, and the event feed's `+ Add …` pill and its implicit-link heuristic both assumed the follow-up shared the parent's team.~~ Resolved 2026-08-15: templates declare `triggerTeam: 'same' | 'opponent'` beside `triggerEventId`, and `getTriggerFor` returns `{ eventId, team }` so no caller can learn what to spawn without learning whose it is. The feed pill was latent rather than a live bug — it fires only on template-level triggers, and rugby's only one is `try` → `conversion`, which is same-team.
- [x] `SCORE-6` **Move `outcomes` off the step and onto the template.** ~~The server traversed step structure for one reason only — resolving outcome definitions — and never cared about screens.~~ Resolved 2026-08-15: `outcomes` **and** `reasons` now live at template level, and the `OUTCOME_SELECTION` / `REASON_SELECTION` steps are positional markers that carry no data. The scope grew to include `reasons` because the original note was wrong that outcomes were the server's only step read — it also called `findReason` for `specifyPlayer`, so moving outcomes alone would have left the traversal in place. `GameEventManager` now imports no step helpers at all, and grouping is purely client-side. The stored JSON was re-synced with `sync_db_rugby_templates.ts`; `check_rugby_templates.ts` warns if any step still carries the pre-split shape.

- [x] `SCORE-9` **`Outcome.excludePlayer` was only half-honoured.** ~~The deprecated client cleared the actor on commit when the chosen outcome set `excludePlayer: true`; the server never did, so nothing enforced it. expo-app read it in `getMissingDetails` to suppress the missing-player chip, which was the only live behaviour.~~ Resolved 2026-08-18 by **deleting the flag** rather than enforcing it. Git history shows `excludePlayer: true` was never set anywhere, on any branch — it had a reader and no writer, like the `optional` / `groupWithNext` / `dependsOnReason` family `SCORE-5` removed. Rugby has no case for it either: every outcome list is successful/missed, won/lost, or which-restart-was-elected, and none of those changes who is at fault. It is also structurally weaker than `specifyPlayer` — the outcome screen comes *after* the player screen, so it could only ever retract an attribution already made, never skip a screen. Removed from the `Outcome` interface and from `getMissingDetails`, which now reads `reasonRequiresPlayer` alone; the rationale is recorded in [multi_sport_architecture.md](file:///c:/Fred/Coding/SK/docs/multi_sport_architecture.md) so it is not reintroduced by reflex. If a sport ever needs an outcome that nullifies fault (a reversed penalty, a rescinded card), design it then. The deprecated `client/` still references the field and was left alone per `SHARED-3`.
- [ ] `SCORE-11` **Rugby's reason lists have never been reviewed end to end.** The `reasons` on
  `penalty_awarded`, `free_kick`, `scrum`, `yellow_card`, `red_card` and `timed_red_card` grew ad
  hoc and no one has checked them against the laws for completeness, wording, or overlap. Two
  concrete gaps found on 2026-08-15 while adding follow-up prefill: `scrum` had no reason covering
  a free kick (added as `free_kick`), and its `penalty_scrum` id reads as an implementation
  artefact next to plain ids like `knock_on`. Now that a parent's outcome can prefill a child's
  reason via `triggerEventData`, the lists are also a contract between templates — every event that
  can *award* a scrum or lineout needs a matching reason on the child, and
  `check_rugby_templates.ts` warns when one does not resolve.

  Wants a pass over each template with someone who knows the laws, deciding for each list: what is
  missing, what should be merged, and which reasons carry `specifyPlayer: false`. Renaming an
  **id** is a data migration — stored events hold the id — so decide whether existing events get
  rewritten or the old ids stay as aliases before touching any of them.

  **Groundwork done 2026-08-18:** [docs/rugby/laws-infringements.md](file:///c:/Fred/Coding/SK/docs/rugby/laws-infringements.md)
  catalogues ~130 infringements from the 2026 Laws of the Game — by phase (tackle, ruck, maul,
  scrum, lineout, restart, open play, in-goal, administration) and by sanction (penalty, free kick,
  scrum, lineout, card) — each mapped to the reason id that covers it today, or marked as a gap.
  It records 12 gaps against the seed (the maul is absent entirely; `scrum_other` and `lineout_foul`
  hide two whole laws; the dangerous-tackle reasons live only on the card templates) and 7 open
  decisions the review has to settle first, chief among them **D1: are cards their own event or an
  escalation of a penalty**, which gates how much of the catalogue gets written where. **Nothing has
  been applied to the seed.** The remaining work is the decisions plus the edit.

  Review it with `npm run review:rugby` — [scripts/rugby-review.js](file:///c:/Fred/Coding/SK/scripts/rugby-review.js)
  serves the doc as a page with a comment box per row, saving to `laws-infringements.comments.json`
  beside it.

  **Review progress — all 10 phases have a draft list (2026-08-18).** The second comment round
  covered §1.2–§1.9, and the doc's **Part 5** now runs to 5.11: a consolidated list per phase, a
  record of what was deliberately excluded, and a rollup of what each template becomes. Distinct
  *offences*: 29 on `penalty_awarded`, 14 on `free_kick` — the id counts below are higher because
  Part 6 gives each phase its own copy. The maul is covered
  without a `maul` template (gap `3.1`), `scrum_other` and `lineout_foul` are both replaced by named
  reasons (gap `3.2`), and the restart templates converge on one 8-outcome list.

  Gap `3.7` is settled without losing detail: the lineout **keeps** `not_straight` as an outcome and
  gains `short_throw`, and every outcome except `won` carries `winnerSide: "other"` — the rule being
  that anything handing the next throw to the opposition counts as a loss. The same two ids also
  appear as *reasons*, describing why the following lineout or scrum exists. That fixes a live stat
  bug on the way past: `not_straight` carries no `eventData` today, so
  [rugbyUtils.ts](file:///c:/Fred/Coding/SK/expo-app/components/sports/rugby/rugbyUtils.ts) counts it
  in `lineoutsTotal` and in neither won nor lost, depressing the success rate. Seed-only fix, no
  client change. Six law offences are deliberately unrecorded — two of them (19.22, 19.26)
  only as scrum resets, which makes the resets counter load-bearing.

  **All seven decisions answered (2026-08-18), and the doc now carries a Part 6 spec.** D1: a card
  is its **own event** with its own reason list, never a linked child of a penalty — the overlap with
  `penalty_awarded` is accepted as real, with wording kept identical across the two. D2: reasons are
  split by phase and the phase is the scorer's *first* choice; §4.1 proposes the screen — a 3×3 grid
  of phase tiles drilling into that phase's options, which is a `DynamicScoringDialog`
  `REASON_SELECTION` change only, with a fallback to today's flat chips for single-group templates.
  D3: one phase vocabulary across every template. D4: `line_kick` chains into **nothing** — a lineout
  is recorded by hand, which makes its new reason list load-bearing rather than redundant. D5:
  elections are not recorded; the next event shows what was chosen. D6: **there is nothing to
  migrate** — the ids are being chosen now, so Part 6 fixes them, including a phase prefix on every
  `penalty_awarded` / `free_kick` reason (`tackle_offside`, `ruck_offside`, …, which closes gap `3.4`
  by construction) and `penalty_scrum` → `penalty` (gap `3.10`). D7: `specifyPlayer` stays `true`
  everywhere for now; the cleanup pass comes after the list settles.

  **Four more refinements, 2026-08-19.** The penalty's Administration group is renamed **Technical**
  (matching the yellow card's), with ids `admin_` → `tech_`. Lineout reason names drop the word
  "lineout" — "Short throw", "Early jump", "Faking throw", "Leaving early" — since the group and the
  id prefix already carry the phase; that is now a stated convention, a reason never repeats its
  phase. The cards go to **one group each**. And `timed_red_card` is **deleted**: in practice a
  referee shows a yellow and signals a review, so the review lives on `yellow_card` as its outcome —
  `stands` / `under_review` / `upgraded_timed_red` / `upgraded_red` — with `red_card` gaining
  `permanent` / `timed` for a red shown directly. `under_review` is a real outcome, not an unset one,
  so "the TMO is looking at it" cannot be confused with "the scorer has not filled this in". This one
  is a **server** change as much as a seed change: see `SCORE-13`.

  **Part 6 is the edit.** `penalty_awarded` 40 reasons in 9 groups · `free_kick` 21 in 6 · `scrum` 16
  in 5 · `lineout` 7 reasons and 4 outcomes · `yellow_card` 9, `red_card` 9, `timed_red_card` 6 ·
  the three restart templates sharing one 8-outcome list.

  **Three refinements, 2026-08-19.** The tackle drops Off feet, Side entry and Croc roll — all three
  are offences by a player *arriving* (14.8a–c, 14.8e), so they move to the ruck under a clean rule:
  the tackle is the two players in it, everyone arriving is the ruck. The maul's scrum cause is
  `maul_unplayable` ("Ball unplayable") rather than a turnover, which pairs it with `ruck_unplayable`
  and drops the planned "Open Play Turnover" template rename — the clash it was solving is gone. And
  every card reason carries `specifyPlayer: true` as a **rule**, not a default: a card is given to a
  person, so the player step is never skipped, `repeated_offence` and `second_yellow` included. The
  D7 pass must not switch those off.
  §6.8 lists what has to happen with it: write the seed, re-sync with `sync_db_rugby_templates.ts`
  and run `check_rugby_templates.ts` (the prefill contract changes), **verify and reset the stored
  `game_events` before the new ids ship** — D6 rests on that being safe — add `winnerSide: "other"`
  to the lineout's non-won outcomes, build the phase picker, then the D7 pass. One open contradiction
  is left: 21.5 was excluded on the grounds that lineouts need no reason, written before they got
  one.

- [x] `SCORE-10` **The step bar no longer shows what was chosen.** ~~The deprecated client's stepper rendered the selected value under each step name — "Dangerous Tackle", "3 Resets", the player's number and name — so a scorer could see the whole event at a glance and jump straight back to the wrong one. expo-app's `Tabs` showed only `1. Infringement`.~~ Resolved 2026-08-18. `TabItem` gained an optional `sublabel`, rendered as a muted, one-line-truncated second line in both `Tabs` variants; the scoring dialog fills it from a `screenSummary(screen)` that joins each step's chosen value with `", "`.

  Three of the old client's rules came for free and one was dropped deliberately:

  - **Groups and skipped steps** needed no special case. `getScreens` already unwraps a `GROUP` and drops steps the flow skipped, so joining a screen's `steps` reproduces the old GROUP behaviour exactly.
  - **Reason and outcome** resolve through `findReason` / `findOutcome` with the same raw-id fallback `getEventLabel` uses, so a renamed option still shows *something*.
  - **Widgets** no longer hardcode `ScrumResetsCounter`. A registry entry may declare `summarise(value, step)`, returning `undefined` when the value is not worth showing — so an untouched counter stays silent and the step bar never learns what a widget means. This is the honest version the old note asked for; it is the only part of the parked widget-generality item ([Pending Tasks](#pending-tasks)) that was pulled in.
  - **`displayOverride` is deliberately not used.** The outcome's plain `name` is shown instead. The override exists to make the *feed headline* read well — rugby sets it to `""` for a successful conversion so the card reads "CONVERSION" alone — and reusing it here would have blanked the tab for the button the scorer had just tapped.

  Step-name defaults were already correct in expo-app (`stepLabel`), so only the value line was missing. The old client's 10px/9px sizing is approximated by the design system's `text-xs` / `text-[9px]`.

- [x] `SCORE-12` **The event card printed the raw reason id.** ~~The card's sub-line rendered `eventData.reason.replace(/^(General|Set Piece) - /i, '')` — a leftover from when reasons were stored as display strings like `"General - Knock On"`. Reasons have been snake_case ids since, so the regex stripped nothing and the card read "Reason: early_push", while the title on the same card resolved the same reason properly through `getEventLabel`. On `free_kick`, whose `displayPattern` is `{name} → {reason}`, both appeared at once.~~ Found and fixed 2026-08-18 alongside `SCORE-10`, which needed the same id→name resolution: [EventLogFeed.tsx](file:///c:/Fred/Coding/SK/expo-app/components/sports/shared/EventLogFeed.tsx) now goes through `findReason` and the dead regex is gone.

### Shared Package & Tooling

- [x] `SHARED-1` **The `@sk/types` package holds far more than types.** ~~`shared/` contains `models/`, `constants/`, `utils/` and `types/`, but `shared/package.json` names the package `@sk/types`, so every import reads `from '@sk/types'` even when pulling in `calculateStandings` or `getScreens`.~~ Resolved 2026-08-15: renamed to `@sk/shared` across `shared/`, `server/` and `expo-app/` — imports, `server/package.json`, `expo-app/tsconfig.json` paths and the `metro.config.js` `resolveRequest` hook. **The deprecated `client/` was deliberately left on `@sk/types`** per [deprecated-client](file:///c:/Fred/Coding/SK/.agent/skills/deprecated-client/SKILL.md); it still resolves through its own `tsconfig` path mapping and its existing `node_modules/@sk/types` symlink, but a fresh `npm install` there would fail. That is accepted — see `SHARED-3` if we ever need it to build again.
- [ ] `SCORE-13` **The sin bin is written once and never corrected.**
  [GameEventManager.ts](file:///c:/Fred/Coding/SK/server/src/managers/GameEventManager.ts) appends a
  `live_state.sinBins` entry when a card event is created and removes it when the event is removed,
  and nothing in between rewrites it — so editing a card leaves the entry stale. It is latent today
  because nothing can change what a card *means*: `type` and `durationMS` are derived from the
  `subType`, which an edit cannot alter. `SCORE-11`'s Part 6 makes it live, because it moves the
  yellow/20-minute-red distinction onto the card's **outcome** so a yellow can be upgraded after a
  TMO review — and without an update path the scoreboard would keep counting down 10 minutes for a
  player who is off for 20 or for good. The fix is to re-derive the entry (`type`, `durationMS`,
  keeping the original `awardedAtMS`) wherever a card event is mutated, on both the direct-update and
  consensus-approved paths, which already share the engine.

  Two smaller things in the same code, found 2026-08-19 while checking this:

  - `sinBinEntry.playerId` is set to `data.gameParticipantId` — the *team's* participant row, the
    same value `teamId` is derived from — not the carded player, who is `actorOrgProfileId`. The
    `SinBin` interface in [Game.ts](file:///c:/Fred/Coding/SK/shared/src/models/event/Game.ts)
    documents it as the player. Latent: `SinBinBadge` renders only the clock and the colour, so
    nothing reads the wrong value yet. Worth fixing when the badge learns to show who is off.
  - The three `subType === 'timed_red_card'` guards (plus the duration test) all disappear with the
    template, so this is the moment to collapse the card checks into one helper rather than four
    copies of the same three-way `||`.

- [ ] `SHARED-3` **The deprecated `client/` cannot be reinstalled from scratch.** Its `package.json` still depends on `"@sk/types": "file:../shared"`, but `shared/package.json` is now named `@sk/shared`, so `npm install` in `client/` errors on the name mismatch. It builds today only off the symlink already on disk. Not worth fixing while the folder is reference-only — the fix, if we want one, is to delete `client/` outright rather than to keep it installable. Second reason to delete it, 2026-08-15: `SCORE-6` moved `outcomes` and `reasons` to template level and re-synced the stored specs, and `client/` still reads them off the step — so it now finds no outcomes or reasons for any rugby template. Agreed at the time to leave it broken rather than update a folder we intend to remove.
- [ ] `SHARED-2` **No automated guard against raw `template.steps` traversal.** The defence today is design rather than tooling: `flattenSteps` is private to [templateSteps.ts](file:///c:/Fred/Coding/SK/shared/src/utils/templateSteps.ts) so no flat array can circulate, plus a JSDoc note on `ActionStep.steps`. Narrowed 2026-08-15 by `SCORE-6`: with `outcomes` and `reasons` on the template, walking `steps` can no longer give a wrong answer about what an event *means* — the remaining risk is only screen layout, and `getScreens` is the sole legitimate reason to traverse. A `no-restricted-syntax` rule banning `.steps.find(` / `.steps.some(` / `.steps.flatMap(` outside that module would still catch the copy-paste path, but there is no ESLint config or lint script anywhere in the repo, so this means standing up linting first — worth folding in if we ever do, not worth doing for this rule alone.

### Organization Counts & Background Jobs
*All resolved 2026-08-14 by deriving the counts and removing the job runner — see [docs/background-tasks.md](file:///c:/Fred/Coding/SK/docs/background-tasks.md). Kept here as the record of what went wrong.*

- [x] `ORG-1` **`MembershipExpiryJob` double-subtracted `member_count`.** Its incremental decrement raced the full recompute in `refreshOrgSummary`, which had already excluded lapsed memberships, so counts drifted steadily downward.
- [x] `ORG-2` **Seed and setup scripts never initialized the counters.** They inserted teams, sites and memberships directly, leaving the columns at their `DEFAULT 0`, so any seeded or restored database was drifted from the start.
- [x] `ORG-3` **The org claim flow bypassed the refresh.** `claimOrgViaToken` inserted an admin membership and called only `invalidateCache()`, which does not recompute counts.
- [x] `ORG-4` **No systemic guarantee.** Correctness depended on every mutation path remembering to call `broadcastOrgSummaries`; a trigger could not substitute, because membership validity depends on the clock rather than on writes.
- [x] `ORG-5` **`accuracy-audit` was postponed 5 minutes on every startup**, because `membership-expiry` was registered first and still counted as running when the priority guard checked.


---
*Note: You can ask me to update this list or check off items as we complete them.*
