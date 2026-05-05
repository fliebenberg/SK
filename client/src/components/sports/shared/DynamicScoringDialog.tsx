import React from 'react';
import { cn } from '@/lib/utils';
import { useSharedDynamicScoring } from './DynamicScoringContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogPortal, DialogOverlay } from "@radix-ui/react-dialog";
import { Button } from '@/components/ui/button';
import { ReasonSelectionStep } from './steps/ReasonSelectionStep';
import { OutcomeSelectionStep } from './steps/OutcomeSelectionStep';
import { PlayerSelectionStep } from './steps/PlayerSelectionStep';
import { CustomWidgetStep } from './steps/CustomWidgetStep';
import { Check, Trash2, X, RotateCcw, ChevronRight } from 'lucide-react';
import { store } from '@/app/store/store';

export function DynamicScoringDialog() {
    const { 
        scoringState, 
        activeTemplate, 
        templates,
        startDynamicFlow,
        cancelDynamicFlow, 
        nextDynamicStep,
        goToStep,
        getActiveTriggerEventId,
        hasLinkedFollowUp,
        removeGameEvent,
        saveChanges,
        rosters,
        game
    } = useSharedDynamicScoring();

    if (scoringState.status !== 'ACTIVE' || !activeTemplate || scoringState.stepIndex === undefined) return null;

    const currentStep = activeTemplate.steps[scoringState.stepIndex];
    if (!currentStep) return null;

    const handlePartialUpdate = (data: any) => {
        // Just update the collectedData without advancing
        nextDynamicStep({ ...data, _noAdvance: true });
    };

    // Helper to determine if a step should group with the next one
    const renderSteps = () => {
        let stepsToRender = [currentStep];
        let nextIdx = scoringState.stepIndex! + 1;
        while (stepsToRender[stepsToRender.length - 1].groupWithNext && nextIdx < activeTemplate.steps.length) {
            stepsToRender.push(activeTemplate.steps[nextIdx]);
            nextIdx++;
        }

        return stepsToRender.map((step, idx) => {
            switch(step.type) {
                case 'REASON_SELECTION':
                    return <ReasonSelectionStep key={idx} step={step} onComplete={(data) => nextDynamicStep(data)} />;
                case 'OUTCOME_SELECTION':
                    return <OutcomeSelectionStep key={idx} step={step} onComplete={(data) => nextDynamicStep(data)} />;
                case 'PLAYER_SELECTION':
                    return <PlayerSelectionStep key={idx} step={step} onComplete={(data) => nextDynamicStep(data)} />;
                case 'CUSTOM_WIDGET':
                    return <CustomWidgetStep 
                                key={idx} 
                                step={step} 
                                onComplete={(data) => {
                                    if (data._advance) {
                                        const { _advance, ...rest } = data;
                                        nextDynamicStep(rest);
                                    } else {
                                        handlePartialUpdate(data);
                                    }
                                }} 
                            />;
                case 'FORM_INPUT':
                    return <div key={idx} className="p-4 border border-dashed text-muted-foreground">Form Input: {step.fields?.map(f => f.name).join(', ')}</div>;
                default:
                    return <div key={idx}>Unknown step type</div>;
            }
        });
    };

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) cancelDynamicFlow(); }}>
            <DialogPortal>
                <DialogOverlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm dark:bg-black/60" />
                <DialogContent 
                    className="sm:max-w-[600px] border-border bg-background p-0 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                    onPointerDownOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                    hideCloseButton={true}
                >
                    <DialogHeader className="p-3 sm:p-5 pb-2 sm:pb-3 border-b border-border bg-muted/30">
                        <div className="flex justify-between items-center w-full mb-2">
                            <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex justify-between items-center w-full">
                                <span>{activeTemplate.name}</span>
                                <div className="flex items-center gap-1">
                                    {(() => {
                                        const original = scoringState.editingId ? store.gameEvents.find(e => e.id === scoringState.editingId) : null;
                                        const originalData = original?.eventData || {};
                                        const currentData = scoringState.collectedData || {};
                                        
                                        const hasChanged = !original || (
                                            original.actorOrgProfileId !== currentData.playerId ||
                                            originalData.outcome !== currentData.outcome ||
                                            originalData.reason !== currentData.reason ||
                                            originalData.pointsDelta !== currentData.pointsDelta
                                        );

                                        const isLastStep = scoringState.stepIndex === activeTemplate.steps.length - 1;

                                        return (
                                            <>
                                                {/* Bin (Delete) - Only when editing */}
                                                {scoringState.editingId && (
                                                    <Button 
                                                        size="icon" 
                                                        variant="ghost" 
                                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => removeGameEvent(scoringState.editingId!, original?.type || '', scoringState.side)}
                                                        title="Remove Event"
                                                    >
                                                        <Trash2 className="h-5 w-5" />
                                                    </Button>
                                                )}

                                                {/* Check (Save/Finish) */}
                                                {(hasChanged || scoringState.editingId === undefined) && (
                                                    <Button 
                                                        size="icon" 
                                                        variant="ghost" 
                                                        className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                                        onClick={saveChanges}
                                                        title="Save Changes"
                                                    >
                                                        <Check className="h-5 w-5" />
                                                    </Button>
                                                )}

                                                {/* Chevron (Next) - Only if not last step */}
                                                {!isLastStep && (
                                                    <Button 
                                                        size="icon" 
                                                        variant="ghost" 
                                                        className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                        onClick={() => nextDynamicStep({})}
                                                        title="Next Step"
                                                    >
                                                        <ChevronRight className="h-5 w-5" />
                                                    </Button>
                                                )}
                                            </>
                                        );
                                    })()}
                                    <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="h-8 w-8 text-muted-foreground"
                                        onClick={cancelDynamicFlow}
                                        title="Cancel"
                                    >
                                        <X className="h-5 w-5" />
                                    </Button>
                                </div>
                            </DialogTitle>
                        </div>
                        
                        {/* Visual Stepper */}
                        {activeTemplate.steps.length > 1 && (
                            <div className="flex items-center text-xs font-medium uppercase tracking-wider text-muted-foreground gap-3 overflow-x-auto pb-1 hide-scrollbar">
                                {(() => {
                                    const data = scoringState.collectedData || {};
                                    const participantId = scoringState.side === 'home' ? game.participants?.[0]?.id : game.participants?.[1]?.id;
                                    const roster = rosters[participantId || ''] || [];
                                    const rosterItem = data.playerId ? roster.find((item: any) => item.orgProfileId === data.playerId) : null;
                                    const profile = data.playerId ? store.orgProfiles.find(p => p.id === data.playerId) : null;
                                    const playerName = profile?.name;
                                    const displayPlayer = rosterItem ? `${rosterItem.position || '?'}. ${playerName || 'Unknown'}` : playerName;

                                    return activeTemplate.steps.map((step, idx) => {
                                        const isActive = idx === scoringState.stepIndex;
                                        
                                        let stepName = step.type.replace('_SELECTION', '').replace('_', ' ');
                                        if (step.type === 'CUSTOM_WIDGET') stepName = step.widgetName || 'Custom';
                                        
                                        // Skip rendering if it's grouped with the previous step
                                        if (idx > 0 && activeTemplate.steps[idx - 1].groupWithNext) return null;

                                        let displayValue = '';
                                        if (step.type === 'REASON_SELECTION') displayValue = data.reason;
                                        else if (step.type === 'PLAYER_SELECTION') displayValue = displayPlayer;
                                        else if (step.type === 'OUTCOME_SELECTION') displayValue = data.outcome;

                                        return (
                                            <React.Fragment key={idx}>
                                                <button 
                                                    onClick={() => goToStep(idx)}
                                                    className={cn(
                                                        "flex flex-col items-start transition-colors uppercase tracking-widest",
                                                        isActive ? "text-primary font-black" : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    <span className="text-[10px]">{stepName}</span>
                                                    {displayValue && (
                                                        <span className="text-[9px] font-bold text-foreground/60 mt-0.5 normal-case tracking-normal truncate max-w-[100px]">
                                                            {displayValue}
                                                        </span>
                                                    )}
                                                </button>
                                                {idx < activeTemplate.steps.length - 1 && !step.groupWithNext && (
                                                    <div className="text-muted-foreground/60 px-1 self-start pt-1.5 shrink-0">
                                                        <ChevronRight className="h-4 w-4" />
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    });
                                })()}
                            </div>
                        )}
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto">
                        <div className="p-3 sm:p-5 space-y-4">
                            {renderSteps()}
                        </div>
                    </div>
                    
                    {(() => {
                        if (!scoringState.editingId) return null;
                        const triggerId = getActiveTriggerEventId();
                        if (!triggerId || hasLinkedFollowUp(scoringState.editingId)) return null;

                        const triggerTemplate = templates.find(t => t.id === triggerId || t.name === triggerId);
                        const label = triggerTemplate ? `ADD ${triggerTemplate.name.toUpperCase()}` : `ADD ${triggerId.toUpperCase()}`;

                        return (
                            <div className="p-3 sm:p-5 border-t border-border bg-muted/30 flex justify-center items-center gap-3 shrink-0">
                                <Button 
                                    variant="default" 
                                    className="bg-amber-500 hover:bg-amber-600 text-white font-black"
                                    onClick={() => {
                                        const side = scoringState.side!;
                                        const parentId = scoringState.editingId!;
                                        cancelDynamicFlow();
                                        // Small delay to ensure state clears before starting next flow
                                        setTimeout(() => {
                                            startDynamicFlow(triggerId, side, { linkedEventId: parentId });
                                        }, 100);
                                    }}
                                >
                                    {label}
                                </Button>
                            </div>
                        );
                    })()}
                </DialogContent>
            </DialogPortal>
        </Dialog>
    );
}
