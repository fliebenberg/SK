import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal, Image } from 'react-native';
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
import { SocketAction, League, Sport, Organization } from '@sk/types';
import { getOrgLogoUrl } from '../../../../services/api';
import CustomSelect from '../../../../components/CustomSelect';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export default function OrgLeagues() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // States
  const [isLoading, setIsLoading] = useState(true);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Creation Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [selectedSportId, setSelectedSportId] = useState('');
  const [newLeagueAgeGroup, setNewLeagueAgeGroup] = useState('');
  const [selectedJoinPolicy, setSelectedJoinPolicy] = useState<'CLOSED' | 'INVITE' | 'OPEN'>('CLOSED');
  const [newLeagueLogo, setNewLeagueLogo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Deletion Modal State
  const [leagueToDelete, setLeagueToDelete] = useState<League | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Logo Picker Handler
  const handlePickLeagueLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('We need camera roll permissions to set the league logo.');
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

        const actions: any[] = [
          {
            crop: {
              originX: Math.round((asset.width - minDim) / 2),
              originY: Math.round((asset.height - minDim) / 2),
              width: minDim,
              height: minDim,
            },
          },
        ];

        if (minDim > 1024) {
          actions.push({
            resize: {
              width: 1024,
              height: 1024,
            },
          });
        }

        const manipulateResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          actions,
          { compress: 0.8, format: ImageManipulator.SaveFormat.PNG, base64: true }
        );

        setNewLeagueLogo(`data:image/png;base64,${manipulateResult.base64}`);
      }
    } catch (err) {
      console.error('[Leagues] Error picking logo image:', err);
      alert('Failed to process selected logo image');
    }
  };

  // Fetch Data & Subscribe
  useEffect(() => {
    if (!isConnected || !orgId) return;

    let active = true;
    setIsLoading(true);

    // ... keeping other loads
    wsService.emit('get_data', { type: 'organization', id: orgId }, (res: any) => {
      if (active && res) setOrg(res);
    });

    wsService.emit('get_data', { type: 'leagues', orgId }, (res: any) => {
      if (active) {
        if (Array.isArray(res)) setLeagues(res);
        setIsLoading(false);
      }
    });

    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (active && Array.isArray(res)) setSports(res);
    });

    // Real-Time Sync Subscription
    const room = `org:${orgId}:leagues`;
    const unsubscribe = wsService.subscribeToRoom(room);

    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event) {
        if (event.type === 'LEAGUE_ADDED') {
          setLeagues(prev => {
            if (prev.some(l => l.id === event.data.id)) {
              return prev.map(l => l.id === event.data.id ? event.data : l);
            }
            return [event.data, ...prev];
          });
        } else if (event.type === 'LEAGUE_UPDATED') {
          setLeagues(prev => prev.map(l => l.id === event.data.id ? event.data : l));
        } else if (event.type === 'LEAGUE_DELETED') {
          setLeagues(prev => prev.filter(l => l.id !== event.data.id));
        }
      }
    };

    wsService.on('update', handleUpdate);

    return () => {
      active = false;
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [isConnected, orgId]);

  // Create League Handler
  const handleCreateLeague = () => {
    if (!newLeagueName.trim() || !selectedSportId) {
      setCreateError("Name and Sport are required.");
      return;
    }

    setIsProcessing(true);
    setCreateError(null);

    const payload = {
      name: newLeagueName.trim(),
      orgId,
      sportId: selectedSportId,
      ageGroup: newLeagueAgeGroup.trim() || undefined,
      joinPolicy: selectedJoinPolicy,
      criteria: {},
      logo: newLeagueLogo || undefined
    };

    wsService.emit('action', { type: SocketAction.ADD_LEAGUE as any, payload }, (res: any) => {
      setIsProcessing(false);
      if (res && res.status === 'error') {
        setCreateError(res.message || "Failed to create league.");
      } else {
        setIsCreateModalOpen(false);
        setNewLeagueName('');
        setSelectedSportId('');
        setNewLeagueAgeGroup('');
        setSelectedJoinPolicy('CLOSED');
        setNewLeagueLogo('');
      }
    });
  };

  // Delete League Handler
  const confirmDeleteLeague = () => {
    if (!leagueToDelete) return;
    setIsProcessing(true);
    setDeleteError(null);

    wsService.emit('action', { type: SocketAction.DELETE_LEAGUE as any, payload: { id: leagueToDelete.id } }, (res: any) => {
      setIsProcessing(false);
      if (res && res.status === 'error') {
        setDeleteError(res.message || "Failed to delete league.");
      } else {
        setLeagueToDelete(null);
      }
    });
  };

  // Filter Leagues
  const filteredLeagues = leagues.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.ageGroup?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSportName = (sportId: string) => {
    const s = sports.find(x => x.id === sportId);
    return s ? s.name : sportId;
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity onPress={() => safeBack(`/admin/${orgId}`)} className="flex-row items-center gap-1 active:opacity-85">
          <Ionicons name="chevron-back" size={20} color="#FF3E00" />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">Back</Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase">Leagues & Seasons</Text>
        <TouchableOpacity
          className="w-8 h-8 rounded-lg bg-brand-orange items-center justify-center shadow-md shadow-brand-orange/20 active:opacity-85"
          onPress={() => setIsCreateModalOpen(true)}
        >
          <Ionicons name="add" size={18} color="white" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3E00" />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Search bar */}
          <View className="flex-row items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 mb-6 shadow-sm">
            <Ionicons name="search-outline" size={18} color="#94A3B8" />
            <TextInput
              placeholder="Search leagues..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 font-inter text-slate-800 dark:text-white text-sm ml-2.5 outline-none"
            />
          </View>

          {/* List */}
          <View className="space-y-4">
            {filteredLeagues.map((league) => (
              <GlassCard key={league.id} className="border border-slate-200 dark:border-white/5 p-4">
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center flex-1 mr-4 gap-3.5">
                    {league.logo ? (
                      <View className="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200/50 dark:border-white/5">
                        <Image 
                          source={{ uri: getOrgLogoUrl(league.logo, 'thumb') }} 
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 items-center justify-center shrink-0 border border-slate-200/50 dark:border-white/5">
                        <Ionicons name="trophy" size={20} color={isDark ? "#94A3B8" : "#64748B"} />
                      </View>
                    )}
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white">
                          {league.name}
                        </Text>
                      </View>
                      
                      <View className="flex-row flex-wrap items-center gap-2">
                        <View className="bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-full">
                          <Text className="font-inter-bold text-[9px] text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                            {getSportName(league.sportId)}{league.ageGroup ? ` • ${league.ageGroup}` : ''}
                          </Text>
                        </View>
                        <View className="bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20">
                          <Text className="font-inter-bold text-[9px] text-brand-orange uppercase tracking-wider">
                            {league.joinPolicy}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity 
                      onPress={() => router.push(`/admin/${orgId}/leagues/${league.id}`)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 items-center justify-center border border-slate-200/50 dark:border-white/5 active:opacity-80"
                    >
                      <Ionicons name="pencil" size={12} color={isDark ? "#E2E8F0" : "#475569"} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => setLeagueToDelete(league)}
                      className="w-7 h-7 rounded-lg bg-red-500/10 items-center justify-center border border-red-500/20 active:opacity-80"
                    >
                      <Ionicons name="trash-outline" size={12} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            ))}

            {filteredLeagues.length === 0 && (
              <View className="items-center justify-center py-12">
                <Ionicons name="trophy-outline" size={48} color="#94A3B8" className="opacity-40 mb-3" />
                <Text className="font-orbitron-bold text-base text-slate-700 dark:text-slate-300">No Leagues Found</Text>
                <Text className="font-inter text-xs text-slate-400 dark:text-slate-500 mt-1">Create your first league to configure standings.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Create League Modal */}
      <Modal visible={isCreateModalOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 border-t border-slate-200 dark:border-white/5 space-y-4">
            <View className="flex-row justify-between items-center pb-2 border-b border-slate-100 dark:border-white/5">
              <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white uppercase">New League</Text>
              <TouchableOpacity onPress={() => setIsCreateModalOpen(false)}>
                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            {createError && (
              <View className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                <Text className="text-red-500 font-inter text-xs">{createError}</Text>
              </View>
            )}

            {/* League Logo Selector */}
            <View className="items-center py-2">
              <TouchableOpacity
                onPress={handlePickLeagueLogo}
                className="w-20 h-20 rounded-2xl items-center justify-center overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 relative"
                activeOpacity={0.8}
              >
                {newLeagueLogo ? (
                  <Image source={{ uri: newLeagueLogo }} className="w-full h-full" resizeMode="cover" />
                ) : (
                  <Ionicons name="trophy-outline" size={32} color={isDark ? "#94A3B8" : "#64748B"} />
                )}
                <View className="absolute bottom-1 right-1 bg-brand-orange w-5 h-5 rounded-full items-center justify-center border border-white dark:border-slate-900 shadow-sm">
                  <Ionicons name="camera" size={10} color="white" />
                </View>
              </TouchableOpacity>
              <Text className="font-orbitron-bold text-[8px] text-slate-600 dark:text-slate-400 uppercase tracking-widest mt-1.5">League Logo</Text>
            </View>

            <View className="space-y-1">
              <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">League Name</Text>
              <TextInput
                value={newLeagueName}
                onChangeText={setNewLeagueName}
                placeholder="e.g. Western Province U19 Rugby"
                placeholderTextColor="#94A3B8"
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>

            <View className="space-y-1">
              <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">Sport</Text>
              <CustomSelect
                value={selectedSportId}
                onChange={setSelectedSportId}
                options={sports.map(s => ({ value: s.id, label: s.name }))}
                placeholder="Select a Sport"
              />
            </View>

            <View className="space-y-1">
              <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">Age Group (Optional)</Text>
              <TextInput
                value={newLeagueAgeGroup}
                onChangeText={setNewLeagueAgeGroup}
                placeholder="e.g. U19"
                placeholderTextColor="#94A3B8"
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>

            <View className="space-y-1">
              <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">Join Policy</Text>
              <CustomSelect
                value={selectedJoinPolicy}
                onChange={(val) => setSelectedJoinPolicy(val as 'CLOSED' | 'INVITE' | 'OPEN')}
                options={[
                  { value: 'CLOSED', label: 'CLOSED (Owner Adds Teams)' },
                  { value: 'INVITE', label: 'INVITE (Apply to Join)' },
                  { value: 'OPEN', label: 'OPEN (Anyone Can Join)' }
                ]}
                placeholder="Select Join Policy"
              />
            </View>

            <View className="flex-row gap-4 pt-2">
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setIsCreateModalOpen(false)}
                className="flex-1 py-3 rounded-xl"
              />
              <Button
                title={isProcessing ? "Saving..." : "Create League"}
                onPress={handleCreateLeague}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl"
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        isOpen={!!leagueToDelete}
        title="Delete League"
        description={`Are you sure you want to delete "${leagueToDelete?.name}"? This will permanently delete all associated seasons, rosters, and standings. This action cannot be undone.`}
        onConfirm={confirmDeleteLeague}
        onClose={() => setLeagueToDelete(null)}
        isProcessing={isProcessing}
      />
    </SafeAreaView>
  );
}
