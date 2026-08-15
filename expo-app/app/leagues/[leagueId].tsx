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
import CustomSelect from '../../components/CustomSelect';

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
    const unsubscribe = wsService.subscribeToRoom(room);

    // Merge directly on update: strictly NO server refetch!
    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event && event.type === 'STANDINGS_UPDATED' && Array.isArray(event.data)) {
        setStandings(event.data);
      }
    };

    wsService.on('update', handleUpdate);

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

  const formatTime = (game: any) => {
    const isoString = game?.scheduledStartTime || game?.startTime || '';
    try {
      const d = new Date(isoString);
      if (game?.customSettings?.timeTbd) {
        return `${d.toLocaleDateString()} @ TBD`;
      }
      return `${d.toLocaleDateString()} @ ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity onPress={() => safeBack('/(tabs)/organizations')} className="flex-row items-center gap-1 active:opacity-85">
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">Back</Text>
        </TouchableOpacity>
        <View className="items-center max-w-[65%]">
          <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase truncate text-center">
            {league ? league.name : 'League Leaderboard'}
          </Text>
          <Text className="font-inter text-[9px] text-slate-450 uppercase mt-0.5 tracking-wider">
            {league ? getSportName(league.sportId) : ''}
          </Text>
        </View>
        <View className="w-8" />
      </View>

      {isLoadingLeague ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
        </View>
      ) : (
        <View className="flex-1">
          {/* Season Selector bar */}
          <View className="flex-row items-center justify-between px-6 py-3 bg-white dark:bg-slate-900/50 border-b border-slate-200 dark:border-white/5 gap-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Active Season:</Text>
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
          <View className="flex-row border-b border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 px-4">
            <TouchableOpacity
              onPress={() => setActiveTab('standings')}
              className="flex-1 items-center py-3 border-b-2 flex-row justify-center gap-1.5 active:opacity-80"
              style={{ borderBottomColor: activeTab === 'standings' ? '#FF3E00' : 'transparent' }}
            >
              <Ionicons name="trophy-outline" size={14} color={activeTab === 'standings' ? '#FF3E00' : '#94A3B8'} />
              <Text
                className="font-orbitron-bold text-[10px] uppercase tracking-wider"
                style={{ color: activeTab === 'standings' ? '#FF3E00' : '#94A3B8' }}
              >
                Standings
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveTab('fixtures')}
              className="flex-1 items-center py-3 border-b-2 flex-row justify-center gap-1.5 active:opacity-80"
              style={{ borderBottomColor: activeTab === 'fixtures' ? '#FF3E00' : 'transparent' }}
            >
              <Ionicons name="calendar-outline" size={14} color={activeTab === 'fixtures' ? '#FF3E00' : '#94A3B8'} />
              <Text
                className="font-orbitron-bold text-[10px] uppercase tracking-wider"
                style={{ color: activeTab === 'fixtures' ? '#FF3E00' : '#94A3B8' }}
              >
                Matches & Results
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab content */}
          {isLoadingStandings ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="small" color="#FF3E00" />
            </View>
          ) : (
            <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
              {activeTab === 'standings' && (
                <GlassCard className="border border-slate-200 dark:border-white/5 p-4 overflow-hidden">
                  <View className="overflow-x-auto">
                    <View className="min-w-[400px]">
                      {/* Table Header */}
                      <View className="flex-row border-b border-slate-200 dark:border-white/5 pb-2">
                        <Text className="w-8 font-inter-bold text-[9px] text-slate-400 uppercase text-center">Pos</Text>
                        <Text className="flex-1 font-inter-bold text-[9px] text-slate-400 uppercase">Team</Text>
                        <Text className="w-8 font-inter-bold text-[9px] text-slate-400 uppercase text-center">P</Text>
                        <Text className="w-8 font-inter-bold text-[9px] text-slate-400 uppercase text-center">W</Text>
                        <Text className="w-8 font-inter-bold text-[9px] text-slate-400 uppercase text-center">D</Text>
                        <Text className="w-8 font-inter-bold text-[9px] text-slate-400 uppercase text-center">L</Text>
                        <Text className="w-12 font-inter-bold text-[9px] text-slate-400 uppercase text-center">Diff</Text>
                        <Text className="w-12 font-inter-bold text-[9px] text-slate-400 uppercase text-center">Pts</Text>
                      </View>

                      {/* Rows */}
                      {standings.map((row, idx) => (
                        <View key={row.teamId} className="flex-row py-3 border-b border-slate-100 dark:border-white/5 items-center">
                          <Text className="w-8 font-orbitron-bold text-xs text-slate-500 dark:text-slate-400 text-center">{idx + 1}</Text>
                          <Text className="flex-1 font-orbitron-bold text-xs text-slate-800 dark:text-white truncate pr-2">{row.teamName}</Text>
                          <Text className="w-8 font-inter text-xs text-slate-600 dark:text-slate-400 text-center">{row.played}</Text>
                          <Text className="w-8 font-inter text-xs text-slate-600 dark:text-slate-400 text-center">{row.wins}</Text>
                          <Text className="w-8 font-inter text-xs text-slate-600 dark:text-slate-400 text-center">{row.draws}</Text>
                          <Text className="w-8 font-inter text-xs text-slate-600 dark:text-slate-400 text-center">{row.losses}</Text>
                          <Text className={`w-12 font-inter-bold text-xs text-center ${row.pointsDifference > 0 ? 'text-emerald-500' : row.pointsDifference < 0 ? 'text-red-550' : 'text-slate-500'}`}>
                            {row.pointsDifference > 0 ? `+${row.pointsDifference}` : row.pointsDifference}
                          </Text>
                          <Text className="w-12 font-orbitron-bold text-xs text-brand-orange text-center">{row.points}</Text>
                        </View>
                      ))}

                      {standings.length === 0 && (
                        <View className="items-center justify-center py-12">
                          <Ionicons name="trophy-outline" size={32} color="#94A3B8" className="opacity-40 mb-2" />
                          <Text className="font-inter text-xs text-slate-450 text-center">No scores recorded yet.</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </GlassCard>
              )}

              {activeTab === 'fixtures' && (
                <View className="space-y-4">
                  {fixtures.map((game) => (
                    <GlassCard key={game.id} className="border border-slate-200 dark:border-white/5 p-4">
                      <View className="flex-row justify-between items-center mb-2">
                        <Text className="font-inter-bold text-[9px] text-slate-400 uppercase tracking-wide">
                          {formatTime(game)}
                        </Text>
                        <View className={`px-2 py-0.5 rounded ${game.status === 'Finished' ? 'bg-slate-200/50 dark:bg-white/10' : 'bg-cyan-500/10 border border-cyan-500/20'}`}>
                          <Text className={`font-orbitron-bold text-[8px] uppercase tracking-wider ${game.status === 'Finished' ? 'text-slate-500' : 'text-cyan-500'}`}>
                            {game.status}
                          </Text>
                        </View>
                      </View>

                      <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white text-center py-2 uppercase tracking-wide">
                        {(game.participants?.[0] as any)?.teamName || 'Home'} 
                        <Text className="text-brand-orange text-[10px] font-inter lowercase"> vs </Text> 
                        {(game.participants?.[1] as any)?.teamName || 'Away'}
                      </Text>

                      {game.status === 'Finished' && game.finalScoreData && (
                        <Text className="font-orbitron-bold text-base text-brand-orange text-center pb-2">
                          {game.finalScoreData.home} - {game.finalScoreData.away}
                        </Text>
                      )}
                    </GlassCard>
                  ))}

                  {fixtures.length === 0 && (
                    <View className="items-center justify-center py-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
                      <Ionicons name="calendar-outline" size={32} color="#94A3B8" className="opacity-45 mb-2" />
                      <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400">No Matches Scheduled</Text>
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
