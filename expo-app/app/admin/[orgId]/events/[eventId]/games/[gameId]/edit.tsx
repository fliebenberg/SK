import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { resolveEventType } from '@sk/shared';
import { useSafeBack } from '../../../../../../../hooks/useSafeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../../../../../../../components/GlassCard';
import { Ionicons } from '@expo/vector-icons';
import { ConfirmationModal } from '../../../../../../../components/ConfirmationModal';
import { useActiveTheme } from '../../../../../../../store/settingsStore';
import { wsService } from '../../../../../../../services/websocket';
import { sendAction } from '../../../../../../../services/actions';
import { useWsStore } from '../../../../../../../store/wsStore';
import { SocketAction, Event, Game, Sport, Site, Team, Organization, DeleteGamePayload, DeleteEventPayload } from '@sk/shared';
import { COLORS } from '../../../../../../../constants/Colors';
import MatchForm, { MatchFormData } from '../../../../../../../components/MatchForm';
import { useAuthStore } from '../../../../../../../store/authStore';
import { useUnsavedChanges } from '../../../../../../../hooks/useUnsavedChanges';
import { useUnsavedChangesStore } from '../../../../../../../store/unsavedChangesStore';
import { useEventCapabilities } from '../../../../../../../hooks/useEventCapabilities';
import { getMatchPermissions } from '../../../../../../../utils/matchPermissions';
import { MatchViewSwitcher } from '../../../../../../../components/MatchViewSwitcher';
import { RecordResultModal } from '../../../../../../../components/RecordResultModal';
import { ChangeWhoPlayedCard } from '../../../../../../../components/tournament/ChangeWhoPlayedCard';
import { finishedScoreLine } from '../../../../../../../utils/matchScore';
import { instantToLocalInputs, localInputsToInstant } from '../../../../../../../utils/dates';
import { useToastStore } from '../../../../../../../store/toastStore';

export default function EditGame() {
  const router = useRouter();
  const safeBack = useSafeBack();
  const { orgId, eventId, gameId } = useLocalSearchParams<{ orgId: string, eventId: string, gameId: string }>();
  const { capabilities } = useEventCapabilities(eventId);
  const isDark = useActiveTheme() === 'dark';
  const isConnected = useWsStore((state: any) => state.isConnected);

  const user = useAuthStore((state: any) => state.user);
  const orgMemberships = useAuthStore((state: any) => state.orgMemberships);
  const teamMemberships = useAuthStore((state: any) => state.teamMemberships);

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
  const [isRecording, setIsRecording] = useState(false);

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
        if (res.orgId && res.orgId !== orgId && user?.globalRole !== 'admin') {
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
        // The kick-off in the viewer's own time. This used to cut up the ISO string, which gave
        // the UTC time — and saving it back as local time moved the kick-off by the viewer's
        // offset on every save (DATE-1).
        const kickoff = instantToLocalInputs(game.scheduledStartTime || game.startTime);

        setInitialData({
          sportId: game.sportId || '',
          homeOrgId,
          homeTeamId: homeTeamId || '',
          awayOrgId,
          awayTeamId: awayTeamId || '',
          siteId: game.siteId || '',
          facilityId: game.facilityId || '',
          gameDate: kickoff?.date || event.startDate || '',
          startTime: kickoff?.time || '09:00',
          isTbd: !(game.scheduledStartTime || game.startTime) || game.customSettings?.timeTbd,
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
    // Keyed on the id, not the object: recording a result or cancelling updates `game` in place, and
    // re-running this would reset the form's starting point under any unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, orgsList, orgId, game?.id]);

  // Submit Handler
  const handleSubmit = () => {
    if (!event || !game || !formData || !formData.homeTeamId || !formData.awayTeamId) return;

    // The kick-off as typed, in the organiser's time — or noon that day while it is TBD
    // (date-formatting skill). Refused before anything is sent if the date or time is half-typed.
    const dateBase = formData.gameDate || event.startDate;
    const scheduledTime = localInputsToInstant(dateBase, formData.isTbd ? null : formData.startTime);
    if (!scheduledTime) {
      useToastStore.getState().showError('Enter the full game date and start time.', 'Date Needed');
      return;
    }
    setIsProcessing(true);

    const payload = {
      id: gameId,
      orgId,
      data: {
        sportId: formData.sportId,
        participants: [{ teamId: formData.homeTeamId }, { teamId: formData.awayTeamId }],
        scheduledStartTime: scheduledTime,
        startTime: scheduledTime,
        siteId: formData.siteId || null,
        facilityId: formData.facilityId || null,
        // No status: the form does not edit it (Cancel/Reinstate and Record result do), and sending
        // back the one it loaded would be refused if the match had started on another device since.
        customSettings: {
          ...(game.customSettings || {}),
          timeTbd: formData.isTbd
        }
      }
    };

    sendAction(SocketAction.UPDATE_GAME, payload).then((result) => {
      if (!result.ok) {
        setIsProcessing(false);
        return;
      }
      if (isSingleMatchEvent()) {
        // Resolve event name based on updated orgs and teams
        const homeOrg = orgsList.find(o => o.id === formData.homeOrgId);
        const awayOrg = orgsList.find(o => o.id === formData.awayOrgId);
        
        const homeNameStr = homeOrg ? (homeOrg.shortName || homeOrg.name) : 'Home';
        const awayNameStr = awayOrg ? (awayOrg.shortName || awayOrg.name) : 'Away';
        const eventNameStr = `${homeNameStr} vs ${awayNameStr}`;

        const eventPayload = {
          id: eventId,
          orgId,
          data: {
            name: eventNameStr,
            startDate: dateBase,
            siteId: formData.siteId || null,
            facilityId: formData.facilityId || null,
            sportIds: formData.sportId ? [formData.sportId] : [],
            /* Both sides. This sent the away org alone, on the assumption that the host is
               implicitly taking part — an assumption that stopped holding on 2026-09-21, when
               participation became a row the organiser can remove. Sending one side would have
               quietly taken the other out of its own match. */
            participatingOrgIds: [formData.homeOrgId, formData.awayOrgId].filter(Boolean),
          }
        };

        sendAction(SocketAction.UPDATE_EVENT, eventPayload).then((eventResult) => {
          setIsProcessing(false);
          // Left dirty if the event half failed, so saving again retries both.
          if (!eventResult.ok) return;
          if (formData) {
            setInitialData({ ...formData });
          }
          useUnsavedChangesStore.getState().clear();
        });
      } else {
        setIsProcessing(false);
        if (formData) {
          setInitialData({ ...formData });
        }
        useUnsavedChangesStore.getState().clear();
      }
    });
  };

  /**
   * Cancel a scheduled match, or reinstate a cancelled one — the two status changes that are
   * planning decisions, and so the only ones this screen makes. Starting and finishing a match
   * belong to the match itself: live scoring, or Record result (2026-09-21).
   */
  const setPlanningStatus = (status: 'Scheduled' | 'Cancelled') => {
    setIsProcessing(true);
    const applied = () => {
      setIsCancelling(false);
      setInitialData((prev: any) => prev ? { ...prev, status } : null);
      if (formData) setFormData({ ...formData, status });
      setGame(prev => prev ? { ...prev, status } : prev);
    };

    sendAction(SocketAction.UPDATE_GAME, { id: gameId, orgId, data: { status } }).then((result) => {
      if (!result.ok) {
        setIsProcessing(false);
        return;
      }
      if (isSingleMatchEvent()) {
        sendAction(SocketAction.UPDATE_EVENT, { id: eventId, orgId, data: { status } }).then((eventResult) => {
          setIsProcessing(false);
          // A failed event half keeps the dialog open to retry; repeating the game half is harmless.
          if (!eventResult.ok) return;
          applied();
        });
      } else {
        setIsProcessing(false);
        applied();
      }
    });
  };

  /**
   * Whether this game *is* its event, rather than one fixture inside a container.
   *
   * Routed through `resolveEventType` rather than testing the string, because U39 makes the type
   * an explicit three-way answer: an event whose type we cannot name is not silently treated as a
   * single match here, which is the safe direction — deleting this game would otherwise delete a
   * whole tournament.
   */
  const isSingleMatchEvent = () => resolveEventType(event).kind === 'SingleMatch';

  // Delete Game Handler
  const handleDeleteGame = () => {
    setIsProcessing(true);
    if (isSingleMatchEvent()) {
      sendAction(SocketAction.DELETE_EVENT, { id: eventId, orgId }).then((result) => {
        setIsProcessing(false);
        // A failed delete leaves the user on this screen, with the dialog still open.
        if (!result.ok) return;
        setIsDeleting(false);
        useUnsavedChangesStore.getState().clear();
        router.push(`/admin/${orgId}/events`);
      });
    } else {
      sendAction(SocketAction.DELETE_GAME, { id: gameId, orgId }).then((result) => {
        setIsProcessing(false);
        if (!result.ok) return;
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

  const permissions = getMatchPermissions({
    game,
    event,
    currentOrgId: orgId,
    user,
    orgMemberships,
    teamMemberships,
    // Without this the screen would hide the controls from an appointed organiser or a
    // division convenor, neither of whom holds an org membership that says so (D33).
    capabilities,
  });

  const handleSwitchView = (targetView: 'view' | 'selection' | 'edit' | 'score') => {
    confirmThenNavigate(() => {
      router.push(`/admin/${orgId}/events/${eventId}/games/${gameId}/${targetView}`);
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950" edges={['top', 'left', 'right']}>
      {/* HEADER BAR */}
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-white/5 bg-white dark:bg-slate-900 z-10">
        <TouchableOpacity
          onPress={handleBackPress}
          activeOpacity={0.85}
          className="flex-row items-center gap-1"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
            Back
          </Text>
        </TouchableOpacity>
        <Text className="font-orbitron-bold text-sm tracking-widest text-slate-800 dark:text-white uppercase truncate flex-1 text-center px-4" numberOfLines={1}>
          Edit Match Info
        </Text>
        <MatchViewSwitcher
          orgId={orgId!}
          eventId={eventId!}
          gameId={gameId!}
          currentView="edit"
          permissions={permissions}
          onNavigate={handleSwitchView}
        />
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

        {/* RESULT — recorded after the fact, by an editor or a scorer */}
        {(permissions.canScore || permissions.canEdit) && game.status !== 'Cancelled' && (
          <GlassCard className="border border-slate-200 dark:border-white/5 p-5 mt-6">
            <View className="flex-row justify-between items-center">
              <View className="flex-1 mr-3">
                <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Result</Text>
                <Text className="font-inter text-xs text-slate-500 mt-0.5">
                  {finishedScoreLine(game) || 'Record the score to finish the match — or that nobody has it.'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsRecording(true)}
                className="px-4 py-2 bg-brand-orange rounded-lg"
              >
                <Text className="font-inter-bold text-xs text-white uppercase">
                  {game.status === 'Finished' ? 'Correct Result' : 'Record Result'}
                </Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        )}

        {/* Who played — a tournament fixture's sides, for the one-match change (FIX-20). */}
        {permissions.canEdit && (
          <ChangeWhoPlayedCard
            game={game}
            orgId={orgId}
            eventId={eventId}
            onChanged={(participantId, teamId, name) =>
              setGame(prev =>
                prev
                  ? {
                      ...prev,
                      participants: (prev.participants || []).map(p =>
                        p.id === participantId ? ({ ...p, teamId, name } as any) : p
                      ),
                    }
                  : prev
              )
            }
          />
        )}

        {/* DANGER ZONE */}
        <GlassCard className="border border-red-500/25 bg-red-500/5 p-5 gap-4 mt-6">
          <Text className="font-orbitron-bold text-xs text-brand-red uppercase tracking-wider">Danger Zone</Text>
          {game.status === 'Cancelled' ? (
            <View className="flex-row justify-between items-center">
              <View className="flex-1 mr-3">
                <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Reinstate Match</Text>
                <Text className="font-inter text-xs text-slate-500 mt-0.5">Put this cancelled match back on the schedule.</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPlanningStatus('Scheduled')}
                disabled={isProcessing}
                className="px-4 py-2 border border-brand-orange rounded-lg"
              >
                <Text className="font-inter-bold text-xs text-brand-orange uppercase">Reinstate</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row justify-between items-center">
              <View className="flex-1 mr-3">
                <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">Cancel Match</Text>
                <Text className="font-inter text-xs text-slate-500 mt-0.5">
                  {game.status === 'Scheduled' || !game.status
                    ? 'Temporarily mark match as Cancelled.'
                    : 'This match has already started, so it is cancelled from its scoring screen.'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsCancelling(true)}
                disabled={!(game.status === 'Scheduled' || !game.status)}
                className={`px-4 py-2 border border-brand-orange rounded-lg ${
                  game.status === 'Scheduled' || !game.status ? '' : 'opacity-40'
                }`}
              >
                <Text className="font-inter-bold text-xs text-brand-orange uppercase">Cancel Match</Text>
              </TouchableOpacity>
            </View>
          )}

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
              activeOpacity={0.8}
              className="bg-slate-100 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/5"
            >
              <Text className="font-orbitron-bold text-[9px] text-slate-600 dark:text-slate-300 uppercase tracking-widest">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isProcessing || !hasFormSelection}
              activeOpacity={0.8}
              className={`px-5 py-2.5 rounded-xl flex-row items-center gap-2 shadow-md ${
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
        description="Are you sure you want to cancel this match? You can reinstate it later from this screen."
        confirmText="Cancel Match"
        cancelText="Keep Scheduled"
        onConfirm={() => setPlanningStatus('Cancelled')}
        onClose={() => setIsCancelling(false)}
        isProcessing={isProcessing}
      />

      <RecordResultModal
        isOpen={isRecording}
        onClose={() => setIsRecording(false)}
        game={game}
        sideLabels={(game.participants || []).map(p => (p as any).name || '')}
        onRecorded={(finished) => {
          setGame(finished);
          setInitialData((prev: any) => prev ? { ...prev, status: finished.status } : null);
          if (formData) setFormData({ ...formData, status: finished.status as any });
        }}
      />

      {/* DELETION CONFIRMATION */}
      <ConfirmationModal
        isOpen={isDeleting}
        title="Delete Match?"
        description={
          isSingleMatchEvent()
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
