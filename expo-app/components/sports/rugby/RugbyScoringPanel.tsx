import React from 'react';
import { View, Text } from 'react-native';
import { Game } from '@sk/types';
import { ScoringActionButton } from '../shared/ScoringActionButton';
import { useSharedDynamicScoring } from '../shared/DynamicScoringContext';

export default function RugbyScoringPanel({ game, role }: { game: Game; role?: string }) {
  const { startDynamicFlow, scoringState } = useSharedDynamicScoring();

  const isScoringDisabled = game.status === 'Finished' || game.status === 'Scheduled';

  const renderSideButtons = (side: 'home' | 'away') => {
    const isOtherSideActive = scoringState.status !== 'IDLE' && scoringState.side !== side;
    const disabled = isScoringDisabled || isOtherSideActive;

    return (
      <View className="flex-1 space-y-2">
        <Text className="font-orbitron-bold text-[10px] uppercase text-slate-400 text-center mb-1">
          {side === 'home' ? 'Home Scoring' : 'Away Scoring'}
        </Text>
        <ScoringActionButton
          label="Try (+5)"
          mobileLabel="Try (+5)"
          onClick={() => startDynamicFlow('try', side)}
          disabled={disabled}
        />
        <ScoringActionButton
          label="Conversion (+2)"
          mobileLabel="Conv (+2)"
          onClick={() => startDynamicFlow('conversion', side)}
          disabled={disabled}
        />
        <ScoringActionButton
          label="Penalty Kick (+3)"
          mobileLabel="Penalty (+3)"
          onClick={() => startDynamicFlow('penalty_kick', side)}
          disabled={disabled}
        />
        <ScoringActionButton
          label="Drop Goal (+3)"
          mobileLabel="Drop (+3)"
          onClick={() => startDynamicFlow('drop_goal', side)}
          disabled={disabled}
        />
        <ScoringActionButton
          label="Penalty Try (+7)"
          mobileLabel="Pen Try (+7)"
          onClick={() => startDynamicFlow('penalty_try', side)}
          disabled={disabled}
        />
        <ScoringActionButton
          label="Yellow Card"
          mobileLabel="Yellow Card"
          variant="warning"
          onClick={() => startDynamicFlow('yellow_card', side)}
          disabled={disabled}
        />
        <ScoringActionButton
          label="Red Card"
          mobileLabel="Red Card"
          variant="danger"
          onClick={() => startDynamicFlow('red_card', side)}
          disabled={disabled}
        />
      </View>
    );
  };

  return (
    <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-sm mb-4">
      <Text className="font-orbitron-bold text-xs text-slate-800 dark:text-white uppercase tracking-wider mb-3">
        Scoring & Discipline Actions
      </Text>

      <View className="flex-row gap-3">
        {renderSideButtons('home')}
        <View className="w-[1px] bg-slate-200 dark:bg-white/10" />
        {renderSideButtons('away')}
      </View>
    </View>
  );
}
