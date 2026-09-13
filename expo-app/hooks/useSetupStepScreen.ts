import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Event, SocketAction } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';
import { useEventCapabilities } from './useEventCapabilities';
import { useSafeBack } from './useSafeBack';
import { useUnsavedChangesStore } from '../store/unsavedChangesStore';
import { wsService } from '../services/websocket';
import { useAuthStore } from '../store/authStore';
import {
  SetupStepKey,
  SetupStepRoute,
  nextStepAfter,
  setupChecklistHref,
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
  const finishSave = useCallback((onDone?: () => void) => {
    setIsProcessing(false);
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
    wsService.emit('action', {
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
    });
    safeBack(checklistHref);
  }, [event, eventId, orgId, user?.id, dismissedSteps, stepKey, safeBack, checklistHref]);

  return {
    orgId,
    eventId,
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
