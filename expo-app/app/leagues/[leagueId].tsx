import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { useActiveTheme } from '../../store/settingsStore';
import { readData } from '../../services/reads';
import { useSocketQuery } from '../../hooks/useSocketQuery';
import { useWsStore } from '../../store/wsStore';
import { League, Season, LeagueStandingRow, Game, Sport } from '@sk/shared';
import { finishedScoreLine } from '../../utils/matchScore';
import CustomSelect from '../../components/CustomSelect';
import { ReadFailure } from '../../components/ReadFailure';
import { RoomFailure } from '../../components/RoomFailure';
import { useLiveRoom } from '../../hooks/useLiveRoom';
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
  // Only the name beside the league's: it stays blank if this fails, so nothing false is on screen.
  const { data: sports } = useSocketQuery<Sport[]>('sports', {}, { suppressToast: true });
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  
  // Selected Season dynamic states
  const [standings, setStandings] = useState<LeagueStandingRow[]>([]);
  const [fixtures, setFixtures] = useState<Game[]>([]);

  // What failed (`SYNC-9`), and the Try again of each.
  const [leagueError, setLeagueError] = useState<string | null>(null);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const [standingsError, setStandingsError] = useState<string | null>(null);
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [leagueAttempt, setLeagueAttempt] = useState(0);
  const [seasonsAttempt, setSeasonsAttempt] = useState(0);
  const [detailsAttempt, setDetailsAttempt] = useState(0);
  /** The season each list holds: another season's must not stand in when this one's read fails. */
  const answeredSeason = useRef<{ standings?: string; fixtures?: string }>({});

  const retryLoad = () => {
    if (leagueError) setLeagueAttempt(n => n + 1);
    if (seasonsError) setSeasonsAttempt(n => n + 1);
  };
  const retryDetails = () => setDetailsAttempt(n => n + 1);

  // 1. Initial Load: League and Seasons list
  useEffect(() => {
    if (!isConnected || !leagueId) return;

    let active = true;
    setLeagueError(null);

    void readData<League | null>('league', { id: leagueId }, { suppressToast: true, stillWanted: () => active }).then(result => {
      if (!active) return;
      if (!result.ok) return setLeagueError(result.message);
      if (result.data) setLeague(result.data);
    });

    return () => {
      active = false;
    };
  }, [isConnected, leagueId, leagueAttempt]);

  useEffect(() => {
    if (!isConnected || !leagueId) return;

    let active = true;
    setIsLoadingLeague(true);
    setSeasonsError(null);

    void readData<Season[]>('seasons', { leagueId }, { suppressToast: true, stillWanted: () => active }).then(result => {
      if (!active) return;
      if (!result.ok) {
        setSeasonsError(result.message);
      } else if (Array.isArray(result.data)) {
        const res = result.data;
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
    });

    return () => {
      active = false;
    };
  }, [isConnected, leagueId, seasonsAttempt]);

  // 2. Fetch Standings & Games whenever selected season changes, and subscribe to room
  useEffect(() => {
    if (!isConnected || !selectedSeasonId) return;

    let active = true;
    const wanted = { suppressToast: true, stillWanted: () => active };
    setIsLoadingStandings(true);
    setStandingsError(null);
    setFixturesError(null);

    void Promise.all([
      // Fetch standings
      readData<Season | null>('season', { id: selectedSeasonId }, wanted).then(result => {
        if (!active) return;
        if (result.ok) {
          answeredSeason.current.standings = selectedSeasonId;
          setStandings(result.data?.cachedStandings || []);
        } else {
          if (answeredSeason.current.standings !== selectedSeasonId) setStandings([]);
          setStandingsError(result.message);
        }
      }),
      // Fetch linked games
      readData<Game[]>('season_games', { id: selectedSeasonId }, wanted).then(result => {
        if (!active) return;
        if (result.ok) {
          answeredSeason.current.fixtures = selectedSeasonId;
          setFixtures(Array.isArray(result.data) ? result.data : []);
        } else {
          if (answeredSeason.current.fixtures !== selectedSeasonId) setFixtures([]);
          setFixturesError(result.message);
        }
      }),
    ]).then(() => {
      if (active) setIsLoadingStandings(false);
    });

    return () => {
      active = false;
    };
  }, [isConnected, selectedSeasonId, detailsAttempt]);

  // Standings updates in real time: every recalculation, merged with no read. A sibling screen
  // already holding the room replays the last (`LIVE-9`).
  const liveStandings = useLiveRoom<LeagueStandingRow>(selectedSeasonId ? `season:${selectedSeasonId}:standings` : null, {
    reduce: message =>
      message.type === 'STANDINGS_UPDATED' && Array.isArray(message.data)
        ? { kind: 'replace', items: message.data }
        : { kind: 'ignore' },
  });
  useEffect(() => {
    // Only what the room has actually said: its empty hold before the first push is not an answer.
    if (liveStandings.isLoading || liveStandings.notFound || !selectedSeasonId) return;
    // As good an answer as the read's, so a failed read has nothing left to say.
    answeredSeason.current.standings = selectedSeasonId;
    setStandingsError(null);
    setStandings(liveStandings.items);
  }, [liveStandings.items, liveStandings.isLoading, liveStandings.notFound]);

  const getSportName = (sportId: string) => {
    const s = sports?.find(x => x.id === sportId);
    return s ? s.name : sports ? sportId : '';
  };

  /** "19 Sep 2026 · 14:30", the one way the app writes a kick-off (`UI-13`). */
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
          <Text numberOfLines={1} className="font-orbitron-bold text-sm tracking-widest text-ink uppercase text-center">
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
      ) : seasonsError && !seasons.length ? (
        <View className="px-6 py-6">
          <ReadFailure what="This league" reason={seasonsError} onRetry={retryLoad} />
        </View>
      ) : (
        <View className="flex-1">
          {leagueError || seasonsError ? (
            <View className="px-6 pt-3">
              <ReadFailure what={seasonsError ? 'The seasons' : 'The league'} reason={(seasonsError || leagueError)!} onRetry={retryLoad} stale={!!seasonsError} />
            </View>
          ) : null}

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
              {activeTab === 'standings' && standingsError && (
                <ReadFailure what="The standings" reason={standingsError} onRetry={retryDetails} stale={standings.length > 0} />
              )}
              {activeTab === 'standings' && !standingsError && (
                // The read's table is there; this says it is not keeping up (`LIVE-25`).
                <RoomFailure rooms={[liveStandings.room]} what="The standings" stale={standings.length > 0} />
              )}

              {activeTab === 'standings' && (!standingsError || standings.length > 0) && (
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
                          <Text numberOfLines={1} className="flex-1 font-orbitron-bold text-xs text-ink pr-2">{row.teamName}</Text>
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
                <View className="gap-4">
                  {fixturesError ? (
                    <ReadFailure what="The matches" reason={fixturesError} onRetry={retryDetails} stale={fixtures.length > 0} />
                  ) : null}

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

                  {fixtures.length === 0 && !fixturesError && (
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
