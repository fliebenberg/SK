import React from 'react';
import { Game } from '@sk/shared';
import { DynamicScoringPanel } from './shared/DynamicScoringPanel';

export interface SlotProps {
  game: Game;
  role?: string;
}

const DynamicGameEventsPanel = ({ role }: SlotProps) => (
  <DynamicScoringPanel section="Game Events" role={role} />
);

const DynamicGeneralPlayPanel = ({ role }: SlotProps) => (
  <DynamicScoringPanel section="General Play" role={role} />
);

export const SportComponentRegistry = {
  getScoreboard: (categoryStr: string) => {
    switch (categoryStr.toLowerCase()) {
      case 'rugby':
        return require('./rugby/RugbyScoreboard').default;
      default:
        return null;
    }
  },

  getScoringPanel: (categoryStr: string) => {
    switch (categoryStr.toLowerCase()) {
      case 'rugby':
        return require('./rugby/RugbyScoringPanel').default;
      default:
        return null;
    }
  },

  getGameEventsPanel: (categoryStr: string) => {
    switch (categoryStr.toLowerCase()) {
      case 'rugby':
        return DynamicGameEventsPanel;
      default:
        return null;
    }
  },

  getGeneralPlayPanel: (categoryStr: string) => {
    switch (categoryStr.toLowerCase()) {
      case 'rugby':
        return DynamicGeneralPlayPanel;
      default:
        return null;
    }
  },

  getParticipantList: (categoryStr: string) => {
    return null;
  }
};
