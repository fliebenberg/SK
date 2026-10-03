import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../store/settingsStore';
import { wsService } from '../../services/websocket';
import { useWsStore } from '../../store/wsStore';
import { League, Season, LeagueStandingRow, Game, Sport } from '@sk/shared';
import { finishedScoreLine } from '../../utils/matchScore';
import CustomSelect from '../../components/CustomSelect';
import { formatFixtureWhen } from '../../utils/dates';
import { themeColor } from '../../constants/Colors';


export default function PublicLeagueStandings() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Loading States
  const [isLoadingLeague, setIsLoadingLeague] = useState(true);
  const [isLoadingStandings, setIsLoadingStandings] = useState(false);
  const [activeTab, setActiveTab] = useState<'standings' | 'fixtures'>('standings');

  // Data States
  const [league, setLeague] = useState<League | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  
  // Selected Season dynamic states
  const [standings, setStandings] = useState<LeagueStandingRow[]>([]);
  const [fixtures, setFixtures] = useState<Game[]>([]);

  // 1. Initial Load: League and Seasons list
  useEffect(() => {
    if (!isConnected || !leagueId) return;

    let active = true;
    setIsLoadingLeague(true);

    wsService.emit('get_data', { type: 'league', id: leagueId }, (res: any) => {
      if (active && res) setLeague(res);
    });

    wsService.emit('get_data', { type: 'seasons', leagueId }, (res: any) => {
      if (active) {
        if (Array.isArray(res)) {
          setSeasons(res);
          // Set initial season (prefer active, otherwise first)
          const activeSeason = res.find(s => s.status === 'ACTIVE');
          if (activeSeason) {
            setSelectedSeasonId(activeSeason.id);
          } else if (res.length > 0) {
            setSelectedSeasonId(res[0].id);
          }
        }
        setIsLoadingLeague(false);
      }
    });

    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });

    return () => {
      active = false;
    };
  }, [isConnected, leagueId]);

  // 2. Fetch Standings & Games whenever selected season changes, and subscribe to room
  useEffect(() => {
    if (!isConnected || !selectedSeasonId) return;

    let active = true;
    setIsLoadingStandings(true);

    const loadSeasonDetails = () => {
      // Fetch standings
      wsService.emit('get_data', { type: 'season', id: selectedSeasonId }, (res: any) => {
        if (active && res) {
          setStandings(res.cachedStandings || []);
        }
      });

      // Fetch linked games
      wsService.emit('get_data', { type: 'season_games', id: selectedSeasonId }, (res: any) => {
        if (active) {
          if (Array.isArray(res)) setFixtures(res);
          setIsLoadingStandings(false);
        }
      });
    };

    loadSeasonDetails();

    // Subscribe to standings updates in real-time
    const room = `season:${selectedSeasonId}:standings`;

    // Merge directly on update: strictly NO server refetch!
    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event && event.type === 'STANDINGS_UPDATED' && Array.isArray(event.data)) {
        setStandings(event.data);
      }
    };

    wsService.on('update', handleUpdate);
    // Replay handler, so arriving second at a room a sibling screen already holds still
    // yields the standings (`LIVE-9`).
    const unsubscribe = wsService.subscribeToRoom(room, handleUpdate);

    return () => {
      active = false;
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, selectedSeasonId]);

  const getSportName = (sportId: string) => {
    const s = sports.find(x => x.id === sportId);
    return s ? s.name : sportId;
  };

  /** Third copy of this, extracted to `utils/dates.ts` in U49. Renders exactly as it always did. */
  const formatTime = (game: any) =>
    formatFixtureWhen(game?.scheduledStartTime || game?.startTime, {
      timeTbd: game?.customSettings?.timeTbd,
    });

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity onPress={() => safeBack('/(tabs)/organizations')} className="flex-row items-center gap-1 active:opacity-85">
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">Back</Text>
        </TouchableOpacity>
        <View className="items-center max-w-[65%]">
          <Text className="font-orbitron-bold text-sm tracking-widest text-ink uppercase truncate text-center">
            {league ? league.name : 'League Leaderboard'}
          </Text>
          <Text className="font-inter text-[9px] text-ink-muted uppercase mt-0.5 tracking-wider">
            {league ? getSportName(league.sportId) : ''}
          </Text>
        </View>
        <View className="w-8" />
      </View>

      {isLoadingLeague ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        </View>
      ) : (
        <View className="flex-1">
          {/* Season Selector bar */}
          <View className="flex-row items-center justify-between px-6 py-3 bg-card border-b border-line gap-4">
            <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-widest">Active Season:</Text>
            <CustomSelect
              value={selectedSeasonId}
              onChange={setSelectedSeasonId}
              options={seasons.map(s => ({ value: s.id, label: `${s.name} (${s.status})` }))}
              placeholder="Select Season"
              className="flex-1 max-w-[200px]"
              style={{ height: 38, paddingVertical: 0 }}
            />
          </View>

          {/* Tabs */}
          <View className="flex-row border-b border-line bg-card px-4">
            <TouchableOpacity
              onPress={() => setActiveTab('standings')}
              className="flex-1 items-center py-3 border-b-2 flex-row justify-center gap-1.5 active:opacity-80"
              style={{ borderBottomColor: activeTab === 'standings' ? themeColor(isDark, 'primary') : 'transparent' }}
            >
              <Ionicons name="trophy-outline" size={14} color={themeColor(isDark, activeTab === 'standings' ? 'primary-ink' : 'ink-muted')} />
              <Text
                className="font-orbitron-bold text-[10px] uppercase tracking-wider"
                style={{ color: themeColor(isDark, activeTab === 'standings' ? 'primary-ink' : 'ink-muted') }}
              >
                Standings
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('fixtures')}
              className="flex-1 items-center py-3 border-b-2 flex-row justify-center gap-1.5 active:opacity-80"
              style={{ borderBottomColor: activeTab === 'fixtures' ? themeColor(isDark, 'primary') : 'transparent' }}
            >
              <Ionicons name="calendar-outline" size={14} color={themeColor(isDark, activeTab === 'fixtures' ? 'primary-ink' : 'ink-muted')} />
              <Text
                className="font-orbitron-bold text-[10px] uppercase tracking-wider"
                style={{ color: themeColor(isDark, activeTab === 'fixtures' ? 'primary-ink' : 'ink-muted') }}
              >
                Matches & Results
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab content */}
          {isLoadingStandings ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color={themeColor(isDark, 'primary')} />
            </View>
          ) : (
            <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
              {activeTab === 'standings' && (
                <GlassCard className="border border-line p-4 overflow-hidden">
                  <View className="overflow-x-auto">
                    <View className="min-w-[400px]">
                      {/* Table Header */}
                      <View className="flex-row border-b border-line pb-2">
                        <Text className="w-8 font-inter-bold text-[9px] text-ink-muted uppercase text-center">Pos</Text>
                        <Text className="flex-1 font-inter-bold text-[9px] text-ink-muted uppercase">Team</Text>
                        <Text className="w-8 font-inter-bold text-[9px] text-ink-muted uppercase text-center">P</Text>
                        <Text className="w-8 font-inter-bold text-[9px] text-ink-muted uppercase text-center">W</Text>
                        <Text className="w-8 font-inter-bold text-[9px] text-ink-muted uppercase text-center">D</Text>
                        <Text className="w-8 font-inter-bold text-[9px] text-ink-muted uppercase text-center">L</Text>
                        <Text className="w-12 font-inter-bold text-[9px] text-ink-muted uppercase text-center">Diff</Text>
                        <Text className="w-12 font-inter-bold text-[9px] text-ink-muted uppercase text-center">Pts</Text>
                      </View>

                      {/* Rows */}
                      {standings.map((row, idx) => (
                        <View key={row.teamId} className="flex-row py-3 border-b border-line-soft items-center">
                          <Text className="w-8 font-orbitron-bold text-xs text-ink-muted text-center">{idx + 1}</Text>
                          <Text className="flex-1 font-orbitron-bold text-xs text-ink truncate pr-2">{row.teamName}</Text>
                          <Text className="w-8 font-inter text-xs text-ink-muted text-center">{row.played}</Text>
                          <Text className="w-8 font-inter text-xs text-ink-muted text-center">{row.wins}</Text>
                          <Text className="w-8 font-inter text-xs text-ink-muted text-center">{row.draws}</Text>
                          <Text className="w-8 font-inter text-xs text-ink-muted text-center">{row.losses}</Text>
                          <Text className={`w-12 font-inter-bold text-xs text-center ${row.pointsDifference > 0 ? 'text-success-ink' : row.pointsDifference < 0 ? 'text-danger-ink' : 'text-ink-muted'}`}>
                            {row.pointsDifference > 0 ? `+${row.pointsDifference}` : row.pointsDifference}
                          </Text>
                          <Text className="w-12 font-orbitron-bold text-xs text-primary-ink text-center">{row.points}</Text>
                        </View>
                      ))}

                      {standings.length === 0 && (
                        <View className="items-center justify-center py-12">
                          <Ionicons name="trophy-outline" size={32} color={themeColor(isDark, 'ink-muted')} className="opacity-40 mb-2" />
                          <Text className="font-inter text-xs text-ink-muted text-center">No scores recorded yet.</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </GlassCard>
              )}

              {activeTab === 'fixtures' && (
                <View className="space-y-4">
                  {fixtures.map((game) => (
                    <GlassCard key={game.id} className="border border-line p-4">
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="font-inter-bold text-[9px] text-ink-muted uppercase tracking-wide">
                          {formatTime(game)}
                        </Text>
                        <View className={`px-2 py-0.5 rounded ${game.status === 'Finished' ? 'bg-sunken' : 'bg-accent-soft border border-accent-line'}`}>
                          <Text className={`font-orbitron-bold text-[8px] uppercase tracking-wider ${game.status === 'Finished' ? 'text-ink-muted' : 'text-accent-ink'}`}>
                            {game.status}
                          </Text>
                        </View>
                      </View>

                      <Text className="font-orbitron-bold text-sm text-ink text-center py-2 uppercase tracking-wide">
                        {(game.participants?.[0] as any)?.teamName || 'Home'} 
                        <Text className="text-primary-ink text-[10px] font-inter lowercase"> vs </Text> 
                        {(game.participants?.[1] as any)?.teamName || 'Away'}
                      </Text>

                      {finishedScoreLine(game) && (
                        <Text className="font-orbitron-bold text-base text-primary-ink text-center pb-2">
                          {finishedScoreLine(game)}
                        </Text>
                      )}
                    </GlassCard>
                  ))}

                  {fixtures.length === 0 && (
                    <View className="items-center justify-center py-10 bg-card border border-line rounded-2xl">
                      <Ionicons name="calendar-outline" size={32} color={themeColor(isDark, 'ink-muted')} className="opacity-45 mb-2" />
                      <Text className="font-orbitron-bold text-xs text-ink-muted">No Matches Scheduled</Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}
