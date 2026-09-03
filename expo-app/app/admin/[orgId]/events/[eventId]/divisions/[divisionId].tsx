import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SocketAction, TournamentDivision, TournamentOrganizer } from '@sk/shared';
import { GlassCard } from '../../../../../../components/GlassCard';
import { DivisionPanel } from '../../../../../../components/tournament/DivisionPanel';
import { OrganizerPicker } from '../../../../../../components/OrganizerPicker';
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

  const { items: divisions, accessDenied } = useLiveRoom<TournamentDivision>(
    divisionId ? `division:${divisionId}:fixtures` : null,
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

            {/* Entrants and the division table are Phase 6; saying so is better than an empty
                section the organiser reads as broken. */}
            <GlassCard className="border border-dashed border-slate-200 dark:border-white/10 p-5">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                Entrants and standings
              </Text>
              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                Entering teams, generating fixtures and this division's table arrive in the next
                release. Fixtures added by hand already appear above.
              </Text>
            </GlassCard>

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
