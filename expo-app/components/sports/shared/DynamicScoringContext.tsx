import React, { createContext, useContext, useState, useEffect } from 'react';
import { Game } from '@sk/types';
import { wsService } from '../../../services/websocket';

export interface EventTemplateItem {
  id: string;
  name: string;
  mobileLabel?: string;
  section: 'Scoring' | 'Game Events' | 'General Play';
  points?: number;
  steps?: any[];
}

export const RUGBY_TEMPLATES: EventTemplateItem[] = [
  // SCORING
  { id: 'try', name: 'Try', mobileLabel: 'Try', section: 'Scoring', points: 5 },
  { id: 'conversion', name: 'Conversion', mobileLabel: 'Conversion', section: 'Scoring', points: 2 },
  { id: 'penalty_kick', name: 'Penalty Kick', mobileLabel: 'Penalty Kick', section: 'Scoring', points: 3 },
  { id: 'drop_goal', name: 'Drop Goal', mobileLabel: 'Drop Goal', section: 'Scoring', points: 3 },
  { id: 'penalty_try', name: 'Penalty Try', mobileLabel: 'Penalty Try', section: 'Scoring', points: 7 },

  // GAME EVENTS
  { id: 'kickoff', name: 'Kick-off', mobileLabel: 'Kick-off', section: 'Game Events' },
  { id: 'penalty_awarded', name: 'Penalty Awarded', mobileLabel: 'Penalty', section: 'Game Events' },
  { id: 'free_kick', name: 'Free Kick Awarded', mobileLabel: 'Free Kick', section: 'Game Events' },
  { id: 'yellow_card', name: 'Yellow Card', mobileLabel: 'Yellow Card', section: 'Game Events' },
  { id: 'red_card', name: 'Red Card', mobileLabel: 'Red Card', section: 'Game Events' },

  // GENERAL PLAY & SET PIECES
  { id: 'scrum', name: 'Scrum', mobileLabel: 'Scrum', section: 'General Play' },
  { id: 'lineout', name: 'Lineout', mobileLabel: 'Lineout', section: 'General Play' },
  { id: 'knock_on', name: 'Knock-on', mobileLabel: 'Knock-on', section: 'General Play' },
  { id: 'turnover', name: 'Turnover Won', mobileLabel: 'Turnover', section: 'General Play' },
  { id: 'tackle_made', name: 'Tackle Made', mobileLabel: 'Tackle', section: 'General Play' },
  { id: 'tackle_missed', name: 'Tackle Missed', mobileLabel: 'Missed Tackle', section: 'General Play' },
];

interface DynamicScoringContextType {
  game: Game;
  templates: EventTemplateItem[];
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
  updateFinalScore: (scores: { [participantId: string]: number }) => Promise<void>;
}

const DynamicScoringContext = createContext<DynamicScoringContextType | null>(null);

export function DynamicScoringProvider({ game, children }: { game: Game; children: React.ReactNode }) {
  const [scoringState, setScoringState] = useState<DynamicScoringContextType['scoringState']>({
    status: 'IDLE',
  });

  const templates = RUGBY_TEMPLATES;

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
    const template = templates.find(t => t.id === scoringState.templateId);
    const points = template?.points || 0;

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

  const updateFinalScore = async (scores: { [participantId: string]: number }) => {
    return new Promise<void>((resolve) => {
      wsService.emit('action', {
        type: 'UPDATE_GAME_SCORE',
        payload: {
          gameId: game.id,
          scores,
          reason: 'Manual Final Score',
        }
      }, () => {
        resolve();
      });
    });
  };

  return (
    <DynamicScoringContext.Provider
      value={{
        game,
        templates,
        scoringState,
        startDynamicFlow,
        cancelDynamicFlow,
        submitEvent,
        updateFinalScore,
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

