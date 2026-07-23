import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Game, GameEvent } from '@sk/types';
import { calculateRugbyStats } from './rugbyUtils';
import { wsService } from '../../../services/websocket';
import { COLORS } from '../../../constants/Colors';

interface RugbyGameStatsProps {
  game: Game;
}

export default function RugbyGameStats({ game }: RugbyGameStatsProps) {
  const [events, setEvents] = useState<GameEvent[]>([]);

  useEffect(() => {
    wsService.emit('get_data', { type: 'game_events', id: game.id }, (data: GameEvent[]) => {
      if (data) setEvents(data);
    });

    const handleEventUpdate = (evt: { type: string; data: any }) => {
      if (['GAME_EVENT_ADDED', 'GAME_EVENT_UPDATED', 'GAME_EVENTS_SYNC'].includes(evt.type)) {
        wsService.emit('get_data', { type: 'game_events', id: game.id }, (data: GameEvent[]) => {
          if (data) setEvents(data);
        });
      }
    };

    wsService.on('update', handleEventUpdate);
    return () => {
      wsService.off('update', handleEventUpdate);
    };
  }, [game.id]);

  const homeParticipantId = game.participants?.[0]?.id;
  const awayParticipantId = game.participants?.[1]?.id;

  const stats = useMemo(() => {
    return calculateRugbyStats(events, homeParticipantId, awayParticipantId);
  }, [events, homeParticipantId, awayParticipantId]);

  const renderStatRow = (
    label: string,
    home: { main: string | number; sub?: string | null },
    away: { main: string | number; sub?: string | null },
    homeRaw: number,
    awayRaw: number
  ) => {
    const total = homeRaw + awayRaw;
    const homeWidthPercent = total > 0 ? Math.round((homeRaw / total) * 100) : 0;
    const awayWidthPercent = total > 0 ? Math.round((awayRaw / total) * 100) : 0;

    return (
      <View className="py-2 border-b border-slate-100 dark:border-white/5">
        <View className="flex-row items-center justify-between px-2 mb-1">
          <View className="flex-1 items-start">
            <Text className="font-orbitron-bold text-xs text-blue-500">{home.main}</Text>
            {home.sub && <Text className="font-inter text-[9px] text-slate-400">{home.sub}</Text>}
          </View>
          <Text className="font-orbitron-bold text-[10px] text-slate-500 uppercase tracking-widest px-2 text-center">
            {label}
          </Text>
          <View className="flex-1 items-end">
            <Text className="font-orbitron-bold text-xs text-red-500">{away.main}</Text>
            {away.sub && <Text className="font-inter text-[9px] text-slate-400">{away.sub}</Text>}
          </View>
        </View>

        <View className="flex-row h-1.5 w-full gap-1 px-2">
          <View className="flex-1 flex-row justify-end bg-slate-100 dark:bg-white/5 rounded-l-full overflow-hidden">
            <View className="h-full bg-blue-500 rounded-l-full" style={{ width: `${homeWidthPercent}%` }} />
          </View>
          <View className="flex-1 flex-row justify-start bg-slate-100 dark:bg-white/5 rounded-r-full overflow-hidden">
            <View className="h-full bg-red-500 rounded-r-full" style={{ width: `${awayWidthPercent}%` }} />
          </View>
        </View>
      </View>
    );
  };

  const formatAccuracy = (success: number, total: number) => {
    if (total === 0) return { main: '0', sub: null };
    const percent = Math.round((success / total) * 100);
    return { main: `${success}/${total}`, sub: `${percent}%` };
  };

  const formatSimple = (value: number | string) => ({ main: value });

  return (
    <ScrollView className="flex-1 px-2">
      <View className="py-1 bg-slate-100 dark:bg-white/5 px-3 rounded-lg mb-1 mt-2">
        <Text className="font-orbitron-bold text-[10px] text-brand-orange uppercase tracking-widest">Scoring</Text>
      </View>
      {renderStatRow('Tries', formatSimple(stats.home.tries), formatSimple(stats.away.tries), stats.home.tries, stats.away.tries)}
      {renderStatRow('Conversions', formatAccuracy(stats.home.conversionSuccess, stats.home.conversionAttempts), formatAccuracy(stats.away.conversionSuccess, stats.away.conversionAttempts), stats.home.conversionSuccess, stats.away.conversionSuccess)}
      {renderStatRow('Penalty Tries', formatSimple(stats.home.penaltyTries), formatSimple(stats.away.penaltyTries), stats.home.penaltyTries, stats.away.penaltyTries)}
      {renderStatRow('Penalty Kicks', formatAccuracy(stats.home.penaltyKickSuccess, stats.home.penaltyKickAttempts), formatAccuracy(stats.away.penaltyKickSuccess, stats.away.penaltyKickAttempts), stats.home.penaltyKickSuccess, stats.away.penaltyKickSuccess)}
      {renderStatRow('Drop Goals', formatAccuracy(stats.home.dropGoalSuccess, stats.home.dropGoalAttempts), formatAccuracy(stats.away.dropGoalSuccess, stats.away.dropGoalAttempts), stats.home.dropGoalSuccess, stats.away.dropGoalSuccess)}

      <View className="py-1 bg-slate-100 dark:bg-white/5 px-3 rounded-lg mb-1 mt-3">
        <Text className="font-orbitron-bold text-[10px] text-amber-500 uppercase tracking-widest">Discipline</Text>
      </View>
      {renderStatRow('Penalties', formatSimple(stats.home.penaltiesAwarded), formatSimple(stats.away.penaltiesAwarded), stats.home.penaltiesAwarded, stats.away.penaltiesAwarded)}
      {renderStatRow('Free Kicks', formatSimple(stats.home.freeKicksAwarded), formatSimple(stats.away.freeKicksAwarded), stats.home.freeKicksAwarded, stats.away.freeKicksAwarded)}
      {renderStatRow('Yellow Cards', formatSimple(stats.home.yellowCards), formatSimple(stats.away.yellowCards), stats.home.yellowCards, stats.away.yellowCards)}
      {renderStatRow('Red Cards', formatSimple(stats.home.redCards), formatSimple(stats.away.redCards), stats.home.redCards, stats.away.redCards)}

      <View className="py-1 bg-slate-100 dark:bg-white/5 px-3 rounded-lg mb-1 mt-3">
        <Text className="font-orbitron-bold text-[10px] text-emerald-500 uppercase tracking-widest">Set Pieces</Text>
      </View>
      {renderStatRow('Scrums Won', formatAccuracy(stats.home.scrumsWon, stats.home.scrumsTotal), formatAccuracy(stats.away.scrumsWon, stats.away.scrumsTotal), stats.home.scrumsWon, stats.away.scrumsWon)}
      {renderStatRow('Scrum Resets', formatSimple(stats.home.scrumResets), formatSimple(stats.away.scrumResets), stats.home.scrumResets, stats.away.scrumResets)}
      {renderStatRow('Lineouts Won', formatAccuracy(stats.home.lineoutsWon, stats.home.lineoutsTotal), formatAccuracy(stats.away.lineoutsWon, stats.away.lineoutsTotal), stats.home.lineoutsWon, stats.away.lineoutsWon)}

      <View className="py-1 bg-slate-100 dark:bg-white/5 px-3 rounded-lg mb-1 mt-3 pb-6">
        <Text className="font-orbitron-bold text-[10px] text-blue-500 uppercase tracking-widest">General Play</Text>
      </View>
      {renderStatRow('Knock-ons', formatSimple(stats.home.knockOns), formatSimple(stats.away.knockOns), stats.home.knockOns, stats.away.knockOns)}
      {renderStatRow('Turnovers Won', formatSimple(stats.home.turnovers), formatSimple(stats.away.turnovers), stats.home.turnovers, stats.away.turnovers)}
      {renderStatRow('Tackles Made', formatSimple(stats.home.tacklesMade), formatSimple(stats.away.tacklesMade), stats.home.tacklesMade, stats.away.tacklesMade)}
      {renderStatRow('Tackles Missed', formatSimple(stats.home.tacklesMissed), formatSimple(stats.away.tacklesMissed), stats.home.tacklesMissed, stats.away.tacklesMissed)}
    </ScrollView>
  );
}
