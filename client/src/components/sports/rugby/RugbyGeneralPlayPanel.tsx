import React from 'react';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { useSharedRugbyScoring } from './RugbyScoringContext';
import { ScoringActionButton } from '../shared/ScoringActionButton';

export default function RugbyGeneralPlayPanel({ game, role }: { game: Game, role?: string }) {
    const { 
        scoringState, 
        setScoringState, 
    } = useSharedRugbyScoring();

    const isScoringDisabled = game.status === 'Scheduled';

    const renderGeneralPlayEvents = (side: 'home' | 'away') => {
        const teamColorClass = side === 'home' ? 'bg-blue-600/40 border-blue-600/40 hover:bg-blue-600/65 hover:border-blue-600/70' : 'bg-red-600/40 border-red-600/40 hover:bg-red-600/65 hover:border-red-600/70';
        const disabled = isScoringDisabled || (scoringState.status !== 'IDLE' && scoringState.side !== side);

        const events = [
            { label: 'Knock-on', mobileLabel: 'Knock', title: 'Knock-on', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Knock-on', isInfringer: true }) },
            { label: 'Turnover Won', mobileLabel: 'T/O Won', title: 'Turnover Won', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Turnover Won' }) },
            { label: 'Tackle Made', mobileLabel: 'Tackle', title: 'Tackle Made', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Tackle Made' }) },
            { label: 'Tackle Missed', mobileLabel: 'Miss T', title: 'Tackle Missed', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Tackle Missed' }) },
        ];

        return (
            <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
                {events.map((evt) => (
                    <ScoringActionButton 
                        key={evt.label}
                        onClick={evt.action}
                        disabled={disabled}
                        label={evt.label}
                        mobileLabel={(evt as any).mobileLabel}
                        title={evt.title}
                        variant="none"
                        className={cn(teamColorClass, disabled ? 'opacity-30' : '', "h-8 sm:h-11")}
                    />
                ))}
            </div>
        );
    };

    return (
        <div className="flex divide-x divide-white/10">
            <div className={cn("flex-1 p-1.5 bg-blue-600/5 transition-all", scoringState.status !== 'IDLE' && scoringState.side === 'away' ? 'opacity-40 grayscale' : '')}>
                {renderGeneralPlayEvents('home')}
            </div>
            <div className={cn("flex-1 p-1.5 bg-red-600/5 transition-all", scoringState.status !== 'IDLE' && scoringState.side === 'home' ? 'opacity-40 grayscale' : '')}>
                {renderGeneralPlayEvents('away')}
            </div>
        </div>
    );
}
