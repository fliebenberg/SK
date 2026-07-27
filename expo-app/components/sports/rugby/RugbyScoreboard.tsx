import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Game, SinBin } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { COLORS } from '../../../constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function RugbyScoreboard({ game, role }: { game: Game; role?: string }) {
  const [homeTeam, setHomeTeam] = useState<any>(null);
  const [awayTeam, setAwayTeam] = useState<any>(null);
  const { formattedTime, currentActualMS } = useGameTimer(game.liveState?.clock, game.startTime, game.finishTime);

  const homeParticipant = game.participants?.[0];
  const awayParticipant = game.participants?.[1];
  const homeTeamId = homeParticipant?.teamId;
  const awayTeamId = awayParticipant?.teamId;

  const homeScore = homeParticipant ? game.liveState?.scores?.[homeParticipant.id] ?? 0 : 0;
  const awayScore = awayParticipant ? game.liveState?.scores?.[awayParticipant.id] ?? 0 : 0;

  useEffect(() => {
    if (homeTeamId) {
      wsService.emit('get_data', { type: 'team', id: homeTeamId }, (t: any) => {
        if (t) setHomeTeam(t);
      });
    }
    if (awayTeamId) {
      wsService.emit('get_data', { type: 'team', id: awayTeamId }, (t: any) => {
        if (t) setAwayTeam(t);
      });
    }
  }, [homeTeamId, awayTeamId]);

  const homeSinBins = game.liveState?.sinBins?.filter(sb => sb.teamId === homeTeamId) || [];
  const awaySinBins = game.liveState?.sinBins?.filter(sb => sb.teamId === awayTeamId) || [];

  const handleClearSinBin = (sinBinId: string) => {
    wsService.emit('action', {
      type: 'REMOVE_SIN_BIN',
      payload: { gameId: game.id, sinBinId }
    });
  };

  const renderSinBins = (sinBins: SinBin[]) => {
    if (sinBins.length === 0) return null;
    return (
      <View className="flex-row flex-wrap gap-1 mt-2">
        {sinBins.map((sb) => {
          const remainingMS = sb.durationMS === 0 ? 0 : Math.max(0, sb.durationMS - (currentActualMS - sb.awardedAtMS));
          const totalSecs = Math.floor(remainingMS / 1000);
          const mins = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
          const isYellow = sb.type === 'yellow';

          return (
            <TouchableOpacity
              key={sb.id}
              onPress={() => handleClearSinBin(sb.id)}
              className={`flex-row items-center gap-1 px-2 py-1 rounded border ${
                isYellow ? 'bg-amber-400 border-amber-600' : 'bg-red-600 border-red-800'
              }`}
            >
              <Ionicons name="card" size={12} color={isYellow ? '#000000' : '#FFFFFF'} />
              <Text className={`font-mono font-bold text-[10px] ${isYellow ? 'text-black' : 'text-white'}`}>
                {sb.durationMS === 0 ? 'RED' : timeStr}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-sm mb-4">
      {/* HEADER BAR */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="px-3 py-1 bg-brand-orange/10 rounded-full border border-brand-orange/20">
          <Text className="font-orbitron-bold text-[10px] text-brand-orange uppercase">
            {game.status || 'SCHEDULED'}
          </Text>
        </View>
        <Text className="font-orbitron-bold text-xs text-slate-500">{formattedTime}</Text>
      </View>

      {/* SCORES ROW */}
      <View className="flex-row items-center justify-between">
        {/* HOME TEAM */}
        <View className="flex-1 items-center">
          <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white text-center" numberOfLines={2}>
            {homeTeam?.name || 'Home'}
          </Text>
          <Text className="font-orbitron-bold text-3xl text-blue-500 mt-2">{homeScore}</Text>
          {renderSinBins(homeSinBins)}
        </View>

        {/* COLON */}
        <Text className="font-orbitron-bold text-2xl text-slate-400 px-3">:</Text>

        {/* AWAY TEAM */}
        <View className="flex-1 items-center">
          <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white text-center" numberOfLines={2}>
            {awayTeam?.name || 'Away'}
          </Text>
          <Text className="font-orbitron-bold text-3xl text-red-500 mt-2">{awayScore}</Text>
          {renderSinBins(awaySinBins)}
        </View>
      </View>
    </View>
  );
}
