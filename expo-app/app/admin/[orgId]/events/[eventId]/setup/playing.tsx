import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Facility,
  Sport,
  SocketAction,
  TournamentDivision,
  isCollapsed,
  structureAnnouncement,
} from '@sk/shared';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import { ConfirmationModal } from '../../../../../../components/ConfirmationModal';
import { FloatingSaveBar, FLOATING_SAVE_BAR_PADDING } from '../../../../../../components/FloatingSaveBar';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { reportActionError } from '../../../../../../utils/actionErrors';
import { facilitySummary } from '../../../../../../components/tournament/FacilityPicker';
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
 * What is being played (U46), on its own screen (U48).
 *
 * Named for the work rather than for the entity, because U15 hides the word "division" altogether
 * when there is only one — a screen called *Divisions* would put back the concept the collapse
 * rule exists to keep out of a one-sport festival's way.
 *
 * **The sports are asked once.** The event carries `sportIds` and every division carries a
 * `sportId`, and entering them separately is how a tournament ends up advertising hockey with no
 * hockey division in it. With more than one division the divisions are the answer and the event's
 * list is derived from them; collapsed, the chips are the question and the single division's sport
 * is what they set.
 *
 * A division's own screen is where its name, age group, stages and fields are edited — this one
 * lists them and opens them.
 */
export default function SetupPlaying() {
  const router = useRouter();
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');
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
    goBackToChecklist,
    nextStep,
    finishSave,
  } = useSetupStepScreen('divisions');

  /* Split out of `event:{id}` on 2026-09-11; this screen was still listening on the old room until
     2026-09-15, so the sync never arrived — same defect as the facilities one on `basics.tsx`. */
  const { items: divisions } = useLiveRoom<TournamentDivision>(
    eventId ? `event:${eventId}:divisions` : null,
    {
      reduce: (message) => {
        switch (message.type) {
          case 'DIVISIONS_SYNC':
            return { kind: 'replace', items: message.data || [] };
          case 'DIVISION_ADDED':
          case 'DIVISION_UPDATED':
            return { kind: 'upsert', item: message.data };
          case 'DIVISION_DELETED':
            return { kind: 'remove', id: message.data?.id };
          default:
            return { kind: 'ignore' };
        }
      },
    }
  );

  const { items: eventFacilityRows } = useLiveRoom<{ id: string }>(
    eventId ? `event:${eventId}:facilities` : null,
    {
      reduce: (message) =>
        message.type === 'EVENT_FACILITIES_SYNC'
          ? { kind: 'replace', items: (message.data?.facilityIds || []).map((id: string) => ({ id })) }
          : { kind: 'ignore' },
    }
  );

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

  // Sports are global reference data that no room owns, so this stays a one-shot read.
  const [sports, setSports] = useState<Sport[]>([]);
  useEffect(() => {
    if (!isConnected) return;
    let active = true;
    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected]);

  const [editSportIds, setEditSportIds] = useState<string[]>([]);
  const [isAddingDivision, setIsAddingDivision] = useState(false);

  useEffect(() => {
    if (!event) return;
    setEditSportIds(event.sportIds || []);
  }, [event?.id, event?.sportIds]);

  const orderedDivisions = useMemo(
    () => [...divisions].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [divisions]
  );
  const divisionsCollapsed = isCollapsed(orderedDivisions.length);
  const onlyDivision = divisionsCollapsed ? orderedDivisions[0] : undefined;

  const divisionSportIds = useMemo(
    () => [...new Set(orderedDivisions.map(d => d.sportId).filter(Boolean) as string[])],
    [orderedDivisions]
  );
  const sportsAreDerived = orderedDivisions.length > 1;
  const effectiveSportIds = sportsAreDerived ? divisionSportIds : editSportIds;
  const sportName = (sportId?: string) => sports.find(s => s.id === sportId)?.name;
  const eventFacilityIds = useMemo(() => eventFacilityRows.map(row => row.id), [eventFacilityRows]);

  /**
   * A derived list deliberately does **not** make the form dirty. The stored value may already
   * disagree — every tournament created before U46 does — and a page that comes up with an
   * unsaved-changes bar over something the organiser never touched is worse than a field that
   * corrects itself on the next save, which is what `handleSave` does with it.
   */
  const isDirty =
    !!event &&
    canEdit &&
    !sportsAreDerived &&
    [...editSportIds].sort().join() !== [...(event.sportIds || [])].sort().join();

  const handleCancel = useCallback(() => {
    if (!event) return;
    setEditSportIds(event.sportIds || []);
  }, [event]);

  const { confirmThenNavigate } = useUnsavedChanges(isDirty && !isProcessing, handleCancel);

  const handleSave = useCallback(
    (onDone?: () => void) => {
      if (!event) return;

      setIsProcessing(true);
      wsService.emit(
        'action',
        {
          type: SocketAction.UPDATE_EVENT,
          payload: {
            id: eventId,
            userId: user?.id,
            orgId,
            // Whatever the sports are *now*: the chips when they are the question, the divisions
            // when they are the answer. This is the one write that keeps a derived list in step.
            data: { sportIds: effectiveSportIds },
          },
        },
        (response: any) => finishSave(response, onDone)
      );

      /*
        Collapsed, the sport chip *is* the division's sport (U46), so choosing one has to reach the
        division or the tournament says two different things about what is being played. Only when
        exactly one sport is chosen: two sports and one division is a tournament that wants
        splitting, which the screen says rather than guesses at.
      */
      if (
        onlyDivision &&
        !sportsAreDerived &&
        editSportIds.length === 1 &&
        onlyDivision.sportId !== editSportIds[0]
      ) {
        /* The second write of this save. It reports for itself rather than through `finishSave`,
           which the event write owns — a division whose sport silently failed to change while the
           event's did is exactly the inconsistency nobody would be told about. */
        wsService.emit(
          'action',
          {
            type: SocketAction.UPDATE_DIVISION,
            payload: { id: onlyDivision.id, orgId, data: { sportId: editSportIds[0] } },
          },
          (response: any) =>
            reportActionError(response, "The division's sport could not be saved.")
        );
      }
    },
    [
      event,
      eventId,
      orgId,
      user?.id,
      effectiveSportIds,
      onlyDivision,
      sportsAreDerived,
      editSportIds,
      setIsProcessing,
      finishSave,
    ]
  );

  const handleAddDivision = useCallback(() => {
    setIsProcessing(true);
    wsService.emit(
      'action',
      {
        type: SocketAction.ADD_DIVISION,
        payload: {
          eventId,
          orgId,
          name: `Division ${orderedDivisions.length + 1}`,
          // Every division has at least one stage (D11), and the caller that knows the format says
          // so in the same call rather than making a second round trip.
          stage: { name: 'Fixtures', format: 'Festival', sequence: 1 },
        },
      },
      (res: any) => {
        setIsProcessing(false);
        setIsAddingDivision(false);
        const addedId = res?.data?.id;
        if (addedId) router.push(`/admin/${orgId}/events/${eventId}/divisions/${addedId}`);
      }
    );
  }, [eventId, orgId, orderedDivisions.length, router, setIsProcessing]);

  const handleBack = useCallback(
    () => confirmThenNavigate(() => goBackToChecklist()),
    [confirmThenNavigate, goBackToChecklist]
  );

  const handleNext = useCallback(() => {
    const go = () => goBackToChecklist(nextStep);
    if (isDirty) handleSave(go);
    else go();
  }, [isDirty, handleSave, goBackToChecklist, nextStep]);

  const divisionAnnouncement = structureAnnouncement({
    level: 'division',
    existingName: onlyDivision?.name,
  });

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
          contentContainerStyle={{ paddingBottom: isDirty ? FLOATING_SAVE_BAR_PADDING : 60 }}
        >
          <View className="space-y-6">
            <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
              <View className="p-5 space-y-4">
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Sports
                </Text>

                {sportsAreDerived ? (
                  <>
                    <View className="flex-row flex-wrap gap-2">
                      {effectiveSportIds.length === 0 ? (
                        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                          No division has a sport set yet.
                        </Text>
                      ) : (
                        effectiveSportIds.map(id => (
                          <View
                            key={id}
                            className="px-3 py-1.5 rounded-full border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5"
                          >
                            <Text className="font-inter text-xs text-slate-600 dark:text-slate-400">
                              {sportName(id) || 'Unknown sport'}
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                    <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                      Taken from the divisions below — each one names its own sport, so this list
                      follows them rather than being kept separately.
                    </Text>
                  </>
                ) : (
                  <>
                    <View className="flex-row flex-wrap gap-2">
                      {sports.map(sport => {
                        const isOn = editSportIds.includes(sport.id);
                        return (
                          <TouchableOpacity
                            key={sport.id}
                            onPress={() =>
                              setEditSportIds(prev =>
                                isOn ? prev.filter(id => id !== sport.id) : [...prev, sport.id]
                              )
                            }
                            className={`px-3 py-1.5 rounded-full border ${
                              isOn
                                ? 'bg-brand-orange/10 border-brand-orange/40'
                                : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5'
                            }`}
                          >
                            <Text
                              className={`font-inter text-xs ${
                                isOn ? 'text-brand-orange' : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {sport.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {editSportIds.length > 1 && (
                      <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                        More than one sport in a single competition. Splitting into divisions is how
                        each sport gets its own fixtures, table and fields.
                      </Text>
                    )}
                  </>
                )}
              </View>

              {/* Divisions. One renders nowhere here — the concept is collapsed (U15) and its
                  stages live on the Schedule tab; several are listed, each opening its screen. */}
              <View className="p-5 space-y-3 border-t border-slate-200 dark:border-white/5">
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  {divisionsCollapsed ? 'Divisions' : `Divisions · ${orderedDivisions.length}`}
                </Text>

                {orderedDivisions.length === 0 ? (
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                    This tournament has no structure yet. Add a division to give its fixtures
                    somewhere to live.
                  </Text>
                ) : divisionsCollapsed ? (
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                    One competition, with its stages and fixtures on the Schedule tab. Split it if
                    the day runs more than one sport or age group.
                  </Text>
                ) : (
                  orderedDivisions.map(division => (
                    <TouchableOpacity
                      key={division.id}
                      onPress={() =>
                        router.push(`/admin/${orgId}/events/${eventId}/divisions/${division.id}`)
                      }
                      activeOpacity={0.85}
                      className="flex-row items-center justify-between bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-3"
                    >
                      <View className="flex-1 min-w-0">
                        <Text
                          className="font-inter-bold text-xs text-slate-800 dark:text-white"
                          numberOfLines={1}
                        >
                          {division.name}
                        </Text>
                        <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {[sportName(division.sportId), division.ageGroup]
                            .filter(Boolean)
                            .join(' · ') || 'No sport set'}
                        </Text>
                        {/* Where this division is played (U47). An empty allocation is *inherit*,
                            not nothing, so it says so rather than showing a blank. */}
                        <Text
                          className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5"
                          numberOfLines={1}
                        >
                          {facilitySummary(
                            division.facilityIds,
                            facilities,
                            eventFacilityIds.length > 0
                              ? "Any of the tournament's fields"
                              : 'No fields chosen for the tournament yet'
                          )}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={secondary} />
                    </TouchableOpacity>
                  ))
                )}

                <TouchableOpacity
                  onPress={() => setIsAddingDivision(true)}
                  className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-slate-300 dark:border-white/10 active:opacity-80"
                >
                  <Ionicons name="add-circle-outline" size={16} color={COLORS.brand.orange} />
                  <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                    {divisionsCollapsed && orderedDivisions.length === 1
                      ? 'Split into divisions'
                      : 'Add a division'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <SetupStepFooter
              label={step.label}
              nextStep={nextStep}
              onNext={handleNext}
              onBackToChecklist={handleBack}
              isDirty={isDirty}
              isProcessing={isProcessing}
            />
          </View>
        </ScrollView>
      )}

      <FloatingSaveBar
        visible={isDirty}
        description="You have changed which sports are being played."
        onSave={() => handleSave()}
        onCancel={handleCancel}
        isProcessing={isProcessing}
      />

      {/* Say what will happen before the screen restructures itself (U15). */}
      <ConfirmationModal
        isOpen={isAddingDivision}
        title={divisionAnnouncement.title}
        description={divisionAnnouncement.description}
        confirmText={divisionAnnouncement.confirmText}
        cancelText="Cancel"
        variant="primary"
        isProcessing={isProcessing}
        onConfirm={handleAddDivision}
        onClose={() => setIsAddingDivision(false)}
      />
    </SafeAreaView>
  );
}
