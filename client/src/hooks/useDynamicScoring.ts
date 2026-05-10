import { useState, useEffect, useMemo, useRef } from 'react';
import { Game, EventTemplate, ActionStep, ActionStepType } from '@sk/types';
import { store } from '@/app/store/store';
import { useGameTimer } from '@/hooks/useGameTimer';
import { toast } from '@/hooks/use-toast';

export interface DynamicScoringState {
    status: 'IDLE' | 'ACTIVE' | 'CONFIRM_REMOVAL';
    side?: 'home' | 'away';
    activeTemplateId?: string;
    stepIndex?: number;
    collectedData?: any;
    editingId?: string;
    eventIdToRemove?: string;
    typeToRemove?: string;
}

export function useDynamicScoring(game: Game) {
    const [scoringState, setScoringState] = useState<DynamicScoringState>({ status: 'IDLE' });
    const [pendingDispute, setPendingDispute] = useState<{
        eventId: string;
        officialId: string;
        gameId?: string;
        type?: string;
        side?: 'home' | 'away' | null;
        actorId?: string;
        extraData?: any;
        subType?: string;
        isRemoval?: boolean;
    } | null>(null);
    const [rosters, setRosters] = useState<{ [participantId: string]: any[] }>({});
    const { currentMS } = useGameTimer(game.liveState?.clock, game.startTime, game.finishTime);
    const periodLabel = game.liveState?.periodLabel || '1st Period';

    const p1 = game.participants?.[0]?.teamId;
    const homeTeam = p1 ? store.getTeam(p1) : undefined;
    const sportId = game.sportId || homeTeam?.sportId;
    const sport = sportId ? store.getSport(sportId) : null;

    const templates = sport?.eventTemplates || [];

    useEffect(() => {
        game.participants?.forEach(p => {
            store.fetchGameRoster(p.id).then(roster => {
                setRosters(prev => ({ ...prev, [p.id]: roster }));
            });
        });
    }, [game.id, game.participants]);

    const activeTemplate = useMemo(() => {
        if (!scoringState.activeTemplateId) return null;
        return templates.find(t => t.id === scoringState.activeTemplateId) || null;
    }, [scoringState.activeTemplateId, templates]);

    const isStepSkipped = (index: number, data?: any): boolean => {
        const template = activeTemplate;
        if (!template) return false;
        const step = template.steps[index];
        if (!step) return false;

        const collectedData = data || scoringState.collectedData || {};

        if (step.type === ActionStepType.GROUP) {
            // A group is skipped only if ALL its sub-steps are skipped
            return step.steps?.every((_, subIdx) => isSubStepSkipped(step, subIdx, collectedData)) || false;
        }

        return isSingleStepSkipped(step, collectedData);
    };

    const isSingleStepSkipped = (step: ActionStep, collectedData: any): boolean => {
        if (step.type === ActionStepType.PLAYER_SELECTION && step.dependsOnReason) {
            const reasonId = collectedData.reason;
            if (!reasonId) return false;
            
            const reasonStep = activeTemplate?.steps.flatMap(s => s.type === ActionStepType.GROUP ? (s.steps || []) : [s]).find(s => s.type === ActionStepType.REASON_SELECTION);
            const reasonOpt = reasonStep?.reasons?.flatMap(g => g.options).find(o => o.id === reasonId);
            
            if (reasonOpt && reasonOpt.specifyPlayer === false) return true;
        }
        return false;
    };

    const isSubStepSkipped = (group: ActionStep, subIdx: number, collectedData: any): boolean => {
        const step = group.steps?.[subIdx];
        if (!step) return false;
        return isSingleStepSkipped(step, collectedData);
    };

    const cancelDynamicFlow = () => {
        setScoringState({ status: 'IDLE' });
    };

    const cancelWorkflow = async () => {
        if (scoringState.status === 'ACTIVE' && !scoringState.editingId && activeTemplate?.disputeConfig?.allowUndo === false) {
            const flatSteps = activeTemplate.steps.flatMap(s => s.type === ActionStepType.GROUP ? (s.steps || []) : [s]);
            const outcomeStep = flatSteps.find(s => s.type === ActionStepType.OUTCOME_SELECTION);
            const zeroPointOutcome = outcomeStep?.outcomes?.find(o => o.points === 0);
            
            if (zeroPointOutcome) {
                await commitEvent(activeTemplate, scoringState.side as 'home'|'away', { ...scoringState.collectedData, outcome: zeroPointOutcome.id });
                return;
            }
        }
        cancelDynamicFlow();
    };

    const gameEvents = store.gameEvents.filter(e => e.gameId === game.id);

    const isEventInUndoWindow = (eventId: string) => {
        const event = gameEvents.find(e => e.id === eventId);
        if (!event) return false;
        
        const eventTime = new Date(event.timestamp).getTime();
        const age = Date.now() - eventTime;
        const isWithinWindow = age < store.undoDelay;
        
        let isInitiator = store.isMyOrgProfileId(event.initiatorOrgProfileId || '');
        if (!event.initiatorOrgProfileId && store.globalRole === 'admin') {
            isInitiator = true;
        }
        
        return isWithinWindow && isInitiator;
    };

    const triggerUpdateDispute = (eventId: string, type: string, side: 'home' | 'away', extraData: any, subType: string, actorId?: string) => {
        const myProfileIds = Array.from(store.myOrgProfileIds);
        const officialId = myProfileIds[0] || (store.globalRole === 'admin' ? store.currentUserId || 'admin' : null);
        
        if (officialId) {
            setPendingDispute({
                eventId,
                officialId,
                type,
                side,
                extraData,
                subType,
                actorId,
                isRemoval: false
            });
        }
    };

    const commitEvent = async (template: EventTemplate, side: 'home' | 'away', finalData: any, nextFlowTemplateId?: string) => {
        const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
        if (!participant) return;

        const team = participant.teamId ? store.getTeam(participant.teamId) : null;
        const initiatorId = store.getOrgProfileId(team?.orgId || '');

        // Fetch original event if editing
        const original = scoringState.editingId ? gameEvents.find(e => e.id === scoringState.editingId) : null;
        const originalData = original?.eventData || {};

        if (scoringState.editingId && original) {
            // SURGICAL UPDATE: Only send what changed
            const changes: any = {};

            // Intelligence: Does the reason or outcome still require a player?
            const flatSteps = template.steps.flatMap(s => s.type === ActionStepType.GROUP ? (s.steps || []) : [s]);
            
            const reasonStep = flatSteps.find(s => s.type === ActionStepType.REASON_SELECTION);
            const reasonId = finalData.reason || originalData.reason;
            const reasonOpt = reasonStep?.reasons?.flatMap(g => g.options).find(o => o.id === reasonId);
            const requiresPlayerByReason = reasonOpt?.specifyPlayer !== false;

            const outcomeStep = flatSteps.find(s => s.type === ActionStepType.OUTCOME_SELECTION);
            const outcomeId = finalData.outcome || originalData.outcome;
            const outcomeOpt = outcomeStep?.outcomes?.find(o => o.id === outcomeId);
            const requiresPlayerByOutcome = outcomeOpt?.excludePlayer !== true;

            const requiresPlayer = requiresPlayerByReason && requiresPlayerByOutcome;

            let actorId = finalData.playerId || original.actorOrgProfileId;
            if (!requiresPlayer) actorId = null; // FORCE CLEAR
            
            if (actorId !== original.actorOrgProfileId) {
                changes.actorOrgProfileId = actorId;
            }

            const eventDataChanges: any = {};
            let hasDataChanges = false;
            
            // Diff the eventData
            Object.keys(finalData).forEach(key => {
                // Ignore control fields
                if (['playerId', 'eventId', 'triggerEventId'].includes(key)) return;
                
                if (finalData[key] !== originalData[key]) {
                    eventDataChanges[key] = finalData[key];
                    hasDataChanges = true;
                }
            });

            if (hasDataChanges) {
                changes.eventData = eventDataChanges;
            }

            if (Object.keys(changes).length === 0) {
                console.log("[DynamicScoring] No changes detected, skipping update.");
                if (nextFlowTemplateId) {
                    startDynamicFlow(nextFlowTemplateId, side, { linkedEventId: scoringState.editingId });
                    return;
                }
                setScoringState({ status: 'IDLE' });
                return; // Nothing to do
            }

            const isScoring = template.section === 'Scoring';
            const type = isScoring ? 'SCORE' : (original.type || 'GAME_EVENT');
            const subType = original.subType || template.name;

            if (isScoring && !isEventInUndoWindow(scoringState.editingId)) {
                // Only trigger dispute if scoring outcome or points actually changed
                const pointsChanged = eventDataChanges.pointsDelta !== undefined;
                const outcomeChanged = eventDataChanges.outcome !== undefined;

                if (pointsChanged || outcomeChanged) {
                    triggerUpdateDispute(scoringState.editingId, type, side, eventDataChanges, subType, actorId);
                    return;
                }
            }

            await store.updateGameEvent(game.id, scoringState.editingId, changes);
            toast({ title: "Event Updated", description: "Changes have been saved." });

            if (nextFlowTemplateId) {
                startDynamicFlow(nextFlowTemplateId, side, { linkedEventId: scoringState.editingId });
                return;
            }
        } else {
            // NEW EVENT: Full payload
            const actorId = finalData.playerId;
            const eventDataPayload = {
                templateId: template.id,
                elapsedMS: currentMS,
                period: periodLabel,
                ...(template.eventData || {}),
                ...(template.section === 'Scoring' ? { pointsDelta: template.points } : {}),
                ...finalData
            };

            const isScoring = template.section === 'Scoring';
            const type = isScoring ? 'SCORE' : (eventDataPayload.type || 'GAME_EVENT');
            const subType = template.id || template.name;
            
            const { type: _, subType: __, playerId: ___, ...extraData } = eventDataPayload;

            const res = await store.addGameEvent({
                gameId: game.id,
                initiatorOrgProfileId: initiatorId,
                actorOrgProfileId: actorId, 
                type,
                subType,
                gameParticipantId: participant.id,
                eventData: extraData
            });

            // Handle FollowUps or Triggers
            const triggerId = nextFlowTemplateId || finalData.triggerEventId || template.triggerEventId;
            if (triggerId) {
                startDynamicFlow(triggerId, side, { linkedEventId: res?.id });
                return;
            }
        }
        
        setScoringState({ status: 'IDLE' });
    };

    const startDynamicFlow = (templateId: string, side: 'home' | 'away', initialData: any = {}) => {
        // Find the template to determine initial status
        const template = templates.find(t => t.id === templateId);
        if (!template) {
            console.error(`Template not found: ${templateId}`);
            toast({ 
                title: "Configuration Error", 
                description: `Event template "${templateId}" not found for this sport.`, 
                variant: "destructive" 
            });
            return;
        }

        // If template has NO steps, commit immediately IF NEW
        if (!template.steps || template.steps.length === 0) {
            if (!initialData.eventId) {
                commitEvent(template, side, initialData);
                return;
            }
        }

        setScoringState({
            status: 'ACTIVE',
            activeTemplateId: template.id,
            side,
            stepIndex: 0,
            collectedData: { ...initialData },
            editingId: initialData.eventId // If coming from manual flow
        });
    };

    const syncManualFlow = () => {
        if (store.pendingManualFlow && scoringState.status === 'IDLE') {
            const config = store.pendingManualFlow;
            store.startManualFlow(null); // Consume the trigger
            
            // Find the template
            const template = templates.find(t => t.id === config.type);
            if (template) {
                startDynamicFlow(template.id, config.side as 'home' | 'away', {
                    ...config.extraData,
                    playerId: config.actorId,
                    eventId: config.eventId,
                    outcome: config.extraData?.outcome // Correctly get the outcome from extraData
                });
            }
        }
    };

    useEffect(() => {
        syncManualFlow();
        return store.subscribe(syncManualFlow);
    }, [scoringState.status, templates]);





    const saveChanges = async (nextFlowTemplateId?: string) => {
        if (scoringState.status !== 'ACTIVE' || !activeTemplate) return;
        await commitEvent(activeTemplate, scoringState.side as 'home'|'away', scoringState.collectedData, nextFlowTemplateId);
    };

    const nextDynamicStep = async (stepData: any) => {
        if (scoringState.status !== 'ACTIVE' || !activeTemplate || scoringState.stepIndex === undefined) return;

        const { _noAdvance, ...cleanData } = stepData;
        const newCollectedData = { ...scoringState.collectedData, ...cleanData };

        if (_noAdvance) {
            setScoringState(prev => ({ ...prev, collectedData: newCollectedData }));
            return;
        }

        let nextIndex = scoringState.stepIndex + 1;

        while (nextIndex < activeTemplate.steps.length && isStepSkipped(nextIndex, newCollectedData)) {
            nextIndex++;
        }

        if (nextIndex >= activeTemplate.steps.length) {
            if (scoringState.editingId) {
                // When editing, don't auto-commit on the last step, just update data
                // so the user can see the "tick" and save manually
                setScoringState(prev => ({ ...prev, collectedData: newCollectedData }));
            } else {
                await commitEvent(activeTemplate, scoringState.side as 'home'|'away', newCollectedData);
            }
        } else {
            setScoringState(prev => ({
                ...prev,
                stepIndex: nextIndex,
                collectedData: newCollectedData
            }));
        }
    };

    const goToStep = (index: number) => {
        if (scoringState.status !== 'ACTIVE' || !activeTemplate) return;
        if (index < 0 || index >= activeTemplate.steps.length) return;
        
        let targetIndex = index;
        // If the targeted step is skipped, find the next non-skipped one
        while (targetIndex < activeTemplate.steps.length && isStepSkipped(targetIndex)) {
            targetIndex++;
        }
        
        // If all remaining steps are skipped, don't do anything or go to last valid?
        // Usually the stepper only shows valid ones anyway.
        if (targetIndex >= activeTemplate.steps.length) return;

        setScoringState(prev => ({
            ...prev,
            stepIndex: targetIndex
        }));
    };

    // --- Legacy hooks needed for panels that haven't migrated completely ---
    const triggerRemovalDispute = (eventId: string, type: string, side: 'home' | 'away' | null) => {
        const myProfileIds = Array.from(store.myOrgProfileIds);
        const officialId = myProfileIds[0] || (store.globalRole === 'admin' ? store.currentUserId || 'admin' : null);
        
        if (officialId) {
            setPendingDispute({
                eventId,
                officialId,
                gameId: game.id,
                isRemoval: true
            });
        }
    };

    const triggerCorrectionDispute = (eventId: string, type: string, subType: string, side: 'home' | 'away' | null, newOutcome: string) => {
        const myProfileIds = Array.from(store.myOrgProfileIds);
        const officialId = myProfileIds[0] || (store.globalRole === 'admin' ? store.currentUserId || 'admin' : null);
        
        if (officialId) {
            setPendingDispute({
                eventId,
                officialId,
                type,
                subType,
                side,
                extraData: { newOutcome },
                isRemoval: false
            });
            setScoringState({ status: 'IDLE' });
        }
    };

    const isScoringEventCheck = (evt: any) => {
        if (!evt) return false;
        if (evt.type === 'SCORE') return true;
        const eventData = evt.eventData || evt.event_data || {};
        const templateId = eventData.templateId || evt.subType;
        const template = sport?.eventTemplates?.find(t => t.id === templateId);
        return template?.section === 'Scoring';
    };


    const removeGameEvent = async (eventId: string, type: string, side: 'home' | 'away' | undefined, force = false) => {
        const event = gameEvents.find(e => e.id === eventId);
        
        // Check if the template allows removal
        const eventData = event?.eventData || (event as any)?.event_data || {};
        const templateId = eventData.templateId || event?.subType;
        const template = templates.find(t => t.id === templateId);

        if (template?.disputeConfig?.allowUndo === false) {
            toast({ title: "Action Restricted", description: "This event type cannot be removed.", variant: "warning" });
            return;
        }
        // Prioritize explicit type passed from template, fallback to checking the existing event object
        const isScoring = type === 'SCORE' || isScoringEventCheck(event);
        const inWindow = isEventInUndoWindow(eventId);

        if (isScoring && !inWindow) {
            triggerRemovalDispute(eventId, type, side ?? null);
            setScoringState({ status: 'IDLE' });
        } else if (isScoring && inWindow) {
            // Instant removal within undo window for initiator
            const res = await store.removeGameEvent(game.id, eventId);
            if (res.success) {
                toast({ title: "Event Removed", description: "The event has been removed.", variant: "success" });
                setScoringState({ status: 'IDLE' });
            } else {
                toast({ title: "Removal Failed", description: res.error || "The event could not be removed.", variant: "destructive" });
            }
        } else if (!force) {
            setScoringState({ status: 'CONFIRM_REMOVAL', eventIdToRemove: eventId, typeToRemove: type, side });
        } else {
            await store.removeGameEvent(game.id, eventId);
            setScoringState({ status: 'IDLE' });
        }
    };
    
    const resolveDispute = async (confirmed: boolean) => {
        if (!pendingDispute) return;

        if (confirmed) {
            if (pendingDispute.isRemoval) {
                await store.initiateUndoVote(game.id, pendingDispute.eventId, pendingDispute.officialId);
                toast({ title: "Dispute Initiated", description: "Removal requires official consensus." });
            } else {
                console.log(`[useDynamicScoring] Resolving dispute: UPDATE_EVENT`, {
                    gameId: game.id,
                    eventId: pendingDispute.eventId,
                    initiatorId: pendingDispute.officialId,
                    updateData: {
                        actorOrgProfileId: pendingDispute.actorId,
                        eventData: pendingDispute.extraData
                    }
                });
                console.log(`[useDynamicScoring] Calling store.initiateUpdateVote now...`);
                try {
                    await store.initiateUpdateVote(game.id, pendingDispute.eventId, pendingDispute.officialId, {
                        actorOrgProfileId: pendingDispute.actorId,
                        eventData: pendingDispute.extraData
                    });
                    console.log(`[useDynamicScoring] store.initiateUpdateVote completed.`);
                    toast({ title: "Dispute Initiated", description: "Correction requires official consensus." });
                } catch (error) {
                    console.error(`[useDynamicScoring] Error in store.initiateUpdateVote:`, error);
                    toast({ title: "Error", description: "Failed to initiate dispute.", variant: "destructive" });
                }
            }
            
            setPendingDispute(null);
            setScoringState({ status: 'IDLE' });
        } else {
            setPendingDispute(null);
        }
    };

    const confirmRemoval = async (confirmed: boolean) => {
        if (scoringState.status !== 'CONFIRM_REMOVAL' || !scoringState.eventIdToRemove) return;

        if (confirmed) {
            await removeGameEvent(scoringState.eventIdToRemove, scoringState.typeToRemove!, scoringState.side, true);
        } else {
            setScoringState({ status: 'IDLE' });
        }
    };

    const getActiveTriggerEventId = () => {
        if (!activeTemplate) return null;
        
        const outcomeId = scoringState.collectedData?.outcome;
        if (outcomeId) {
            const flatSteps = activeTemplate.steps.flatMap(s => s.type === ActionStepType.GROUP ? (s.steps || []) : [s]);
            const outcomeStep = flatSteps.find(s => s.type === ActionStepType.OUTCOME_SELECTION);
            const outcome = outcomeStep?.outcomes?.find(o => o.id === outcomeId);
            if (outcome?.triggerEventId) return outcome.triggerEventId;
        }
        
        return activeTemplate.triggerEventId || null;
    };

    const getLinkedFollowUp = (eventId: string, triggerId?: string) => {
        // 1. Explicit link check
        const explicitMatch = gameEvents.find(e => e.eventData?.linkedEventId === eventId && e.eventData?.status !== 'REMOVED');
        if (explicitMatch) return explicitMatch;

        // 2. Implicit check (Immediately following event of same side and type)
        if (triggerId) {
            const currentIdx = gameEvents.findIndex(e => e.id === eventId);
            if (currentIdx !== -1 && currentIdx < gameEvents.length - 1) {
                const nextEvent = gameEvents[currentIdx + 1];
                const isSameSide = nextEvent.gameParticipantId === gameEvents[currentIdx].gameParticipantId;
                const nextTemplateId = nextEvent.eventData?.templateId || nextEvent.subType;
                
                if (isSameSide && nextTemplateId === triggerId && nextEvent.eventData?.status !== 'REMOVED') {
                    return nextEvent;
                }
            }
        }

        return null;
    };

    return {
        game,
        scoringState,
        activeTemplate,
        templates,
        rosters,
        startDynamicFlow,
        cancelDynamicFlow,
        cancelWorkflow,
        nextDynamicStep,
        goToStep,
        triggerRemovalDispute,
        triggerCorrectionDispute,
        removeGameEvent,
        isStepSkipped,
        isSubStepSkipped,
        isSingleStepSkipped,
        getActiveTriggerEventId,
        getLinkedFollowUp,
        pendingDispute,
        resolveDispute,
        saveChanges,
        confirmRemoval
    };
}
