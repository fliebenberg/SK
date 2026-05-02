import React, { useState } from 'react';
import { ActionStep, ReasonOption } from '@sk/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ScoringActionButton, RosterGrid } from '../ScoringActionButton';
import { useSharedDynamicScoring } from '../DynamicScoringContext';

export function ReasonSelectionStep({ 
    step, 
    onComplete 
}: { 
    step: ActionStep, 
    onComplete: (data: any) => void 
}) {
    const { scoringState, rosters, nextDynamicStep } = useSharedDynamicScoring();
    const side = scoringState.side!;
    
    // Find the initial reason from collected data to keep it highlighted when coming back
    const initialReasonName = scoringState.collectedData?.reason;
    const initialReason = step.reasons?.flatMap(g => g.options).find(o => o.name === initialReasonName) || null;

    const [selectedReason, setSelectedReason] = useState<ReasonOption | null>(initialReason);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>(scoringState.collectedData?.playerId || '');

    const handleSelectReason = (reason: ReasonOption) => {
        setSelectedReason(reason);
        // Sync with context immediately so stepper knows we have data
        nextDynamicStep({ 
            reason: reason.name, 
            _noAdvance: true 
        });
    };

    const handleNext = () => {
        if (!selectedReason) return;
        onComplete({
            reason: selectedReason.name,
            ...(selectedReason.specifyPlayer && selectedPlayerId ? { playerId: selectedPlayerId } : {})
        });
    };

    return (
        <div className="space-y-3">
            <div className="grid gap-4">
                {step.reasons?.map((group) => (
                    <div key={group.name} className="space-y-1.5">
                        <div className="px-1 border-b border-border flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-primary/70 tracking-[0.2em]">{group.name}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                            {group.options.map((opt) => {
                                const isSelected = selectedReason?.name === opt.name;
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

            {selectedReason?.specifyPlayer && (
                <div className="pt-2 border-t border-border">
                    <div className="px-1 mb-2">
                        <span className="text-[10px] font-black uppercase text-muted-foreground/70 tracking-[0.2em]">Select Player</span>
                    </div>
                    <RosterGrid 
                        roster={(Object.values(rosters)[side === 'home' ? 0 : 1] as any[]) || []}
                        selectedPlayerId={selectedPlayerId}
                        onSelect={(id) => {
                            const newId = id === selectedPlayerId ? '' : id;
                            setSelectedPlayerId(newId);
                            nextDynamicStep({ playerId: newId, _noAdvance: true });
                        }}
                    />
                </div>
            )}
        </div>
    );
}
