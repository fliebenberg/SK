import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Event, Facility, Site, SocketAction, TournamentOrganizer } from '@sk/shared';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import CustomSelect from '../../../../../../components/CustomSelect';
import DatePicker from '../../../../../../components/DatePicker';
import { FloatingSaveBar, FLOATING_SAVE_BAR_PADDING } from '../../../../../../components/FloatingSaveBar';
import { OrganizerPicker } from '../../../../../../components/OrganizerPicker';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { FacilityPicker } from '../../../../../../components/tournament/FacilityPicker';
import { SetupStepFooter } from '../../../../../../components/tournament/SetupStepFooter';
import { useSetupStepScreen } from '../../../../../../hooks/useSetupStepScreen';
import { useUnsavedChanges } from '../../../../../../hooks/useUnsavedChanges';
import { useLiveRoom } from '../../../../../../hooks/useLiveRoom';
import { wsService } from '../../../../../../services/websocket';
import { useWsStore } from '../../../../../../store/wsStore';
import { useAuthStore } from '../../../../../../store/authStore';
import { useActiveTheme } from '../../../../../../store/settingsStore';
import { COLORS, getThemeColor } from '../../../../../../constants/Colors';

/**
 * What the tournament is, when it is, and where (U48).
 *
 * The first step, and the only one that is never dismissible: a tournament with no name and no
 * date is not a tournament. It carries the identity the events list shows, the **base site** and
 * the **set of facilities** — two different questions (U47) — and who is appointed to run it
 * (D33), because who runs it is known at the same time as the name and the dates.
 *
 * A division's own convenor and its own facilities are set on the division screen; this screen
 * never reaches into one.
 */
export default function SetupBasics() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);
  const user = useAuthStore((state: any) => state.user);

  const {
    step,
    event,
    eventRoom,
    canEdit,
    isLoadingCapabilities,
    accessDenied,
    isProcessing,
    setIsProcessing,
    dismissedSteps,
    goBackToChecklist,
    nextStep,
    finishSave,
  } = useSetupStepScreen('basics');

  const { items: sites } = useLiveRoom<Site>(orgId ? `org:${orgId}:sites` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'SITES_SYNC':
          return { kind: 'replace', items: message.data || [] };
        case 'SITE_ADDED':
        case 'SITE_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'SITE_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  const { items: facilities } = useLiveRoom<Facility>(orgId ? `org:${orgId}:facilities` : null, {
    reduce: (message) => {
      switch (message.type) {
        case 'FACILITIES_SYNC':
          return { kind: 'replace', items: message.data || [] };
        case 'FACILITY_ADDED':
        case 'FACILITY_UPDATED':
          return { kind: 'upsert', item: message.data };
        case 'FACILITY_DELETED':
          return { kind: 'remove', id: message.data?.id };
        default:
          return { kind: 'ignore' };
      }
    },
  });

  /**
   * The facilities in play (U47) — a set, and the base site beside it is not a filter on it.
   *
   * Held as `{ id }` rows because that is the shape `useLiveRoom` addresses items by; the ids are
   * what every consumer wants, which is what `savedFacilityIds` unwraps.
   */
  const { items: eventFacilityRows } = useLiveRoom<{ id: string }>(eventRoom, {
    reduce: (message) =>
      message.type === 'EVENT_FACILITIES_SYNC'
        ? { kind: 'replace', items: (message.data?.facilityIds || []).map((id: string) => ({ id })) }
        : { kind: 'ignore' },
  });

  const [editName, setEditName] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [editEndDate, setEditEndDate] = useState('');
  /** Where the tournament is *based* (U47). Shown on the listing, and the first venue the facility
   *  picker offers — never a limit on which facilities may be used. */
  const [editSiteId, setEditSiteId] = useState('');
  const [editFacilityIds, setEditFacilityIds] = useState<string[]>([]);
  const [organizers, setOrganizers] = useState<TournamentOrganizer[]>([]);

  useEffect(() => {
    if (!event) return;
    setEditName(event.name);
    setEditStartDate(event.startDate?.split('T')[0] || '');
    setIsMultiDay(!!event.endDate);
    setEditEndDate(event.endDate?.split('T')[0] || '');
    setEditSiteId(event.siteId || '');
  }, [event?.id, event?.name, event?.startDate, event?.endDate, event?.siteId]);

  /**
   * The facilities come from their own room message rather than from the event, so they seed on
   * their own — keyed on the ids themselves, so a re-publish that changes nothing does not stamp
   * on an organiser's unsaved selection.
   */
  const savedFacilityIds = useMemo(() => eventFacilityRows.map(row => row.id), [eventFacilityRows]);
  const savedFacilityKey = [...savedFacilityIds].sort().join();
  useEffect(() => {
    setEditFacilityIds(savedFacilityIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, savedFacilityKey]);

  useEffect(() => {
    if (!isConnected || !eventId || !canEdit) return;
    let active = true;
    wsService.emit('get_data', { type: 'event_organizers', eventId }, (res: any) => {
      if (active && Array.isArray(res)) setOrganizers(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected, eventId, canEdit]);

  const identityDirty =
    !!event &&
    (editName !== event.name ||
      editStartDate !== (event.startDate?.split('T')[0] || '') ||
      isMultiDay !== !!event.endDate ||
      (isMultiDay && editEndDate !== (event.endDate?.split('T')[0] || '')) ||
      editSiteId !== (event.siteId || ''));
  /** Its own flag, because it saves through its own action against its own table. */
  const facilitiesDirty = [...editFacilityIds].sort().join() !== savedFacilityKey;
  const isDirty = canEdit && (identityDirty || facilitiesDirty);

  const handleCancel = useCallback(() => {
    if (!event) return;
    setEditName(event.name);
    setEditStartDate(event.startDate?.split('T')[0] || '');
    setIsMultiDay(!!event.endDate);
    setEditEndDate(event.endDate?.split('T')[0] || '');
    setEditSiteId(event.siteId || '');
    setEditFacilityIds(savedFacilityIds);
  }, [event, savedFacilityIds]);

  const { confirmThenNavigate } = useUnsavedChanges(isDirty && !isProcessing, handleCancel);

  /**
   * `UPDATE_EVENT` carries only this screen's fields — it is a patch, so the sports and the invite
   * list edited on their own screens are not touched by a save here.
   *
   * The facilities are a second write, and deliberately so: `event_facilities` is a different
   * table with an action of its own, and folding it into `UPDATE_EVENT` would mean teaching that
   * action about a join table to save one round trip.
   */
  const handleSave = useCallback(
    (onDone?: () => void) => {
      if (!event || !editName.trim()) return;

      setIsProcessing(true);
      wsService.emit(
        'action',
        {
          type: SocketAction.UPDATE_EVENT,
          payload: {
            id: eventId,
            userId: user?.id,
            orgId,
            data: {
              name: editName.trim(),
              startDate: `${editStartDate}T12:00:00.000Z`,
              endDate: isMultiDay && editEndDate ? `${editEndDate}T12:00:00.000Z` : null,
              siteId: editSiteId || null,
            },
          },
        },
        () => finishSave(onDone)
      );

      if (facilitiesDirty) {
        wsService.emit('action', {
          type: SocketAction.SET_EVENT_FACILITIES,
          payload: { eventId, orgId, facilityIds: editFacilityIds },
        });
      }
    },
    [
      event,
      editName,
      editStartDate,
      isMultiDay,
      editEndDate,
      editSiteId,
      editFacilityIds,
      facilitiesDirty,
      eventId,
      orgId,
      user?.id,
      setIsProcessing,
      finishSave,
    ]
  );

  const handleBack = useCallback(
    () => confirmThenNavigate(() => goBackToChecklist()),
    [confirmThenNavigate, goBackToChecklist]
  );

  /** Next writes first when there is something to write, so nobody is asked to discard the step
   *  they have just filled in. */
  const handleNext = useCallback(() => {
    const go = () => goBackToChecklist(nextStep);
    if (isDirty) handleSave(go);
    else go();
  }, [isDirty, handleSave, goBackToChecklist, nextStep]);

  // Gated on `!isLoadingCapabilities`, or the screen shows Access Restricted for a beat on every
  // load while the capability read is still in flight.
  if (accessDenied || (!isLoadingCapabilities && !canEdit)) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        <AccessDenied
          message="You do not have permission to set this tournament up."
          actionLabel="Back to the tournament"
          onAction={() => goBackToChecklist()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <ScreenHeader context={event?.name} title={step.label} onBack={handleBack} />

      {!event ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brand.orange} />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-6 py-6"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: isDirty ? FLOATING_SAVE_BAR_PADDING : 60 }}
        >
          <View className="space-y-6">
            <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
              <View className="p-5 space-y-4">
                <View className="space-y-1.5">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Name
                  </Text>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                  />
                </View>

                <View className="space-y-1.5">
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Starts
                  </Text>
                  <DatePicker value={editStartDate} onChange={setEditStartDate} />
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                    Runs over more than one day
                  </Text>
                  <Switch
                    value={isMultiDay}
                    onValueChange={setIsMultiDay}
                    trackColor={{ true: COLORS.brand.orange }}
                  />
                </View>

                {isMultiDay && (
                  <View className="space-y-1.5">
                    <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Ends
                    </Text>
                    <DatePicker value={editEndDate} onChange={setEditEndDate} />
                  </View>
                )}

                {/* The base venue (U47): where the tournament *is*, which is a different question
                    from which fields it uses. It is what the listing shows and what the facility
                    picker below opens on, and it restricts nothing. */}
                <View className="space-y-1.5" style={{ zIndex: 30 }}>
                  <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Based at
                  </Text>
                  <CustomSelect
                    options={sites.map(s => ({ label: s.name, value: s.id }))}
                    value={editSiteId}
                    onChange={setEditSiteId}
                    placeholder="Select a venue..."
                    clearable
                  />
                </View>
              </View>

              <View className="p-5 space-y-3 border-t border-slate-200 dark:border-white/5">
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Fields in play
                </Text>
                <FacilityPicker
                  sites={sites}
                  facilities={facilities}
                  value={editFacilityIds}
                  onChange={setEditFacilityIds}
                  baseSiteId={editSiteId || undefined}
                  emptyLabel="No fields chosen yet. Pick the ones this tournament may use — the generator places fixtures on them, and a division can be narrowed to a few of them later."
                />
              </View>

              {/* Appointing an organiser (D33). Who runs it is known with the name and the dates,
                  which is why it sits in Basic Info; a division's own convenor is appointed on the
                  division screen. */}
              <View className="p-5 border-t border-slate-200 dark:border-white/5">
                <OrganizerPicker
                  eventId={eventId}
                  hostOrgId={(event as Event).orgId}
                  actingOrgId={orgId}
                  organizers={organizers}
                  onChange={setOrganizers}
                  canManage={canEdit}
                  label="Tournament organisers"
                />
              </View>
            </View>

            <SetupStepFooter
              label={step.label}
              nextStep={nextStep}
              onNext={handleNext}
              onBackToChecklist={handleBack}
              isDirty={isDirty}
              isProcessing={isProcessing}
              nextDisabled={!editName.trim()}
            />
          </View>
        </ScrollView>
      )}

      <FloatingSaveBar
        visible={isDirty}
        description="You have modified this tournament's basics."
        onSave={() => handleSave()}
        onCancel={handleCancel}
        isProcessing={isProcessing}
        saveDisabled={!editName.trim()}
      />
    </SafeAreaView>
  );
}
