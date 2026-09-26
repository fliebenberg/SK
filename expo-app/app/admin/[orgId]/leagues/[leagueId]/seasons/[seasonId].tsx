import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Platform, Image } from 'react-native';
import { useUnsavedChanges } from '../../../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../../../store/unsavedChangesStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../../components/GlassCard';
import { Button } from '../../../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../../../store/settingsStore';
import { wsService } from '../../../../../../services/websocket';
import { sendAction } from '../../../../../../services/actions';
import { useWsStore } from '../../../../../../store/wsStore';
import { SocketAction, Season, SeasonTeam, LeagueStandingRow, Game, Team, reseedDecision } from '@sk/shared';
import { finishedScoreLine } from '../../../../../../utils/matchScore';
import DatePicker from '../../../../../../components/DatePicker';
import { getOrgLogoUrl } from '../../../../../../services/assets';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { calendarRangeStatus, formatFixtureWhen, isCalendarDate } from '../../../../../../utils/dates';

/** Where a season sits against the viewer's today. Its dates are calendar dates, both inclusive. */
const calculateSeasonStatus = (startDate: string, endDate: string): 'UPCOMING' | 'ACTIVE' | 'COMPLETED' => {
  const status = calendarRangeStatus(startDate, endDate);
  if (status === 'during') return 'ACTIVE';
  if (status === 'after') return 'COMPLETED';
  return 'UPCOMING';
};

/** The season settings form — the fields the Save bar above the season covers. */
interface SeasonSettingsForm {
  name: string;
  startDate: string;
  endDate: string;
  ptsWin: string;
  ptsDraw: string;
  ptsLoss: string;
  logo: string;
}

/** A season record, in the shape the settings form holds it. Defaults match the form's own. */
const seasonSettingsOf = (season: any): SeasonSettingsForm => ({
  name: season?.name || '',
  startDate: season?.startDate || '',
  endDate: season?.endDate || '',
  ptsWin: String(season?.settings?.pointsPerWin ?? 4),
  ptsDraw: String(season?.settings?.pointsPerDraw ?? 2),
  ptsLoss: String(season?.settings?.pointsPerLoss ?? 0),
  logo: season?.logo || '',
});

const sameSeasonSettings = (a: SeasonSettingsForm, b: SeasonSettingsForm) =>
  a.name.trim() === b.name.trim() &&
  a.startDate === b.startDate &&
  a.endDate === b.endDate &&
  a.ptsWin === b.ptsWin &&
  a.ptsDraw === b.ptsDraw &&
  a.ptsLoss === b.ptsLoss &&
  a.logo === b.logo;

export default function SeasonDetails() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, leagueId, seasonId } = useLocalSearchParams<{ orgId: string, leagueId: string, seasonId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // States
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'standings' | 'teams' | 'games' | 'settings'>('standings');
  
  // Data States
  const [season, setSeason] = useState<Season | null>(null);
  const [standings, setStandings] = useState<LeagueStandingRow[]>([]);
  const [seasonTeams, setSeasonTeams] = useState<any[]>([]);
  const [seasonGames, setSeasonGames] = useState<Game[]>([]);
  
  // Org lists (for association modals)
  const [orgTeams, setOrgTeams] = useState<Team[]>([]);
  const [orgGames, setOrgGames] = useState<Game[]>([]);

  // Modals & Action States
  const [isAddTeamOpen, setIsAddTeamOpen] = useState(false);
  const [isLinkGameOpen, setIsLinkGameOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Confirmations
  const [teamToRemove, setTeamToRemove] = useState<any | null>(null);
  const [gameToUnlink, setGameToUnlink] = useState<Game | null>(null);
  
  // Settings edit states
  const [ptsWin, setPtsWin] = useState('4');
  const [ptsDraw, setPtsDraw] = useState('2');
  const [ptsLoss, setPtsLoss] = useState('0');
  const [seasonName, setSeasonName] = useState('');
  const [startDateStr, setStartDateStr] = useState('');
  const [endDateStr, setEndDateStr] = useState('');
  const [seasonLogo, setSeasonLogo] = useState('');

  /**
   * What the settings fields were last seeded from (`UI-19`).
   *
   * The Save bar is measured against this rather than against `season`, because `season` is
   * re-read by `refreshSeasonData` after unrelated actions and can come back carrying somebody
   * else's edit.
   */
  const [settingsBaseline, setSettingsBaseline] = useState<SeasonSettingsForm | null>(null);

  /** The settings fields as they stand. */
  const currentSeasonSettings = (): SeasonSettingsForm => ({
    name: seasonName,
    startDate: startDateStr,
    endDate: endDateStr,
    ptsWin,
    ptsDraw,
    ptsLoss,
    logo: seasonLogo,
  });

  const seedSeasonSettings = (from: SeasonSettingsForm) => {
    // One batch, so the fields and the baseline they are measured against never disagree.
    setSeasonName(from.name);
    setStartDateStr(from.startDate);
    setEndDateStr(from.endDate);
    setPtsWin(from.ptsWin);
    setPtsDraw(from.ptsDraw);
    setPtsLoss(from.ptsLoss);
    setSeasonLogo(from.logo);
    setSettingsBaseline(from);
  };

  const computedStatus = calculateSeasonStatus(startDateStr, endDateStr);

  // Logo Picker Handler
  const handlePickSeasonLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('We need camera roll permissions to change the season logo.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const minDim = Math.min(asset.width, asset.height);
        const actions = [{
          crop: {
            originX: Math.round((asset.width - minDim) / 2),
            originY: Math.round((asset.height - minDim) / 2),
            width: minDim,
            height: minDim,
          }
        }];
        if (minDim > 1024) actions.push({ resize: { width: 1024, height: 1024 } } as any);
        const manipulateResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          actions,
          { compress: 0.8, format: ImageManipulator.SaveFormat.PNG, base64: true }
        );
        setSeasonLogo(`data:image/png;base64,${manipulateResult.base64}`);
      }
    } catch (err) {
      console.error('[SeasonDetails] Error picking season logo:', err);
      alert('Failed to process selected logo');
    }
  };

  // Load Data
  useEffect(() => {
    if (!isConnected || !seasonId || !orgId) return;

    let active = true;
    setIsLoading(true);

    const loadData = () => {
      // 1. Fetch Season details
      wsService.emit('get_data', { type: 'season', id: seasonId }, (res: any) => {
        if (!active) return;
        if (res) {
          setSeason(res);
          setStandings(res.cachedStandings || []);
          seedSeasonSettings(seasonSettingsOf(res));
        }
      });

      // 2. Fetch Season Teams
      wsService.emit('get_data', { type: 'season_teams', id: seasonId }, (res: any) => {
        if (active && Array.isArray(res)) setSeasonTeams(res);
      });

      // 3. Fetch Season Games
      wsService.emit('get_data', { type: 'season_games', id: seasonId }, (res: any) => {
        if (active && Array.isArray(res)) setSeasonGames(res);
      });

      // 4. Fetch Org Teams (for registration selector)
      wsService.emit('get_data', { type: 'teams', orgId }, (res: any) => {
        if (active && Array.isArray(res)) setOrgTeams(res);
      });

      // 5. Fetch Org Games (for linker selector)
      wsService.emit('get_data', { type: 'games', orgId }, (res: any) => {
        if (active && Array.isArray(res)) {
          setOrgGames(res);
          setIsLoading(false);
        }
      });
    };

    loadData();

    // Subscribe to Room updates
    const room = `season:${seasonId}:standings`;

    // Dynamic standing merge handler: NO redundant fetches!
    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event) {
        if (event.type === 'STANDINGS_UPDATED' && Array.isArray(event.data)) {
          setStandings(event.data);
        }
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
  }, [isConnected, seasonId, orgId]);

  /**
   * Measured against the baseline the fields were seeded from, never against the live `season` —
   * which `refreshSeasonData` replaces after unrelated actions.
   */
  const hasSettingsChanges =
    !!settingsBaseline && !sameSeasonSettings(currentSeasonSettings(), settingsBaseline);

  const safeGoBack = useCallback(() => {
    safeBack(`/admin/${orgId}/leagues/${leagueId}`);
  }, [safeBack, orgId, leagueId]);

  /** Discard goes back to the baseline — what the fields were last seeded from, which is what
   *  is saved. Restoring from the live `season` could pull in an edit made elsewhere. */
  const handleCancelSettings = useCallback(() => {
    if (settingsBaseline) {
      seedSeasonSettings(settingsBaseline);
      setActionError(null);
    }
  }, [settingsBaseline, seedSeasonSettings]);

  useUnsavedChanges(hasSettingsChanges && !isProcessing, handleCancelSettings);

  // Refresh season lists (teams/games)
  const refreshSeasonData = () => {
    wsService.emit('get_data', { type: 'season_teams', id: seasonId }, (res: any) => {
      if (Array.isArray(res)) setSeasonTeams(res);
    });
    wsService.emit('get_data', { type: 'season_games', id: seasonId }, (res: any) => {
      if (Array.isArray(res)) setSeasonGames(res);
    });
    wsService.emit('get_data', { type: 'season', id: seasonId }, (res: any) => {
      if (!res) return;
      setSeason(res);
      setStandings(res.cachedStandings || []);
      /*
        `UI-19`. This re-read runs after adding a team or generating fixtures, and it can bring back
        somebody else's edit to the settings above. Left ungated it moved the record the Save bar
        was measured against while the fields stayed as typed — so a field nobody here touched read
        as unsaved, and Cancel would have restored to a version this organiser never saw.
      */
      const incoming = seasonSettingsOf(res);
      const decision = reseedDecision({
        baseline: settingsBaseline,
        drafts: currentSeasonSettings(),
        incoming,
        same: sameSeasonSettings,
      });
      if (decision === 'adopt') seedSeasonSettings(incoming);
    });
  };

  // Add Team Handler
  const handleAddTeam = (teamId: string) => {
    setIsProcessing(true);
    setActionError(null);
    const payload = { seasonId, teamId, status: 'approved' as const };

    // Toasted, not put in `actionError`: that banner is only drawn on the Settings tab, so a failure
    // set there from the Teams or Games tab was never seen.
    sendAction(SocketAction.ADD_SEASON_TEAM, payload).then(result => {
      setIsProcessing(false);
      if (!result.ok) return;
      setIsAddTeamOpen(false);
      refreshSeasonData();
    });
  };

  // Approve Pending Team
  const handleApproveTeam = (teamId: string) => {
    setIsProcessing(true);
    const payload = { seasonId, teamId, status: 'approved' as const };
    sendAction(SocketAction.ADD_SEASON_TEAM, payload).then(result => {
      setIsProcessing(false);
      if (!result.ok) return;
      refreshSeasonData();
    });
  };

  // Remove Team Handler
  const confirmRemoveTeam = () => {
    if (!teamToRemove) return;
    setIsProcessing(true);
    const payload = { seasonId, teamId: teamToRemove.teamId };

    sendAction(SocketAction.REMOVE_SEASON_TEAM, payload).then(result => {
      setIsProcessing(false);
      if (!result.ok) return;
      setTeamToRemove(null);
      refreshSeasonData();
    });
  };

  // Link Game Handler
  const handleLinkGame = (gameId: string) => {
    setIsProcessing(true);
    setActionError(null);
    const payload = { gameId, seasonId };

    sendAction(SocketAction.ADD_GAME_TO_SEASON, payload).then(result => {
      setIsProcessing(false);
      if (!result.ok) return;
      setIsLinkGameOpen(false);
      refreshSeasonData();
    });
  };

  // Unlink Game Handler
  const confirmUnlinkGame = () => {
    if (!gameToUnlink) return;
    setIsProcessing(true);
    const payload = { gameId: gameToUnlink.id, seasonId };

    sendAction(SocketAction.REMOVE_GAME_FROM_SEASON, payload).then(result => {
      setIsProcessing(false);
      if (!result.ok) return;
      setGameToUnlink(null);
      refreshSeasonData();
    });
  };

  // Save Settings Handler
  const handleSaveSettings = () => {
    if (!seasonName.trim() || !startDateStr || !endDateStr) {
      setActionError("Name and start/end dates are required.");
      return;
    }

    if (!isCalendarDate(startDateStr) || !isCalendarDate(endDateStr)) {
      setActionError("Dates must be in YYYY-MM-DD format.");
      return;
    }
    if (endDateStr < startDateStr) {
      setActionError("The season must end on or after the day it starts.");
      return;
    }

    setIsProcessing(true);
    setActionError(null);

    const payload = {
      id: seasonId,
      data: {
        name: seasonName.trim(),
        startDate: startDateStr,
        endDate: endDateStr,
        status: computedStatus,
        settings: {
          pointsPerWin: parseInt(ptsWin) || 4,
          pointsPerDraw: parseInt(ptsDraw) || 2,
          pointsPerLoss: parseInt(ptsLoss) || 0
        },
        logo: seasonLogo || null
      }
    };

    sendAction(SocketAction.UPDATE_SEASON, payload, { suppressToast: true }).then(result => {
      setIsProcessing(false);
      // A missing reply used to fall through to here and clear the unsaved-changes guard.
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      if (result.data) {
        setSeason(result.data);
        // The baseline moves with the save, which is what brings the Save bar down.
        seedSeasonSettings(seasonSettingsOf(result.data));
      }
      useUnsavedChangesStore.getState().clear();
    });
  };

  // Helper selectors
  const availableTeams = orgTeams.filter(t => !seasonTeams.some(st => st.teamId === t.id));
  const availableGames = orgGames.filter(g => !seasonGames.some(sg => sg.id === g.id));

  /** Third copy of this, extracted to `utils/dates.ts` in U49. Renders exactly as it always did. */
  const formatTime = (game: any) =>
    formatFixtureWhen(game?.scheduledStartTime || game?.startTime, {
      timeTbd: game?.customSettings?.timeTbd,
    });

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity onPress={safeGoBack} className="flex-row items-center gap-1 active:opacity-85">
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">Back</Text>
        </TouchableOpacity>
        <View className="items-center">
          <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">
            {season ? season.name : 'Season Manager'}
          </Text>
          <Text className="font-inter text-[9px] text-slate-400 uppercase mt-0.5">Administration</Text>
        </View>
        <View className="w-8" />
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 px-4">
        {[
          { id: 'standings', label: 'Standings', icon: 'trophy' },
          { id: 'teams', label: 'Teams', icon: 'people' },
          { id: 'games', label: 'Matches', icon: 'calendar' },
          { id: 'settings', label: 'Settings', icon: 'settings' }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id as any)}
              className="flex-1 items-center py-3 border-b-2 flex-row justify-center gap-1.5 active:opacity-80"
              style={{ borderBottomColor: isActive ? '#FF3E00' : 'transparent' }}
            >
              <Ionicons name={`${tab.icon}-outline` as any} size={14} color={isActive ? '#FF3E00' : '#94A3B8'} />
              <Text className={`font-orbitron-bold text-[10px] uppercase tracking-wider ${isActive ? 'text-brand-orange' : 'text-slate-500'}`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: (activeTab === 'settings' && hasSettingsChanges) ? 140 : 40 }}>
          {/* TAB 1: STANDINGS */}
          {activeTab === 'standings' && (
            <GlassCard className="border border-slate-200 dark:border-white/5 p-4 overflow-hidden">
              <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Live Standings</Text>
              
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
                      <Text className="font-inter text-xs text-slate-400 text-center">No scores recorded yet.</Text>
                    </View>
                  )}
                </View>
              </View>
            </GlassCard>
          )}

          {/* TAB 2: TEAMS */}
          {activeTab === 'teams' && (
            <View className="space-y-4">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest">Season Roster</Text>
                <TouchableOpacity
                  onPress={() => setIsAddTeamOpen(true)}
                  className="flex-row items-center gap-1 bg-brand-orange/10 border border-brand-orange/20 px-2.5 py-1.5 rounded-lg active:opacity-85"
                >
                  <Ionicons name="add" size={13} color="#FF3E00" />
                  <Text className="font-inter-bold text-[10px] text-brand-orange uppercase">Register Team</Text>
                </TouchableOpacity>
              </View>

              {/* Roster list */}
              {seasonTeams.map((st) => {
                const isPending = st.status === 'pending';
                return (
                  <GlassCard key={st.teamId} className="border border-slate-200 dark:border-white/5 p-4 flex-row justify-between items-center">
                    <View className="flex-1">
                      <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white leading-tight">
                        {st.teamName}
                      </Text>
                      <View className="flex-row items-center gap-2 mt-1">
                        <View className={`px-2 py-0.5 rounded ${isPending ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-emerald-550/10 border border-emerald-550/20'}`}>
                          <Text className={`font-orbitron-bold text-[8px] uppercase tracking-wider ${isPending ? 'text-brand-orange' : 'text-emerald-500'}`}>
                            {st.status}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View className="flex-row gap-2">
                      {isPending && (
                        <TouchableOpacity
                          onPress={() => handleApproveTeam(st.teamId)}
                          className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 items-center justify-center active:opacity-85"
                        >
                          <Ionicons name="checkmark-outline" size={16} color="#10B981" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => setTeamToRemove(st)}
                        className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/20 items-center justify-center active:opacity-85"
                      >
                        <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                );
              })}

              {seasonTeams.length === 0 && (
                <View className="items-center justify-center py-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
                  <Ionicons name="people-outline" size={36} color="#94A3B8" className="opacity-45 mb-2" />
                  <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400">Roster Empty</Text>
                  <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Click "Register Team" to add participating squads.</Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 3: GAMES */}
          {activeTab === 'games' && (
            <View className="space-y-4">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest">Season Matches</Text>
                <TouchableOpacity
                  onPress={() => setIsLinkGameOpen(true)}
                  className="flex-row items-center gap-1 bg-brand-orange/10 border border-brand-orange/20 px-2.5 py-1.5 rounded-lg active:opacity-85"
                >
                  <Ionicons name="link-outline" size={13} color="#FF3E00" />
                  <Text className="font-inter-bold text-[10px] text-brand-orange uppercase">Link Match</Text>
                </TouchableOpacity>
              </View>

              {/* Games List */}
              {seasonGames.map((game) => (
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

                  {finishedScoreLine(game) && (
                    <Text className="font-orbitron-bold text-base text-brand-orange text-center pb-2">
                      {finishedScoreLine(game)}
                    </Text>
                  )}

                  <View className="flex-row justify-end border-t border-slate-100 dark:border-white/5 pt-3 mt-2">
                    <TouchableOpacity
                      onPress={() => setGameToUnlink(game)}
                      className="flex-row items-center gap-1 bg-red-500/10 px-3 py-1.5 rounded-lg active:opacity-85 border border-red-500/20"
                    >
                      <Ionicons name="unlink-outline" size={13} color="#EF4444" />
                      <Text className="font-inter-bold text-[9px] text-red-500 uppercase">Unlink Match</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              ))}

              {seasonGames.length === 0 && (
                <View className="items-center justify-center py-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
                  <Ionicons name="calendar-outline" size={36} color="#94A3B8" className="opacity-45 mb-2" />
                  <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400">No Matches Linked</Text>
                  <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Click "Link Match" to add games to this season.</Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === 'settings' && (
            <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-4">
              <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest">Season Settings</Text>

              {actionError && (
                <View className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                  <Text className="text-red-500 font-inter text-xs">{actionError}</Text>
                </View>
              )}

              {/* Season Logo Upload */}
              <View className="items-center py-2">
                <TouchableOpacity
                  onPress={handlePickSeasonLogo}
                  className="w-24 h-24 rounded-2xl items-center justify-center overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 relative"
                  activeOpacity={0.85}
                >
                  {seasonLogo ? (
                    <Image source={{ uri: getOrgLogoUrl(seasonLogo) }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <Ionicons name="calendar-outline" size={40} color={isDark ? "#94A3B8" : "#64748B"} />
                  )}
                  <View className="absolute bottom-1.5 right-1.5 bg-brand-orange w-6 h-6 rounded-full items-center justify-center border border-white dark:border-slate-900 shadow-md">
                    <Ionicons name="camera" size={12} color="white" />
                  </View>
                </TouchableOpacity>
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">Season Branding Logo</Text>
              </View>

              <View className="space-y-1">
                <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Season Name</Text>
                <TextInput
                  value={seasonName}
                  onChangeText={setSeasonName}
                  placeholder="e.g. 2026 Season"
                  placeholderTextColor="#94A3B8"
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                />
              </View>

              <View className="grid grid-cols-2 gap-4">
                <View className="space-y-1">
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Start Date</Text>
                  <DatePicker
                    value={startDateStr}
                    onChange={setStartDateStr}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View className="space-y-1">
                  <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">End Date</Text>
                  <DatePicker
                    value={endDateStr}
                    onChange={setEndDateStr}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              <View className="space-y-1.5">
                <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Season Status (Calculated)</Text>
                <View className="flex-row items-center">
                  <View className={`px-3 py-1.5 rounded-lg ${
                    computedStatus === 'ACTIVE' 
                      ? 'bg-cyan-500/10 border border-cyan-500/20' 
                      : computedStatus === 'COMPLETED' 
                      ? 'bg-slate-200/50 dark:bg-white/10' 
                      : 'bg-orange-500/10 border border-orange-500/20'
                  }`}>
                    <Text className={`font-orbitron-bold text-[10px] uppercase tracking-wider ${
                      computedStatus === 'ACTIVE' 
                        ? 'text-cyan-500' 
                        : computedStatus === 'COMPLETED' 
                        ? 'text-slate-500 dark:text-slate-400' 
                        : 'text-brand-orange'
                    }`}>
                      {computedStatus}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Point allocation settings */}
              <View className="pt-2 border-t border-slate-100 dark:border-white/5 space-y-2">
                <Text className="font-orbitron-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Point Rules</Text>
                <View className="grid grid-cols-3 gap-3">
                  <View className="space-y-1">
                    <Text className="font-inter-bold text-[8px] text-slate-400 uppercase">Win</Text>
                    <TextInput
                      value={ptsWin}
                      onChangeText={setPtsWin}
                      keyboardType="numeric"
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 font-inter text-xs text-center text-slate-850 dark:text-white"
                    />
                  </View>
                  <View className="space-y-1">
                    <Text className="font-inter-bold text-[8px] text-slate-400 uppercase">Draw</Text>
                    <TextInput
                      value={ptsDraw}
                      onChangeText={setPtsDraw}
                      keyboardType="numeric"
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 font-inter text-xs text-center text-slate-850 dark:text-white"
                    />
                  </View>
                  <View className="space-y-1">
                    <Text className="font-inter-bold text-[8px] text-slate-400 uppercase">Loss</Text>
                    <TextInput
                      value={ptsLoss}
                      onChangeText={setPtsLoss}
                      keyboardType="numeric"
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 font-inter text-xs text-center text-slate-850 dark:text-white"
                    />
                  </View>
                </View>
              </View>

            </GlassCard>
          )}
        </ScrollView>
      )}

      {/* Add Team Modal */}
      <Modal visible={isAddTeamOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 border-t border-slate-200 dark:border-white/5 space-y-4 max-h-[80%]">
            <View className="flex-row justify-between items-center pb-2 border-b border-slate-100 dark:border-white/5">
              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white uppercase">Register Team</Text>
              <TouchableOpacity onPress={() => setIsAddTeamOpen(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            <ScrollView className="space-y-3">
              {availableTeams.map(team => (
                <TouchableOpacity
                  key={team.id}
                  onPress={() => handleAddTeam(team.id)}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 p-4 rounded-xl active:opacity-85 flex-row justify-between items-center"
                >
                  <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">{team.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#FF3E00" />
                </TouchableOpacity>
              ))}

              {availableTeams.length === 0 && (
                <Text className="font-inter text-xs text-slate-400 text-center py-6">All organization teams are already registered in this season.</Text>
              )}
            </ScrollView>

            <Button
              title="Close"
              variant="secondary"
              onPress={() => setIsAddTeamOpen(false)}
              className="py-3 rounded-xl"
            />
          </View>
        </View>
      </Modal>

      {/* Link Game Modal */}
      <Modal visible={isLinkGameOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 border-t border-slate-200 dark:border-white/5 space-y-4 max-h-[80%]">
            <View className="flex-row justify-between items-center pb-2 border-b border-slate-100 dark:border-white/5">
              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white uppercase">Link Match</Text>
              <TouchableOpacity onPress={() => setIsLinkGameOpen(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            <ScrollView className="space-y-3">
              {availableGames.map(game => (
                <TouchableOpacity
                  key={game.id}
                  onPress={() => handleLinkGame(game.id)}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 p-4 rounded-xl active:opacity-85"
                >
                  <Text className="font-inter-bold text-[9px] text-slate-400 uppercase mb-1">{formatTime(game)}</Text>
                  <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white">
                    {(game.participants?.[0] as any)?.teamName || 'Home'} vs {(game.participants?.[1] as any)?.teamName || 'Away'}
                  </Text>
                </TouchableOpacity>
              ))}

              {availableGames.length === 0 && (
                <Text className="font-inter text-xs text-slate-400 text-center py-6">No unlinked games found in the organization.</Text>
              )}
            </ScrollView>

            <Button
              title="Close"
              variant="secondary"
              onPress={() => setIsLinkGameOpen(false)}
              className="py-3 rounded-xl"
            />
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        isOpen={!!teamToRemove}
        title="Remove Team"
        description={`Are you sure you want to remove "${teamToRemove?.teamName}" from this season? All their scores and stats will be removed from the standings immediately. Game records linked to this season will be unaffected but excluded from standings calculations.`}
        onConfirm={confirmRemoveTeam}
        onClose={() => setTeamToRemove(null)}
        isProcessing={isProcessing}
      />

      <ConfirmationModal
        isOpen={!!gameToUnlink}
        title="Unlink Match"
        description={`Are you sure you want to unlink this match? The game results will no longer contribute to the standings of this season.`}
        onConfirm={confirmUnlinkGame}
        onClose={() => setGameToUnlink(null)}
        isProcessing={isProcessing}
      />

      {/* FLOATING SAVE CHANGES BAR */}
      {activeTab === 'settings' && hasSettingsChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">
              Unsaved Changes
            </Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              You have modified this season's settings.
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleCancelSettings}
              disabled={isProcessing}
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl active:scale-95 border border-slate-200 dark:border-white/5"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveSettings}
              disabled={isProcessing}
              className="bg-brand-orange px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-brand-orange/30"
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">
                    Save
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
