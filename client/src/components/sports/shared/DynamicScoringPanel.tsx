import React from 'react';
import { Game } from '@sk/types';
import { DynamicScoringProvider, useSharedDynamicScoring } from './DynamicScoringContext';
import { ScoringActionButton } from './ScoringActionButton';
import { cn } from '@/lib/utils';
import { DynamicScoringDialog } from './DynamicScoringDialog';

/** Generic dynamic panel component driven by EventTemplates */
export function DynamicScoringPanel({ section }: { section: string }) {
    // Consume the context provided by the parent (GameDashboard)
    const { scoringState, templates, startDynamicFlow, game } = useSharedDynamicScoring();

    const allowTimedRedCard = game.customSettings?.allowTimedRedCard ?? false;
    const relevantTemplates = templates.filter((t) => {
        if (t.id === 'timed_red_card' && !allowTimedRedCard) return false;
        return t.section === section;
    });
    const isScoringDisabled = game.status === 'Scheduled';

    const renderButtons = (side: 'home' | 'away') => {
        const teamColorClass = side === 'home' 
            ? 'bg-blue-600/40 border-blue-600/40 hover:bg-blue-600/65 hover:border-blue-600/70' 
            : 'bg-red-600/40 border-red-600/40 hover:bg-red-600/65 hover:border-red-600/70';
        
        const disabled = isScoringDisabled || (scoringState.status !== 'IDLE' && scoringState.side !== side);

        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-1.5">
                {relevantTemplates.map((template) => (
                    <ScoringActionButton 
                        key={template.id}
                        onClick={() => startDynamicFlow(template.id, side)}
                        disabled={disabled}
                        label={template.name}
                        mobileLabel={template.mobileLabel}
                        title={template.name}
                        variant="none"
                        className={cn(teamColorClass, disabled ? 'opacity-30' : '', "h-8 sm:h-11")}
                    />
                ))}
            </div>
        );
    };

    if (relevantTemplates.length === 0) return null;

    return (
        <div className="flex flex-col">
            <div className="flex divide-x divide-white/10">
                <div className={cn("flex-1 p-1.5 bg-blue-600/5 transition-all", scoringState.status !== 'IDLE' && scoringState.side === 'away' ? 'opacity-40 grayscale' : '')}>
                    {renderButtons('home')}
                </div>
                <div className={cn("flex-1 p-1.5 bg-red-600/5 transition-all", scoringState.status !== 'IDLE' && scoringState.side === 'home' ? 'opacity-40 grayscale' : '')}>
                    {renderButtons('away')}
                </div>
            </div>
        </div>
    );
}
