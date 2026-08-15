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
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, League, Season, Sport } from '@sk/shared';
import DatePicker from '../../../../components/DatePicker';
import { getOrgLogoUrl } from '../../../../services/api';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import CustomSelect from '../../../../components/CustomSelect';

const calculateSeasonStatus = (startDateStr: string, endDateStr: string): 'UPCOMING' | 'ACTIVE' | 'COMPLETED' => {
  if (!startDateStr || !endDateStr) return 'UPCOMING';
  try {
    const cleanStart = startDateStr.split('T')[0];
    const cleanEnd = endDateStr.split('T')[0];
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(cleanStart) || !dateRegex.test(cleanEnd)) {
      return 'UPCOMING';
    }

    const [startYear, startMonth, startDay] = cleanStart.split('-').map(Number);
    const [endYear, endMonth, endDay] = cleanEnd.split('-').map(Number);
    
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return 'UPCOMING';
    }

    const now = new Date();
    
    if (now < start) {
      return 'UPCOMING';
    } else if (now > end) {
      return 'COMPLETED';
    } else {
      return 'ACTIVE';
    }
  } catch (e) {
    return 'UPCOMING';
  }
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
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

    // Fetch Seasons
    wsService.emit('get_data', { type: 'seasons', leagueId }, (res: any) => {
      if (active) {
        if (Array.isArray(res)) setSeasons(res);
        setIsLoading(false);
      }
    });

    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });

    // Real-Time Room Subscriptions
    const room = `league:${leagueId}:seasons`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event) {
        if (event.type === 'SEASON_ADDED') {
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

    wsService.emit('action', { type: SocketAction.UPDATE_LEAGUE as any, payload }, (res: any) => {
      setIsSavingLeague(false);
      if (res && res.status === 'error') {
        setEditError(res.message || "Failed to update league settings.");
      } else {
        // Direct merge to local state
        if (res && res.data) {
          setLeague(res.data);
        }
        useUnsavedChangesStore.getState().clear();
      }
    });
  };

  // Create Season Handler
  const handleCreateSeason = () => {
    if (!newSeasonName.trim() || !startDateStr || !endDateStr) {
      setCreateError("Name and start/end dates are required.");
      return;
    }

    // Validate dates YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDateStr) || !dateRegex.test(endDateStr)) {
      setCreateError("Dates must be in YYYY-MM-DD format.");
      return;
    }

    setIsProcessing(true);
    setCreateError(null);

    const payload = {
      leagueId,
      name: newSeasonName.trim(),
      startDate: new Date(startDateStr).toISOString(),
      endDate: new Date(endDateStr).toISOString(),
      status: computedStatus,
      settings: {
        pointsPerWin: parseInt(ptsWin) || 4,
        pointsPerDraw: parseInt(ptsDraw) || 2,
        pointsPerLoss: parseInt(ptsLoss) || 0
      },
      logo: newSeasonLogo || undefined
    };

    wsService.emit('action', { type: SocketAction.ADD_SEASON as any, payload }, (res: any) => {
      setIsProcessing(false);
      if (res && res.status === 'error') {
        setCreateError(res.message || "Failed to create season.");
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
    setDeleteError(null);

    wsService.emit('action', { type: SocketAction.DELETE_SEASON as any, payload: { id: seasonToDelete.id } }, (res: any) => {
      setIsProcessing(false);
      if (res && res.status === 'error') {
        setDeleteError(res.message || "Failed to delete season.");
      } else {
        setSeasonToDelete(null);
      }
    });
  };

  const getSportName = (sportId: string) => {
    const s = sports.find(x => x.id === sportId);
    return s ? s.name : sportId;
  };

  const formatDate = (isoString: string) => {
    try {
      return isoString.split('T')[0];
    } catch {
      return isoString;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity onPress={safeGoBack} className="flex-row items-center gap-1 active:opacity-85">
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">Back</Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">League Settings</Text>
        <View className="w-8" />
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: hasLeagueChanges ? 140 : 40 }}>
          {/* League Details Editor */}
          <GlassCard className="border border-slate-200 dark:border-white/5 p-5 mb-8">
            <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">League Settings</Text>
            
            {editError && (
              <View className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl mb-4">
                <Text className="text-red-500 font-inter text-xs">{editError}</Text>
              </View>
            )}

            <View className="space-y-4">
              {/* League Logo Upload */}
              <View className="items-center py-2">
                <TouchableOpacity
                  onPress={handlePickLeagueLogo}
                  className="w-24 h-24 rounded-2xl items-center justify-center overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 relative"
                  activeOpacity={0.85}
                >
                  {leagueLogo ? (
                    <Image source={{ uri: getOrgLogoUrl(leagueLogo) }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <Ionicons name="trophy-outline" size={40} color={isDark ? "#94A3B8" : "#64748B"} />
                  )}
                  <View className="absolute bottom-1.5 right-1.5 bg-brand-orange w-6 h-6 rounded-full items-center justify-center border border-white dark:border-slate-900 shadow-md">
                    <Ionicons name="camera" size={12} color="white" />
                  </View>
                </TouchableOpacity>
                <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">League Branding Logo</Text>
              </View>

              <View className="space-y-1">
                <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">League Name</Text>
                <TextInput
                  value={leagueName}
                  onChangeText={setLeagueName}
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                />
              </View>

              <View className="flex-row items-center gap-2 mt-1">
                <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Sport:</Text>
                <View className="bg-slate-150 dark:bg-white/10 px-2.5 py-0.5 rounded-full border border-slate-200/50 dark:border-white/5">
                  <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-350 uppercase tracking-wider">
                    {league ? getSportName(league.sportId) : ''}
                  </Text>
                </View>
              </View>

              <View className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Join Policy</Text>
                <View className="flex-row gap-2.5">
                  {(['CLOSED', 'INVITE', 'OPEN'] as const).map((policy) => {
                    const isSelected = joinPolicy === policy;
                    return (
                      <TouchableOpacity
                        key={policy}
                        onPress={() => setJoinPolicy(policy)}
                        className={`flex-1 py-2 rounded-xl border items-center justify-center ${
                          isSelected
                            ? 'bg-brand-orange/15 border-brand-orange'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200/50 dark:border-white/5'
                        }`}
                      >
                        <Text className={`font-orbitron-bold text-[10px] tracking-wider ${
                          isSelected
                            ? 'text-brand-orange'
                            : 'text-slate-500 dark:text-slate-450'
                        }`}>
                          {policy}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View className="bg-slate-100/50 dark:bg-white/5 p-3 rounded-xl border border-slate-200/30 dark:border-white/5">
                  <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
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
            <Text className="font-orbitron-bold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest">Seasons</Text>
            <TouchableOpacity
              onPress={() => setIsCreateModalOpen(true)}
              className="flex-row items-center gap-1 bg-brand-orange/10 border border-brand-orange/20 px-3 py-1.5 rounded-lg active:opacity-85"
            >
              <Ionicons name="add" size={14} color="#FF3E00" />
              <Text className="font-inter-bold text-[10px] text-brand-orange uppercase">New Season</Text>
            </TouchableOpacity>
          </View>

          {/* Seasons List */}
          <View className="space-y-4">
            {seasons.map((season) => (
              <GlassCard key={season.id} className="border border-slate-200 dark:border-white/5 p-4">
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center flex-1 mr-4 gap-3.5">
                    {season.logo ? (
                      <View className="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200/50 dark:border-white/5">
                        <Image 
                          source={{ uri: getOrgLogoUrl(season.logo, 'thumb') }} 
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center shrink-0 border border-slate-200/50 dark:border-white/5">
                        <Ionicons name="calendar" size={20} color={isDark ? "#94A3B8" : "#64748B"} />
                      </View>
                    )}
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1 flex-wrap">
                        <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white">
                          {season.name}
                        </Text>
                        <View className={`px-2 py-0.5 rounded ${
                          season.status === 'ACTIVE' 
                            ? 'bg-cyan-500/10 border border-cyan-500/20' 
                            : season.status === 'COMPLETED' 
                            ? 'bg-slate-200/50 dark:bg-white/10' 
                            : 'bg-orange-500/10 border border-orange-500/20'
                        }`}>
                          <Text className={`font-orbitron-bold text-[8px] uppercase tracking-wider ${
                            season.status === 'ACTIVE' 
                              ? 'text-cyan-500' 
                              : season.status === 'COMPLETED' 
                              ? 'text-slate-500 dark:text-slate-400' 
                              : 'text-brand-orange'
                          }`}>
                            {season.status}
                          </Text>
                        </View>
                      </View>
                      
                      <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(season.startDate)} to {formatDate(season.endDate)}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity 
                      onPress={() => router.push(`/admin/${orgId}/leagues/${leagueId}/seasons/${season.id}`)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center border border-slate-200/50 dark:border-white/5 active:opacity-85"
                    >
                      <Ionicons name="pencil" size={12} color={isDark ? "#E2E8F0" : "#475569"} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => setSeasonToDelete(season)}
                      className="w-7 h-7 rounded-lg bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-85"
                    >
                      <Ionicons name="trash-outline" size={12} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            ))}

            {seasons.length === 0 && (
              <View className="items-center justify-center py-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl">
                <Ionicons name="calendar-outline" size={36} color="#94A3B8" className="opacity-45 mb-2" />
                <Text className="font-orbitron-bold text-xs text-slate-500 dark:text-slate-400">No Seasons Registered</Text>
                <Text className="font-inter text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Click "New Season" to begin.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Create Season Modal */}
      <Modal visible={isCreateModalOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 border-t border-slate-200 dark:border-white/5 space-y-4 max-h-[90%]">
            <View className="flex-row justify-between items-center pb-2 border-b border-slate-100 dark:border-white/5">
              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white uppercase">New Season</Text>
              <TouchableOpacity onPress={() => setIsCreateModalOpen(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            {createError && (
              <View className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                <Text className="text-red-500 font-inter text-xs">{createError}</Text>
              </View>
            )}

            <ScrollView className="space-y-4 pr-1">
              {/* Season Logo Upload */}
              <View className="items-center py-1">
                <TouchableOpacity
                  onPress={handlePickSeasonLogo}
                  className="w-20 h-20 rounded-2xl items-center justify-center overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 relative"
                  activeOpacity={0.8}
                >
                  {newSeasonLogo ? (
                    <Image source={{ uri: newSeasonLogo }} className="w-full h-full" resizeMode="cover" />
                  ) : (
                    <Ionicons name="calendar-outline" size={32} color={isDark ? "#94A3B8" : "#64748B"} />
                  )}
                  <View className="absolute bottom-1 right-1 bg-brand-orange w-5 h-5 rounded-full items-center justify-center border border-white dark:border-slate-900 shadow-sm">
                    <Ionicons name="camera" size={10} color="white" />
                  </View>
                </TouchableOpacity>
                <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mt-1.5">Season Logo</Text>
              </View>

              <View className="space-y-1">
                <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">Season Name</Text>
                <TextInput
                  value={newSeasonName}
                  onChangeText={setNewSeasonName}
                  placeholder="e.g. 2026 Season"
                  placeholderTextColor="#94A3B8"
                  className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
                />
              </View>

              <View className="grid grid-cols-2 gap-4">
                <View className="space-y-1">
                  <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">Start Date</Text>
                  <DatePicker
                    value={startDateStr}
                    onChange={setStartDateStr}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View className="space-y-1">
                  <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">End Date</Text>
                  <DatePicker
                    value={endDateStr}
                    onChange={setEndDateStr}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              <View className="space-y-1.5">
                <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">Status (Calculated)</Text>
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

              {/* Point settings */}
              <View className="pt-2 border-t border-slate-100 dark:border-white/5 space-y-2">
                <Text className="font-orbitron-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">Point Allocations</Text>
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
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">
              Unsaved Changes
            </Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
              You have modified this league's details.
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleCancelLeague}
              disabled={isSavingLeague}
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl active:scale-95 border border-slate-200 dark:border-white/5"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveLeague}
              disabled={isSavingLeague || !leagueName.trim()}
              className="bg-brand-orange px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md shadow-brand-orange/30"
            >
              {isSavingLeague ? (
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
