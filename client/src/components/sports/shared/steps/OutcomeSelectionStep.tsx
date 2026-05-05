import React, { useState } from 'react';
import { ActionStep } from '@sk/types';
import { Button } from '@/components/ui/button';
import { ScoringActionButton, RosterGrid } from '../ScoringActionButton';
import { cn } from '@/lib/utils';
import { useSharedDynamicScoring } from '../DynamicScoringContext';

export function OutcomeSelectionStep({ 
    step, 
    onComplete 
}: { 
    step: ActionStep, 
    onComplete: (data: any) => void 
}) {
    const { scoringState, rosters, nextDynamicStep, game } = useSharedDynamicScoring();
    const side = scoringState.side!;
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>(scoringState.collectedData?.playerId || '');

    const participantId = side === 'home' ? game.participants?.[0]?.id : game.participants?.[1]?.id;
    const roster = rosters[participantId || ''] || [];

    const handleSelectOutcome = (outcome: any) => {
        onComplete({
            outcome: outcome.id || outcome.name,
            ...(outcome.points !== undefined ? { pointsDelta: outcome.points } : {}),
            ...(outcome.triggerEventId ? { triggerEventId: outcome.triggerEventId } : {}),
            ...(step.includePlayerSelection && selectedPlayerId ? { playerId: selectedPlayerId } : {}),
            ...(outcome.eventData || {}),
        });
    };

    return (
        <div className="space-y-4">
            {step.includePlayerSelection && (
                <div className="pb-2 border-b border-border">
                    <div className="px-1 mb-2">
                        <span className="text-[10px] font-black uppercase text-muted-foreground/70 tracking-[0.2em]">Select Player</span>
                    </div>
                    <RosterGrid 
                        roster={roster}
                        selectedPlayerId={selectedPlayerId}
                        onSelect={(id) => {
                            const newId = id === selectedPlayerId ? '' : id;
                            setSelectedPlayerId(newId);
                            nextDynamicStep({ playerId: newId, _noAdvance: true });
                        }}
                    />
                </div>
            )}

            <div className="grid grid-cols-2 gap-1.5">
                {step.outcomes?.map((outcome) => {
                    const isSelected = scoringState.collectedData?.outcome === (outcome.id || outcome.name);
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
