import React, { useEffect, useState, memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Game, SinBin } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { LiveClockText } from '../shared/LiveClockText';
import { Ionicons } from '@expo/vector-icons';

const SinBinBadge = memo(function SinBinBadge({
  sb,
  clock,
  startTime,
  finishTime,
  onClear,
}: {
  sb: SinBin;
  clock: any;
  startTime?: string;
  finishTime?: string;
  onClear: (id: string) => void;
}) {
  const { currentActualMS } = useGameTimer(clock, startTime, finishTime);
  const remainingMS = sb.durationMS === 0 ? 0 : Math.max(0, sb.durationMS - (currentActualMS - sb.awardedAtMS));
  const totalSecs = Math.floor(remainingMS / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const isYellow = sb.type === 'yellow';

  return (
    <TouchableOpacity
      onPress={() => onClear(sb.id)}
      className={`flex-row items-center gap-1 px-1.5 py-0.5 rounded border ${
        isYellow ? 'bg-amber-400 border-amber-600' : 'bg-red-600 border-red-800'
      }`}
    >
      <Ionicons name="card" size={10} color={isYellow ? '#000000' : '#FFFFFF'} />
      <Text className={`font-mono font-bold text-[9px] ${isYellow ? 'text-black' : 'text-white'}`}>
        {sb.durationMS === 0 ? 'RED' : timeStr}
      </Text>
    </TouchableOpacity>
  );
});

export default function RugbyScoreboard({ game, role }: { game: Game; role?: string }) {
  const [homeTeam, setHomeTeam] = useState<any>(null);
  const [awayTeam, setAwayTeam] = useState<any>(null);

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

  const periodLabel = game.liveState?.periodLabel || (game.status === 'Scheduled' ? 'SCHEDULED' : 'LIVE');

  const renderSinBins = (sinBins: SinBin[]) => {
    if (sinBins.length === 0) return null;
    return (
      <View className="flex-row flex-wrap gap-1 mt-1 justify-center">
        {sinBins.map((sb) => (
          <SinBinBadge
            key={sb.id}
            sb={sb}
            clock={game.liveState?.clock}
            startTime={game.startTime}
            finishTime={game.finishTime}
            onClear={handleClearSinBin}
          />
        ))}
      </View>
    );
  };

  return (
    <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-3 shadow-sm mb-2">
      {/* SCORES & CENTER INFO ROW */}
      <View className="flex-row items-center justify-between">
        {/* HOME TEAM */}
        <View className="flex-1 items-center justify-center">
          <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white text-center" numberOfLines={1}>
            {homeTeam?.name || 'Home'}
          </Text>
          <Text className="font-orbitron-bold text-2xl sm:text-3xl text-blue-500 mt-0.5">{homeScore}</Text>
          {renderSinBins(homeSinBins)}
        </View>

        {/* CENTER COLUMN: TIME, COLON & PERIOD BADGE */}
        <View className="items-center justify-center px-2">
          <LiveClockText
            clock={game.liveState?.clock}
            startTime={game.startTime}
            finishTime={game.finishTime}
            className="font-orbitron-bold text-sm sm:text-base text-amber-500"
          />
          <Text className="font-orbitron-bold text-lg text-slate-400 my-0.5">:</Text>
          <View className="px-2 py-0.5 bg-brand-orange/10 rounded-full border border-brand-orange/20">
            <Text className="font-orbitron-bold text-[8px] sm:text-[9px] text-brand-orange uppercase">
              {periodLabel}
            </Text>
          </View>
        </View>

        {/* AWAY TEAM */}
        <View className="flex-1 items-center justify-center">
          <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white text-center" numberOfLines={1}>
            {awayTeam?.name || 'Away'}
          </Text>
          <Text className="font-orbitron-bold text-2xl sm:text-3xl text-red-500 mt-0.5">{awayScore}</Text>
          {renderSinBins(awaySinBins)}
        </View>
      </View>
    </View>
  );
}
