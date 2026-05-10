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
import { ActionStepType } from '@sk/types';

export function DynamicScoringDialog() {
    const { 
        scoringState, 
        activeTemplate, 
        templates,
        startDynamicFlow,
        cancelDynamicFlow, 
        cancelWorkflow,
        nextDynamicStep,
        goToStep,
        isStepSkipped,
        isSubStepSkipped,
        isSingleStepSkipped,
        getActiveTriggerEventId,
        getLinkedFollowUp,
        removeGameEvent,
        saveChanges,
        rosters,
        game
    } = useSharedDynamicScoring();

    if (scoringState.status !== 'ACTIVE' || !activeTemplate || scoringState.stepIndex === undefined) return null;

    const currentStep = activeTemplate.steps[scoringState.stepIndex];
    if (!currentStep && activeTemplate.steps.length > 0) return null;

    const handlePartialUpdate = (data: any) => {
        // Just update the collectedData without advancing
        nextDynamicStep({ ...data, _noAdvance: true });
    };

    // Helper to determine if a step should group with the next one
    const renderSteps = () => {
        if (!currentStep) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 opacity-40">
                    <span className="text-sm font-black uppercase tracking-widest italic text-muted-foreground">
                        No additional details to edit
                    </span>
                </div>
            );
        }

        const stepsToRender = currentStep.type === ActionStepType.GROUP 
            ? (currentStep.steps || []).filter((_, idx) => !isSubStepSkipped(currentStep, idx, scoringState.collectedData))
            : [currentStep];

        return stepsToRender.map((step, idx) => {
            const stepKey = `${activeTemplate.id}-${scoringState.stepIndex}-${idx}`;
            switch(step.type) {
                case ActionStepType.REASON_SELECTION:
                    return <ReasonSelectionStep key={stepKey} step={step} onComplete={(data) => nextDynamicStep(data)} />;
                case ActionStepType.OUTCOME_SELECTION:
                    return <OutcomeSelectionStep key={stepKey} step={step} onComplete={(data) => nextDynamicStep(data)} />;
                case ActionStepType.PLAYER_SELECTION:
                    return <PlayerSelectionStep key={stepKey} step={step} onComplete={(data) => nextDynamicStep(data)} />;
                case ActionStepType.CUSTOM_WIDGET:
                    return <CustomWidgetStep 
                                key={stepKey} 
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
                case ActionStepType.FORM_INPUT:
                    return <div key={idx} className="p-4 border border-dashed text-muted-foreground">Form Input: {step.fields?.map(f => f.name).join(', ')}</div>;
                default:
                    return <div key={idx}>Unknown step type</div>;
            }
        });
    };

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) cancelWorkflow(); }}>
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
                                        
                                        const hasChanged = (() => {
                                            if (!original) return true;
                                            if (original.actorOrgProfileId !== (currentData.playerId || null)) return true;
                                            
                                            const dataKeys = new Set([...Object.keys(originalData), ...Object.keys(currentData)]);
                                            for (const key of dataKeys) {
                                                if (['playerId', 'eventId', 'triggerEventId', '_noAdvance'].includes(key)) continue;
                                                if (currentData[key] !== originalData[key]) return true;
                                            }
                                            return false;
                                        })();

                                        const isLastSection = activeTemplate.steps.length === 0 || (() => {
                                            let idx = scoringState.stepIndex!;
                                            while (idx < activeTemplate.steps.length - 1 && isStepSkipped(idx + 1)) {
                                                idx++;
                                            }
                                            return idx === activeTemplate.steps.length - 1;
                                        })();

                                        return (
                                            <>
                                                {/* Bin (Delete) - Only when editing */}
                                                {scoringState.editingId && activeTemplate.disputeConfig?.allowUndo !== false && (
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
                                                        onClick={() => saveChanges()}
                                                        title="Save Changes"
                                                    >
                                                        <Check className="h-5 w-5" />
                                                    </Button>
                                                )}

                                                {/* Chevron (Next) - Only if not last section */}
                                                {!isLastSection && (
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
                                        onClick={cancelWorkflow}
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
                                        if (isStepSkipped(idx)) return null;

                                        let stepName = step.name || step.type.replace('_SELECTION', '').replace('_', ' ');
                                        if (!step.name && step.type === ActionStepType.CUSTOM_WIDGET) stepName = step.widgetName || 'Custom';

                                        // Calculate combined display value for the group (this step and any sub-steps if it's a group)
                                        const displayValue = (() => {
                                            const values: string[] = [];
                                            const subSteps = step.type === ActionStepType.GROUP ? (step.steps || []) : [step];
                                            
                                            subSteps.forEach((s) => {
                                                if (isSingleStepSkipped(s, data)) return;
                                                
                                                let val = '';
                                                if (s.type === ActionStepType.REASON_SELECTION) {
                                                    const reasonVal = data.reason;
                                                    const reasonOpt = s.reasons?.flatMap((g: any) => g.options).find((o: any) => o.id === reasonVal);
                                                    val = reasonOpt?.name || reasonVal;
                                                } else if (s.type === ActionStepType.PLAYER_SELECTION) {
                                                    val = displayPlayer || '';
                                                } else if (s.type === ActionStepType.OUTCOME_SELECTION) {
                                                    const outcomeVal = data.outcome;
                                                    const outcomeOpt = s.outcomes?.find((o: any) => o.id === outcomeVal);
                                                    val = outcomeOpt?.name || outcomeVal;
                                                } else if (s.type === ActionStepType.CUSTOM_WIDGET && s.widgetName === 'ScrumResetsCounter') {
                                                    const resets = data.scrumResets || 0;
                                                    if (resets > 0) val = `${resets} Resets`;
                                                }
                                                if (val) values.push(val);
                                            });
                                            return values.join(', ');
                                        })();

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
                                                        <span className="text-[9px] font-bold text-foreground/60 mt-0.5 normal-case tracking-normal truncate max-w-[150px]">
                                                            {displayValue}
                                                        </span>
                                                    )}
                                                </button>
                                                {(() => {
                                                    // Find next non-skipped step to see if we should show a separator
                                                    let nextNonSkipped = idx + 1;
                                                    while (nextNonSkipped < activeTemplate.steps.length && isStepSkipped(nextNonSkipped)) {
                                                        nextNonSkipped++;
                                                    }
                                                    if (nextNonSkipped < activeTemplate.steps.length) {
                                                        return (
                                                            <div className="text-muted-foreground/60 px-1 self-start pt-1.5 shrink-0">
                                                                <ChevronRight className="h-4 w-4" />
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
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
                        if (!triggerId || getLinkedFollowUp(scoringState.editingId, triggerId)) return null;

                        const triggerTemplate = templates.find(t => t.id === triggerId);
                        const label = triggerTemplate ? `ADD ${triggerTemplate.name.toUpperCase()}` : `ADD ${triggerId.toUpperCase()}`;

                        return (
                            <div className="p-3 sm:p-5 border-t border-border bg-muted/30 flex justify-center items-center gap-3 shrink-0">
                                <Button 
                                    variant="default" 
                                    className="bg-amber-500 hover:bg-amber-600 text-white font-black"
                                    onClick={() => {
                                        saveChanges(triggerId);
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
