import React, { useState } from 'react';
import { ActionStep } from '@sk/types';
import { RosterGrid } from '../ScoringActionButton';
import { useSharedDynamicScoring } from '../DynamicScoringContext';

export function PlayerSelectionStep({ 
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

    const handleSelect = (id: string) => {
        const newId = id === selectedPlayerId ? '' : id;
        setSelectedPlayerId(newId);
        // We don't auto-advance on player selection as it might be accidental
        // The user uses the header "Next" button to confirm
        nextDynamicStep({ playerId: newId, _noAdvance: true });
    };

    return (
        <div className="space-y-4">
            <div className="px-1 mb-2">
                <span className="text-[10px] font-black uppercase text-muted-foreground/70 tracking-[0.2em]">Select Player</span>
            </div>
            <RosterGrid 
                roster={roster}
                selectedPlayerId={selectedPlayerId}
                onSelect={handleSelect}
            />
            {/* If it's NOT grouped with next and we want to allow auto-advance on selection, 
                we could call onComplete({ playerId: id }) inside handleSelect.
                But for now, consistency with header navigation is better. */}
        </div>
    );
}
