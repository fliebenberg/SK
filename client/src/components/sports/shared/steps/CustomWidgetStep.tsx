import React, { useState } from 'react';
import { ActionStep } from '@sk/types';
import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';
import { useSharedDynamicScoring } from '../DynamicScoringContext';

export function CustomWidgetStep({ 
    step, 
    onComplete 
}: { 
    step: ActionStep, 
    onComplete: (data: any) => void 
}) {
    // A registry of custom widgets
    if (step.widgetName === 'ScrumResetsCounter') {
        return <ScrumResetsCounter step={step} onComplete={onComplete} />;
    }

    return (
        <div className="p-4 border border-dashed border-red-500/50 text-red-500 bg-red-500/10 rounded-lg">
            Unknown Custom Widget: {step.widgetName}
        </div>
    );
}

function ScrumResetsCounter({ 
    step, 
    onComplete 
}: { 
    step: ActionStep, 
    onComplete: (data: any) => void 
}) {
    const { scoringState } = useSharedDynamicScoring();
    const resets = scoringState.collectedData?.scrumResets || 0;

    // If it's grouped with next, we might not want a "Next" button here, 
    // but rather we just immediately fire onComplete to update the shared state whenever it changes.
    // Actually, if it's grouped with next, the parent needs to handle the fact that this widget
    // doesn't "complete" the step, but just updates data.
    // For simplicity, we'll auto-complete it with the data so it merges into collectedData.
    
    const handleUpdate = (newVal: number) => {
        onComplete({ scrumResets: newVal });
    };

    return (
        <div className="flex flex-col items-center justify-center space-y-3 py-4">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Resets</h4>
            <div className="flex items-center gap-4 bg-muted/50 p-2 rounded-2xl border border-border">
                <Button
                    variant="ghost"
                    className="h-14 w-14 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => handleUpdate(Math.max(0, resets - 1))}
                    disabled={resets === 0}
                >
                    <Minus className="w-8 h-8" />
                </Button>
                <div className="w-16 text-center">
                    <span className="text-4xl font-black text-foreground">{resets}</span>
                </div>
                <Button
                    variant="ghost"
                    className="h-14 w-14 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => handleUpdate(resets + 1)}
                >
                    <Plus className="w-8 h-8" />
                </Button>
            </div>
            
        </div>
    );
}
