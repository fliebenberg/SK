import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../components/GlassCard';
import { Button } from '../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../store/settingsStore';
import { wsService } from '../../../../services/websocket';
import { useWsStore } from '../../../../store/wsStore';
import { SocketAction, League, Sport, Organization } from '@sk/types';

export default function OrgLeagues() {
  const router = useRouter();
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Deletion Modal State
  const [leagueToDelete, setLeagueToDelete] = useState<League | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch Data & Subscribe
  useEffect(() => {
    if (!isConnected || !orgId) return;

    let active = true;
    setIsLoading(true);

    // Initial fetch
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
          setLeagues(prev => [event.data, ...prev]);
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
      criteria: {}
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
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1 active:opacity-85">
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
                  <View className="flex-1 mr-4">
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

            <View className="space-y-1">
              <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">League Name</Text>
              <TextInput
                value={newLeagueName}
                onChangeText={setNewLeagueName}
                placeholder="e.g. Western Province U19 Rugby"
                placeholderTextColor="#94A3B8"
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>

            <View className="space-y-1">
              <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Sport</Text>
              <View className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
                <select
                  value={selectedSportId}
                  onChange={(e) => setSelectedSportId(e.target.value)}
                  style={{
                    width: '100%',
                    height: 44,
                    padding: '0 16px',
                    background: 'transparent',
                    border: 'none',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    fontFamily: 'Inter, System, sans-serif',
                    fontSize: 14,
                    outline: 'none'
                  }}
                >
                  <option value="">Select a Sport</option>
                  {sports.map(s => (
                    <option key={s.id} value={s.id} style={{ background: isDark ? '#0F172A' : '#FFFFFF' }}>{s.name}</option>
                  ))}
                </select>
              </View>
            </View>

            <View className="space-y-1">
              <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Age Group (Optional)</Text>
              <TextInput
                value={newLeagueAgeGroup}
                onChangeText={setNewLeagueAgeGroup}
                placeholder="e.g. U19"
                placeholderTextColor="#94A3B8"
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            </View>

            <View className="space-y-1">
              <Text className="font-inter-bold text-[10px] text-slate-400 dark:text-slate-500 uppercase">Join Policy</Text>
              <View className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
                <select
                  value={selectedJoinPolicy}
                  onChange={(e: any) => setSelectedJoinPolicy(e.target.value)}
                  style={{
                    width: '100%',
                    height: 44,
                    padding: '0 16px',
                    background: 'transparent',
                    border: 'none',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    fontFamily: 'Inter, System, sans-serif',
                    fontSize: 14,
                    outline: 'none'
                  }}
                >
                  <option value="CLOSED" style={{ background: isDark ? '#0F172A' : '#FFFFFF' }}>CLOSED (Owner Adds Teams)</option>
                  <option value="INVITE" style={{ background: isDark ? '#0F172A' : '#FFFFFF' }}>INVITE (Apply to Join)</option>
                  <option value="OPEN" style={{ background: isDark ? '#0F172A' : '#FFFFFF' }}>OPEN (Anyone Can Join)</option>
                </select>
              </View>
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
