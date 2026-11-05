import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { wsService } from '../../../../../../../services/websocket';
import { readData } from '../../../../../../../services/reads';
import { useWsStore } from '../../../../../../../store/wsStore';
import { SocketAction, Event, Game } from '@sk/shared';

import { useAuthStore } from '../../../../../../../store/authStore';
import { useGameCapabilities } from '../../../../../../../hooks/useGameCapabilities';
import { useEventCapabilities } from '../../../../../../../hooks/useEventCapabilities';
import { getMatchPermissions } from '../../../../../../../utils/matchPermissions';
import { DynamicScoringProvider, ScoringReadNote } from '../../../../../../../components/sports/shared/DynamicScoringContext';
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
import { ReadFailure } from '../../../../../../../components/ReadFailure';
import { ScreenHeader } from '../../../../../../../components/ScreenHeader';
import { useActiveTheme } from '../../../../../../../store/settingsStore';
import { themeColor } from '../../../../../../../constants/Colors';

export default function ScoreGameScreen() {
  const isDark = useActiveTheme() === 'dark';
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, gameId } = useLocalSearchParams<{ orgId: string; eventId: string; gameId: string }>();
  const { capabilities, isLoading: capabilitiesLoading, error: capabilitiesError, retry: retryCapabilities } = useEventCapabilities(eventId, { suppressToast: true });
  const { capabilities: gameCapabilities, isLoading: gameCapabilitiesLoading, error: gameCapabilitiesError, retry: retryGameCapabilities } = useGameCapabilities(gameId, { suppressToast: true });
  const isConnected = useWsStore((state: any) => state.isConnected);

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);

  const [game, setGame] = useState<Game | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [gameError, setGameError] = useState<string | null>(null);
  const [eventLoading, setEventLoading] = useState(!!eventId);
  const [eventError, setEventError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<'feed' | 'team1' | 'team2' | 'stats'>('feed');

  useEffect(() => {
    if (!isConnected || !gameId) return;

    // Coming back from a dropped connection reads again behind the scoring screen, not instead of it.
    if (game?.id !== gameId) setIsLoading(true);
    setGameError(null);

    let active = true;
    const options = { suppressToast: true, stillWanted: () => active };

    if (eventId) {
      setEventLoading(true);
      setEventError(null);
      void readData<Event | null>('event', { id: eventId }, options).then(result => {
        if (!active) return;
        if (result.ok) {
          if (result.data) setEvent(result.data);
        } else {
          setEventError(result.message);
        }
        setEventLoading(false);
      });
    }

    void readData<Game | null>('game', { id: gameId }, options).then(result => {
      if (!active) return;
      if (result.ok) {
        if (result.data) setGame(result.data);
      } else {
        setGameError(result.message);
      }
      setIsLoading(false);
    });

    return () => { active = false; };
  }, [isConnected, gameId, attempt]);

  useEffect(() => {
    if (!gameId) return;

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
  }, [gameId]);

  const backToGame = () => safeBack(`/admin/${orgId}/events/${eventId}/games/${gameId}`);
  const retryReads = () => {
    if (gameError || eventError) setAttempt(n => n + 1);
    if (capabilitiesError) retryCapabilities();
    if (gameCapabilitiesError) retryGameCapabilities();
  };
  const spinner = (
    <SafeAreaView className="flex-1 bg-canvas justify-center items-center">
      <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
      <Text className="font-orbitron text-xs text-ink-muted mt-4 uppercase tracking-widest">
        Loading Control Room...
      </Text>
    </SafeAreaView>
  );

  if (isLoading) return spinner;
  if (!game) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <ScreenHeader title="Game Control Room" onBack={backToGame} />
        <View className="flex-1 items-center justify-center p-6">
          {gameError
            ? <ReadFailure what="This game" reason={gameError} onRetry={retryReads} />
            : <Text className="font-inter text-sm text-ink-muted text-center">This game was not found.</Text>}
        </View>
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
    // And from an appointed scorer or match official, whom no membership names (`PERM-6`).
    gameCapabilities,
  });
  // An appointed timekeeper gets the timekeeping section alone (`PERM-7`).
  const timekeeperOnly = !permissions.canScore && !!gameCapabilities?.canKeepTime;
  // Permissions only widen with what these say, so without them "may not score" is not yet known.
  const rightsError = eventError || capabilitiesError || gameCapabilitiesError;

  // Being signed into the workspace is not enough to score: the control room is
  // for org admins/staff and coaches of a participating team. Everyone else is
  // sent to the read-only match view.
  if (!permissions.canScore && !timekeeperOnly) {
    if (eventLoading || capabilitiesLoading || gameCapabilitiesLoading) return spinner;
    if (rightsError) {
      return (
        <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
          <ScreenHeader title="Game Control Room" onBack={backToGame} />
          <View className="flex-1 items-center justify-center p-6">
            <ReadFailure title="Your right to score this match could not be checked." reason={rightsError} onRetry={retryReads} />
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        <AccessDenied
          title="Scoring Restricted"
          message="You do not have permission to score this match. Org admins and staff, its teams' coaches and scorers, and its appointed officials can open the control room."
          actionLabel="Open Match View"
          onAction={() => router.replace(`/admin/${orgId}/events/${eventId}/games/${gameId}` as any)}
        />
      </SafeAreaView>
    );
  }

  const sportCategory = game.sportId ? 'Rugby' : 'Rugby';
  const ScoreboardComponent = SportComponentRegistry.getScoreboard(sportCategory);

  const p1 = game.participants?.[0];
  const p2 = game.participants?.[1];

  return (
    <DynamicScoringProvider game={game} showReadNote={false}>
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
        {/* HEADER BAR */}
        <View className="flex-row items-center justify-between px-4 py-2.5 border-b border-line-soft bg-card z-10">
          <TouchableOpacity onPress={() => safeBack(`/admin/${orgId}/events/${eventId}/games/${gameId}`)} className="flex-row items-center gap-1">
            <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
            <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">
              Back
            </Text>
          </TouchableOpacity>
          <Text numberOfLines={1} className="font-orbitron-bold text-sm tracking-widest text-ink uppercase flex-1 text-center px-4">
            Game Control Room
          </Text>
          {/* Back to the game's page — there is no View / Lineup / Edit / Score switcher since stage 3. */}
          <View style={{ width: 60 }} />
        </View>

        <ScrollView className="flex-1 px-4 py-2" contentContainerStyle={{ paddingBottom: 30 }}>
          {/* What did not load, above what is held: scoring carries on underneath. */}
          {gameError ? <ReadFailure what="The game" reason={gameError} onRetry={retryReads} stale /> : null}
          {timekeeperOnly && rightsError ? <ReadFailure title="You may have more than the clock here, but your rights could not be checked." reason={rightsError} onRetry={retryReads} className="mb-2" /> : null}
          <ScoringReadNote />
          <View className="flex-col lg:flex-row gap-3 items-start justify-center max-w-7xl mx-auto w-full">
            {/* MAIN SCORING COLUMN (TIMER, SCOREBOARD, DISPUTES & SCORER PANELS) */}
            <View className="w-full flex-1 max-w-3xl">
              {/* TIMER SLOT */}
              <TimerPanelSlot game={game} canEdit={true} timekeeperOnly={timekeeperOnly} />

              {/* SCOREBOARD SLOT — with its sin-bins, which are timekeeping too */}
              {ScoreboardComponent && <ScoreboardComponent game={game} role={timekeeperOnly ? 'TIMEKEEPER' : 'SCORER'} />}

              {timekeeperOnly ? null : (
                <>
                  {/* DISPUTES PANEL */}
                  <ActiveDisputesPanel gameId={game.id} game={game as any} />

                  {/* SCORING PANELS — one per section the sport declares, in its own order */}
                  <DynamicScoringPanels role="SCORER" />
                </>
              )}
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
                  {activeTab === 'feed' && <EventLogFeed gameId={game.id} game={game} canManage={!timekeeperOnly} />}
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
