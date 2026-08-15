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
- [ ] `SCORE-4` **`widgetName` is not dispatched on.** `CUSTOM_WIDGET` steps always render a counter, whatever `widgetName` says — the rugby spec's only widget is `ScrumResetsCounter`, so the value is currently decorative. Its value is also collected into a single `scrumResets` field on the event payload rather than one keyed per widget, so a template declaring two widgets would have them share state. Needs a widget registry keyed by `widgetName` before a second widget type lands.
- [ ] `SCORE-5` **`dependsOnReason` and `optional` are declared but unread.** `ActionStep.dependsOnReason` (used by `penalty_awarded`'s player step) and `ActionStep.optional` are honoured nowhere in expo-app — only the deprecated web client implemented skip logic. Now that the reason screen precedes the player screen, `dependsOnReason` could gate or filter the player step rather than being inert. `groupWithNext` is likewise unused and should be dropped from the model if we do not implement it.
- [x] `SCORE-7` **Editing a penalty moved its penalty kick — and the kick's points — to the wrong team.** ~~`applyMutation`'s cascade passed the parent's `gameParticipantId` down to every linked child, so correcting a penalty's reason or player rewrote the kick's participant to the offending team and `recalculateEventScores` re-attributed the 3 points with it. The cascade stripped `actorOrgProfileId` and `eventData` for exactly this reason but missed the participant. It went unnoticed because a try and its conversion share a team — only the flipped chains corrupted.~~ Resolved 2026-08-15: the cascade no longer touches `game_participant_id`. A child's side is settled when it is created and no parent edit can move it, on both the direct-update and consensus-approved paths, which share the engine.
- [x] `SCORE-8` **The team a triggered follow-up belongs to was hardcoded in the client.** ~~`DynamicScoringContext` flipped to the other team for template ids `penalty_awarded` and `free_kick` and nowhere else, so the rule was invisible to the server, and the event feed's `+ Add …` pill and its implicit-link heuristic both assumed the follow-up shared the parent's team.~~ Resolved 2026-08-15: templates declare `triggerTeam: 'same' | 'opponent'` beside `triggerEventId`, and `getTriggerFor` returns `{ eventId, team }` so no caller can learn what to spawn without learning whose it is. The feed pill was latent rather than a live bug — it fires only on template-level triggers, and rugby's only one is `try` → `conversion`, which is same-team.
- [ ] `SCORE-6` **Move `outcomes` off the step and onto the template.** *Agreed 2026-08-15 as its own session.* The server reads `steps` for exactly one reason — to resolve outcome definitions (points, `eventData`, `triggerEventId`) — and never cares about screens. If `outcomes` lived at `template.outcomes`, the server would stop traversing step structure entirely and grouping would become a purely client-side concern, which is the version where the layers stop leaking. Scope: the `EventTemplate` model, the rugby seed, every helper in [templateSteps.ts](file:///c:/Fred/Coding/SK/shared/src/utils/templateSteps.ts) that currently reaches through `OUTCOME_SELECTION`, and both clients. Note the specs are stored in `sports.event_templates`, so a shape change needs the stored JSON re-synced (for rugby, re-running `sync_db_rugby_templates.ts` is enough — it overwrites from the seed, which is the only sport seed we have).

### Shared Package & Tooling

- [x] `SHARED-1` **The `@sk/types` package holds far more than types.** ~~`shared/` contains `models/`, `constants/`, `utils/` and `types/`, but `shared/package.json` names the package `@sk/types`, so every import reads `from '@sk/types'` even when pulling in `calculateStandings` or `getScreens`.~~ Resolved 2026-08-15: renamed to `@sk/shared` across `shared/`, `server/` and `expo-app/` — imports, `server/package.json`, `expo-app/tsconfig.json` paths and the `metro.config.js` `resolveRequest` hook. **The deprecated `client/` was deliberately left on `@sk/types`** per [deprecated-client](file:///c:/Fred/Coding/SK/.agent/skills/deprecated-client/SKILL.md); it still resolves through its own `tsconfig` path mapping and its existing `node_modules/@sk/types` symlink, but a fresh `npm install` there would fail. That is accepted — see `SHARED-3` if we ever need it to build again.
- [ ] `SHARED-3` **The deprecated `client/` cannot be reinstalled from scratch.** Its `package.json` still depends on `"@sk/types": "file:../shared"`, but `shared/package.json` is now named `@sk/shared`, so `npm install` in `client/` errors on the name mismatch. It builds today only off the symlink already on disk. Not worth fixing while the folder is reference-only — the fix, if we want one, is to delete `client/` outright rather than to keep it installable.
- [ ] `SHARED-2` **No automated guard against raw `template.steps` traversal.** The defence today is design rather than tooling: `flattenSteps` is private to [templateSteps.ts](file:///c:/Fred/Coding/SK/shared/src/utils/templateSteps.ts) so no flat array can circulate, plus a JSDoc note on `ActionStep.steps`. A `no-restricted-syntax` rule banning `.steps.find(` / `.steps.some(` / `.steps.flatMap(` outside that module would catch the copy-paste path, but there is no ESLint config or lint script anywhere in the repo, so this means standing up linting first — worth folding in if we ever do, not worth doing for this rule alone.

### Organization Counts & Background Jobs
*All resolved 2026-08-14 by deriving the counts and removing the job runner — see [docs/background-tasks.md](file:///c:/Fred/Coding/SK/docs/background-tasks.md). Kept here as the record of what went wrong.*

- [x] `ORG-1` **`MembershipExpiryJob` double-subtracted `member_count`.** Its incremental decrement raced the full recompute in `refreshOrgSummary`, which had already excluded lapsed memberships, so counts drifted steadily downward.
- [x] `ORG-2` **Seed and setup scripts never initialized the counters.** They inserted teams, sites and memberships directly, leaving the columns at their `DEFAULT 0`, so any seeded or restored database was drifted from the start.
- [x] `ORG-3` **The org claim flow bypassed the refresh.** `claimOrgViaToken` inserted an admin membership and called only `invalidateCache()`, which does not recompute counts.
- [x] `ORG-4` **No systemic guarantee.** Correctness depended on every mutation path remembering to call `broadcastOrgSummaries`; a trigger could not substitute, because membership validity depends on the clock rather than on writes.
- [x] `ORG-5` **`accuracy-audit` was postponed 5 minutes on every startup**, because `membership-expiry` was registered first and still counted as running when the priority guard checked.


---
*Note: You can ask me to update this list or check off items as we complete them.*
