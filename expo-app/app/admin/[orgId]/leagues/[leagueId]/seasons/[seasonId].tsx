import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { readData } from '../../../../../../services/reads';
import { ReadFailure } from '../../../../../../components/ReadFailure';
import { FloatingSaveBar, FLOATING_SAVE_BAR_PADDING } from '../../../../../../components/FloatingSaveBar';
import { useIncomingRecord, CHANGED_ELSEWHERE_NOTICE } from '../../../../../../hooks/useIncomingRecord';
import { useWsStore } from '../../../../../../store/wsStore';
import { SocketAction, Season, SeasonTeam, LeagueStandingRow, Game, Team, seasonPointsFromInput } from '@sk/shared';
import { finishedScoreLine } from '../../../../../../utils/matchScore';
import DatePicker from '../../../../../../components/DatePicker';
import { getOrgLogoUrl } from '../../../../../../services/assets';
import { useImageUpload } from '../../../../../../hooks/useImageUpload';
import { calendarRangeStatus, formatFixtureWhen, isCalendarDate } from '../../../../../../utils/dates';
import { pickableTeams } from '../../../../../../components/teams/TeamBits';
import { themeColor } from '../../../../../../constants/Colors';

/** Where a season sits against the viewer's today. Its dates are calendar dates, both inclusive. */
const calculateSeasonStatus = (startDate: string, endDate: string): 'UPCOMING' | 'ACTIVE' | 'COMPLETED' => {
  const status = calendarRangeStatus(startDate, endDate);
  if (status === 'during') return 'ACTIVE';
  if (status === 'after') return 'COMPLETED';
  return 'UPCOMING';
};

/** The screen's reads, each with its own failure where its content would have been (`SYNC-9`). */
type SeasonRead = 'season' | 'seasonTeams' | 'seasonGames' | 'orgTeams' | 'orgGames';

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

  // The logo is uploaded when chosen and saved with the settings; until Save it is an unsaved change.
  const logoUpload = useImageUpload({
    kind: 'logos',
    title: 'Season logo',
    current: seasonLogo ? getOrgLogoUrl(seasonLogo, 'large') : null,
    onUploaded: setSeasonLogo,
    onRemove: () => { setSeasonLogo(''); return true; },
  });

  /**
   * Why each list is missing or out of date. A failed read leaves what is held, so a refusal cannot
   * wipe the standings or seed the settings with a blank name and default points.
   */
  const [readErrors, setReadErrors] = useState<Partial<Record<SeasonRead, string>>>({});
  const noteRead = (read: SeasonRead, failure: string | null) => setReadErrors(held => {
    if ((held[read] ?? null) === failure) return held;
    const next = { ...held };
    if (failure) next[read] = failure;
    else delete next[read];
    return next;
  });

  /** One read: its answer goes to `apply`, its failure to `readErrors` for the tab to draw. */
  const readInto = <T,>(read: SeasonRead, type: string, params: Record<string, unknown>, apply: (data: T) => void, wanted: () => boolean = () => true) =>
    readData<T>(type, params, { suppressToast: true, stillWanted: wanted }).then(result => {
      if (!wanted()) return;
      noteRead(read, result.ok ? null : result.message);
      if (result.ok) apply(result.data);
    });

  const readSeason = (apply: (res: Season) => void, wanted?: () => boolean) =>
    readInto<Season | null>('season', 'season', { id: seasonId }, res => {
      if (res) apply(res);
      else noteRead('season', 'The server has no record of this season.');
    }, wanted);
  const readSeasonTeams = (wanted?: () => boolean) =>
    readInto<any[]>('seasonTeams', 'season_teams', { id: seasonId }, res => { if (Array.isArray(res)) setSeasonTeams(res); }, wanted);
  const readSeasonGames = (wanted?: () => boolean) =>
    readInto<Game[]>('seasonGames', 'season_games', { id: seasonId }, res => { if (Array.isArray(res)) setSeasonGames(res); }, wanted);
  const readOrgTeams = (wanted?: () => boolean) =>
    readInto<Team[]>('orgTeams', 'teams', { orgId }, res => { if (Array.isArray(res)) setOrgTeams(res); }, wanted);
  const readOrgGames = (wanted?: () => boolean) =>
    readInto<Game[]>('orgGames', 'games', { orgId }, res => { if (Array.isArray(res)) setOrgGames(res); }, wanted);

  // Load Data
  useEffect(() => {
    if (!isConnected || !seasonId || !orgId) return;

    let active = true;
    const wanted = () => active;
    setIsLoading(true);

    void Promise.all([
      // 1. Fetch Season details
      // On reconnecting too, so it goes through `adoptSeason`, which keeps what is being typed (`SYNC-10`).
      readSeason(res => adoptSeason(res), wanted),
      // 2. Fetch Season Teams
      readSeasonTeams(wanted),
      // 3. Fetch Season Games
      readSeasonGames(wanted),
      // 4. Fetch Org Teams (for registration selector)
      readOrgTeams(wanted),
      // 5. Fetch Org Games (for linker selector)
      readOrgGames(wanted),
    ]).then(() => {
      if (active) setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isConnected, seasonId, orgId]);

  // Subscribe to Room updates
  useEffect(() => {
    if (!seasonId) return;

    const room = `season:${seasonId}:standings`;

    // Dynamic standing merge handler: NO redundant fetches!
    const handleUpdate = (event: any) => {
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
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [seasonId]);

  /**
   * Measured against the baseline the fields were seeded from, never against the live `season` —
   * which `refreshSeasonData` replaces after unrelated actions.
   */
  const incomingSettings = useIncomingRecord(sameSeasonSettings);
  /** The baseline and drafts as they are now: a read's answer lands several renders after it was sent. */
  const settingsRef = useRef<{ baseline: SeasonSettingsForm | null; drafts: SeasonSettingsForm }>({ baseline: null, drafts: currentSeasonSettings() });
  settingsRef.current = { baseline: settingsBaseline, drafts: currentSeasonSettings() };

  const hasSettingsChanges =
    !!settingsBaseline && !sameSeasonSettings(currentSeasonSettings(), settingsBaseline);

  const safeGoBack = useCallback(() => {
    safeBack(`/admin/${orgId}/leagues/${leagueId}`);
  }, [safeBack, orgId, leagueId]);

  /** Discard goes back to the baseline — what the fields were last seeded from, which is what
   *  is saved. Restoring from the live `season` could pull in an edit made elsewhere. */
  const handleCancelSettings = useCallback(() => {
    // The newer version, when the season changed while this was edited: Cancel shows it.
    const to = incomingSettings.newer ?? settingsBaseline;
    if (to) {
      seedSeasonSettings(to);
      logoUpload.discard();
      setActionError(null);
    }
    incomingSettings.clear();
    // Not `seedSeasonSettings`: it is new each render and only calls setters. Listing it changed this
    // callback each render, which looped `useUnsavedChanges` ("Maximum update depth exceeded").
  }, [settingsBaseline, incomingSettings.newer]); // eslint-disable-line react-hooks/exhaustive-deps

  useUnsavedChanges(hasSettingsChanges && !isProcessing, handleCancelSettings);

  // Refresh season lists (teams/games)
  const adoptSeason = (res: Season) => {
    setSeason(res);
    setStandings(res.cachedStandings || []);
    /*
      `UI-19`. This re-read runs after adding a team or generating fixtures, and it can bring back
      somebody else's edit to the settings above. Left ungated it moved the record the Save bar
      was measured against while the fields stayed as typed — so a field nobody here touched read
      as unsaved, and Cancel would have restored to a version this organiser never saw.
    */
    const { baseline, drafts } = settingsRef.current;
    incomingSettings.offer({ baseline, drafts, incoming: seasonSettingsOf(res), seed: seedSeasonSettings });
  };

  const refreshSeasonData = () => {
    void readSeasonTeams();
    void readSeasonGames();
    void readSeason(adoptSeason);
  };

  /** Try again: what failed, and only that, so that typed settings and held lists stay as they are. */
  const retryFailedReads = () => {
    setIsLoading(true);
    void Promise.all([
      readErrors.season ? readSeason(adoptSeason) : null,
      readErrors.seasonTeams ? readSeasonTeams() : null,
      readErrors.seasonGames ? readSeasonGames() : null,
      readErrors.orgTeams ? readOrgTeams() : null,
      readErrors.orgGames ? readOrgGames() : null,
    ]).then(() => setIsLoading(false));
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
    const points = seasonPointsFromInput({ win: ptsWin, draw: ptsDraw, loss: ptsLoss });
    if (!points.ok) {
      setActionError(points.message);
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
        settings: points.points,
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
      logoUpload.saved();
      if (result.data) {
        setSeason(result.data);
        // The baseline moves with the save, which is what brings the Save bar down.
        seedSeasonSettings(seasonSettingsOf(result.data));
      }
      incomingSettings.clear();
      useUnsavedChangesStore.getState().clear();
    });
  };

  // Helper selectors
  // Teams that could still be registered: not in the season yet, and not inactive (docs/teams.md).
  const availableTeams = pickableTeams(orgTeams).filter(t => !seasonTeams.some(st => st.teamId === t.id));
  const availableGames = orgGames.filter(g => !seasonGames.some(sg => sg.id === g.id));

  /** "19 Sep 2026 · 14:30", the one way the app writes a kick-off (`UI-13`). */
  const formatTime = (game: any) =>
    formatFixtureWhen(game?.scheduledStartTime || game?.startTime, {
      timeTbd: game?.customSettings?.timeTbd,
    });

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity onPress={safeGoBack} className="flex-row items-center gap-1 active:opacity-85">
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">Back</Text>
        </TouchableOpacity>
        <View className="items-center">
          <Text className="font-orbitron-bold text-sm tracking-widest text-ink uppercase">
            {season ? season.name : 'Season Manager'}
          </Text>
          <Text className="font-inter text-[9px] text-ink-muted uppercase mt-0.5">Administration</Text>
        </View>
        <View className="w-8" />
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-line bg-card px-4">
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
              style={{ borderBottomColor: isActive ? themeColor(isDark, 'primary') : 'transparent' }}
            >
              <Ionicons name={`${tab.icon}-outline` as any} size={14} color={isActive ? themeColor(isDark, 'primary') : themeColor(isDark, 'ink-muted')} />
              <Text className={`font-orbitron-bold text-[10px] uppercase tracking-wider ${isActive ? 'text-primary-ink' : 'text-ink-muted'}`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: (activeTab === 'settings' && hasSettingsChanges) ? FLOATING_SAVE_BAR_PADDING : 40 }}>
          {/* TAB 1: STANDINGS */}
          {activeTab === 'standings' && readErrors.season ? (
            <ReadFailure what="The standings" reason={readErrors.season} onRetry={retryFailedReads} stale={standings.length > 0} />
          ) : null}
          {activeTab === 'standings' && (!readErrors.season || standings.length > 0) && (
            <GlassCard className="border border-line p-4 overflow-hidden">
              <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-4">Live Standings</Text>
              
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

          {/* TAB 2: TEAMS */}
          {activeTab === 'teams' && (
            <View className="gap-4">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest">Season Roster</Text>
                <TouchableOpacity
                  onPress={() => setIsAddTeamOpen(true)}
                  className="flex-row items-center gap-1 bg-primary-soft border border-primary-line px-2.5 py-1.5 rounded-lg active:opacity-85"
                >
                  <Ionicons name="add" size={13} color={themeColor(isDark, 'primary')} />
                  <Text className="font-inter-bold text-[10px] text-primary-ink uppercase">Register Team</Text>
                </TouchableOpacity>
              </View>

              {readErrors.seasonTeams ? (
                <ReadFailure what="The roster" reason={readErrors.seasonTeams} onRetry={retryFailedReads} stale={seasonTeams.length > 0} />
              ) : null}

              {/* Roster list */}
              {seasonTeams.map((st) => {
                const isPending = st.status === 'pending';
                return (
                  <GlassCard key={st.teamId} className="border border-line p-4 flex-row justify-between items-center">
                    <View className="flex-1">
                      <Text className="font-orbitron-bold text-base text-ink leading-tight">
                        {st.teamName}
                      </Text>
                      <View className="flex-row items-center gap-2 mt-1">
                        <View className={`px-2 py-0.5 rounded ${isPending ? 'bg-primary-soft border border-primary-line' : 'bg-success-soft border border-success-line'}`}>
                          <Text className={`font-orbitron-bold text-[8px] uppercase tracking-wider ${isPending ? 'text-primary-ink' : 'text-success-ink'}`}>
                            {st.status}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View className="flex-row gap-2">
                      {isPending && (
                        <TouchableOpacity
                          onPress={() => handleApproveTeam(st.teamId)}
                          className="w-9 h-9 rounded-lg bg-success-soft border border-success-line items-center justify-center active:opacity-85"
                        >
                          <Ionicons name="checkmark-outline" size={16} color={themeColor(isDark, 'success')} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => setTeamToRemove(st)}
                        className="w-9 h-9 rounded-lg bg-danger-soft border border-danger-line items-center justify-center active:opacity-85"
                      >
                        <Ionicons name="trash-outline" size={16} color={themeColor(isDark, 'danger')} />
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                );
              })}

              {seasonTeams.length === 0 && !readErrors.seasonTeams && (
                <View className="items-center justify-center py-10 bg-card border border-line rounded-2xl">
                  <Ionicons name="people-outline" size={36} color={themeColor(isDark, 'ink-muted')} className="opacity-45 mb-2" />
                  <Text className="font-orbitron-bold text-xs text-ink-muted">Roster Empty</Text>
                  <Text className="font-inter text-[10px] text-ink-muted mt-0.5">Click "Register Team" to add participating squads.</Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 3: GAMES */}
          {activeTab === 'games' && (
            <View className="gap-4">
              <View className="flex-row justify-between items-center mb-1">
                <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest">Season Matches</Text>
                <TouchableOpacity
                  onPress={() => setIsLinkGameOpen(true)}
                  className="flex-row items-center gap-1 bg-primary-soft border border-primary-line px-2.5 py-1.5 rounded-lg active:opacity-85"
                >
                  <Ionicons name="link-outline" size={13} color={themeColor(isDark, 'primary')} />
                  <Text className="font-inter-bold text-[10px] text-primary-ink uppercase">Link Match</Text>
                </TouchableOpacity>
              </View>

              {readErrors.seasonGames ? (
                <ReadFailure what="The season's matches" reason={readErrors.seasonGames} onRetry={retryFailedReads} stale={seasonGames.length > 0} />
              ) : null}

              {/* Games List */}
              {seasonGames.map((game) => (
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

                  <View className="flex-row justify-end border-t border-line-soft pt-3 mt-2">
                    <TouchableOpacity
                      onPress={() => setGameToUnlink(game)}
                      className="flex-row items-center gap-1 bg-danger-soft px-3 py-1.5 rounded-lg active:opacity-85 border border-danger-line"
                    >
                      <Ionicons name="unlink-outline" size={13} color={themeColor(isDark, 'danger')} />
                      <Text className="font-inter-bold text-[9px] text-danger-ink uppercase">Unlink Match</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              ))}

              {seasonGames.length === 0 && !readErrors.seasonGames && (
                <View className="items-center justify-center py-10 bg-card border border-line rounded-2xl">
                  <Ionicons name="calendar-outline" size={36} color={themeColor(isDark, 'ink-muted')} className="opacity-45 mb-2" />
                  <Text className="font-orbitron-bold text-xs text-ink-muted">No Matches Linked</Text>
                  <Text className="font-inter text-[10px] text-ink-muted mt-0.5">Click "Link Match" to add games to this season.</Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 4: SETTINGS. No form until there is a season behind it: its blanks could be saved. */}
          {activeTab === 'settings' && !settingsBaseline && readErrors.season ? (
            <ReadFailure what="The season's settings" reason={readErrors.season} onRetry={retryFailedReads} />
          ) : null}
          {activeTab === 'settings' && settingsBaseline && (
            <GlassCard className="border border-line p-5 gap-4">
              <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest">Season Settings</Text>

              {readErrors.season ? (
                <ReadFailure what="The season's settings" reason={readErrors.season} onRetry={retryFailedReads} stale />
              ) : null}

              {actionError && (
                <View className="bg-danger-soft border border-danger-line p-3 rounded-xl">
                  <Text className="text-danger-ink font-inter text-xs">{actionError}</Text>
                </View>
              )}

              {/* Season Logo Upload */}
              <View className="items-center py-2">
                <TouchableOpacity
                  onPress={logoUpload.open}
                  accessibilityRole="button"
                  accessibilityLabel="Change the season logo"
                  className="w-24 h-24 rounded-2xl items-center justify-center overflow-hidden border border-line bg-canvas relative"
                  activeOpacity={0.85}
                >
                  {seasonLogo ? (
                    <Image source={{ uri: getOrgLogoUrl(seasonLogo) }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <Ionicons name="calendar-outline" size={40} color={themeColor(isDark, 'ink-muted')} />
                  )}
                  <View className="absolute bottom-1.5 right-1.5 bg-primary w-6 h-6 rounded-full items-center justify-center border border-card shadow-md">
                    <Ionicons name="camera" size={12} color={themeColor(isDark, 'on-primary')} />
                  </View>
                </TouchableOpacity>
                <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest mt-2">Season Branding Logo</Text>
              </View>

              <View className="gap-1">
                <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Season Name</Text>
                <TextInput
                  value={seasonName}
                  onChangeText={setSeasonName}
                  placeholder="e.g. 2026 Season"
                  placeholderTextColor={themeColor(isDark, 'ink-muted')}
                  className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
                />
              </View>

              <View className="grid grid-cols-2 gap-4">
                <View className="gap-1">
                  <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Start Date</Text>
                  <DatePicker
                    value={startDateStr}
                    onChange={setStartDateStr}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View className="gap-1">
                  <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">End Date</Text>
                  <DatePicker
                    value={endDateStr}
                    onChange={setEndDateStr}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              <View className="gap-1.5">
                <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Season Status (Calculated)</Text>
                <View className="flex-row items-center">
                  <View className={`px-3 py-1.5 rounded-lg ${
                    computedStatus === 'ACTIVE' 
                      ? 'bg-accent-soft border border-accent-line' 
                      : computedStatus === 'COMPLETED' 
                      ? 'bg-sunken' 
                      : 'bg-primary-soft border border-primary-line'
                  }`}>
                    <Text className={`font-orbitron-bold text-[10px] uppercase tracking-wider ${
                      computedStatus === 'ACTIVE' 
                        ? 'text-accent-ink' 
                        : computedStatus === 'COMPLETED' 
                        ? 'text-ink-muted' 
                        : 'text-primary-ink'
                    }`}>
                      {computedStatus}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Point allocation settings */}
              <View className="pt-2 border-t border-line-soft gap-2">
                <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase">Point Rules</Text>
                <View className="grid grid-cols-3 gap-3">
                  <View className="gap-1">
                    <Text className="font-inter-bold text-[8px] text-ink-muted uppercase">Win</Text>
                    <TextInput
                      value={ptsWin}
                      onChangeText={setPtsWin}
                      keyboardType="numeric"
                      className="bg-field border border-line rounded-xl px-3 py-2 font-inter text-xs text-center text-ink"
                    />
                  </View>
                  <View className="gap-1">
                    <Text className="font-inter-bold text-[8px] text-ink-muted uppercase">Draw</Text>
                    <TextInput
                      value={ptsDraw}
                      onChangeText={setPtsDraw}
                      keyboardType="numeric"
                      className="bg-field border border-line rounded-xl px-3 py-2 font-inter text-xs text-center text-ink"
                    />
                  </View>
                  <View className="gap-1">
                    <Text className="font-inter-bold text-[8px] text-ink-muted uppercase">Loss</Text>
                    <TextInput
                      value={ptsLoss}
                      onChangeText={setPtsLoss}
                      keyboardType="numeric"
                      className="bg-field border border-line rounded-xl px-3 py-2 font-inter text-xs text-center text-ink"
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
        <View className="flex-1 justify-end bg-overlay/60">
          <View className="bg-card rounded-t-3xl p-6 border-t border-line gap-4 max-h-[80%]">
            <View className="flex-row justify-between items-center pb-2 border-b border-line-soft">
              <Text className="font-orbitron-bold text-lg text-ink uppercase">Register Team</Text>
              <TouchableOpacity onPress={() => setIsAddTeamOpen(false)}>
                <Ionicons name="close" size={24} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerClassName="gap-3">
              {readErrors.orgTeams || readErrors.seasonTeams ? (
                <ReadFailure
                  what="The teams"
                  reason={(readErrors.orgTeams || readErrors.seasonTeams)!}
                  onRetry={retryFailedReads}
                  stale={orgTeams.length > 0 && !readErrors.seasonTeams}
                />
              ) : null}

              {/* Without the roster, any of these may already be registered. */}
              {!readErrors.seasonTeams && availableTeams.map(team => (
                <TouchableOpacity
                  key={team.id}
                  onPress={() => handleAddTeam(team.id)}
                  className="bg-canvas border border-line p-4 rounded-xl active:opacity-85 flex-row justify-between items-center"
                >
                  <Text className="font-orbitron-bold text-sm text-ink">{team.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'primary')} />
                </TouchableOpacity>
              ))}

              {availableTeams.length === 0 && !readErrors.orgTeams && !readErrors.seasonTeams && (
                <Text className="font-inter text-xs text-ink-muted text-center py-6">All organisation teams are already registered in this season.</Text>
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
        <View className="flex-1 justify-end bg-overlay/60">
          <View className="bg-card rounded-t-3xl p-6 border-t border-line gap-4 max-h-[80%]">
            <View className="flex-row justify-between items-center pb-2 border-b border-line-soft">
              <Text className="font-orbitron-bold text-lg text-ink uppercase">Link Match</Text>
              <TouchableOpacity onPress={() => setIsLinkGameOpen(false)}>
                <Ionicons name="close" size={24} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerClassName="gap-3">
              {readErrors.orgGames || readErrors.seasonGames ? (
                <ReadFailure
                  what="The matches"
                  reason={(readErrors.orgGames || readErrors.seasonGames)!}
                  onRetry={retryFailedReads}
                  stale={orgGames.length > 0 && !readErrors.seasonGames}
                />
              ) : null}

              {/* Without the season's matches, any of these may already be linked. */}
              {!readErrors.seasonGames && availableGames.map(game => (
                <TouchableOpacity
                  key={game.id}
                  onPress={() => handleLinkGame(game.id)}
                  className="bg-canvas border border-line p-4 rounded-xl active:opacity-85"
                >
                  <Text className="font-inter-bold text-[9px] text-ink-muted uppercase mb-1">{formatTime(game)}</Text>
                  <Text className="font-orbitron-bold text-xs text-ink">
                    {(game.participants?.[0] as any)?.teamName || 'Home'} vs {(game.participants?.[1] as any)?.teamName || 'Away'}
                  </Text>
                </TouchableOpacity>
              ))}

              {availableGames.length === 0 && !readErrors.orgGames && !readErrors.seasonGames && (
                <Text className="font-inter text-xs text-ink-muted text-center py-6">No unlinked games found in the organisation.</Text>
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

      <FloatingSaveBar
        visible={activeTab === 'settings' && hasSettingsChanges}
        description="You have modified this season's settings."
        onSave={handleSaveSettings}
        onCancel={handleCancelSettings}
        isProcessing={isProcessing}
        notice={incomingSettings.newer ? CHANGED_ELSEWHERE_NOTICE : null}
      />

      {logoUpload.element}
    </SafeAreaView>
  );
}
