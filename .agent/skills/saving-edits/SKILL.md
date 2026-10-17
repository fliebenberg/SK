---
name: Saving Edits
description: How an editing screen saves and guards unsaved work — which of the app's three save patterns to use and the guard each one gets (EditDialog's isDirty, nothing, or the useUnsavedChanges hook), plus the rules every save follows: send writes with `sendAction`, never let a failed save look like a successful one, keep the dirty flag clearable by the save it triggers, and measure dirtiness against a baseline.
---

# Saving Edits

Nobody should lose work they typed by leaving a screen, closing a dialog or closing the tab — and
nobody should be told work is saved when it is not. How a screen guards its edits depends on how it
saves them, and the app saves in three ways.

## Pick the save pattern first

The design rules decide which one a screen uses — [design_system.md](file:///c:/Fred/Coding/SK/okf/design_system.md),
*Read-first record pages* (rules 1 and 10) and *Saving an edited record*. The guard follows from it:

| The screen | How it saves | Guarding unsaved edits |
|---|---|---|
| **A read-first page** — values as text, one card per group | Each card's Edit opens an [`<EditDialog>`](file:///c:/Fred/Coding/SK/expo-app/components/EditDialog.tsx) that saves only that card's fields | Pass `isDirty` to the dialog. Closing asks *Discard your changes?* inside it, and on web so does closing the tab. **Do not** call `useUnsavedChanges` — the page itself is never dirty. |
| **A switch or chip that saves when pressed** (a settings row) | One write per press | None: there is nothing unsaved to lose. Ask first if the change is far-reaching. |
| **A whole-page form** — lineup selection, a tournament organisation's teams, league and season settings, people import | [`<FloatingSaveBar>`](file:///c:/Fred/Coding/SK/expo-app/components/FloatingSaveBar.tsx) with Cancel and Save | [`useUnsavedChanges`](file:///c:/Fred/Coding/SK/expo-app/hooks/useUnsavedChanges.ts), as below. |

Most new editing belongs in the first row. A whole-page form is for work that has to be edited as
one piece — a lineup — not a default.

## A whole-page form: `useUnsavedChanges`

```tsx
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '@/store/unsavedChangesStore';

const { confirmThenNavigate } = useUnsavedChanges(isDirty && !isSaving, handleCancel);
```

-   **`(isDirty, onDiscard)`.** `onDiscard` is the same reset Cancel runs: choosing *Discard* in the
    leave dialog runs it, so a screen that warns can also let go. Pass a stable callback.
-   **`&& !isSaving`.** While a save is in flight the screen is not dirty, so a save that ends in a
    navigation does not raise the dialog over itself.
-   **`confirmThenNavigate(() => router.push(…))`** for any navigation the page starts itself (a
    button, a link). Back, swipe-back and the header back are caught by the hook's `beforeRemove`
    listener; the side rail and the mobile workspace menu read the shared store. On web the hook
    also asks before the tab is closed or reloaded.
-   **On a successful save, call `useUnsavedChangesStore.getState().clear()`.** The store follows
    `isDirty` only when `isDirty` changes, and the form usually stays dirty until the saved record
    comes back through its room — a render or more later. Without `clear()` the next navigation
    raises a discard dialog over changes already written. Removing the record (and leaving) clears
    it too.
-   The dialog itself is rendered once, in [app/_layout.tsx](file:///c:/Fred/Coding/SK/expo-app/app/_layout.tsx),
    backed by [unsavedChangesStore](file:///c:/Fred/Coding/SK/expo-app/store/unsavedChangesStore.ts).
    Do not render another.
-   **Cancel** resets the drafts to the baseline, which clears the dirty flag.

## A save that failed must never look like one that worked

Send every write with [`sendAction`](file:///c:/Fred/Coding/SK/expo-app/services/actions.ts) — the
full rule is the [action-replies skill](file:///c:/Fred/Coding/SK/.agent/skills/action-replies/SKILL.md).
It resolves to `{ ok: true, data }` or `{ ok: false, message }`, treats no reply at all (a timeout,
being offline) as a failure, and has already announced the failure by the time you see it.

**On failure: keep the edits, keep the dirty state, and do not run the success path.** Above all do
not navigate away: callers routinely pass navigation into the "done" callback, and leaving the
screen discards work the user believes is saved.

```tsx
sendAction(SocketAction.UPDATE_THING, payload).then(result => {
  setIsProcessing(false);
  if (!result.ok) return;          // already toasted; no clear, no navigate
  clearDirtyState();
  onDone?.();
});
```

**A screen with two writes** stops at the first failure and says which one failed. Only one of the
writes owns the dirty state and the navigation.

## The dirty flag must be clearable by the save it triggers

A save bar rendered on `isDirty` computed from server data can only come down if the write actually changes that data. Two ways that quietly fails, both found on one screen in one week:

*   **A term the write does not send.** A "runs over more than one day" switch made the form dirty, but with no end date the save wrote `endDate: null` over a column that was already null. Nothing changed, the re-seed effect never re-ran, and the bar could not be dismissed however many times Save was pressed.
*   **A baseline from a room the screen is not subscribed to.** The facilities comparison read a room the sync is not published to, so the baseline could never refresh — and because the save genuinely succeeded, it looked exactly like a failing write.

**When you add a term to a dirty check, ask two questions**: which write clears it, and which room refreshes the value it compares against. If either answer is "none", the form can become permanently dirty.

## Never measure dirtiness against live data

A third way it fails, and the one that bites hardest on a screen two people have open. Comparing the drafts to the **live record** — `editName !== event.name` — and re-seeding them in an effect keyed on that record looks equivalent to keeping a baseline, and is not. The record moves under an open form, and it moves one render before the effect that follows it:

*   **The save bar flashes on every other viewer.** For that one frame the new record sits beside the old drafts, and the form declares itself dirty. Reported on the division screen: editing a name on one device made a button blink on another.
*   **An edit in progress is silently discarded.** An unconditional re-seed throws away a half-typed value whenever *any* field of the record changes elsewhere — the loss this whole skill exists to prevent, arriving through the back door rather than through navigation.

**Keep a baseline: the values the drafts were last seeded from.** Dirtiness is drafts-against-baseline, and the two move together in one batch, so no frame can exist in which they disagree. [`reseedDecision`](file:///c:/Fred/Coding/SK/shared/src/utils/liveForm.ts) decides what an incoming record means — `adopt` when the form is clean or the change is this device's own save landing back, `keep` when somebody is mid-edit, `unchanged` when nothing moved (return before writing state, or the effect feeds itself).

**The baseline and the drafts move together or not at all.** Guarding only one is the same bug wearing the other face: a screen that kept the typed form but took the incoming baseline did not *lose* the typing, it corrupted the comparison — so a remote change that happened to match what was being typed dropped the save bar over work that was never saved, and Cancel restored to a version the user had never seen. Whenever you find one of these, look for the screen's *other* save bar: a screen with two subjects needs two baselines, and finding one is not finding the other.

**To enumerate the screens this applies to, grep the `useUnsavedChanges(` call sites**, not the names of the dirty flags. A sweep that grepped `isDirty|hasChanges` missed `hasLeagueChanges`, `hasSettingsChanges` and `hasDetailsChanges` — three of the four screens that actually had the defect.

Two details worth copying rather than rediscovering. **Compare the fields the user edits, not derived ones** — the division screen's automatic name is numbered against its siblings, so renaming a *different* division changed it and would have reported this form dirty. And **a different subject is a different form**: express that as "no baseline" inside the same effect, because a second effect clearing it runs afterwards and leaves the drafts a render behind. Scope the baseline to that subject (`{eventId, key}`, not a bare key) — an unscoped one carries across a navigation whenever two records happen to hold the same value, which for a set of chosen ids includes the common case of both holding none.

**A handler registered once must read the drafts through a ref.** Room subscriptions are set up in an effect that does not depend on the form state, so a closure there answers "was anything typed when I was set up" — which is the opposite of the question. Keep `ref.current` in step on every render and read that.

**Prefer a state that cannot go wrong over one that recovers.** The multi-day case was fixed by making the bad state unreachable — an end date is required and seeded — not by detecting it afterwards.

