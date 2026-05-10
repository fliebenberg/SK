import React, { useState } from 'react';
import { ActionStep, ReasonOption } from '@sk/types';
import { ScoringActionButton } from '../ScoringActionButton';
import { useSharedDynamicScoring } from '../DynamicScoringContext';

export function ReasonSelectionStep({ 
    step, 
    onComplete 
}: { 
    step: ActionStep, 
    onComplete: (data: any) => void 
}) {
    const { scoringState, nextDynamicStep } = useSharedDynamicScoring();
    
    // Resolve the currently selected reason from shared state
    const selectedReasonId = scoringState.collectedData?.reason;
    const selectedReason = step.reasons?.flatMap(g => g.options).find(o => o.id === selectedReasonId) || null;

    const handleSelectReason = (reason: ReasonOption) => {
        // Sync with context immediately so stepper knows we have data
        nextDynamicStep({ 
            reason: reason.id, 
            _noAdvance: true 
        });
    };

    const handleNext = () => {
        if (!selectedReason) return;
        onComplete({
            reason: selectedReason.id,
        });
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-4">
                {step.reasons?.map((group) => (
                    <div key={group.name} className="space-y-1.5">
                        <div className="px-1 border-b border-border flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-primary/70 tracking-[0.2em]">{group.name}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                            {group.options.map((opt) => {
                                const isSelected = selectedReason?.id === opt.id;
                                return (
                                    <ScoringActionButton
                                        key={opt.name}
                                        label={opt.name}
                                        selected={isSelected}
                                        onClick={() => handleSelectReason(opt)}
                                        className="h-11 sm:h-12 w-full"
                                        variant={(opt.variant as any) || "primary"}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
