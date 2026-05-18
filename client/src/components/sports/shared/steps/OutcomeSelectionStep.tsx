import React from 'react';
import { ActionStep } from '@sk/types';
import { ScoringActionButton } from '../ScoringActionButton';
import { useSharedDynamicScoring } from '../DynamicScoringContext';

export function OutcomeSelectionStep({ 
    step, 
    onComplete 
}: { 
    step: ActionStep, 
    onComplete: (data: any) => void 
}) {
    const { scoringState, nextDynamicStep } = useSharedDynamicScoring();

    const handleSelectOutcome = (outcome: any) => {
        const isSelected = scoringState.collectedData?.outcome === outcome.id;
        if (isSelected) {
            onComplete({
                outcome: undefined,
                pointsDelta: 0,
                triggerEventId: undefined
            });
        } else {
            onComplete({
                outcome: outcome.id,
                ...(outcome.points !== undefined ? { pointsDelta: outcome.points } : {}),
                ...(outcome.triggerEventId ? { triggerEventId: outcome.triggerEventId } : {}),
                ...(outcome.eventData || {}),
            });
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1.5">
                {step.outcomes?.map((outcome) => {
                    const isSelected = scoringState.collectedData?.outcome === outcome.id;
                    return (
                        <ScoringActionButton
                            key={outcome.name}
                            label={outcome.name}
                            selected={isSelected}
                            onClick={() => handleSelectOutcome(outcome)}
                            className="h-12 sm:h-14 w-full"
                            variant={(outcome.variant as any) || (outcome.points && outcome.points > 0 ? "success" : "primary")}
                            description={outcome.points !== undefined ? `${outcome.points} PTS` : undefined}
                        />
                    );
                })}
            </div>
        </div>
    );
}
