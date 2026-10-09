import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { wsService } from '../../../../../../../services/websocket';
import { useWsStore } from '../../../../../../../store/wsStore';
import { SocketAction, Event, Game } from '@sk/shared';

import { useAuthStore } from '../../../../../../../store/authStore';
import { useEventCapabilities } from '../../../../../../../hooks/useEventCapabilities';
import { getMatchPermissions } from '../../../../../../../utils/matchPermissions';
import { MatchViewSwitcher } from '../../../../../../../components/MatchViewSwitcher';
import { DynamicScoringProvider } from '../../../../../../../components/sports/shared/DynamicScoringContext';
import { DynamicScoringDialog } from '../../../../../../../components/sports/shared/DynamicScoringDialog';
import { DynamicScoringPanels } from '../../../../../../../components/sports/shared/DynamicScoringPanels';
import { SportComponentRegistry } from '../../../../../../../components/sports/SportComponentRegistry';
import { TimerPanelSlot } from '../../../../../../../components/sports/shared/TimerPanelSlot';
import { ActiveDisputesPanel } from '../../../../../../../components/sports/shared/ActiveDisputesPanel';
import { EventLogFeed } from '../../../../../../../components/sports/shared/EventLogFeed';
import { TeamRosterPanel } from '../../../../../../../components/sports/shared/TeamRosterPanel';
import RugbyGameStats from '../../../../../../../components/sports/rugby/RugbyGameStats';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { Tabs } from '../../../../../../../components/Tabs';
import { AccessDenied } from '../../../../../../../components/AccessDenied';
import { useActiveTheme } from '../../../../../../../store/settingsStore';
import { themeColor } from '../../../../../../../constants/Colors';

export default function ScoreGameScreen() {
  const isDark = useActiveTheme() === 'dark';
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, gameId } = useLocalSearchParams<{ orgId: string; eventId: string; gameId: string }>();
  const { capabilities } = useEventCapabilities(eventId);
  const isConnected = useWsStore((state: any) => state.isConnected);

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);

  const [game, setGame] = useState<Game | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'team1' | 'team2' | 'stats'>('feed');

  useEffect(() => {
    if (!isConnected || !gameId) return;

    setIsLoading(true);

    if (eventId) {
      wsService.emit('get_data', { type: 'event', id: eventId }, (resEvent: Event) => {
        if (resEvent) setEvent(resEvent);
      });
    }

    wsService.emit('get_data', { type: 'game', id: gameId }, (resGame: Game) => {
      if (resGame) {
        setGame(resGame);
      }
      setIsLoading(false);
    });

    const handleUpdate = (evt: { type: string; data: any }) => {
      if (['GAME_UPDATED', 'GAME_RESET'].includes(evt.type) && (evt.data?.id === gameId || evt.data?.gameId === gameId)) {
        if (evt.data) {
          setGame(prev => {
            if (!prev) return evt.data as Game;
            const updatedLiveState = evt.data.liveState ? { ...prev.liveState, ...evt.data.liveState } : prev.liveState;
            return {
              ...prev,
              ...evt.data,
              liveState: updatedLiveState
            };
          });
        }
      }
    };

    // Through the ledger, not by raw `join_room` / `leave_room` (`LIVE-17`). The raw leave on
    // unmount removed the socket from `game:{id}` even when another mounted screen still held it,
    // and the reference count never saw either call, so nothing re-joined.
    wsService.on('update', handleUpdate);
    const unsubscribeGame = wsService.subscribeToRoom(`game:${gameId}`, handleUpdate);
    const unsubscribeEvents = wsService.subscribeToRoom(`game:${gameId}:events`, handleUpdate);

    return () => {
      unsubscribeGame();
      unsubscribeEvents();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, gameId]);

  if (isLoading || !game) {
    return (
      <SafeAreaView className="flex-1 bg-canvas justify-center items-center">
        <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        <Text className="font-orbitron text-xs text-ink-muted mt-4 uppercase tracking-widest">
          Loading Control Room...
        </Text>
      </SafeAreaView>
    );
  }

  const permissions = getMatchPermissions({
    game,
    event,
    currentOrgId: orgId,
    user,
    orgMemberships,
    teamMemberships,
    // Without this the screen would hide the controls from an appointed organiser or a
    // division convenor, neither of whom holds an org membership that says so (D33).
    capabilities,
  });

  // Being signed into the workspace is not enough to score: the control room is
  // for org admins/staff and coaches of a participating team. Everyone else is
  // sent to the read-only match view.
  if (!permissions.canScore) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <AccessDenied
          title="Scoring Restricted"
          message="You do not have permission to score this match. Org admins and staff, or a coach of one of the participating teams, can open the control room."
          actionLabel="Open Match View"
          onAction={() => router.replace(`/admin/${orgId}/events/${eventId}/games/${gameId}/view` as any)}
        />
      </SafeAreaView>
    );
  }

  const sportCategory = game.sportId ? 'Rugby' : 'Rugby';
  const ScoreboardComponent = SportComponentRegistry.getScoreboard(sportCategory);

  const p1 = game.participants?.[0];
  const p2 = game.participants?.[1];

  return (
    <DynamicScoringProvider game={game}>
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        {/* HEADER BAR */}
        <View className="flex-row items-center justify-between px-4 py-2.5 border-b border-line-soft bg-card z-10">
          <TouchableOpacity onPress={() => safeBack(`/admin/${orgId}/events/${eventId}`)} className="flex-row items-center gap-1">
            <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
            <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
              Back
            </Text>
          </TouchableOpacity>
          <Text numberOfLines={1} className="font-orbitron-bold text-sm tracking-widest text-ink uppercase flex-1 text-center px-4">
            Game Control Room
          </Text>
          <MatchViewSwitcher
            orgId={orgId!}
            eventId={eventId!}
            gameId={gameId!}
            currentView="score"
            permissions={permissions}
          />
        </View>

        <ScrollView className="flex-1 px-4 py-2" contentContainerStyle={{ paddingBottom: 30 }}>
          <View className="flex-col lg:flex-row gap-3 items-start justify-center max-w-7xl mx-auto w-full">
            {/* MAIN SCORING COLUMN (TIMER, SCOREBOARD, DISPUTES & SCORER PANELS) */}
            <View className="w-full flex-1 max-w-3xl">
              {/* TIMER SLOT */}
              <TimerPanelSlot game={game} canEdit={true} />

              {/* SCOREBOARD SLOT */}
              {ScoreboardComponent && <ScoreboardComponent game={game} role="SCORER" />}

              {/* DISPUTES PANEL */}
              <ActiveDisputesPanel gameId={game.id} />

              {/* SCORING PANELS — one per section the sport declares, in its own order */}
              <DynamicScoringPanels role="SCORER" />
            </View>

            {/* EVENTS & DRAWER TABS PANEL (LOG FEED / ROSTERS / STATS - SHOWN ON RIGHT ON LARGE SCREENS) */}
            <View className="w-full lg:w-96 xl:w-[440px]">
              <View className="bg-card border border-line rounded-2xl p-3 shadow-sm mt-2 lg:mt-0">
                <Tabs<'feed' | 'team1' | 'team2' | 'stats'>
                  items={[
                    { key: 'feed', label: 'Events', icon: 'list-outline' },
                    { key: 'team1', label: 'Home', icon: 'people-outline' },
                    { key: 'team2', label: 'Away', icon: 'people-outline' },
                    { key: 'stats', label: 'Stats', icon: 'stats-chart-outline' },
                  ]}
                  activeKey={activeTab}
                  onChange={setActiveTab}
                  variant="underline"
                  className="mb-3"
                />

                <View className="min-h-[280px]">
                  {activeTab === 'feed' && <EventLogFeed gameId={game.id} game={game} canManage={true} />}
                  {activeTab === 'team1' && p1 && <TeamRosterPanel gameId={game.id} participantId={p1.id} teamId={p1.teamId} />}
                  {activeTab === 'team2' && p2 && <TeamRosterPanel gameId={game.id} participantId={p2.id} teamId={p2.teamId} />}
                  {activeTab === 'stats' && <RugbyGameStats game={game} />}
                </View>
              </View>
            </View>
          </View>

          {/* DYNAMIC SCORING DIALOG OVERLAY */}
          <DynamicScoringDialog />
        </ScrollView>
      </SafeAreaView>
    </DynamicScoringProvider>
  );
}
