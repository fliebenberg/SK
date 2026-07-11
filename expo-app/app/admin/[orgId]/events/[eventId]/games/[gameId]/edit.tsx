import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../../../components/GlassCard';
import { Button } from '../../../../../../../components/Button';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../../../../store/settingsStore';
import { wsService } from '../../../../../../../services/websocket';
import { useWsStore } from '../../../../../../../store/wsStore';
import { SocketAction, Event, Game, Sport, Site, Team, Organization } from '@sk/types';
import { COLORS, getThemeColor } from '../../../../../../../constants/Colors';

export default function EditGame() {
  const router = useRouter();
  const { orgId, eventId, gameId } = useLocalSearchParams<{ orgId: string, eventId: string, gameId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [sports, setSports] = useState<Sport[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [orgsList, setOrgsList] = useState<Organization[]>([]);

  // Team cache by organization
  const [orgTeams, setOrgTeams] = useState<Record<string, Team[]>>({});

  // Form Fields
  const [selectedSportId, setSelectedSportId] = useState('');
  const [selectedHomeOrgId, setSelectedHomeOrgId] = useState(orgId);
  const [selectedHomeTeamId, setSelectedHomeTeamId] = useState('');
  const [selectedAwayOrgId, setSelectedAwayOrgId] = useState('');
  const [selectedAwayTeamId, setSelectedAwayTeamId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [isTbd, setIsTbd] = useState(false);
  const [gameStatus, setGameStatus] = useState<'Scheduled' | 'Live' | 'Finished' | 'Cancelled'>('Scheduled');

  // Deletion & Cancellation modals
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Load initial game and metadata
  useEffect(() => {
    if (!isConnected || !orgId || !eventId || !gameId) return;

    setIsLoading(true);

    // Get event
    wsService.emit('get_data', { type: 'event', id: eventId }, (res: any) => {
      if (res) setEvent(res);
    });

    // Get game
    wsService.emit('get_data', { type: 'game', id: gameId }, (res: any) => {
      if (res) {
        setGame(res);
        setSelectedSportId(res.sportId || '');
        setSelectedSiteId(res.siteId || '');
        setGameStatus(res.status || 'Scheduled');
        setIsTbd(!res.startTime);
        if (res.startTime) {
          const t = res.startTime.split('T')[1]?.substring(0, 5) || '09:00';
          setStartTime(t);
        }
      }
    });

    wsService.emit('get_data', { type: 'sports' }, (res: any) => {
      if (Array.isArray(res)) setSports(res);
    });

    wsService.emit('get_data', { type: 'sites', orgId }, (res: any) => {
      if (Array.isArray(res)) setSites(res);
    });

    wsService.emit('get_data', { type: 'organizations' }, (res: any) => {
      if (Array.isArray(res)) setOrgsList(res);
    });
  }, [isConnected, orgId, eventId, gameId]);

  // Load teams for host and participating orgs
  useEffect(() => {
    if (!event || orgsList.length === 0 || !game) return;

    const allInvolvedOrgIds = [orgId, ...(event.participatingOrgIds || [])];
    
    let loadedCount = 0;
    allInvolvedOrgIds.forEach(id => {
      wsService.emit('get_data', { type: 'teams', orgId: id }, (res: any) => {
        if (Array.isArray(res)) {
          setOrgTeams(prev => ({
            ...prev,
            [id]: res
          }));

          // Resolve home and away organizations from initial game participants
          const homeParticipantId = game.participants?.[0]?.teamId;
          const awayParticipantId = game.participants?.[1]?.teamId;

          if (homeParticipantId && res.some(t => t.id === homeParticipantId)) {
            setSelectedHomeOrgId(id);
            setSelectedHomeTeamId(homeParticipantId);
          }
          if (awayParticipantId && res.some(t => t.id === awayParticipantId)) {
            setSelectedAwayOrgId(id);
            setSelectedAwayTeamId(awayParticipantId);
          }
        }
        loadedCount++;
        if (loadedCount === allInvolvedOrgIds.length) {
          setIsLoading(false);
        }
      });
    });
  }, [event, orgsList, orgId, game]);

  // Filters
  const eventSports = sports.filter(s => event?.sportIds?.includes(s.id));
  const involvedOrgs = orgsList.filter(o => o.id === orgId || event?.participatingOrgIds?.includes(o.id));
  const homeTeamsList = (orgTeams[selectedHomeOrgId] || []).filter(t => t.sportId === selectedSportId);
  const awayTeamsList = (orgTeams[selectedAwayOrgId] || []).filter(t => t.sportId === selectedSportId);

  // Submit Handler
  const handleSubmit = () => {
    if (!event || !game || !selectedHomeTeamId || !selectedAwayTeamId) return;
    setIsProcessing(true);

    const dateBase = event.startDate.split('T')[0];
    const dateObj = new Date(`${dateBase}T${startTime}:00`);
    const scheduledTime = isTbd ? null : (!isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateBase}T${startTime}:00`);

    const payload = {
      id: gameId,
      data: {
        sportId: selectedSportId,
        participants: [{ teamId: selectedHomeTeamId }, { teamId: selectedAwayTeamId }],
        scheduledStartTime: scheduledTime,
        startTime: scheduledTime,
        siteId: selectedSiteId || undefined,
        status: gameStatus
      }
    };

    wsService.emit('action', { type: SocketAction.UPDATE_GAME, payload }, (res: any) => {
      setIsProcessing(false);
      if (res) router.back();
    });
  };

  // Cancel Game Handler
  const handleCancelGame = () => {
    setIsProcessing(true);
    const payload = {
      id: gameId,
      data: { status: 'Cancelled' }
    };

    wsService.emit('action', { type: SocketAction.UPDATE_GAME, payload }, (res: any) => {
      setIsProcessing(false);
      setIsCancelling(false);
      setGameStatus('Cancelled');
    });
  };

  // Delete Game Handler
  const handleDeleteGame = () => {
    setIsProcessing(true);
    if (event?.type === 'SingleMatch') {
      // For Standalone match, delete the parent Event which removes the game in cascade
      wsService.emit('delete_entity', { type: 'event', id: eventId }, (res: any) => {
        setIsProcessing(false);
        setIsDeleting(false);
        router.push(`/admin/${orgId}/events`);
      });
    } else {
      // Just delete the game inside Sports Day/Tournament
      wsService.emit('delete_entity', { type: 'game', id: gameId }, (res: any) => {
        setIsProcessing(false);
        setIsDeleting(false);
        router.push(`/admin/${orgId}/events/${eventId}`);
      });
    }
  };

  if (isLoading || !event || !game) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.brand.orange} />
        <Text className="font-orbitron text-xs text-slate-500 mt-4 uppercase tracking-widest">
          Loading Details...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-1 active:opacity-85"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase truncate flex-1 text-center px-4" numberOfLines={1}>
          Edit Match Info
        </Text>
        <TouchableOpacity 
          className={`active:opacity-85 ${(!selectedHomeTeamId || !selectedAwayTeamId) ? 'opacity-40' : ''}`}
          disabled={!selectedHomeTeamId || !selectedAwayTeamId || isProcessing}
          onPress={handleSubmit}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={COLORS.brand.orange} />
          ) : (
            <Text className="font-inter-bold text-xs text-brand-orange uppercase tracking-wider">
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 60 }}>
        <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-5">
          <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
            Edit details for game {gameId}
          </Text>

          {/* Select Status */}
          <View className="space-y-1.5">
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Match Status
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(['Scheduled', 'Live', 'Finished'] as const).map(status => {
                const isSelected = gameStatus === status;
                return (
                  <TouchableOpacity
                    key={status}
                    onPress={() => setGameStatus(status)}
                    className={`px-3 py-2 rounded-lg border ${
                      isSelected 
                        ? 'bg-brand-orange/10 border-brand-orange' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Select Sport */}
          <View className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Sport
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {eventSports.map(sport => {
                const isSelected = selectedSportId === sport.id;
                return (
                  <TouchableOpacity
                    key={sport.id}
                    onPress={() => {
                      setSelectedSportId(sport.id);
                      setSelectedHomeTeamId('');
                      setSelectedAwayTeamId('');
                    }}
                    className={`px-3 py-2 rounded-lg border ${
                      isSelected 
                        ? 'bg-brand-orange/10 border-brand-orange' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {sport.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Home Org Selection */}
          <View className="space-y-1.5">
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Home Organization
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {involvedOrgs.map(o => {
                const isSelected = selectedHomeOrgId === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => {
                      setSelectedHomeOrgId(o.id);
                      setSelectedHomeTeamId('');
                    }}
                    className={`px-3 py-2 rounded-lg border ${
                      isSelected 
                        ? 'bg-brand-orange/10 border-brand-orange' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {o.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Home Team Selection */}
          {selectedHomeOrgId && (
            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Home Team
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {homeTeamsList.map(team => {
                  const isSelected = selectedHomeTeamId === team.id;
                  return (
                    <TouchableOpacity
                      key={team.id}
                      onPress={() => setSelectedHomeTeamId(team.id)}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected 
                          ? 'bg-brand-orange/10 border-brand-orange' 
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                      }`}
                    >
                      <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                        {team.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {homeTeamsList.length === 0 && (
                  <Text className="font-inter text-xs text-slate-400 italic">No teams matching selected sport.</Text>
                )}
              </View>
            </View>
          )}

          {/* Away Org Selection */}
          <View className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Away Organization
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {involvedOrgs.map(o => {
                const isSelected = selectedAwayOrgId === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => {
                      setSelectedAwayOrgId(o.id);
                      setSelectedAwayTeamId('');
                    }}
                    className={`px-3 py-2 rounded-lg border ${
                      isSelected 
                        ? 'bg-brand-orange/10 border-brand-orange' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {o.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Away Team Selection */}
          {selectedAwayOrgId && (
            <View className="space-y-1.5">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Away Team
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {awayTeamsList.map(team => {
                  const isSelected = selectedAwayTeamId === team.id;
                  return (
                    <TouchableOpacity
                      key={team.id}
                      onPress={() => setSelectedAwayTeamId(team.id)}
                      className={`px-3 py-2 rounded-lg border ${
                        isSelected 
                          ? 'bg-brand-orange/10 border-brand-orange' 
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                      }`}
                    >
                      <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                        {team.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {awayTeamsList.length === 0 && (
                  <Text className="font-inter text-xs text-slate-400 italic">No opponent teams matching selected sport.</Text>
                )}
              </View>
            </View>
          )}

          {/* Site selection */}
          <View className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-white/5">
            <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Site Field/Court
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {sites.map(site => {
                const isSelected = selectedSiteId === site.id;
                return (
                  <TouchableOpacity
                    key={site.id}
                    onPress={() => setSelectedSiteId(site.id)}
                    className={`px-3 py-2 rounded-lg border ${
                      isSelected 
                        ? 'bg-brand-orange/10 border-brand-orange' 
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/5'
                    }`}
                  >
                    <Text className={`font-inter text-xs ${isSelected ? 'text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                      {site.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Match Time */}
          <View className="space-y-3 pt-2">
            <View className="flex-row justify-between items-center">
              <Text className="font-orbitron-bold text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Start Time
              </Text>
              <View className="flex-row items-center gap-2">
                <Text className="font-inter text-xs text-slate-500">TBD</Text>
                <Switch
                  value={isTbd}
                  onValueChange={setIsTbd}
                  trackColor={{ false: '#CBD5E1', true: COLORS.brand.orange }}
                />
              </View>
            </View>

            {!isTbd && (
              <TextInput
                placeholder="e.g. 09:00"
                placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                value={startTime}
                onChangeText={setStartTime}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 font-inter text-sm text-slate-850 dark:text-white"
              />
            )}
          </View>
        </GlassCard>

        {/* DANGER ZONE */}
        <GlassCard className="border border-red-500/25 bg-red-500/5 p-5 space-y-4 mt-6">
          <Text className="font-orbitron-bold text-xs text-brand-red uppercase tracking-wider">Danger Zone</Text>
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Cancel Match</Text>
              <Text className="font-inter text-xs text-slate-500 mt-0.5">Temporarily mark match as Cancelled.</Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsCancelling(true)}
              disabled={gameStatus === 'Cancelled'}
              className={`px-4 py-2 border border-brand-orange rounded-lg ${
                gameStatus === 'Cancelled' ? 'opacity-40' : ''
              }`}
            >
              <Text className="font-inter-bold text-xs text-brand-orange uppercase">Cancel Match</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-between items-center pt-4 border-t border-slate-100 dark:border-white/5">
            <View>
              <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Delete Match</Text>
              <Text className="font-inter text-xs text-slate-500 mt-0.5">Permanently deletes match records.</Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsDeleting(true)}
              className="px-4 py-2 border border-brand-red rounded-lg"
            >
              <Text className="font-inter-bold text-xs text-brand-red uppercase">Delete Match</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </ScrollView>

      {/* CANCELLATION CONFIRMATION */}
      <ConfirmationModal
        isOpen={isCancelling}
        title="Cancel Match?"
        description="Are you sure you want to cancel this match? You can restore it later by setting the status back to Scheduled."
        confirmText="Cancel Match"
        cancelText="Keep Scheduled"
        onConfirm={handleCancelGame}
        onClose={() => setIsCancelling(false)}
        isProcessing={isProcessing}
      />

      {/* DELETION CONFIRMATION */}
      <ConfirmationModal
        isOpen={isDeleting}
        title="Delete Match?"
        description={
          event?.type === 'SingleMatch'
            ? 'Deleting this game will also permanently delete the entire Friendly Match event record. This cannot be undone.'
            : 'Are you sure you want to permanently delete this game matchup? This will remove all database records for this match and cannot be undone.'
        }
        confirmText="Delete Match"
        cancelText="Cancel"
        onConfirm={handleDeleteGame}
        onClose={() => setIsDeleting(false)}
        isProcessing={isProcessing}
      />
    </SafeAreaView>
  );
}
