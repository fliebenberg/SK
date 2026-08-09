import React, { useState, memo } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Game, getPeriodLabel, SocketAction } from '@sk/types';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { wsService } from '../../../services/websocket';
import { useAuthStore } from '../../../store/authStore';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/Colors';
import { GameStatusIndicator } from './GameStatusIndicator';

import { LiveClockText } from './LiveClockText';

interface TimerPanelSlotProps {
  game: Game;
  canEdit?: boolean;
}

const ClockDisplay = memo(function ClockDisplay({
  clock,
  startTime,
  finishTime,
  periodLabel,
}: {
  clock: any;
  startTime: any;
  finishTime: any;
  periodLabel: string;
}) {
  const { isRunning } = useGameTimer(clock, startTime, finishTime);
  return (
    <View>
      <LiveClockText
        clock={clock}
        startTime={startTime}
        finishTime={finishTime}
        className="font-orbitron-bold text-base text-slate-800 dark:text-white"
      />
      <View className="mt-0.5">
        <GameStatusIndicator
          isRunning={isRunning}
          periodText={periodLabel}
          compact={true}
        />
      </View>
    </View>
  );
});

export function TimerPanelSlot({ game, canEdit = false }: TimerPanelSlotProps) {
  const clock = game.liveState?.clock;
  const { isRunning, currentMS } = useGameTimer(clock, game.startTime, game.finishTime);
  const [isDebouncing, setIsDebouncing] = useState(false);

  // Cancellation & Reset Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const periodIndex = clock?.periodIndex ?? 0;
  const scheduledPeriods = clock?.scheduledPeriods ?? 2;
  const isPeriodActive = clock?.isPeriodActive ?? false;
  const periodTerm = game.customSettings?.periodTerm || 'Period';
  const currentPeriodLabel = game.liveState?.periodLabel || getPeriodLabel(periodIndex, periodTerm);

  const isLastPeriod = periodIndex + 1 >= scheduledPeriods;
  const scoreValues = Object.values(game.liveState?.scores || {});
  const isDraw = scoreValues.length >= 2 ? scoreValues[0] === scoreValues[1] : true;
  const hasPeriodElapsed = clock?.periodLengthMS ? currentMS >= clock.periodLengthMS : false;

  const resolveInitiatorId = (): string => {
    const user = useAuthStore.getState().user;
    const orgMemberships = useAuthStore.getState().orgMemberships || [];
    if (!user) return 'system';
    if (user.globalRole === 'admin') {
      const adminMem = orgMemberships.find((m: any) => m.orgId === 'org-system-admins');
      if (adminMem?.orgProfileId) return adminMem.orgProfileId;
    }
    return orgMemberships[0]?.orgProfileId || user.id || 'system';
  };

  const handleUpdateStatus = (status: string, reason?: string) => {
    wsService.emitAction(SocketAction.UPDATE_GAME_STATUS, { id: game.id, status: status as any });

    let subType = 'GAME_UPDATED';
    if (status === 'Live') subType = 'GAME_STARTED';
    else if (status === 'Finished') subType = 'GAME_ENDED';
    else if (status === 'Cancelled') subType = 'GAME_CANCELLED';

    wsService.emitAction(SocketAction.ADD_GAME_EVENT, {
      gameId: game.id,
      initiatorOrgProfileId: resolveInitiatorId(),
      type: 'STATUS',
      subType,
      eventData: {
        status,
        reason,
        timestamp: new Date().toISOString(),
        elapsedMS: currentMS,
        period: currentPeriodLabel,
      },
    });

    if (status === 'Cancelled') {
      setShowCancelModal(false);
      setCancelReason('');
    }
  };

  const handleResetGame = () => {
    wsService.emitAction(SocketAction.RESET_GAME, { id: game.id });
    setShowResetModal(false);
  };

  const handleClockAction = (
    action: 'START' | 'PAUSE' | 'RESUME' | 'RESET' | 'START_PERIOD' | 'END_PERIOD',
    eventType?: string
  ) => {
    if (isDebouncing) return;

    wsService.emitAction(SocketAction.UPDATE_GAME_CLOCK, { id: game.id, action });

    if (eventType) {
      const eventPeriodLabel = action === 'START_PERIOD'
        ? getPeriodLabel(periodIndex + 1, periodTerm)
        : currentPeriodLabel;

      wsService.emitAction(SocketAction.ADD_GAME_EVENT, {
        gameId: game.id,
        initiatorOrgProfileId: resolveInitiatorId(),
        type: 'TIME',
        subType: eventType,
        eventData: {
          action,
          period: eventPeriodLabel,
          elapsedMS: currentMS,
        },
      });
    }

    setIsDebouncing(true);
    setTimeout(() => setIsDebouncing(false), 1000);
  };

  const handlePrimaryStartTap = () => {
    if (game.status === 'Scheduled') {
      handleUpdateStatus('Live');
      handleClockAction('START');
    } else if (game.status === 'Live') {
      if (isPeriodActive) {
        if (isRunning) {
          handleClockAction('PAUSE', 'CLOCK_PAUSED');
        } else {
          handleClockAction('RESUME', 'CLOCK_RESUMED');
        }
      } else {
        handleClockAction('START_PERIOD', 'PERIOD_STARTED');
      }
    }
  };

  const handleEndPeriodTap = () => {
    if (isLastPeriod && !isDraw) {
      handleClockAction('END_PERIOD');
      handleUpdateStatus('Finished');
    } else {
      handleClockAction('END_PERIOD', 'PERIOD_ENDED');
    }
  };

  return (
    <>
      <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-2 shadow-sm mb-1.5">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-2 shrink-0">
            <ClockDisplay
              clock={clock}
              startTime={game.startTime}
              finishTime={game.finishTime}
              periodLabel={currentPeriodLabel}
            />
          </View>

          {canEdit && (
            <View className="flex-row gap-1.5 items-center">
              {/* PRIMARY START / PAUSE / RESUME / START PERIOD BUTTON */}
              {game.status === 'Scheduled' && (
                <TouchableOpacity
                  disabled={isDebouncing}
                  onPress={handlePrimaryStartTap}
                  accessibilityLabel="Start Game"
                  {...({ title: 'Start Game & Match Clock' } as any)}
                  className="bg-emerald-600 active:scale-95 px-3 py-1.5 rounded-lg flex-row items-center justify-center gap-1 opacity-100 disabled:opacity-50"
                >
                  <Ionicons name="play" size={14} color="white" />
                  <Text className="font-orbitron-bold text-xs text-white uppercase">Start Game</Text>
                </TouchableOpacity>
              )}

              {game.status === 'Live' && (
                isPeriodActive ? (
                  isRunning ? (
                    <TouchableOpacity
                      disabled={isDebouncing}
                      onPress={handlePrimaryStartTap}
                      accessibilityLabel="Pause Clock"
                      {...({ title: 'Pause Match Clock' } as any)}
                      className={`bg-amber-500 active:scale-95 rounded-lg flex-row items-center justify-center gap-1 disabled:opacity-50 ${!hasPeriodElapsed ? 'px-3 py-1.5' : 'w-8 h-8'}`}
                    >
                      <Ionicons name="pause" size={14} color="white" />
                      <Text className={`font-orbitron-bold text-xs text-white uppercase ${!hasPeriodElapsed ? 'flex' : 'hidden'}`}>Pause</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      disabled={isDebouncing}
                      onPress={handlePrimaryStartTap}
                      accessibilityLabel="Resume Clock"
                      {...({ title: 'Resume Match Clock' } as any)}
                      className={`bg-emerald-600 active:scale-95 rounded-lg flex-row items-center justify-center gap-1 disabled:opacity-50 ${!hasPeriodElapsed ? 'px-3 py-1.5' : 'w-8 h-8'}`}
                    >
                      <Ionicons name="play" size={14} color="white" />
                      <Text className={`font-orbitron-bold text-xs text-white uppercase ${!hasPeriodElapsed ? 'flex' : 'hidden'}`}>Resume</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <TouchableOpacity
                    disabled={isDebouncing}
                    onPress={handlePrimaryStartTap}
                    accessibilityLabel="Start Next Period"
                    {...({ title: 'Start Next Period' } as any)}
                    className="bg-emerald-600 active:scale-95 px-3 py-1.5 rounded-lg flex-row items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <Ionicons name="play" size={14} color="white" />
                    <Text className="font-orbitron-bold text-xs text-white uppercase">Start Period</Text>
                  </TouchableOpacity>
                )
              )}

              {/* SECONDARY END PERIOD / END GAME BUTTON */}
              {game.status === 'Live' && isPeriodActive && (
                <TouchableOpacity
                  disabled={isDebouncing}
                  onPress={handleEndPeriodTap}
                  accessibilityLabel={isLastPeriod && !isDraw ? 'End Game' : 'End Period'}
                  {...({ title: isLastPeriod && !isDraw ? 'Finalize Match & End Game' : 'End Current Period' } as any)}
                  className={
                    isLastPeriod && !isDraw
                      ? `bg-rose-600 active:scale-95 rounded-lg flex-row items-center justify-center gap-1 disabled:opacity-50 ${hasPeriodElapsed ? 'px-3 py-1.5' : 'w-8 h-8'}`
                      : `bg-amber-600/20 dark:bg-amber-500/20 active:scale-95 rounded-lg flex-row items-center justify-center gap-1 border border-amber-500/40 disabled:opacity-50 ${hasPeriodElapsed ? 'px-3 py-1.5' : 'w-8 h-8'}`
                  }
                >
                  <Ionicons
                    name={isLastPeriod && !isDraw ? 'square' : 'square-outline'}
                    size={14}
                    color={isLastPeriod && !isDraw ? 'white' : COLORS.brand.orange}
                  />
                  <Text
                    className={
                      isLastPeriod && !isDraw
                        ? `font-orbitron-bold text-xs text-white uppercase ${hasPeriodElapsed ? 'flex' : 'hidden'}`
                        : `font-orbitron-bold text-xs text-brand-orange uppercase ${hasPeriodElapsed ? 'flex' : 'hidden'}`
                    }
                  >
                    {isLastPeriod && !isDraw ? 'End Game' : 'End Period'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* RESET GAME BUTTON */}
              {game.status !== 'Scheduled' && (
                <TouchableOpacity
                  onPress={() => setShowResetModal(true)}
                  accessibilityLabel="Reset Game Data"
                  {...({ title: 'Reset Game Data' } as any)}
                  className="bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 active:scale-95 w-8 h-8 rounded-lg items-center justify-center"
                >
                  <Ionicons name="refresh-outline" size={14} color={COLORS.brand.orange} />
                </TouchableOpacity>
              )}

              {/* CANCEL GAME BUTTON */}
              {(game.status === 'Scheduled' ||
                (game.status === 'Live' && !isPeriodActive && !isLastPeriod) ||
                game.status === 'Finished') && (
                <TouchableOpacity
                  onPress={() => setShowCancelModal(true)}
                  accessibilityLabel="Cancel Game"
                  {...({ title: 'Cancel Game' } as any)}
                  className="bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 active:scale-95 w-8 h-8 rounded-lg items-center justify-center"
                >
                  <Ionicons name="close-circle-outline" size={14} color={COLORS.brand.red} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      {/* CUSTOM CANCEL GAME OVERLAY MODAL */}
      <Modal
        visible={showCancelModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-4">
          <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5 w-full max-w-md shadow-xl">
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="alert-circle" size={24} color={COLORS.brand.red} />
              <Text className="font-orbitron-bold text-lg text-slate-900 dark:text-white">
                Cancel Game
              </Text>
            </View>

            <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
              Are you sure you want to cancel this game? This will update the match status to Cancelled. Please enter a cancellation reason.
            </Text>

            <TextInput
              multiline
              numberOfLines={3}
              placeholder="Reason for cancellation (e.g. Inclement Weather, Forfeit...)"
              placeholderTextColor="#94A3B8"
              value={cancelReason}
              onChangeText={setCancelReason}
              className="bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white mb-5 min-h-[80px] align-top font-inter"
            />

            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                onPress={() => setShowCancelModal(false)}
                className="bg-slate-100 dark:bg-white/10 px-4 py-2.5 rounded-xl"
              >
                <Text className="font-inter-semibold text-xs text-slate-700 dark:text-slate-300">
                  Keep Game
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!cancelReason.trim()}
                onPress={() => handleUpdateStatus('Cancelled', cancelReason)}
                className={
                  cancelReason.trim()
                    ? 'bg-rose-600 px-4 py-2.5 rounded-xl'
                    : 'bg-slate-300 dark:bg-slate-700 px-4 py-2.5 rounded-xl opacity-50'
                }
              >
                <Text className="font-inter-bold text-xs text-white">
                  Confirm Cancellation
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CUSTOM RESET GAME OVERLAY MODAL */}
      <Modal
        visible={showResetModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowResetModal(false)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-4">
          <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5 w-full max-w-md shadow-xl">
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="refresh-circle" size={24} color={COLORS.brand.orange} />
              <Text className="font-orbitron-bold text-lg text-slate-900 dark:text-white">
                Reset Game Data?
              </Text>
            </View>

            <Text className="font-inter text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
              ARE YOU ABSOLUTELY SURE? This will PERMANENTLY DELETE all scores, events, and timings for this game and reset it to scheduled status.
            </Text>

            <View className="flex-row justify-end gap-3">
              <TouchableOpacity
                onPress={() => setShowResetModal(false)}
                className="bg-slate-100 dark:bg-white/10 px-4 py-2.5 rounded-xl"
              >
                <Text className="font-inter-semibold text-xs text-slate-700 dark:text-slate-300">
                  Keep Data
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleResetGame}
                className="bg-rose-600 px-4 py-2.5 rounded-xl"
              >
                <Text className="font-inter-bold text-xs text-white font-inter-bold">
                  Reset Everything
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
