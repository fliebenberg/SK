---
name: Unsaved Changes Warning
description: Enforces the use of the `useUnsavedChanges` hook on all pages that allow data editing to prevent accidental data loss.
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
    *   **Save**: On successful save, the `isDirty` state will naturally become false if `initialData` is updated or the component re-renders with new data.
    *   **Cancel/Discard**: Explicitly reset the form data to the original state to clear the dirty flag.

## Technical Details

-   The system is managed globally via `NavigationGuardContext` and `NavigationGuard`.
-   It intercepts tab/window closure, internal links, and browser back/forward buttons.
-   [NavigationGuard.tsx](file:///c:/Fred/Coding/SK/client/src/components/NavigationGuard.tsx)
- [useUnsavedChanges.ts](file:///c:/Fred/Coding/SK/client/src/hooks/useUnsavedChanges.ts)
