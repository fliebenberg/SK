import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Event, TournamentDivision } from '@sk/shared';
import { ScreenHeader } from '../../../../../../../components/ScreenHeader';
import { DivisionPanel } from '../../../../../../../components/tournament/DivisionPanel';
import { DivisionStandings } from '../../../../../../../components/tournament/DivisionStandings';
import { useLiveRoom } from '../../../../../../../hooks/useLiveRoom';
import { useEventCapabilities } from '../../../../../../../hooks/useEventCapabilities';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { COLORS } from '../../../../../../../constants/Colors';

/**
 * One division's schedule: its stages, fixtures and table (U53).
 *
 * What the Schedule tab opens for a tournament with several divisions. It used to open the
 * division's own screen, which carried these below the division's details — so deciding which
 * divisions a tournament has also asked for its stages and draw. The details are
 * [setup](./index.tsx) now, and this is the rest. A lone division's panel is still shown inline on
 * the Schedule tab (U15), through the same `DivisionPanel`, so the two cannot drift.
 */
export default function DivisionScheduleScreen() {
  const safeBack = useSafeBack();
  const { orgId, eventId, divisionId } = useLocalSearchParams<{
    orgId: string;
    eventId: string;
    divisionId: string;
  }>();

  const { capabilities } = useEventCapabilities(eventId);

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

  const { items: events } = useLiveRoom<Event>(eventId ? `event:${eventId}` : null, {
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
  const event = events.find(e => e?.id === eventId);

  // The same rule as the division's setup screen: the event's organisers, this division's
  // convenors, and the organisers of the sport it plays.
  const runsThisSport =
    !!division?.sportId && !!capabilities?.convenesSportIds.includes(division.sportId);
  const canEdit =
    !!capabilities &&
    (capabilities.canEditEvent || capabilities.convenesDivisionIds.includes(divisionId) || runsThisSport);

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
      <ScreenHeader
        context={event?.name}
        title={division?.name || 'Division'}
        onBack={() => safeBack(`/admin/${orgId}/events/${eventId}`)}
      />

      {!division ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.brand.orange} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
          <View className="space-y-6">
            <DivisionPanel orgId={orgId} eventId={eventId} divisionId={divisionId} canEdit={canEdit} />

            {/*
              This division's table, ranking its **entrants** (U29) — so a school that entered u14A
              and u14B is two rows here, and one line in the event's roll-up. The same component
              the standings tab mounts when its scope selector names a division, so the two cannot
              drift.
            */}
            <View className="space-y-2">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 uppercase tracking-widest pl-1">
                Standings
              </Text>
              <DivisionStandings divisionId={divisionId} canEdit={canEdit} />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
