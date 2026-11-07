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
import { sendAction } from '../../../../services/actions';
import { useSocketQuery } from '../../../../hooks/useSocketQuery';
import { SocketAction, League, Sport } from '@sk/shared';
import { getOrgLogoUrl } from '../../../../services/assets';
import CustomSelect from '../../../../components/CustomSelect';
import { ReadFailure } from '../../../../components/ReadFailure';
import { AgeGroupPicker } from '../../../../components/AgeGroupPicker';
import { useImageUpload } from '../../../../hooks/useImageUpload';
import { themeColor } from '../../../../constants/Colors';

export default function OrgLeagues() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const isDark = useActiveTheme() === 'dark';

  // States
  const [isLoading, setIsLoading] = useState(true);
  const [leagues, setLeagues] = useState<League[]>([]);
  /** The room refused this viewer (`SYNC-10`): not "no leagues", which only its answer can say. */
  const [refused, setRefused] = useState(false);
  // Drawn here where the names would be, and in the form where the sport is chosen.
  const { data: sportsRead, error: sportsError, refetch: refetchSports } = useSocketQuery<Sport[]>('sports', {}, { suppressToast: true });
  const sports = sportsRead ?? [];
  /** No list of sports to choose from, because the read failed. */
  const sportsFailed = !!sportsError && !sportsRead;
  const [searchQuery, setSearchQuery] = useState('');

  // Creation Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [selectedSportId, setSelectedSportId] = useState('');
  const [newLeagueAgeGroupId, setNewLeagueAgeGroupId] = useState<string | null>(null);
  const [selectedJoinPolicy, setSelectedJoinPolicy] = useState<'CLOSED' | 'INVITE' | 'OPEN'>('CLOSED');
  const [newLeagueLogo, setNewLeagueLogo] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Deletion Modal State
  const [leagueToDelete, setLeagueToDelete] = useState<League | null>(null);

  // The logo is uploaded when chosen and saved with the league. Closing the form deletes an
  // upload it did not save.
  const logoUpload = useImageUpload({
    kind: 'logos',
    title: 'League logo',
    current: newLeagueLogo ? getOrgLogoUrl(newLeagueLogo, 'large') : null,
    onUploaded: setNewLeagueLogo,
    onRemove: () => { setNewLeagueLogo(''); return true; },
  });
  const closeCreateModal = () => {
    logoUpload.discard();
    setNewLeagueLogo('');
    setIsCreateModalOpen(false);
  };

  // Fetch Data & Subscribe
  useEffect(() => {
    if (!orgId) return;

    let active = true;
    setIsLoading(true);

    // Real-Time Sync Subscription. The room hands the leagues over on join (`LIVE-14`), so there
    // is no `get_data leagues` here — joining *is* the load, live-data rule 2.
    const room = `org:${orgId}:leagues`;

    const handleUpdate = (event: any) => {
      if (!active) return;
      if (event) {
        if (event.type === 'LEAGUES_SYNC') {
          if (Array.isArray(event.data)) setLeagues(event.data);
          setRefused(false);
          setIsLoading(false);
        } else if (event.type === 'ROOM_ACCESS_DENIED' || event.type === 'ROOM_ACCESS_REVOKED') {
          // A room push has no ack and no timeout, so a refused join has to clear the spinner
          // explicitly or the screen waits forever for a message that is never coming.
          setLeagues([]);
          setRefused(true);
          setIsLoading(false);
        } else if (event.type === 'LEAGUE_ADDED') {
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
    const unsubscribe = wsService.subscribeToRoom(room, handleUpdate);

    return () => {
      active = false;
      unsubscribe();
      wsService.off('update', handleUpdate);
    };
  }, [orgId]);

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
      ageGroupId: newLeagueAgeGroupId,
      joinPolicy: selectedJoinPolicy,
      criteria: {},
      logo: newLeagueLogo || undefined
    };

    sendAction(SocketAction.ADD_LEAGUE, payload, { suppressToast: true }).then(result => {
      setIsProcessing(false);
      if (!result.ok) {
        setCreateError(result.message);
      } else {
        logoUpload.saved();
        setIsCreateModalOpen(false);
        setNewLeagueName('');
        setSelectedSportId('');
        setNewLeagueAgeGroupId(null);
        setSelectedJoinPolicy('CLOSED');
        setNewLeagueLogo('');
      }
    });
  };

  // Delete League Handler
  const confirmDeleteLeague = () => {
    if (!leagueToDelete) return;
    setIsProcessing(true);

    // Toasted rather than shown inline. On failure the dialog stays open.
    sendAction(SocketAction.DELETE_LEAGUE, { id: leagueToDelete.id }).then(result => {
      setIsProcessing(false);
      if (result.ok) setLeagueToDelete(null);
    });
  };

  // Filter Leagues
  const filteredLeagues = leagues.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.ageGroup?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSportName = (sportId: string) => {
    const s = sports.find(x => x.id === sportId);
    return s ? s.name : sportsRead ? sportId : '';
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-line-soft bg-card z-10">
        <TouchableOpacity onPress={() => safeBack(`/admin/${orgId}`)} className="flex-row items-center gap-1 active:opacity-85">
          <Ionicons name="chevron-back" size={20} color={themeColor(isDark, 'primary')} />
          <Text className="font-inter-bold text-xs text-ink-muted uppercase tracking-wider">Back</Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-ink uppercase">Leagues & Seasons</Text>
        <TouchableOpacity
          className="w-8 h-8 rounded-lg bg-primary items-center justify-center shadow-md shadow-primary/20 active:opacity-85"
          onPress={() => setIsCreateModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="New league"
        >
          <Ionicons name="add" size={18} color={themeColor(isDark, 'on-primary')} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={themeColor(isDark, 'primary')} />
        </View>
      ) : (
        <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Search bar */}
          <View className="flex-row items-center bg-card border border-line rounded-xl px-4 py-3 mb-6 shadow-sm">
            <Ionicons name="search-outline" size={18} color={themeColor(isDark, 'ink-muted')} />
            <TextInput
              placeholder="Search leagues..."
              placeholderTextColor={themeColor(isDark, 'ink-muted')}
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 font-inter text-ink text-sm ml-2.5 outline-none"
            />
          </View>

          {/* List */}
          <View className="gap-4">
            {sportsFailed ? <ReadFailure what="The sports" reason={sportsError} onRetry={refetchSports} /> : null}
            {refused ? <ReadFailure title="The leagues did not load." reason="The server refused this account access to the organisation's leagues." /> : null}

            {filteredLeagues.map((league) => (
              <GlassCard key={league.id} className="border border-line p-4">
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center flex-1 mr-4 gap-3.5">
                    {league.logo ? (
                      <View className="w-11 h-11 rounded-xl overflow-hidden bg-sunken shrink-0 border border-line-soft">
                        <Image 
                          source={{ uri: getOrgLogoUrl(league.logo, 'thumb') }} 
                          className="w-full h-full"
                          resizeMode="cover"
                        />
                      </View>
                    ) : (
                      <View className="w-11 h-11 rounded-xl bg-sunken items-center justify-center shrink-0 border border-line-soft">
                        <Ionicons name="trophy" size={20} color={themeColor(isDark, 'ink-muted')} />
                      </View>
                    )}
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text className="font-orbitron-bold text-base text-ink">
                          {league.name}
                        </Text>
                      </View>
                      
                      <View className="flex-row flex-wrap items-center gap-2">
                        {getSportName(league.sportId) || league.ageGroup ? (
                          <View className="bg-sunken px-2.5 py-1 rounded-full">
                            <Text className="font-inter-bold text-[9px] text-ink-soft uppercase tracking-wider">
                              {[getSportName(league.sportId), league.ageGroup].filter(Boolean).join(' • ')}
                            </Text>
                          </View>
                        ) : null}
                        <View className="bg-primary-soft px-2.5 py-1 rounded-full border border-primary-line">
                          <Text className="font-inter-bold text-[9px] text-primary-ink uppercase tracking-wider">
                            {league.joinPolicy}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity 
                      onPress={() => router.push(`/admin/${orgId}/leagues/${league.id}`)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${league.name}`}
                      className="w-7 h-7 rounded-lg bg-sunken items-center justify-center border border-line-soft active:opacity-80"
                    >
                      <Ionicons name="pencil" size={12} color={themeColor(isDark, 'ink-soft')} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => setLeagueToDelete(league)}
                      className="w-7 h-7 rounded-lg bg-danger-soft items-center justify-center border border-danger-line active:opacity-80"
                    >
                      <Ionicons name="trash-outline" size={12} color={themeColor(isDark, 'danger')} />
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            ))}

            {filteredLeagues.length === 0 && !refused && (
              <View className="items-center justify-center py-12">
                <Ionicons name="trophy-outline" size={48} color={themeColor(isDark, 'ink-muted')} className="opacity-40 mb-3" />
                <Text className="font-orbitron-bold text-base text-ink-soft">No Leagues Found</Text>
                <Text className="font-inter text-xs text-ink-muted mt-1">Create your first league to configure standings.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Create League Modal */}
      <Modal visible={isCreateModalOpen} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-overlay/60">
          <View className="bg-card rounded-t-3xl p-6 border-t border-line gap-4">
            <View className="flex-row justify-between items-center pb-2 border-b border-line-soft">
              <Text className="font-orbitron-bold text-lg text-ink uppercase">New League</Text>
              <TouchableOpacity onPress={closeCreateModal}>
                <Ionicons name="close" size={24} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>

            {createError && (
              <View className="bg-danger-soft border border-danger-line p-3 rounded-xl">
                <Text className="text-danger-ink font-inter text-xs">{createError}</Text>
              </View>
            )}

            {/* League Logo Selector */}
            <View className="items-center py-2">
              <TouchableOpacity
                onPress={logoUpload.open}
                accessibilityRole="button"
                accessibilityLabel="Choose the league logo"
                className="w-20 h-20 rounded-2xl items-center justify-center overflow-hidden border border-line bg-canvas relative"
                activeOpacity={0.8}
              >
                {newLeagueLogo ? (
                  <Image source={{ uri: getOrgLogoUrl(newLeagueLogo, 'medium') }} className="w-full h-full" resizeMode="cover" />
                ) : (
                  <Ionicons name="trophy-outline" size={32} color={themeColor(isDark, 'ink-muted')} />
                )}
                <View className="absolute bottom-1 right-1 bg-primary w-5 h-5 rounded-full items-center justify-center border border-card shadow-sm">
                  <Ionicons name="camera" size={10} color={themeColor(isDark, 'on-primary')} />
                </View>
              </TouchableOpacity>
              <Text className="font-orbitron-bold text-[8px] text-ink-muted uppercase tracking-widest mt-1.5">League Logo</Text>
            </View>

            <View className="gap-1">
              <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">League Name</Text>
              <TextInput
                value={newLeagueName}
                onChangeText={setNewLeagueName}
                placeholder="e.g. Western Province U19 Rugby"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
              />
            </View>

            <View className="gap-1">
              <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Sport</Text>
              {sportsFailed ? (
                <ReadFailure what="The sports" reason={`${sportsError} A league cannot be created without one.`} onRetry={refetchSports} />
              ) : (
                <CustomSelect
                  value={selectedSportId}
                  onChange={(sportId) => {
                    // An age group belongs to one sport, so choosing another clears it.
                    if (sportId !== selectedSportId) setNewLeagueAgeGroupId(null);
                    setSelectedSportId(sportId);
                  }}
                  options={sports.map(s => ({ value: s.id, label: s.name }))}
                  placeholder="Select a Sport"
                />
              )}
            </View>

            <View className="gap-1">
              <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Age Group</Text>
              <AgeGroupPicker
                sportId={selectedSportId}
                ageGroups={sports.find(s => s.id === selectedSportId)?.ageGroups}
                value={newLeagueAgeGroupId}
                onChange={setNewLeagueAgeGroupId}
                noneLabel="Any age"
                orgId={orgId}
              />
            </View>

            <View className="gap-1">
              <Text className="font-inter-bold text-[10px] text-ink-muted uppercase">Join Policy</Text>
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
                onPress={closeCreateModal}
                className="flex-1 py-3 rounded-xl"
              />
              <Button
                title={isProcessing ? "Saving..." : "Create League"}
                onPress={handleCreateLeague}
                disabled={isProcessing || sportsFailed}
                className="flex-1 py-3 rounded-xl"
              />
            </View>
          </View>
        </View>
        {/* Inside the form's modal: iOS shows a modal opened over another only from within it. */}
        {logoUpload.element}
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
