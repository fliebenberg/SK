---
name: Unsaved Changes Warning
description: Enforces the `useUnsavedChanges` hook on every editing page, and the save rules that go with it — send writes with `sendAction`, never let a failed save look like a successful one, and keep the dirty flag clearable by the save it triggers.
---

# Unsaved Changes Warning

To prevent accidental data loss, all pages and components that allow users to edit data must implement the standard unsaved changes warning system.

## Core Requirement

Any component that manages form state or data modification should use the `useUnsavedChanges` hook.

## Implementation Steps

1.  **Calculate Dirty State**: Determine if the current form data differs from the original data.
    ```tsx
    const isDirty = useMemo(() => {
        // ... compare formData with initialData
    }, [formData, initialData]);
    ```

2.  **Use the Hook**: Import and call `useUnsavedChanges(isDirty)` from `@/hooks/useUnsavedChanges`.
    ```tsx
    import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

    // Inside component
    useUnsavedChanges(isDirty);
    ```

3.  **Handle Resets**: Ensure that "Cancel", "Discard", or "Save" actions correctly update or reset the dirty state.
    *   **Save**: On successful save, `isDirty` becomes false because `initialData` is updated or the component re-renders with new data. **Check that this is actually true of the save you are writing** — see the two rules below, which exist because it silently was not.
    *   **Cancel/Discard**: Explicitly reset the form data to the original state to clear the dirty flag.

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

**Prefer a state that cannot go wrong over one that recovers.** The multi-day case was fixed by making the bad state unreachable — an end date is required and seeded — not by detecting it afterwards.

## Technical Details

-   It intercepts tab/window closure, internal links, and browser back/forward buttons.
