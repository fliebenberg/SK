import React, { createContext, useContext, useState, useEffect } from 'react';
import { Game } from '@sk/types';
import { wsService } from '../../../services/websocket';

interface DynamicScoringContextType {
  game: Game;
  scoringState: {
    status: 'IDLE' | 'ACTIVE';
    templateId?: string;
    side?: 'home' | 'away';
    step?: number;
    data?: any;
  };
  startDynamicFlow: (templateId: string, side: 'home' | 'away') => void;
  cancelDynamicFlow: () => void;
  submitEvent: (eventPayload: any) => void;
}

const DynamicScoringContext = createContext<DynamicScoringContextType | null>(null);

export function DynamicScoringProvider({ game, children }: { game: Game; children: React.ReactNode }) {
  const [scoringState, setScoringState] = useState<DynamicScoringContextType['scoringState']>({
    status: 'IDLE',
  });

  const startDynamicFlow = (templateId: string, side: 'home' | 'away') => {
    setScoringState({
      status: 'ACTIVE',
      templateId,
      side,
      step: 0,
      data: {},
    });
  };

  const cancelDynamicFlow = () => {
    setScoringState({ status: 'IDLE' });
  };

  const submitEvent = (eventPayload: any) => {
    const participant = scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1];

    let points = 0;
    if (scoringState.templateId === 'try') points = 5;
    else if (scoringState.templateId === 'conversion') points = 2;
    else if (scoringState.templateId === 'penalty_kick') points = 3;
    else if (scoringState.templateId === 'drop_goal') points = 3;
    else if (scoringState.templateId === 'penalty_try') points = 7;

    const payload = {
      gameId: game.id,
      gameParticipantId: participant?.id,
      type: points > 0 ? 'SCORE' : 'GAME_EVENT',
      subType: scoringState.templateId,
      eventData: {
        ...eventPayload,
        templateId: scoringState.templateId,
        points,
        elapsedMS: game.liveState?.clock?.elapsedMS || 0,
      },
    };

    wsService.emit('action', { type: 'ADD_GAME_EVENT', payload }, () => {
      setScoringState({ status: 'IDLE' });
    });
  };

  return (
    <DynamicScoringContext.Provider
      value={{
        game,
        scoringState,
        startDynamicFlow,
        cancelDynamicFlow,
        submitEvent,
      }}
    >
      {children}
    </DynamicScoringContext.Provider>
  );
}

export function useSharedDynamicScoring(): DynamicScoringContextType {
  const ctx = useContext(DynamicScoringContext);
  if (!ctx) throw new Error('useSharedDynamicScoring must be used within DynamicScoringProvider');
  return ctx;
}
