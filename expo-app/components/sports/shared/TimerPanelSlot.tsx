import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Game } from '@sk/types';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { wsService } from '../../../services/websocket';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/Colors';

interface TimerPanelSlotProps {
  game: Game;
  canEdit?: boolean;
}

export function TimerPanelSlot({ game, canEdit = false }: TimerPanelSlotProps) {
  const clock = game.liveState?.clock;
  const { formattedTime, isRunning } = useGameTimer(clock, game.startTime, game.finishTime);
  const periodIndex = clock?.periodIndex ?? 0;

  const handleClockAction = (action: 'START' | 'PAUSE' | 'RESUME' | 'RESET' | 'START_PERIOD' | 'END_PERIOD') => {
    wsService.emit('action', {
      type: 'UPDATE_GAME_CLOCK',
      payload: { id: game.id, action },
    });
  };

  return (
    <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-sm mb-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons name="time-outline" size={20} color={COLORS.brand.orange} />
          <View>
            <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white">
              {formattedTime}
            </Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">
                Period {periodIndex + 1}
              </Text>
              <View
                className={`px-2 py-0.5 rounded-full border flex-row items-center gap-1 ${
                  isRunning
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-amber-500/10 border-amber-500/30'
                }`}
              >
                <View
                  className={`w-1.5 h-1.5 rounded-full ${
                    isRunning ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <Text
                  className={`font-orbitron-bold text-[9px] uppercase tracking-wider ${
                    isRunning
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {isRunning ? 'RUNNING' : 'PAUSED'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {canEdit && (
          <View className="flex-row gap-2">
            {!isRunning ? (
              <TouchableOpacity
                onPress={() => handleClockAction(clock?.elapsedMS ? 'RESUME' : 'START')}
                className="bg-emerald-500 px-3 py-1.5 rounded-lg flex-row items-center gap-1"
              >
                <Ionicons name="play" size={14} color="white" />
                <Text className="font-orbitron-bold text-xs text-white uppercase">Start</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => handleClockAction('PAUSE')}
                className="bg-amber-500 px-3 py-1.5 rounded-lg flex-row items-center gap-1"
              >
                <Ionicons name="pause" size={14} color="white" />
                <Text className="font-orbitron-bold text-xs text-white uppercase">Pause</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => handleClockAction('END_PERIOD')}
              className="bg-slate-200 dark:bg-white/10 px-3 py-1.5 rounded-lg flex-row items-center gap-1"
            >
              <Ionicons name="play-skip-forward" size={14} color={COLORS.brand.orange} />
              <Text className="font-orbitron-bold text-xs text-brand-orange uppercase">Next Period</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
