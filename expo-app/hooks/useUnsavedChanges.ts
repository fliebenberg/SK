import { useEffect, useCallback } from 'react';
import { useNavigation } from 'expo-router';
import { useUnsavedChangesStore } from '../store/unsavedChangesStore';

/**
 * Hook to warn users about unsaved changes when navigating away.
 *
 * - Intercepts the hardware/gesture back button via Expo Router's `beforeRemove` event.
 * - Writes dirty state to the global store so the LeftNavigationRail and mobile
 *   workspace menu can also check before performing programmatic navigation.
 *
 * @param isDirty   Whether the form currently has unsaved changes.
 * @param onDiscard Optional callback to reset the form when the user chooses to discard.
 * @returns confirmThenNavigate — call this instead of router.push/replace when you want
 *          the same confirmation before a programmatic navigation from within the page.
 */
export function useUnsavedChanges(
  isDirty: boolean,
  onDiscard?: () => void,
) {
  const navigation = useNavigation();
  const { setDirty, clear, setShowDialog, setPendingAction, triggerDiscardPrompt } = useUnsavedChangesStore();

  // Keep global store in sync
  useEffect(() => {
    setDirty(isDirty, onDiscard);
    return () => {
      clear();
    };
  }, [isDirty, onDiscard, setDirty, clear]);

  // Intercept back navigation (hardware back / swipe-back / header back button)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!useUnsavedChangesStore.getState().isDirty) return; // allow navigation if clean

      e.preventDefault(); // block the default removal

      setShowDialog(true);
      setPendingAction(() => {
        navigation.dispatch(e.data.action);
      });
    });

    return unsubscribe;
  }, [navigation, setShowDialog, setPendingAction]);

  /**
   * Use this to wrap any programmatic navigation inside the page that should
   * also respect the unsaved-changes check (e.g. a "Go to Teams" button on the page).
   */
  const confirmThenNavigate = useCallback(
    (action: () => void) => {
      triggerDiscardPrompt(action);
    },
    [triggerDiscardPrompt],
  );

  return { confirmThenNavigate };
}
