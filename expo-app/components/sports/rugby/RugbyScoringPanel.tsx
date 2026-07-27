import React from 'react';
import { Game } from '@sk/types';
import { DynamicScoringPanel } from '../shared/DynamicScoringPanel';

export default function RugbyScoringPanel({ game, role }: { game: Game; role?: string }) {
  return <DynamicScoringPanel section="Scoring" role={role} />;
}
