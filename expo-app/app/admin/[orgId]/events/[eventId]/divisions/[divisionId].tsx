import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Facility, Site, SocketAction, TournamentDivision, TournamentOrganizer } from '@sk/shared';
import { GlassCard } from '../../../../../../components/GlassCard';
import { DivisionPanel } from '../../../../../../components/tournament/DivisionPanel';
import { DivisionStandings } from '../../../../../../components/tournament/DivisionStandings';
import { OrganizerPicker } from '../../../../../../components/OrganizerPicker';
import { FacilityPicker } from '../../../../../../components/tournament/FacilityPicker';
import { useLiveRoom } from '../../../../../../hooks/useLiveRoom';
import { useEventCapabilities } from '../../../../../../hooks/useEventCapabilities';
import { useSafeBack } from '../../../../../../hooks/useSafeBack';
import { wsService } from '../../../../../../services/websocket';
import { useWsStore } from '../../../../../../store/wsStore';
import { useActiveTheme } from '../../../../../../store/settingsStore';
import { COLORS, getThemeColor } from '../../../../../../constants/Colors';

/**
 * A division's own screen (U13).
 *
 * A division is in effect a tournament within a tournament — its own format, venues, entrants and
 * table — which on its own justifies a screen. It is also the unit of delegation (D22/D31/D33), so
 * a convenor needs a link that can be sent to them, and this is that link.
 *
 * **It exists only when the tournament has more than one division.** With exactly one, the collapse
 * rule (U15) renders it inline on the event screen and nothing routes here. The screen still works
 * if somebody follows an old link to a since-collapsed division, because the panel it mounts is the
 * same one the event screen mounts.
 */
export default function DivisionScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, divisionId } = useLocalSearchParams<{
    orgId: string;
    eventId: string;
    divisionId: string;
  }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  const { capabilities } = useEventCapabilities(eventId);
  /**
   * A division's `canEdit`, derived rather than sent.
   *
   * Phase 4 deliberately keeps this off the division object: a `canEdit` there would be published
   * to a room, so one viewer's answer would reach every other viewer of the same division.
   */
  const canEdit =
    !!capabilities &&
    (capabilities.canEditEvent || capabilities.convenesDivisionIds.includes(divisionId));
  /**
   * Appointing is the one tournament write a convenor may not do (D33), so the picker below is
   * mounted for event organisers only — which is also what keeps an appointee from ever building a
   * position the people who appointed them cannot undo.
   */
  const canAppoint = !!capabilities?.canEditEvent;

  // The division record, which is `division:{id}` now rather than a passenger on the fixtures room
  // (rule 4). The record is public — a spectator reading a draw needs the division's name — which
  // is why the tier moved with it.
  const { items: divisions, accessDenied } = useLiveRoom<TournamentDivision>(
    divisionId ? `division:${divisionId}` : null,
    {
      reduce: (message) => {
        switch (message.type) {
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

  const division = divisions.find(d => d.id === divisionId);

  const [organizers, setOrganizers] = useState<TournamentOrganizer[]>([]);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  /*
    Where this division is played (U47).

    A division narrows the tournament's facilities to its own subset, or names none and inherits
    them — "u14 rugby is on Fields 3 and 4" against "wherever there is room". The event's set is the
    ceiling, so it is read here to bound the picker; the names come from the organisation's own
    rooms, which is where every other screen gets them.
  */
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
   * The event's facilities — a one-shot read, not a room.
   *
   * This screen has no reason to join the event room: it would then hold the whole tournament's
   * fixtures and divisions to render one ceiling. What it needs is a list that only an organiser
   * changes, on a screen a convenor opens for one division at a time.
   */
  const [eventFacilityIds, setEventFacilityIds] = useState<string[]>([]);
  useEffect(() => {
    if (!isConnected || !eventId) return;
    let active = true;
    wsService.emit('get_data', { type: 'event_facilities', eventId }, (res: any) => {
      if (active && Array.isArray(res)) setEventFacilityIds(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected, eventId]);

  const [draftFacilityIds, setDraftFacilityIds] = useState<string[]>([]);
  const [isSavingFacilities, setIsSavingFacilities] = useState(false);
  const savedFacilityKey = [...(division?.facilityIds || [])].sort().join();
  useEffect(() => {
    setDraftFacilityIds(division?.facilityIds || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId, savedFacilityKey]);
  const facilitiesDirty = [...draftFacilityIds].sort().join() !== savedFacilityKey;

  const handleSaveFacilities = () => {
    setIsSavingFacilities(true);
    wsService.emit(
      'action',
      {
        type: SocketAction.SET_DIVISION_FACILITIES,
        payload: { divisionId, orgId, facilityIds: draftFacilityIds },
      },
      () => setIsSavingFacilities(false)
    );
  };

  useEffect(() => {
    if (!isConnected || !divisionId || !canEdit) return;
    let active = true;
    wsService.emit('get_data', { type: 'division_organizers', divisionId }, (res: any) => {
      if (active && Array.isArray(res)) setOrganizers(res);
    });
    return () => {
      active = false;
    };
  }, [isConnected, divisionId, canEdit]);

  const handleRename = () => {
    const name = draftName.trim();
    if (!name || name === division?.name) {
      setIsRenaming(false);
      return;
    }
    wsService.emit(
      'action',
      { type: SocketAction.UPDATE_DIVISION, payload: { id: divisionId, orgId, data: { name } } },
      () => setIsRenaming(false)
    );
  };

  if (accessDenied) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center px-8">
        <Ionicons name="lock-closed-outline" size={44} color={COLORS.dark.textSecondary} style={{ opacity: 0.3 }} />
        <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300 mt-4">
          No Access
        </Text>
        <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 text-center mt-1">
          You do not have permission to view this part of the tournament.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => safeBack(`/admin/${orgId}/events/${eventId}`)}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text
          className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase flex-1 text-center px-4"
          numberOfLines={1}
        >
          {division?.name || 'Division'}
        </Text>
        {canEdit ? (
          <TouchableOpacity
            onPress={() => {
              setDraftName(division?.name || '');
              setIsRenaming(true);
            }}
            className="w-8 h-8 items-center justify-center active:opacity-80"
          >
            <Ionicons name="pencil-outline" size={16} color={getThemeColor(isDark, 'textSecondary')} />
          </TouchableOpacity>
        ) : (
          <View className="w-8" />
        )}
      </View>

      {!division ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brand.orange} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="space-y-6">
            {isRenaming && (
              <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-3">
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Rename
                </Text>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  autoFocus
                  placeholder="Division name"
                  placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setIsRenaming(false)}
                    className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 items-center active:opacity-80"
                  >
                    <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleRename}
                    className="flex-1 py-2.5 rounded-lg bg-brand-orange items-center active:opacity-85"
                  >
                    <Text className="font-inter-bold text-xs text-white uppercase">Save</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            )}

            <DivisionPanel
              orgId={orgId}
              eventId={eventId}
              divisionId={divisionId}
              canEdit={canEdit}
            />

            <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-3">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Fields in play
              </Text>
              <FacilityPicker
                sites={sites}
                facilities={facilities}
                value={draftFacilityIds}
                onChange={setDraftFacilityIds}
                allowedFacilityIds={eventFacilityIds}
                disabled={!canEdit}
                emptyLabel={
                  eventFacilityIds.length > 0
                    ? "Any of the tournament's fields. Choose some to keep this division on them."
                    : 'The tournament has no fields in play yet.'
                }
              />
              {canEdit && facilitiesDirty && (
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setDraftFacilityIds(division.facilityIds || [])}
                    className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 items-center active:opacity-80"
                  >
                    <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveFacilities}
                    disabled={isSavingFacilities}
                    className={`flex-1 py-2.5 rounded-lg bg-brand-orange items-center active:opacity-85 ${
                      isSavingFacilities ? 'opacity-50' : ''
                    }`}
                  >
                    <Text className="font-inter-bold text-xs text-white uppercase">Save fields</Text>
                  </TouchableOpacity>
                </View>
              )}
            </GlassCard>

            {/*
              This division's table, ranking its **entrants** (U29) — so a school that entered u14A
              and u14B is two rows here, and one line in the event's roll-up. The same component
              the standings tab mounts when its scope selector names a division, so the two cannot
              drift. Entering teams and generating the draw are inside the panel above, where the
              fixtures they produce are.
            */}
            <View className="space-y-2">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 uppercase tracking-widest pl-1">
                Standings
              </Text>
              <DivisionStandings divisionId={divisionId} canEdit={canEdit} />
            </View>

            {canAppoint && (
              <GlassCard className="border border-slate-200 dark:border-white/5 p-5">
                <OrganizerPicker
                  eventId={eventId}
                  divisionId={divisionId}
                  hostOrgId={orgId}
                  actingOrgId={orgId}
                  organizers={organizers}
                  onChange={setOrganizers}
                  canManage={canAppoint}
                  label={`${division.name} organisers`}
                />
              </GlassCard>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
