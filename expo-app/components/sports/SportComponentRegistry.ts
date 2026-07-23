import { ReactNode } from 'react';
import { Game } from '@sk/types';

export interface SlotProps {
  game: Game;
  role?: string;
}

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
    return null;
  },

  getGeneralPlayPanel: (categoryStr: string) => {
    return null;
  },

  getParticipantList: (categoryStr: string) => {
    return null;
  }
};
