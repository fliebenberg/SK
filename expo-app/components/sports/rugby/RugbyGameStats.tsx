import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Game } from '@sk/shared';
import { calculateRugbyStats } from './rugbyUtils';
import { useSharedDynamicScoring } from '../shared/DynamicScoringContext';


interface RugbyGameStatsProps {
  game: Game;
}

export default function RugbyGameStats({ game }: RugbyGameStatsProps) {
  const { events } = useSharedDynamicScoring();

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
      <View className="py-2 border-b border-line-soft">
        <View className="flex-row items-center justify-between px-2 mb-1">
          <View className="flex-1 items-start">
            <Text className="font-orbitron-bold text-xs text-info-ink">{home.main}</Text>
            {home.sub && <Text className="font-inter text-[9px] text-ink-muted">{home.sub}</Text>}
          </View>
          <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-widest px-2 text-center">
            {label}
          </Text>
          <View className="flex-1 items-end">
            <Text className="font-orbitron-bold text-xs text-danger-ink">{away.main}</Text>
            {away.sub && <Text className="font-inter text-[9px] text-ink-muted">{away.sub}</Text>}
          </View>
        </View>

        <View className="flex-row h-1.5 w-full gap-1 px-2">
          <View className="flex-1 flex-row justify-end bg-sunken rounded-l-full overflow-hidden">
            <View className="h-full bg-info rounded-l-full" style={{ width: `${homeWidthPercent}%` }} />
          </View>
          <View className="flex-1 flex-row justify-start bg-sunken rounded-r-full overflow-hidden">
            <View className="h-full bg-danger rounded-r-full" style={{ width: `${awayWidthPercent}%` }} />
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
      <View className="py-1 bg-sunken px-3 rounded-lg mb-1 mt-2">
        <Text className="font-orbitron-bold text-[10px] text-primary-ink uppercase tracking-widest">Scoring</Text>
      </View>
      {renderStatRow('Tries', formatSimple(stats.home.tries), formatSimple(stats.away.tries), stats.home.tries, stats.away.tries)}
      {renderStatRow('Conversions', formatAccuracy(stats.home.conversionSuccess, stats.home.conversionAttempts), formatAccuracy(stats.away.conversionSuccess, stats.away.conversionAttempts), stats.home.conversionSuccess, stats.away.conversionSuccess)}
      {renderStatRow('Penalty Tries', formatSimple(stats.home.penaltyTries), formatSimple(stats.away.penaltyTries), stats.home.penaltyTries, stats.away.penaltyTries)}
      {renderStatRow('Penalty Kicks', formatAccuracy(stats.home.penaltyKickSuccess, stats.home.penaltyKickAttempts), formatAccuracy(stats.away.penaltyKickSuccess, stats.away.penaltyKickAttempts), stats.home.penaltyKickSuccess, stats.away.penaltyKickSuccess)}
      {renderStatRow('Drop Goals', formatAccuracy(stats.home.dropGoalSuccess, stats.home.dropGoalAttempts), formatAccuracy(stats.away.dropGoalSuccess, stats.away.dropGoalAttempts), stats.home.dropGoalSuccess, stats.away.dropGoalSuccess)}

      <View className="py-1 bg-sunken px-3 rounded-lg mb-1 mt-3">
        <Text className="font-orbitron-bold text-[10px] text-warning-ink uppercase tracking-widest">Discipline</Text>
      </View>
      {renderStatRow('Penalties', formatSimple(stats.home.penaltiesAwarded), formatSimple(stats.away.penaltiesAwarded), stats.home.penaltiesAwarded, stats.away.penaltiesAwarded)}
      {renderStatRow('Free Kicks', formatSimple(stats.home.freeKicksAwarded), formatSimple(stats.away.freeKicksAwarded), stats.home.freeKicksAwarded, stats.away.freeKicksAwarded)}
      {renderStatRow('Yellow Cards', formatSimple(stats.home.yellowCards), formatSimple(stats.away.yellowCards), stats.home.yellowCards, stats.away.yellowCards)}
      {renderStatRow('Red Cards', formatSimple(stats.home.redCards), formatSimple(stats.away.redCards), stats.home.redCards, stats.away.redCards)}

      <View className="py-1 bg-sunken px-3 rounded-lg mb-1 mt-3">
        <Text className="font-orbitron-bold text-[10px] text-success-ink uppercase tracking-widest">Set Pieces</Text>
      </View>
      {renderStatRow('Scrums Won', formatAccuracy(stats.home.scrumsWon, stats.home.scrumsTotal), formatAccuracy(stats.away.scrumsWon, stats.away.scrumsTotal), stats.home.scrumsWon, stats.away.scrumsWon)}
      {renderStatRow('Scrum Resets', formatSimple(stats.home.scrumResets), formatSimple(stats.away.scrumResets), stats.home.scrumResets, stats.away.scrumResets)}
      {renderStatRow('Lineouts Won', formatAccuracy(stats.home.lineoutsWon, stats.home.lineoutsTotal), formatAccuracy(stats.away.lineoutsWon, stats.away.lineoutsTotal), stats.home.lineoutsWon, stats.away.lineoutsWon)}

      <View className="py-1 bg-sunken px-3 rounded-lg mb-1 mt-3 pb-6">
        <Text className="font-orbitron-bold text-[10px] text-info-ink uppercase tracking-widest">General Play</Text>
      </View>
      {renderStatRow('Knock-ons', formatSimple(stats.home.knockOns), formatSimple(stats.away.knockOns), stats.home.knockOns, stats.away.knockOns)}
      {renderStatRow('Turnovers Won', formatSimple(stats.home.turnovers), formatSimple(stats.away.turnovers), stats.home.turnovers, stats.away.turnovers)}
      {renderStatRow('Tackles Made', formatSimple(stats.home.tacklesMade), formatSimple(stats.away.tacklesMade), stats.home.tacklesMade, stats.away.tacklesMade)}
      {renderStatRow('Tackles Missed', formatSimple(stats.home.tacklesMissed), formatSimple(stats.away.tacklesMissed), stats.home.tacklesMissed, stats.away.tacklesMissed)}
    </ScrollView>
  );
}
