import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Facility, Sport, SocketAction, TournamentDivision, divisionAutoName } from '@sk/shared';
import { AccessDenied } from '../../../../../../components/AccessDenied';
import { FieldLabel } from '../../../../../../components/FieldLabel';
import { GlassCard } from '../../../../../../components/GlassCard';
import { ScreenHeader } from '../../../../../../components/ScreenHeader';
import { reportActionError } from '../../../../../../utils/actionErrors';
import { facilitySummary } from '../../../../../../components/tournament/FacilityPicker';
import { SetupStepFooter } from '../../../../../../components/tournament/SetupStepFooter';
import { useSetupStepScreen } from '../../../../../../hooks/useSetupStepScreen';
import { useLiveRoom } from '../../../../../../hooks/useLiveRoom';
import { wsService } from '../../../../../../services/websocket';
import { useWsStore } from '../../../../../../store/wsStore';
import { useAuthStore } from '../../../../../../store/authStore';
import { useActiveTheme } from '../../../../../../store/settingsStore';
import { COLORS, getThemeColor } from '../../../../../../constants/Colors';

/**
 * Sports & Divisions (U46, renamed by U50), on its own screen (U48).
 *
 * **Sports first, and each sport's divisions under it (U52).** The organiser chooses the sports
 * the tournament includes; the first time a sport is chosen it gets a division, so a sport is never
 * on the list with nothing to play in. More divisions are added *under a sport* — "Add a Rugby
 * division" — which is how a division gets its sport without being asked. No sport, no division:
 * the section says to choose one first.
 *
 * **The chips save as they are pressed.** Choosing a sport creates a division on the spot, so a
 * draft-and-save-bar model would have shown a sport as chosen while its division did not exist
 * yet. Every control on the screen now writes immediately, as the Entrants screen's invite list does.
 *
 * **A sport cannot be removed while it has divisions** — the server refuses, and this screen does
 * not try. Pressing a chosen sport that has divisions opens a dialog listing them, with two ways
 * out: delete them one at a time from their own screens, or delete them all here, which requires
 * ticking each division by name before the button arms. Deleting a sport's last division removes
 * the sport, which the division screen warns about; the dialog here says so up front.
 *
 * A division's own screen is where its name, sport, age group, stages and fields are edited — this
 * one lists them and opens them.
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
    canEdit,
    isLoadingCapabilities,
    accessDenied,
    isProcessing,
    setIsProcessing,
    goBackToChecklist,
    nextStep,
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

  const orderedDivisions = useMemo(
    () => [...divisions].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [divisions]
  );
  const sportName = (sportId?: string) => sports.find(s => s.id === sportId)?.name;
  const eventFacilityIds = useMemo(() => eventFacilityRows.map(row => row.id), [eventFacilityRows]);

  const eventSportIds = event?.sportIds || [];
  /** The tournament's sports in the order the chips show them, so the groups below match. */
  const chosenSports = sports.filter(sport => eventSportIds.includes(sport.id));
  const divisionsOf = (sportId: string) => orderedDivisions.filter(d => d.sportId === sportId);
  /* Divisions from before U52 can have no sport, or one the tournament does not list. They are
     shown rather than hidden, in a group of their own, so they can be opened and put right. */
  const unplacedDivisions = orderedDivisions.filter(
    d => !d.sportId || !eventSportIds.includes(d.sportId)
  );

  /** A sport being removed that still has divisions — the dialog's subject. */
  const [removingSportId, setRemovingSportId] = useState<string | null>(null);

  const writeSports = useCallback(
    (sportIds: string[], fallback: string) => {
      setIsProcessing(true);
      wsService.emit(
        'action',
        {
          type: SocketAction.UPDATE_EVENT,
          payload: { id: eventId, userId: user?.id, orgId, data: { sportIds } },
        },
        (response: any) => {
          setIsProcessing(false);
          reportActionError(response, fallback);
        }
      );
    },
    [eventId, orgId, user?.id, setIsProcessing]
  );

  const toggleSport = (sportId: string) => {
    if (isProcessing) return;
    if (!eventSportIds.includes(sportId)) {
      // The server gives a newly chosen sport its first division (U52).
      writeSports([...eventSportIds, sportId], 'That sport could not be added.');
      return;
    }
    if (divisionsOf(sportId).length) {
      setRemovingSportId(sportId);
      return;
    }
    writeSports(
      eventSportIds.filter(id => id !== sportId),
      'That sport could not be removed.'
    );
  };

  const handleAddDivision = useCallback(
    (sportId: string) => {
      setIsProcessing(true);
      wsService.emit(
        'action',
        {
          type: SocketAction.ADD_DIVISION,
          payload: {
            eventId,
            orgId,
            sportId,
            // The automatic name for a division with no age group yet — "Rugby", or "Rugby - 2" when
            // the sport already has one — and it becomes "Rugby U14" once an age group is given on
            // the screen this opens.
            name:
              divisionAutoName(
                sportName(sportId),
                undefined,
                orderedDivisions.map(d => d.name)
              ) || 'Division',
            // Every division has at least one stage (D11), and the caller that knows the format
            // says so in the same call rather than making a second round trip.
            stage: { name: 'Fixtures', format: 'Festival', sequence: 1 },
          },
        },
        (res: any) => {
          setIsProcessing(false);
          if (reportActionError(res, 'The division could not be added.')) return;
          const addedId = res?.data?.id;
          if (addedId) router.push(`/admin/${orgId}/events/${eventId}/divisions/${addedId}`);
        }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventId, orgId, router, setIsProcessing, sports, orderedDivisions]
  );

  const handleBack = useCallback(() => goBackToChecklist(), [goBackToChecklist]);
  const handleNext = useCallback(() => goBackToChecklist(nextStep), [goBackToChecklist, nextStep]);

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

  const renderDivisionRow = (division: TournamentDivision) => (
    <TouchableOpacity
      key={division.id}
      onPress={() => router.push(`/admin/${orgId}/events/${eventId}/divisions/${division.id}`)}
      activeOpacity={0.85}
      className="flex-row items-center justify-between bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-3"
    >
      <View className="flex-1 min-w-0">
        <Text className="font-inter-bold text-xs text-slate-800 dark:text-white" numberOfLines={1}>
          {division.name}
        </Text>
        <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
          {division.ageGroup || 'Any age'}
        </Text>
        {/* Where this division is played (U47). An empty allocation is *inherit*, not nothing, so
            it says so rather than showing a blank. */}
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
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <ScreenHeader context={event?.name} title={step.label} onBack={handleBack} />

      {!event ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brand.orange} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="space-y-6">
            <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
              <View className="p-5 space-y-4">
                <FieldLabel
                  label="Sports"
                  help="Choose every sport this tournament includes. Each sport gets its first division as soon as you choose it; add more under it for age groups. A sport can only be removed once it has no divisions left."
                />

                <View className="flex-row flex-wrap gap-2">
                  {sports.map(sport => {
                    const isOn = eventSportIds.includes(sport.id);
                    return (
                      <TouchableOpacity
                        key={sport.id}
                        onPress={() => toggleSport(sport.id)}
                        disabled={isProcessing}
                        activeOpacity={0.85}
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
              </View>

              {/* Divisions, grouped under the sport each one plays (U52). */}
              <View className="p-5 space-y-4 border-t border-slate-200 dark:border-white/5">
                <FieldLabel
                  label={
                    orderedDivisions.length > 1 ? `Divisions · ${orderedDivisions.length}` : 'Divisions'
                  }
                  help="A division is one competition within the tournament: the teams that play each other for the same title — one sport, usually at one age group, like Rugby U14. Each has its own entrants, fixtures, standings and fields. Every sport starts with one; add more when age groups compete separately."
                />

                {chosenSports.length === 0 && (
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                    Choose a sport above and its first division is created for you.
                  </Text>
                )}

                {chosenSports.map(sport => (
                  <View key={sport.id} className="space-y-2">
                    <Text className="font-inter-bold text-[11px] text-slate-600 dark:text-slate-300">
                      {sport.name}
                    </Text>
                    {divisionsOf(sport.id).map(renderDivisionRow)}
                    <TouchableOpacity
                      onPress={() => handleAddDivision(sport.id)}
                      disabled={isProcessing}
                      activeOpacity={0.85}
                      className="flex-row items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-white/10"
                    >
                      <Ionicons name="add-circle-outline" size={16} color={COLORS.brand.orange} />
                      <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
                        Add a {sport.name} division
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {unplacedDivisions.length > 0 && (
                  <View className="space-y-2">
                    <Text className="font-inter-bold text-[11px] text-slate-600 dark:text-slate-300">
                      Not playing one of the tournament's sports
                    </Text>
                    <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                      Open each one and choose its sport, or delete it.
                    </Text>
                    {unplacedDivisions.map(renderDivisionRow)}
                  </View>
                )}
              </View>
            </View>

            <SetupStepFooter
              label={step.label}
              nextStep={nextStep}
              onNext={handleNext}
              onBackToChecklist={handleBack}
              isProcessing={isProcessing}
            />
          </View>
        </ScrollView>
      )}

      <RemoveSportModal
        sportName={sportName(removingSportId || undefined) || 'This sport'}
        divisions={removingSportId ? divisionsOf(removingSportId) : []}
        orgId={orgId}
        onClose={() => setRemovingSportId(null)}
      />
    </SafeAreaView>
  );
}

/**
 * Removing a sport that still has divisions (U52).
 *
 * The server will not remove a sport a division plays, so the only way out is to delete its
 * divisions — and deleting several divisions at once is the most destructive thing on the
 * screen: their entrants, stages and tables go with them. So the bulk option is made to take
 * effort. **Every division has to be ticked by name** before the button arms; there is no "select
 * all". Somebody who reads the list to tick it has read what they are deleting.
 *
 * The divisions are deleted one after another, and the server removes the sport when the last one
 * goes, so there is no separate "remove the sport" write to fail halfway. A failure stops the run
 * and is reported; whatever was deleted before it stays deleted, and the list shows what is left.
 */
function RemoveSportModal({
  sportName,
  divisions,
  orgId,
  onClose,
}: {
  sportName: string;
  divisions: TournamentDivision[];
  orgId: string;
  onClose: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [ticked, setTicked] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const isOpen = divisions.length > 0;

  useEffect(() => {
    if (!isOpen) setTicked([]);
  }, [isOpen]);

  const allTicked = divisions.every(d => ticked.includes(d.id));
  const count = divisions.length;

  const deleteAll = async () => {
    setIsDeleting(true);
    for (const division of divisions) {
      const response: any = await new Promise(resolve =>
        wsService.emit(
          'action',
          { type: SocketAction.DELETE_DIVISION, payload: { id: division.id, orgId } },
          resolve
        )
      );
      if (reportActionError(response, `${division.name} could not be deleted.`)) {
        setIsDeleting(false);
        return;
      }
    }
    setIsDeleting(false);
    onClose();
  };

  return (
    <Modal transparent visible={isOpen} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-950/75 items-center justify-center p-6">
        <GlassCard
          className="w-full max-w-sm border border-slate-200 dark:border-white/10 p-6 space-y-4 shadow-lg"
          style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
        >
          <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider">
            Remove {sportName}?
          </Text>
          <Text className="font-inter text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {sportName} still has {count === 1 ? 'a division' : `${count} divisions`}. A sport can only
            be removed once it has none. Delete {count === 1 ? 'it' : 'them'} one at a time from{' '}
            {count === 1 ? 'its' : 'their'} own {count === 1 ? 'screen' : 'screens'}, or delete{' '}
            {count === 1 ? 'it' : 'them all'} here.
          </Text>
          <Text className="font-inter text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Deleting a division deletes its entrants, stages and table. Fixtures already played are
            kept, but no longer belong to a division. Tick each one to confirm.
          </Text>

          <View className="space-y-2">
            {divisions.map(division => {
              const isOn = ticked.includes(division.id);
              return (
                <TouchableOpacity
                  key={division.id}
                  onPress={() =>
                    setTicked(prev =>
                      isOn ? prev.filter(id => id !== division.id) : [...prev, division.id]
                    )
                  }
                  disabled={isDeleting}
                  activeOpacity={0.85}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isOn }}
                  className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 bg-slate-50 dark:bg-white/5"
                >
                  <Ionicons
                    name={isOn ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={isOn ? '#EF4444' : getThemeColor(isDark, 'textSecondary')}
                  />
                  <Text className="font-inter text-xs text-slate-800 dark:text-white flex-1" numberOfLines={1}>
                    {division.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View className="gap-2">
            <TouchableOpacity
              onPress={deleteAll}
              disabled={!allTicked || isDeleting}
              activeOpacity={0.85}
              className={`min-h-[44px] items-center justify-center rounded-xl px-4 py-3 bg-red-600 ${
                !allTicked || isDeleting ? 'opacity-40' : ''
              }`}
            >
              {isDeleting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="font-inter-bold text-xs text-white text-center">
                  Delete {count === 1 ? 'the division' : `${count} divisions`} and remove {sportName}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              disabled={isDeleting}
              activeOpacity={0.85}
              className="min-h-[44px] items-center justify-center rounded-xl px-4 py-3 border border-slate-200 dark:border-white/10"
            >
              <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-300">Keep {sportName}</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}
