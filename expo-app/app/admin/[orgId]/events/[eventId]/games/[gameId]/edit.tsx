import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../../../../store/settingsStore';
import { wsService } from '../../../../../../../services/websocket';
import { useWsStore } from '../../../../../../../store/wsStore';
import { SocketAction, Event, Game, Sport, Site, Team, Organization } from '@sk/types';
import { COLORS } from '../../../../../../../constants/Colors';
import MatchForm, { MatchFormData } from '../../../../../../../components/MatchForm';
import { useAuthStore } from '../../../../../../../store/authStore';
import { useUnsavedChanges } from '../../../../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../../../../store/unsavedChangesStore';

export default function EditGame() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, gameId } = useLocalSearchParams<{ orgId: string, eventId: string, gameId: string }>();
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [orgsList, setOrgsList] = useState<Organization[]>([]);

  // Static once resolved initial state
  const [initialData, setInitialData] = useState<any>(null);
  const [formData, setFormData] = useState<MatchFormData | null>(null);

  // Deletion & Cancellation modals
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Form Reset and Dirty state
  const [formKey, setFormKey] = useState(0);

  const hasChanges = useMemo(() => {
    if (!initialData || !formData) return false;
    return (
      (formData.sportId || '') !== (initialData.sportId || '') ||
      (formData.homeOrgId || '') !== (initialData.homeOrgId || '') ||
      (formData.homeTeamId || '') !== (initialData.homeTeamId || '') ||
      (formData.awayOrgId || '') !== (initialData.awayOrgId || '') ||
      (formData.awayTeamId || '') !== (initialData.awayTeamId || '') ||
      (formData.siteId || '') !== (initialData.siteId || '') ||
      (formData.facilityId || '') !== (initialData.facilityId || '') ||
      (formData.gameDate || '') !== (initialData.gameDate || '') ||
      (formData.startTime || '') !== (initialData.startTime || '') ||
      !!formData.isTbd !== !!initialData.isTbd ||
      (formData.status || 'Scheduled') !== (initialData.status || 'Scheduled')
    );
  }, [formData, initialData]);

  const handleCancel = useCallback(() => {
    setFormData(null);
    setFormKey(prev => prev + 1);
  }, []);

  const safeGoBack = useCallback(() => {
    safeBack(`/admin/${orgId}/events/${eventId}`);
  }, [safeBack, orgId, eventId]);

  const { confirmThenNavigate } = useUnsavedChanges(hasChanges, handleCancel);

  const handleBackPress = useCallback(() => {
    confirmThenNavigate(safeGoBack);
  }, [confirmThenNavigate, safeGoBack]);

  // Load initial game and metadata
  useEffect(() => {
    if (!isConnected || !orgId || !eventId || !gameId) return;

    setIsLoading(true);

    // Get event
    wsService.emit('get_data', { type: 'event', id: eventId }, (res: any) => {
      if (res) {
        setEvent(res);
        if (res.orgId && res.orgId !== orgId) {
          router.replace(`/admin/${orgId}/events/${eventId}/games/${gameId}/view`);
          return;
        }
      }
    });

    // Get game
    wsService.emit('get_data', { type: 'game', id: gameId }, (res: any) => {
      if (res) setGame(res);
    });

    wsService.emit('get_data', { type: 'organizations' }, (res: any) => {
      if (res && Array.isArray(res.items)) {
        setOrgsList(res.items);
      } else if (Array.isArray(res)) {
        setOrgsList(res);
      }
    });
  }, [isConnected, orgId, eventId, gameId]);

  // Load team details to resolve participant organization IDs
  useEffect(() => {
    if (!event || orgsList.length === 0 || !game) return;

    const homeTeamId = game.participants?.[0]?.teamId;
    const awayTeamId = game.participants?.[1]?.teamId;

    let homeOrgId = orgId;
    let awayOrgId = '';
    let loadedHome = !homeTeamId;
    let loadedAway = !awayTeamId;

    const checkComplete = () => {
      if (loadedHome && loadedAway) {
        const dateBase = game.startTime ? game.startTime.split('T')[0] : (event.startDate?.split('T')[0] || '');
        const timeBase = game.startTime ? game.startTime.split('T')[1]?.substring(0, 5) : '09:00';
        
        setInitialData({
          sportId: game.sportId || '',
          homeOrgId,
          homeTeamId: homeTeamId || '',
          awayOrgId,
          awayTeamId: awayTeamId || '',
          siteId: game.siteId || '',
          facilityId: game.facilityId || '',
          gameDate: dateBase,
          startTime: timeBase || '09:00',
          isTbd: !game.startTime || game.customSettings?.timeTbd,
          status: game.status || 'Scheduled',
        });
        setIsLoading(false);
      }
    };

    if (homeTeamId) {
      wsService.emit('get_data', { type: 'team', id: homeTeamId }, (team: any) => {
        if (team && team.orgId) {
          homeOrgId = team.orgId;
        }
        loadedHome = true;
        checkComplete();
      });
    } else {
      loadedHome = true;
    }

    if (awayTeamId) {
      wsService.emit('get_data', { type: 'team', id: awayTeamId }, (team: any) => {
        if (team && team.orgId) {
          awayOrgId = team.orgId;
        }
        loadedAway = true;
        checkComplete();
      });
    } else {
      loadedAway = true;
    }

    if (!homeTeamId && !awayTeamId) {
      checkComplete();
    }
  }, [event, orgsList, orgId, game]);

  // Submit Handler
  const handleSubmit = () => {
    if (!event || !game || !formData || !formData.homeTeamId || !formData.awayTeamId) return;
    setIsProcessing(true);

    const dateBase = formData.gameDate || event.startDate.split('T')[0];
    let scheduledTime: string | null = null;

    if (formData.isTbd) {
      const dateObj = new Date(`${dateBase}T12:00:00`);
      scheduledTime = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateBase}T12:00:00`;
    } else {
      const dateObj = new Date(`${dateBase}T${formData.startTime}:00`);
      scheduledTime = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateBase}T${formData.startTime}:00`;
    }

    const userId = useAuthStore.getState().user?.id;

    const payload = {
      id: gameId,
      userId,
      orgId,
      data: {
        sportId: formData.sportId,
        participants: [{ teamId: formData.homeTeamId }, { teamId: formData.awayTeamId }],
        scheduledStartTime: scheduledTime,
        startTime: scheduledTime,
        siteId: formData.siteId || null,
        facilityId: formData.facilityId || null,
        status: formData.status,
        customSettings: {
          ...(game.customSettings || {}),
          timeTbd: formData.isTbd
        }
      }
    };

    wsService.emit('action', { type: SocketAction.UPDATE_GAME, payload }, (res: any) => {
      if (res && event.type === 'SingleMatch') {
        // Resolve event name based on updated orgs and teams
        const homeOrg = orgsList.find(o => o.id === formData.homeOrgId);
        const awayOrg = orgsList.find(o => o.id === formData.awayOrgId);
        
        const homeNameStr = homeOrg ? (homeOrg.shortName || homeOrg.name) : 'Home';
        const awayNameStr = awayOrg ? (awayOrg.shortName || awayOrg.name) : 'Away';
        const eventNameStr = `${homeNameStr} vs ${awayNameStr}`;

        const eventPayload = {
          id: eventId,
          userId,
          orgId,
          data: {
            name: eventNameStr,
            startDate: `${dateBase}T12:00:00.000Z`,
            siteId: formData.siteId || null,
            facilityId: formData.facilityId || null,
            sportIds: formData.sportId ? [formData.sportId] : [],
            participatingOrgIds: formData.awayOrgId && formData.awayOrgId !== orgId ? [formData.awayOrgId] : [],
            status: formData.status === 'Cancelled' ? 'Cancelled' : event.status
          }
        };

        wsService.emit('action', { type: SocketAction.UPDATE_EVENT, payload: eventPayload }, (eventRes: any) => {
          setIsProcessing(false);
          useUnsavedChangesStore.getState().clear();
          safeGoBack();
        });
      } else {
        setIsProcessing(false);
        if (res) {
          useUnsavedChangesStore.getState().clear();
          safeGoBack();
        }
      }
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
      if (res && event?.type === 'SingleMatch') {
        const eventPayload = {
          id: eventId,
          data: { status: 'Cancelled' }
        };
        wsService.emit('action', { type: SocketAction.UPDATE_EVENT, payload: eventPayload }, (eventRes: any) => {
          setIsProcessing(false);
          setIsCancelling(false);
          setInitialData((prev: any) => prev ? { ...prev, status: 'Cancelled' } : null);
          if (formData) {
            setFormData({
              ...formData,
              status: 'Cancelled'
            });
          }
        });
      } else {
        setIsProcessing(false);
        setIsCancelling(false);
        setInitialData((prev: any) => prev ? { ...prev, status: 'Cancelled' } : null);
        if (formData) {
          setFormData({
            ...formData,
            status: 'Cancelled'
          });
        }
      }
    });
  };

  // Delete Game Handler
  const handleDeleteGame = () => {
    setIsProcessing(true);
    const userId = useAuthStore.getState().user?.id;
    if (event?.type === 'SingleMatch') {
      wsService.emit('action', { 
        type: SocketAction.DELETE_EVENT, 
        payload: { id: eventId, userId, orgId } 
      }, (res: any) => {
        setIsProcessing(false);
        setIsDeleting(false);
        useUnsavedChangesStore.getState().clear();
        router.push(`/admin/${orgId}/events`);
      });
    } else {
      wsService.emit('action', { 
        type: SocketAction.DELETE_GAME, 
        payload: { id: gameId, userId, orgId } 
      }, (res: any) => {
        setIsProcessing(false);
        setIsDeleting(false);
        useUnsavedChangesStore.getState().clear();
        router.push(`/admin/${orgId}/events/${eventId}`);
      });
    }
  };

  if (isLoading || !event || !game || !initialData) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color={COLORS.brand.orange} />
        <Text className="font-orbitron text-xs text-slate-500 mt-4 uppercase tracking-widest">
          Loading Details...
        </Text>
      </SafeAreaView>
    );
  }

  const hasFormSelection = formData?.homeTeamId && formData?.awayTeamId;

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={handleBackPress}
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
        <View className="w-12" />
      </View>

      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
          Edit details for game {gameId}
        </Text>

        <MatchForm
          key={formKey}
          orgId={orgId}
          isEdit={true}
          initialData={initialData}
          onChange={setFormData}
        />

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
              disabled={formData?.status === 'Cancelled'}
              className={`px-4 py-2 border border-brand-orange rounded-lg ${
                formData?.status === 'Cancelled' ? 'opacity-40' : ''
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

      {/* FLOATING SAVE CHANGES BAR */}
      {hasChanges && (
        <View className="absolute bottom-6 left-6 right-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-4 rounded-2xl flex-row items-center justify-between shadow-xl z-40">
          <View className="flex-1 mr-4">
            <Text className="font-orbitron-bold text-[10px] text-slate-800 dark:text-white uppercase tracking-wider">Unsaved Changes</Text>
            <Text className="font-inter text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">You have modified this match's details.</Text>
          </View>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handleCancel}
              disabled={isProcessing}
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl active:scale-95 border border-slate-200 dark:border-white/5"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isProcessing || !hasFormSelection}
              className={`px-5 py-2.5 rounded-xl flex-row items-center gap-2 active:scale-95 shadow-md ${
                !hasFormSelection
                  ? 'bg-brand-orange/40 shadow-none'
                  : 'bg-brand-orange shadow-brand-orange/30'
              }`}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={14} color="white" />
                  <Text className="font-orbitron-bold text-[9px] text-white uppercase tracking-widest mt-0.5">Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

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
            ? 'Deleting this game will also permanently delete the entire Single Match event record. This cannot be undone.'
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
