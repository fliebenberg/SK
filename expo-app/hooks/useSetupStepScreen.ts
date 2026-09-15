import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActionResponse, Event, SocketAction } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';
import { useEventCapabilities } from './useEventCapabilities';
import { useSafeBack } from './useSafeBack';
import { useUnsavedChangesStore } from '../store/unsavedChangesStore';
import { useToastStore } from '../store/toastStore';
import { reportActionError } from '../utils/actionErrors';
import { wsService } from '../services/websocket';
import { useAuthStore } from '../store/authStore';
import {
  SetupStepKey,
  SetupStepRoute,
  nextStepAfter,
  setupChecklistHref,
  stepByKey,
} from '../components/tournament/setupSteps';

/**
 * What every tournament setup step screen needs, and nothing a particular one needs (U48).
 *
 * The five step screens share the same frame — the event, whether this viewer may edit it, which
 * steps have been put away, where *back* goes and where *next* goes — and differ entirely in what
 * they put between the header and the footer. That frame is here so a new step is a form and a
 * save rather than a hundred lines of the same wiring.
 *
 * **It deliberately does not own the dirty state or the save.** Those are the two things each
 * screen genuinely differs on: Basics writes two actions against two tables, Scoring writes a
 * settings object with a confirmation token, Fixtures writes nothing at all. A hook that tried to
 * generalise them would take more configuration than it replaced. Each screen computes its own
 * `isDirty`, calls `useUnsavedChanges` itself, and hands the result to `finishSave`.
 *
 * Joining `event:{id}` here rather than in each screen is free: `subscribeToRoom` is ref-counted,
 * so a step screen pushed over the event screen reuses the join the event screen already holds and
 * has the buffered messages replayed into its own reducer (`LIVE-9`).
 */
export function useSetupStepScreen(stepKey: SetupStepKey) {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const user = useAuthStore((state: any) => state.user);

  const eventRoom = eventId ? `event:${eventId}` : null;
  const { items, isLoading, accessDenied } = useLiveRoom<Event>(eventRoom, {
    reduce: (message) => {
      switch (message.type) {
        case 'EVENT_ADDED':
        case 'EVENT_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'EVENT_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });
  const event = items.find(e => e?.id === eventId) || null;

  const { capabilities, isLoading: isLoadingCapabilities } = useEventCapabilities(eventId);
  const canEdit = !!capabilities?.canEditEvent;

  const [isProcessing, setIsProcessing] = useState(false);

  const dismissedSteps: string[] = event?.settings?.dismissedSetupSteps || [];
  const nextStep = nextStepAfter(stepKey, dismissedSteps);

  const checklistHref = setupChecklistHref(orgId, eventId);

  /**
   * Back to the checklist, or on to a named step.
   *
   * `safeBack` for the checklist so a refresh or a deep link onto a step screen still has
   * somewhere to go — there is no history entry to pop in either case, and `?tab=setup` is what
   * makes the event screen come up on the right tab rather than on Schedule.
   */
  const goBackToChecklist = useCallback(
    (step?: SetupStepRoute) => {
      if (step) router.replace(step.href(orgId, eventId) as any);
      else safeBack(checklistHref);
    },
    [router, safeBack, checklistHref, orgId, eventId]
  );

  /**
   * Clear the processing flag and the global dirty state, then do whatever the caller wanted next.
   *
   * The `clear()` is not optional: the store keeps the screen's dirty flag until something says
   * otherwise, so without it a save followed by a navigation still raises the discard dialog.
   */
  /**
   * What happens after a write comes back — **including when it did not work**.
   *
   * Every action is answered `{ status, message }`, and until 2026-09-15 this ignored the argument
   * entirely: a rejected write cleared the processing state, cleared the unsaved-changes store and
   * navigated on exactly as a successful one did. The only trace was the floating save bar staying
   * up, because `visible={isDirty}` is computed from data the server never changed — so a save that
   * failed and a screen reading the wrong room looked *identical* from the outside, which is what
   * made `LIVE-X1`'s sibling bug slow to find.
   *
   * On an error the screen therefore keeps its edits, keeps its dirty state, says what went wrong,
   * and **does not run `onDone`** — the caller passes navigation in there, and walking away from
   * changes that were not saved is the one thing that must not happen.
   */
  const finishSave = useCallback((response?: ActionResponse, onDone?: () => void) => {
    setIsProcessing(false);
    if (response?.status === 'error') {
      useToastStore
        .getState()
        .showError(response.message || 'That change could not be saved. Please try again.');
      return;
    }
    useUnsavedChangesStore.getState().clear();
    onDone?.();
  }, []);

  /**
   * Put this step away, and go back — a dismissed step has nothing left to show.
   *
   * `settings` is spread because `UPDATE_EVENT` replaces that column rather than merging into it,
   * so writing the bare key would drop the event's scoring system.
   */
  const dismissStep = useCallback(() => {
    if (!event) return;
    useUnsavedChangesStore.getState().clear();
    wsService.emit(
      'action',
      {
        type: SocketAction.UPDATE_EVENT,
        payload: {
          id: eventId,
          userId: user?.id,
          orgId,
          data: {
            settings: {
              ...(event.settings || {}),
              dismissedSetupSteps: [...dismissedSteps, stepKey],
            },
          },
        },
      },
      /* Navigation happens either way — the organiser asked to leave this step. What the report
         prevents is the step quietly reappearing on the checklist with no explanation. */
      (response: any) => reportActionError(response, 'That step could not be put away.')
    );
    safeBack(checklistHref);
  }, [event, eventId, orgId, user?.id, dismissedSteps, stepKey, safeBack, checklistHref]);

  return {
    orgId,
    eventId,
    /** What this step is called and where it routes — the one place a step is named. */
    step: stepByKey(stepKey),
    event,
    eventRoom,
    isLoading,
    accessDenied,
    capabilities,
    isLoadingCapabilities,
    canEdit,
    isProcessing,
    setIsProcessing,
    dismissedSteps,
    nextStep,
    goBackToChecklist,
    finishSave,
    dismissStep,
  };
}
