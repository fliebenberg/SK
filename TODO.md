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
- [ ] `REP-2` **Admin list UI keys off the wrong fields.** The list renders `report.reason` as the card title and sniffs it for the substrings `'Discrepancy'` / `'Audit'` to choose an icon, but `reason` only ever holds one of the four lowercase enum values — so the icon always falls through and audit rows are titled "other". Likewise the status badge only styles `resolved` / `pending`, neither of which the DB produces. Decide whether the UI should key off `entity_type` or whether the schema should carry a separate human-readable title.
- [ ] `REP-3` **The expo-app screen is a mockup.** [admin/reports.tsx](file:///c:/Fred/Coding/SK/expo-app/app/(tabs)/admin/reports.tsx) renders a hardcoded array and never calls the server, so reports are unreachable from the active client. Its metric tiles ("Audit Accuracy", "Avg Resolution"), `impact` field and pending/resolved filters have no backing data — decide which of those we actually want before wiring it up.
- [ ] `REP-4` **Reporting is only reachable for organizations.** `ReportDialog` is mounted solely on the org detail page in the deprecated client, and has no expo-app equivalent. `event` and `user` reporting exist in the types but were never built.
- [ ] `REP-5` **`getReportsForEntity` is unreachable.** Exposed on `DataManager` but routed to no socket action, so per-entity report history cannot be fetched.
- [ ] `REP-6` **`resolved_by_user_id` has no FK** to `users(id)`, unlike `reporter_user_id`. Add the constraint when the resolution workflow lands.
- [ ] `REP-7` **Moderation reports and system audits share one screen with no filter.** Audit rows accumulate one per drifting org per run and will drown real moderation items. Decide whether to split the views, filter by `entity_type`, or retain/prune audit rows on a schedule.
- [ ] `REP-8` **No dedup or rate limiting on submission.** A user can submit unlimited identical reports against the same entity. Decide the policy (one open report per user per entity, cooldown, or silent merge).


---
*Note: You can ask me to update this list or check off items as we complete them.*
