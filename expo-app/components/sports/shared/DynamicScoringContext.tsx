import React, { createContext, useContext, useState, useEffect } from 'react';
import { Game, getPeriodLabel } from '@sk/types';
import { wsService } from '../../../services/websocket';
import { getLiveElapsedMS } from '../../../hooks/useGameTimer';

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
  { id: 'dropout_22m', name: '22m Dropout', mobileLabel: '22m Dropout', section: 'Game Events' },
  { id: 'dropout_goalline', name: 'Goalline Dropout', mobileLabel: 'Goalline Dropout', section: 'Game Events' },
  { id: 'penalty_awarded', name: 'Penalty Against', mobileLabel: 'Penalty Against', section: 'Game Events' },
  { id: 'free_kick', name: 'Free Kick Against', mobileLabel: 'Free Kick Against', section: 'Game Events' },
  { id: 'yellow_card', name: 'Yellow Card', mobileLabel: 'Yellow Card', section: 'Game Events' },
  { id: 'red_card', name: 'Red Card', mobileLabel: 'Red Card', section: 'Game Events' },
  { id: 'timed_red_card', name: 'Timed Red Card', mobileLabel: 'Timed Red Card', section: 'Game Events' },
  { id: 'line_kick', name: 'Line Kick', mobileLabel: 'Line Kick', section: 'Game Events' },

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
  homeTeam?: any;
  awayTeam?: any;
  templates: EventTemplateItem[];
  scoringState: {
    status: 'IDLE' | 'ACTIVE';
    templateId?: string;
    side?: 'home' | 'away';
    editingId?: string;
    initialData?: any;
  };
  startDynamicFlow: (templateId: string, side: 'home' | 'away', initialData?: any) => void;
  cancelDynamicFlow: () => void;
  submitEvent: (eventPayload: any) => void;
  removeGameEvent: (eventId: string) => void;
  updateFinalScore: (scores: { [participantId: string]: number }) => Promise<void>;
}

const DynamicScoringContext = createContext<DynamicScoringContextType | null>(null);

export function DynamicScoringProvider({ game, children }: { game: Game; children: React.ReactNode }) {
  const [scoringState, setScoringState] = useState<DynamicScoringContextType['scoringState']>({
    status: 'IDLE',
  });
  const [homeTeam, setHomeTeam] = useState<any>(null);
  const [awayTeam, setAwayTeam] = useState<any>(null);

  const homeTeamId = game.participants?.[0]?.teamId;
  const awayTeamId = game.participants?.[1]?.teamId;

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

  const templates = RUGBY_TEMPLATES;

  const startDynamicFlow = (templateId: string, side: 'home' | 'away', initialData: any = {}) => {
    setScoringState({
      status: 'ACTIVE',
      templateId,
      side,
      editingId: initialData?.eventId,
      initialData,
    });
  };

  const cancelDynamicFlow = () => {
    setScoringState({ status: 'IDLE' });
  };

  const submitEvent = (eventPayload: any) => {
    const side = scoringState.side || 'home';
    const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
    const template = templates.find((t) => t.id === scoringState.templateId);
    
    // Determine points: if kick outcome is missed or skipped, pointsDelta is 0
    let points = template?.points || 0;
    if (template?.id === 'conversion' || template?.id === 'penalty_kick' || template?.id === 'drop_goal') {
      if (eventPayload?.outcome === 'missed' || !eventPayload?.outcome) {
        points = 0;
      }
    }

    const currentPeriodLabel =
      game.liveState?.periodLabel ||
      getPeriodLabel(game.liveState?.clock?.periodIndex ?? 0, game.customSettings?.periodTerm || 'Period');

    const initialData = scoringState.initialData || {};

    const eventData = {
      elapsedMS: getLiveElapsedMS(game.liveState?.clock),
      period: currentPeriodLabel,
      ...initialData,
      ...eventPayload,
      templateId: scoringState.templateId,
      points,
      pending: template?.id === 'conversion' && !eventPayload?.outcome,
    };

    if (scoringState.editingId) {
      // EDIT EXISTING EVENT
      const payload = {
        gameId: game.id,
        eventId: scoringState.editingId,
        gameParticipantId: participant?.id,
        eventData,
      };

      wsService.emit('action', { type: 'UPDATE_GAME_EVENT', payload }, () => {
        setScoringState({ status: 'IDLE' });
      });
    } else {
      // ADD NEW EVENT
      const payload = {
        gameId: game.id,
        gameParticipantId: participant?.id,
        type: points > 0 ? 'SCORE' : 'GAME_EVENT',
        subType: scoringState.templateId,
        eventData,
      };

      wsService.emit('action', { type: 'ADD_GAME_EVENT', payload }, (res: any) => {
        const addedEventId = res?.id || res?.data?.id || res?.eventId;
        // AUTOMATED CHAINED FLOW: Scoring a Try automatically triggers Conversion dialog!
        if (scoringState.templateId === 'try') {
          startDynamicFlow('conversion', side, { linkedEventId: addedEventId });
        } else if (eventPayload?.triggerEventId) {
          startDynamicFlow(eventPayload.triggerEventId, side, { linkedEventId: addedEventId });
        } else {
          setScoringState({ status: 'IDLE' });
        }
      });
    }
  };

  const removeGameEvent = (eventId: string) => {
    wsService.emit('action', { type: 'UNDO_GAME_EVENT', payload: { gameId: game.id, eventId } }, () => {
      setScoringState({ status: 'IDLE' });
    });
  };

  const updateFinalScore = async (scores: { [participantId: string]: number }) => {
    return new Promise<void>((resolve) => {
      wsService.emit(
        'action',
        {
          type: 'UPDATE_GAME_SCORE',
          payload: {
            gameId: game.id,
            scores,
            reason: 'Manual Final Score',
          },
        },
        () => {
          resolve();
        }
      );
    });
  };

  return (
    <DynamicScoringContext.Provider
      value={{
        game,
        homeTeam,
        awayTeam,
        templates,
        scoringState,
        startDynamicFlow,
        cancelDynamicFlow,
        submitEvent,
        removeGameEvent,
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

