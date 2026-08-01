import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { wsService } from '../../../../../../../services/websocket';
import { useWsStore } from '../../../../../../../store/wsStore';
import { SocketAction, Event, Game } from '@sk/types';
import { COLORS } from '../../../../../../../constants/Colors';
import { useAuthStore } from '../../../../../../../store/authStore';
import { getMatchPermissions } from '../../../../../../../utils/matchPermissions';
import { MatchViewSwitcher } from '../../../../../../../components/MatchViewSwitcher';
import { DynamicScoringProvider } from '../../../../../../../components/sports/shared/DynamicScoringContext';
import { DynamicScoringDialog } from '../../../../../../../components/sports/shared/DynamicScoringDialog';
import { SportComponentRegistry } from '../../../../../../../components/sports/SportComponentRegistry';
import { TimerPanelSlot } from '../../../../../../../components/sports/shared/TimerPanelSlot';
import { ActiveDisputesPanel } from '../../../../../../../components/sports/shared/ActiveDisputesPanel';
import { EventLogFeed } from '../../../../../../../components/sports/shared/EventLogFeed';
import { TeamRosterPanel } from '../../../../../../../components/sports/shared/TeamRosterPanel';
import RugbyGameStats from '../../../../../../../components/sports/rugby/RugbyGameStats';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { Tabs } from '../../../../../../../components/Tabs';

export default function ScoreGameScreen() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, gameId } = useLocalSearchParams<{ orgId: string; eventId: string; gameId: string }>();
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

    wsService.emit('join_room', `game:${gameId}`);
    wsService.emit('join_room', `game:${gameId}:events`);

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

    wsService.on('update', handleUpdate);

    return () => {
      wsService.emit('leave_room', `game:${gameId}`);
      wsService.emit('leave_room', `game:${gameId}:events`);
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, gameId]);

  if (isLoading || !game) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.brand.orange} />
        <Text className="font-orbitron text-xs text-slate-500 mt-4 uppercase tracking-widest">
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
  });

  const sportCategory = game.sportId ? 'Rugby' : 'Rugby';
  const ScoreboardComponent = SportComponentRegistry.getScoreboard(sportCategory);
  const ScoringPanelComponent = SportComponentRegistry.getScoringPanel(sportCategory);
  const GameEventsPanelComponent = SportComponentRegistry.getGameEventsPanel(sportCategory);
  const GeneralPlayPanelComponent = SportComponentRegistry.getGeneralPlayPanel(sportCategory);

  const p1 = game.participants?.[0];
  const p2 = game.participants?.[1];

  return (
    <DynamicScoringProvider game={game}>
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
        {/* HEADER BAR */}
        <View className="flex-row items-center justify-between px-4 py-2.5 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
          <TouchableOpacity onPress={() => safeBack(`/admin/${orgId}/events/${eventId}`)} className="flex-row items-center gap-1">
            <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
            <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Back
            </Text>
          </TouchableOpacity>
          <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase truncate flex-1 text-center px-4">
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

              {/* SCORING PANEL SLOT */}
              {ScoringPanelComponent && <ScoringPanelComponent game={game} role="SCORER" />}

              {/* GAME EVENTS PANEL SLOT */}
              {GameEventsPanelComponent && <GameEventsPanelComponent game={game} role="SCORER" />}

              {/* GENERAL PLAY PANEL SLOT */}
              {GeneralPlayPanelComponent && <GeneralPlayPanelComponent game={game} role="SCORER" />}
            </View>

            {/* EVENTS & DRAWER TABS PANEL (LOG FEED / ROSTERS / STATS - SHOWN ON RIGHT ON LARGE SCREENS) */}
            <View className="w-full lg:w-96 xl:w-[440px]">
              <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-3 shadow-sm mt-2 lg:mt-0">
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
                  {activeTab === 'team1' && p1 && <TeamRosterPanel gameId={game.id} participantId={p1.id} />}
                  {activeTab === 'team2' && p2 && <TeamRosterPanel gameId={game.id} participantId={p2.id} />}
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
