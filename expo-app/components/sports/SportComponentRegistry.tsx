import { Game } from '@sk/shared';

export interface SlotProps {
  game: Game;
  role?: string;
}

/**
 * What a sport can override about the control room.
 *
 * The scoring panels used to be here too — one getter per section, each returning a
 * `DynamicScoringPanel` bound to a hardcoded section name. Sections are per-sport data now, so
 * `DynamicScoringPanels` renders them straight from the sport and only the genuinely bespoke
 * pieces are still resolved by category.
 */
export const SportComponentRegistry = {
  getScoreboard: (categoryStr: string) => {
    switch (categoryStr.toLowerCase()) {
      case 'rugby':
        return require('./rugby/RugbyScoreboard').default;
      default:
        return null;
    }
  },

  getParticipantList: (categoryStr: string) => {
    return null;
  }
};
