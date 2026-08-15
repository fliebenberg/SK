import React from 'react';
import { Game } from '@sk/shared';
import { DynamicScoringPanel } from '../shared/DynamicScoringPanel';

export default function RugbyScoringPanel({ game, role }: { game: Game; role?: string }) {
  return <DynamicScoringPanel section="Scoring" role={role} />;
}
