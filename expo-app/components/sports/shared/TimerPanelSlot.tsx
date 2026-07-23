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
            <Text className="font-inter text-[10px] text-slate-400 uppercase tracking-wider">
              Period {periodIndex + 1} • {isRunning ? 'RUNNING' : 'PAUSED'}
            </Text>
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
