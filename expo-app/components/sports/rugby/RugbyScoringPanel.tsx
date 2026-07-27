import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Game } from '@sk/types';
import { ScoringActionButton } from '../shared/ScoringActionButton';
import { useSharedDynamicScoring } from '../shared/DynamicScoringContext';
import { wsService } from '../../../services/websocket';

export default function RugbyScoringPanel({ game, role }: { game: Game; role?: string }) {
  const { startDynamicFlow, scoringState } = useSharedDynamicScoring();
  const [homeTeam, setHomeTeam] = useState<any>(null);
  const [awayTeam, setAwayTeam] = useState<any>(null);

  const homeParticipant = game.participants?.[0];
  const awayParticipant = game.participants?.[1];

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

  const isScoringDisabled = game.status === 'Finished' || game.status === 'Scheduled';

  const renderSideButtons = (side: 'home' | 'away') => {
    const isOtherSideActive = scoringState.status !== 'IDLE' && scoringState.side !== side;
    const disabled = isScoringDisabled || isOtherSideActive;
    const isHome = side === 'home';
    const sideVariant = isHome ? 'blue' : 'red';
    const teamName = isHome ? homeTeam?.name || 'Home' : awayTeam?.name || 'Away';

    return (
      <View
        className={`flex-1 p-3 rounded-xl border ${
          isHome
            ? 'bg-blue-500/5 dark:bg-blue-500/10 border-blue-500/20'
            : 'bg-rose-500/5 dark:bg-rose-500/10 border-rose-500/20'
        }`}
      >
        <View className="flex-row items-center justify-center gap-1.5 mb-2 pb-1.5 border-b border-slate-200/50 dark:border-white/10">
          <View
            className={`w-2 h-2 rounded-full ${isHome ? 'bg-blue-500' : 'bg-rose-500'}`}
          />
          <Text
            className={`font-orbitron-bold text-[11px] uppercase tracking-wider text-center ${
              isHome ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'
            }`}
            numberOfLines={1}
          >
            {teamName}
          </Text>
        </View>

        <View className="space-y-2">
          <ScoringActionButton
            label="Try (+5)"
            mobileLabel="Try (+5)"
            variant={sideVariant}
            onClick={() => startDynamicFlow('try', side)}
            disabled={disabled}
          />
          <ScoringActionButton
            label="Conversion (+2)"
            mobileLabel="Conv (+2)"
            variant={sideVariant}
            onClick={() => startDynamicFlow('conversion', side)}
            disabled={disabled}
          />
          <ScoringActionButton
            label="Penalty Kick (+3)"
            mobileLabel="Penalty (+3)"
            variant={sideVariant}
            onClick={() => startDynamicFlow('penalty_kick', side)}
            disabled={disabled}
          />
          <ScoringActionButton
            label="Drop Goal (+3)"
            mobileLabel="Drop (+3)"
            variant={sideVariant}
            onClick={() => startDynamicFlow('drop_goal', side)}
            disabled={disabled}
          />
          <ScoringActionButton
            label="Penalty Try (+7)"
            mobileLabel="Pen Try (+7)"
            variant={sideVariant}
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
        {renderSideButtons('away')}
      </View>
    </View>
  );
}
