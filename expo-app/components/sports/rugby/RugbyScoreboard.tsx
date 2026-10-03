import React, { memo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Game, SinBin, SocketAction } from '@sk/shared';
import { sendAction } from '../../../services/actions';
import { useGameTimer } from '../../../hooks/useGameTimer';
import { LiveClockText } from '../shared/LiveClockText';
import { Ionicons } from '@expo/vector-icons';
import { useSharedDynamicScoring } from '../shared/DynamicScoringContext';


import { useActiveTheme } from '../../../store/settingsStore';
import { themeColor } from '../../../constants/Colors';
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
  const isDark = useActiveTheme() === 'dark';
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
        isYellow ? 'bg-warning border-warning' : 'bg-danger border-danger'
      }`}
    >
      <Ionicons name="card" size={10} color={themeColor(isDark, isYellow ? 'on-bright' : 'on-fill')} />
      <Text className={`font-mono font-bold text-[9px] ${isYellow ? 'text-on-bright' : 'text-on-fill'}`}>
        {sb.durationMS === 0 ? 'RED' : timeStr}
      </Text>
    </TouchableOpacity>
  );
});

export default function RugbyScoreboard({ game, role }: { game: Game; role?: string }) {
  const { homeTeam, awayTeam } = useSharedDynamicScoring();

  const homeParticipant = game.participants?.[0];
  const awayParticipant = game.participants?.[1];
  const homeTeamId = homeParticipant?.teamId;
  const awayTeamId = awayParticipant?.teamId;

  const homeScore = homeParticipant ? game.liveState?.scores?.[homeParticipant.id] ?? 0 : 0;
  const awayScore = awayParticipant ? game.liveState?.scores?.[awayParticipant.id] ?? 0 : 0;

  const homeSinBins = game.liveState?.sinBins?.filter(sb => sb.teamId === homeTeamId) || [];
  const awaySinBins = game.liveState?.sinBins?.filter(sb => sb.teamId === awayTeamId) || [];

  const handleClearSinBin = (sinBinId: string) => {
    // The badge goes when the server broadcasts the updated game, so there is nothing to do on
    // success; a failure is announced by `sendAction`.
    void sendAction(SocketAction.REMOVE_SIN_BIN, { gameId: game.id, sinBinId });
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
    <View className="bg-card border border-line rounded-2xl p-2 shadow-sm mb-1.5">
      {/* SCORES & CENTER INFO ROW */}
      <View className="flex-row items-center justify-between">
        {/* HOME TEAM */}
        <View className="flex-1 items-center justify-center">
          <Text className="font-orbitron-bold text-xs text-ink text-center" numberOfLines={1}>
            {homeTeam?.name || 'Home'}
          </Text>
          <Text className="font-orbitron-bold text-2xl sm:text-3xl text-info-ink mt-0.5">{homeScore}</Text>
          {renderSinBins(homeSinBins)}
        </View>

        {/* CENTER COLUMN: TIME, COLON & PERIOD BADGE */}
        <View className="items-center justify-center px-2">
          <LiveClockText
            clock={game.liveState?.clock}
            startTime={game.startTime}
            finishTime={game.finishTime}
            className="font-orbitron-bold text-sm sm:text-base text-warning-ink"
          />
          <Text className="font-orbitron-bold text-lg text-ink-muted my-0.5">:</Text>
          <View className="px-2 py-0.5 bg-primary-soft rounded-full border border-primary-line">
            <Text className="font-orbitron-bold text-[8px] sm:text-[9px] text-primary-ink uppercase">
              {periodLabel}
            </Text>
          </View>
        </View>

        {/* AWAY TEAM */}
        <View className="flex-1 items-center justify-center">
          <Text className="font-orbitron-bold text-xs text-ink text-center" numberOfLines={1}>
            {awayTeam?.name || 'Away'}
          </Text>
          <Text className="font-orbitron-bold text-2xl sm:text-3xl text-danger-ink mt-0.5">{awayScore}</Text>
          {renderSinBins(awaySinBins)}
        </View>
      </View>
    </View>
  );
}
