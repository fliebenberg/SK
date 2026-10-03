import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal, Platform, Image } from 'react-native';
import { useUnsavedChanges } from '../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../store/unsavedChangesStore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { sendAction } from '../../../../services/actions';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, League, Season, Sport } from '@sk/shared';
import DatePicker from '../../../../components/DatePicker';
import { getOrgLogoUrl } from '../../../../services/assets';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import CustomSelect from '../../../../components/CustomSelect';
import { calendarRangeStatus, formatDateRange, isCalendarDate } from '../../../../utils/dates';
import { themeColor } from '../../../../constants/Colors';

/** Where a season sits against the viewer's today. Its dates are calendar dates, both inclusive. */
const calculateSeasonStatus = (startDate: string, endDate: string): 'UPCOMING' | 'ACTIVE' | 'COMPLETED' => {
  const status = calendarRangeStatus(startDate, endDate);
  if (status === 'during') return 'ACTIVE';
  if (status === 'after') return 'COMPLETED';
  return 'UPCOMING';
};

export default function LeagueDetails() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, leagueId } = useLocalSearchParams<{ orgId: string, leagueId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // States
  const [isLoading, setIsLoading] = useState(true);
  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);

  // League Edit State
  const [leagueName, setLeagueName] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<'CLOSED' | 'INVITE' | 'OPEN'>('CLOSED');
  const [leagueLogo, setLeagueLogo] = useState('');
  const [isSavingLeague, setIsSavingLeague] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Season Creation Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [startDateStr, setStartDateStr] = useState(''); // YYYY-MM-DD
  const [endDateStr, setEndDateStr] = useState(''); // YYYY-MM-DD
  const [ptsWin, setPtsWin] = useState('4');
  const [ptsDraw, setPtsDraw] = useState('2');
  const [ptsLoss, setPtsLoss] = useState('0');
  const [newSeasonLogo, setNewSeasonLogo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Logo pickers
  const handlePickLeagueLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('We need camera roll permissions to change the league logo.');
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
        setLeagueLogo(`data:image/png;base64,${manipulateResult.base64}`);
      }
    } catch (err) {
      console.error('[LeagueDetails] Error picking league logo:', err);
      alert('Failed to process selected logo');
    }
  };

  const handlePickSeasonLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('We need camera roll permissions to set the season logo.');
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
        setNewSeasonLogo(`data:image/png;base64,${manipulateResult.base64}`);
      }
    } catch (err) {
      console.error('[LeagueDetails] Error picking season logo:', err);
      alert('Failed to process selected logo');
    }
  };

  // Season Deletion State
  const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null);

  const computedStatus = calculateSeasonStatus(startDateStr, endDateStr);

  // Fetch Data & Subscribe
  useEffect(() => {
    if (!isConnected || !leagueId) return;

    let active = true;
    setIsLoading(true);

    // Fetch League details
    wsService.emit('get_data', { type: 'league', id: leagueId }, (res: any) => {
      if (active && res) {
        setLeague(res);
        setLeagueName(res.name);
        setJoinPolicy(res.joinPolicy);
        setLeagueLogo(res.logo || '');
      }
    });

    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });

    // Real-Time Room Subscriptions. The room hands the seasons over on join (`LIVE-14`), so there
    // is no `get_data seasons` here — joining *is* the load, live-data rule 2.
    const room = `league:${leagueId}:seasons`;

    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event) {
        if (event.type === 'SEASONS_SYNC') {
          if (Array.isArray(event.data)) setSeasons(event.data);
          setIsLoading(false);
        } else if (event.type === 'ROOM_ACCESS_DENIED' || event.type === 'ROOM_ACCESS_REVOKED') {
          // A room push has no ack and no timeout, so a refused join has to clear the spinner
          // explicitly or the screen waits forever for a message that is never coming.
          setSeasons([]);
          setIsLoading(false);
        } else if (event.type === 'SEASON_ADDED') {
          setSeasons(prev => {
            if (prev.some(s => s.id === event.data.id)) {
              return prev.map(s => s.id === event.data.id ? event.data : s);
            }
            return [event.data, ...prev];
          });
        } else if (event.type === 'SEASON_UPDATED') {
          setSeasons(prev => prev.map(s => s.id === event.data.id ? event.data : s));
        } else if (event.type === 'SEASON_DELETED') {
          setSeasons(prev => prev.filter(s => s.id !== event.data.id));
        }
      }
    };

    wsService.on('update', handleUpdate);
    const unsubscribe = wsService.subscribeToRoom(room, handleUpdate);

    return () => {
      active = false;
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, leagueId]);

  const hasLeagueChanges = league ? (
    leagueName.trim() !== league.name ||
    joinPolicy !== league.joinPolicy ||
    leagueLogo !== (league.logo || '')
  ) : false;

  const safeGoBack = useCallback(() => {
    safeBack(`/admin/${orgId}/leagues`);
  }, [safeBack, orgId]);

  const handleCancelLeague = useCallback(() => {
    if (league) {
      setLeagueName(league.name);
      setJoinPolicy(league.joinPolicy);
      setLeagueLogo(league.logo || '');
      setEditError(null);
    }
  }, [league]);

  useUnsavedChanges(hasLeagueChanges && !isSavingLeague, handleCancelLeague);

  // Save League Settings
  const handleSaveLeague = () => {
    if (!leagueName.trim()) {
      setEditError("League Name cannot be empty.");
      return;
    }

    setIsSavingLeague(true);
    setEditError(null);

    const payload = {
      id: leagueId,
      data: {
        name: leagueName.trim(),
        joinPolicy,
        logo: leagueLogo || null
      }
    };

    sendAction(SocketAction.UPDATE_LEAGUE, payload, { suppressToast: true }).then(result => {
      setIsSavingLeague(false);
      // Shown in the settings banner. A missing reply used to fall through to the success branch
      // and clear the unsaved-changes guard over a save that may never have landed.
      if (!result.ok) {
        setEditError(result.message);
        return;
      }
      // Direct merge to local state
      if (result.data) setLeague(result.data);
      useUnsavedChangesStore.getState().clear();
    });
  };

  // Create Season Handler
  const handleCreateSeason = () => {
    if (!newSeasonName.trim() || !startDateStr || !endDateStr) {
      setCreateError("Name and start/end dates are required.");
      return;
    }

    // Validate dates YYYY-MM-DD
    if (!isCalendarDate(startDateStr) || !isCalendarDate(endDateStr)) {
      setCreateError("Dates must be in YYYY-MM-DD format.");
      return;
    }
    if (endDateStr < startDateStr) {
      setCreateError("The season must end on or after the day it starts.");
      return;
    }

    setIsProcessing(true);
    setCreateError(null);

    const payload = {
      leagueId,
      name: newSeasonName.trim(),
      startDate: startDateStr,
      endDate: endDateStr,
      status: computedStatus,
      settings: {
        pointsPerWin: parseInt(ptsWin) || 4,
        pointsPerDraw: parseInt(ptsDraw) || 2,
        pointsPerLoss: parseInt(ptsLoss) || 0
      },
      logo: newSeasonLogo || undefined
    };

    sendAction(SocketAction.ADD_SEASON, payload, { suppressToast: true }).then(result => {
      setIsProcessing(false);
      if (!result.ok) {
        setCreateError(result.message);
      } else {
        setIsCreateModalOpen(false);
        setNewSeasonName('');
        setStartDateStr('');
        setEndDateStr('');
        setPtsWin('4');
        setPtsDraw('2');
        setPtsLoss('0');
        setNewSeasonLogo('');
      }
    });
  };

  // Delete Season Handler
  const confirmDeleteSeason = () => {
    if (!seasonToDelete) return;
    setIsProcessing(true);

    // Toasted rather than shown inline. On failure the dialog stays open.
    sendAction(SocketAction.DELETE_SEASON, { id: seasonToDelete.id }).then(result => {
      setIsProcessing(false);
      if (result.ok) setSeasonToDelete(null);
    });
  };

  const getSportName = (sportId: string) => {
    const s = sports.find(x => x.id === sportId);
    return s ? s.name : sportId;
  };



  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity onPress={safeGoBack} className="flex-row items-center gap-1 active:opacity-85">
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">Back</Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-ink uppercase">League Settings</Text>
        <View className="w-8" />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: hasLeagueChanges ? 140 : 40 }}>
          {/* League Details Editor */}
          <GlassCard className="border border-line p-5 mb-8">
            <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest mb-4">League Settings</Text>
            
            {editError && (
              <View className="bg-danger-soft border border-danger-line p-3 rounded-xl mb-4">
                <Text className="text-danger-ink font-inter text-xs">{editError}</Text>
              </View>
            )}

            <View className="space-y-4">
              {/* League Logo Upload */}
              <View className="items-center py-2">
                <TouchableOpacity
                  onPress={handlePickLeagueLogo}
                  className="w-24 h-24 rounded-2xl items-center justify-center overflow-hidden border border-line bg-canvas relative"
                  activeOpacity={0.85}
                >
                  {leagueLogo ? (
                    <Image source={{ uri: getOrgLogoUrl(leagueLogo) }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <Ionicons name="trophy-outline" size={40} color={themeColor(isDark, 'ink-muted')} />
                  )}
                  <View className="absolute bottom-1.5 right-1.5 bg-primary w-6 h-6 rounded-full items-center justify-center border border-card shadow-md">
                    <Ionicons name="camera" size={12} color="white" />
                  </View>
                </TouchableOpacity>
                <Text className="font-orbitron-bold text-[9px] text-ink-muted uppercase tracking-widest mt-2">League Branding Logo</Text>
              </View>

              <View className="space-y-1">
                <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">League Name</Text>
                <TextInput
                  value={leagueName}
                  onChangeText={setLeagueName}
                  className="bg-field border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
                />
              </View>

              <View className="flex-row items-center gap-2 mt-1">
                <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Sport:</Text>
                <View className="bg-sunken px-2.5 py-0.5 rounded-full border border-line-soft">
                  <Text className="font-inter-bold text-[9px] text-ink-soft uppercase tracking-wider">
                    {league ? getSportName(league.sportId) : ''}
                  </Text>
                </View>
              </View>

              <View className="space-y-2 mt-4 pt-4 border-t border-line-soft">
                <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Join Policy</Text>
                <View className="flex-row gap-2.5">
                  {(['CLOSED', 'INVITE', 'OPEN'] as const).map((policy) => {
                    const isSelected = joinPolicy === policy;
                    return (
                      <TouchableOpacity
                        key={policy}
                        onPress={() => setJoinPolicy(policy)}
                        className={`flex-1 py-2 rounded-xl border items-center justify-center ${
                          isSelected
                            ? 'bg-primary-soft border-primary'
                            : 'bg-canvas border-line-soft'
                        }`}
                      >
                        <Text className={`font-orbitron-bold text-[10px] tracking-wider ${
                          isSelected
                            ? 'text-primary-ink'
                            : 'text-ink-muted'
                        }`}>
                          {policy}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View className="bg-sunken p-3 rounded-xl border border-line-soft">
                  <Text className="font-inter text-xs text-ink-muted leading-relaxed">
                    {joinPolicy === 'CLOSED' && "CLOSED: Only administrators can manually assign teams to this league."}
                    {joinPolicy === 'INVITE' && "INVITE: Teams can apply, but administrators must approve their entry."}
                    {joinPolicy === 'OPEN' && "OPEN: Any team that meets the qualifying criteria can join, even from outside the organization."}
                  </Text>
                </View>
              </View>
            </View>
          </GlassCard>

          {/* Seasons Header */}
          <View className="flex-row justify-between items-center mb-4">
            <Text className="font-orbitron-bold text-xs text-ink-muted uppercase tracking-widest">Seasons</Text>
            <TouchableOpacity
              onPress={() => setIsCreateModalOpen(true)}
              className="flex-row items-center gap-1 bg-primary-soft border border-primary-line px-3 py-1.5 rounded-lg active:opacity-85"
            >
              <Ionicons name="add" size={14} color={themeColor(isDark, 'primary')} />
              <Text className="font-inter-bold text-[10px] text-primary-ink uppercase">New Season</Text>
            </TouchableOpacity>
          </View>

          {/* Seasons List */}
          <View className="space-y-4">
            {seasons.map((season) => (
              <GlassCard key={season.id} className="border border-line p-4">
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center flex-1 mr-4 gap-3.5">
                    {season.logo ? (
                      <View className="w-11 h-11 rounded-xl overflow-hidden bg-sunken shrink-0 border border-line-soft">
                        <Image 
                          source={{ uri: getOrgLogoUrl(season.logo, 'thumb') }} 
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View className="w-11 h-11 rounded-xl bg-sunken items-center justify-center shrink-0 border border-line-soft">
                        <Ionicons name="calendar" size={20} color={themeColor(isDark, 'ink-muted')} />
                      </View>
                    )}
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                        <Text className="font-orbitron-bold text-base text-ink">
                          {season.name}
                        </Text>
                        <View className={`px-2 py-0.5 rounded ${
                          season.status === 'ACTIVE' 
                            ? 'bg-accent-soft border border-accent-line' 
                            : season.status === 'COMPLETED' 
                            ? 'bg-sunken' 
                            : 'bg-primary-soft border border-primary-line'
                        }`}>
                          <Text className={`font-orbitron-bold text-[8px] uppercase tracking-wider ${
                            season.status === 'ACTIVE' 
                              ? 'text-accent-ink' 
                              : season.status === 'COMPLETED' 
                              ? 'text-ink-muted' 
                              : 'text-primary-ink'
                          }`}>
                            {season.status}
                          </Text>
                        </View>
                      </View>
                      
                      {/* Was `startDate.split('T')[0]` on both ends — `2026-09-19 to 2026-12-15`,
                          an ISO value shown to a user. A season is a calendar-date range like an
                          event's, so it reads through the shared formatter (U49). */}
                      <Text className="font-inter text-xs text-ink-muted">
                        {formatDateRange(season.startDate, season.endDate) || 'Dates not set'}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity 
                      onPress={() => router.push(`/admin/${orgId}/leagues/${leagueId}/seasons/${season.id}`)}
                      className="w-7 h-7 rounded-lg bg-sunken items-center justify-center border border-line-soft active:opacity-85"
                    >
                      <Ionicons name="pencil" size={12} color={themeColor(isDark, 'ink-soft')} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => setSeasonToDelete(season)}
                      className="w-7 h-7 rounded-lg bg-danger-soft items-center justify-center border border-danger-line active:opacity-85"
                    >
                      <Ionicons name="trash-outline" size={12} color={themeColor(isDark, 'danger')} />
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            ))}

            {seasons.length === 0 && (
              <View className="items-center justify-center py-8 bg-card border border-line rounded-2xl">
                <Ionicons name="calendar-outline" size={36} color={themeColor(isDark, 'ink-muted')} className="opacity-45 mb-2" />
                <Text className="font-orbitron-bold text-xs text-ink-muted">No Seasons Registered</Text>
                <Text className="font-inter text-[10px] text-ink-muted mt-0.5">Click "New Season" to begin.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Create Season Modal */}
      <Modal visible={isCreateModalOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-overlay/60">
          <View className="bg-card rounded-t-3xl p-6 border-t border-line space-y-4 max-h-[90%]">
            <View className="flex-row justify-between items-center pb-2 border-b border-line-soft">
              <Text className="font-orbitron-bold text-lg text-ink uppercase">New Season</Text>
              <TouchableOpacity onPress={() => setIsCreateModalOpen(false)}>
                <Ionicons name="close" size={24} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>

            {createError && (
              <View className="bg-danger-soft border border-danger-line p-3 rounded-xl">
                <Text className="text-danger-ink font-inter text-xs">{createError}</Text>
              </View>
            )}

            <ScrollView className="space-y-4 pr-1">
              {/* Season Logo Upload */}
              <View className="items-center py-1">
                <TouchableOpacity
                  onPress={handlePickSeasonLogo}
                  className="w-20 h-20 rounded-2xl items-center justify-center overflow-hidden border border-line bg-canvas relative"
                  activeOpacity={0.8}
                >
                  {newSeasonLogo ? (
                    <Image source={{ uri: newSeasonLogo }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <Ionicons name="calendar-outline" size={32} color={themeColor(isDark, 'ink-muted')} />
                  )}
                  <View className="absolute bottom-1 right-1 bg-primary w-5 h-5 rounded-full items-center justify-center border border-card shadow-sm">
                    <Ionicons name="camera" size={10} color="white" />
                  </View>
                </TouchableOpacity>
                <Text className="font-orbitron-bold text-[8px] text-ink-muted uppercase tracking-widest mt-1.5">Season Logo</Text>
              </View>

              <View className="space-y-1">
                <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Season Name</Text>
                <TextInput
                  value={newSeasonName}
                  onChangeText={setNewSeasonName}
                  placeholder="e.g. 2026 Season"
                  placeholderTextColor={themeColor(isDark, 'ink-muted')}
                  className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
                />
              </View>

              <View className="grid grid-cols-2 gap-4">
                <View className="space-y-1">
                  <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Start Date</Text>
                  <DatePicker
                    value={startDateStr}
                    onChange={setStartDateStr}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View className="space-y-1">
                  <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">End Date</Text>
                  <DatePicker
                    value={endDateStr}
                    onChange={setEndDateStr}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              <View className="space-y-1.5">
                <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Status (Calculated)</Text>
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

              {/* Point settings */}
              <View className="pt-2 border-t border-line-soft space-y-2">
                <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase">Point Allocations</Text>
                <View className="grid grid-cols-3 gap-3">
                  <View className="space-y-1">
                    <Text className="font-inter-bold text-[8px] text-ink-muted uppercase">Win</Text>
                    <TextInput
                      value={ptsWin}
                      onChangeText={setPtsWin}
                      keyboardType="numeric"
                      className="bg-field border border-line rounded-xl px-3 py-2 font-inter text-xs text-center text-ink"
                    />
                  </View>
                  <View className="space-y-1">
                    <Text className="font-inter-bold text-[8px] text-ink-muted uppercase">Draw</Text>
                    <TextInput
                      value={ptsDraw}
                      onChangeText={setPtsDraw}
                      keyboardType="numeric"
                      className="bg-field border border-line rounded-xl px-3 py-2 font-inter text-xs text-center text-ink"
                    />
                  </View>
                  <View className="space-y-1">
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
            </ScrollView>

            <View className="flex-row gap-4 pt-2">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setIsCreateModalOpen(false)}
                className="flex-1 py-3 rounded-xl"
              />
              <Button
                title={isProcessing ? "Saving..." : "Create Season"}
                onPress={handleCreateSeason}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl"
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        isOpen={!!seasonToDelete}
        title="Delete Season"
        description={`Are you sure you want to delete the season "${seasonToDelete?.name}"? All standings configurations and team registrations for this season will be deleted permanently. This action cannot be undone.`}
        onConfirm={confirmDeleteSeason}
        onClose={() => setSeasonToDelete(null)}
        isProcessing={isProcessing}
      />

      {/* FLOATING SAVE CHANGES BAR */}
      {hasLeagueChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-card border border-line p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-ink uppercase tracking-wider">
              Unsaved Changes
            </Text>
            <Text className="font-inter text-[9px] text-ink-muted mt-0.5">
              You have modified this league's details.
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleCancelLeague}
              disabled={isSavingLeague}
              className="bg-sunken px-4 py-2.5 rounded-xl active:scale-95 border border-line"
            >
              <Text className="font-orbitron-bold text-[9px] text-ink-soft uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveLeague}
              disabled={isSavingLeague || !leagueName.trim()}
              className="bg-primary px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-primary/30"
            >
              {isSavingLeague ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-on-fill uppercase tracking-widest mt-0.5">
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
