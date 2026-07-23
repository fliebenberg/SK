import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Game } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { COLORS } from '../../../constants/Colors';

export default function RugbyScoreboard({ game, role }: { game: Game; role?: string }) {
  const [homeTeam, setHomeTeam] = useState<any>(null);
  const [awayTeam, setAwayTeam] = useState<any>(null);
  const { formattedTime } = useGameTimer(game.liveState?.clock, game.startTime, game.finishTime);

  const homeParticipant = game.participants?.[0];
  const awayParticipant = game.participants?.[1];

  const homeScore = homeParticipant ? game.liveState?.scores?.[homeParticipant.id] ?? 0 : 0;
  const awayScore = awayParticipant ? game.liveState?.scores?.[awayParticipant.id] ?? 0 : 0;

  useEffect(() => {
    if (homeParticipant?.teamId) {
      wsService.emit('get_data', { type: 'team', id: homeParticipant.teamId }, (t: any) => {
        if (t) setHomeTeam(t);
      });
    }
    if (awayParticipant?.teamId) {
      wsService.emit('get_data', { type: 'team', id: awayParticipant.teamId }, (t: any) => {
        if (t) setAwayTeam(t);
      });
    }
  }, [homeParticipant?.teamId, awayParticipant?.teamId]);

  return (
    <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-6 shadow-sm mb-4">
      <View className="flex-row justify-between items-center mb-4">
        <View className="px-3 py-1 bg-brand-orange/10 rounded-full border border-brand-orange/20">
          <Text className="font-orbitron-bold text-[10px] text-brand-orange uppercase">
            {game.status || 'SCHEDULED'}
          </Text>
        </View>
        <Text className="font-orbitron-bold text-xs text-slate-500">{formattedTime}</Text>
      </View>

      <View className="flex-row items-center justify-between">
        {/* HOME TEAM */}
        <View className="flex-1 items-center">
          <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white text-center" numberOfLines={2}>
            {homeTeam?.name || 'Home'}
          </Text>
          <Text className="font-orbitron-bold text-3xl text-blue-500 mt-2">{homeScore}</Text>
        </View>

        {/* COLON */}
        <Text className="font-orbitron-bold text-2xl text-slate-400 px-4">:</Text>

        {/* AWAY TEAM */}
        <View className="flex-1 items-center">
          <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white text-center" numberOfLines={2}>
            {awayTeam?.name || 'Away'}
          </Text>
          <Text className="font-orbitron-bold text-3xl text-red-500 mt-2">{awayScore}</Text>
        </View>
      </View>
    </View>
  );
}
