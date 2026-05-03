import { useState, useEffect, useMemo, useRef } from 'react';
import { Game, EventTemplate, ActionStep } from '@sk/types';
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
        type: string;
        side: 'home' | 'away' | null;
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

    const startDynamicFlow = (templateId: string, side: 'home' | 'away', initialData: any = {}) => {
        // Find the template to determine initial status
        const template = templates.find(t => t.id === templateId || t.name === templateId);
        if (!template) {
            console.error(`Template not found: ${templateId}`);
            return;
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

    const cancelDynamicFlow = () => {
        setScoringState({ status: 'IDLE' });
    };

    // Observe manual flow trigger from Store (e.g. from Feed)
    useEffect(() => {
        const syncManualFlow = () => {
            if (store.pendingManualFlow && scoringState.status === 'IDLE') {
                const config = store.pendingManualFlow;
                store.startManualFlow(null); // Consume the trigger
                
                // Find the template
                const template = templates.find(t => t.id === config.type || t.name === config.type);
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

        syncManualFlow();
        return store.subscribe(syncManualFlow);
    }, [scoringState.status, templates]);

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

    const commitEvent = async (template: EventTemplate, side: 'home' | 'away', finalData: any) => {
        const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
        if (!participant) return;

        const team = participant.teamId ? store.getTeam(participant.teamId) : null;
        const initiatorId = store.getOrgProfileId(team?.orgId || '');

        const eventDataPayload = {
            templateId: template.id,
            elapsedMS: currentMS,
            period: periodLabel,
            ...(template.eventData || {}),
            ...finalData
        };

        const isScoring = template.section === 'Scoring';
        const type = isScoring ? 'SCORE' : (eventDataPayload.type || 'GAME_EVENT');
        const subType = eventDataPayload.subType || template.name;
        
        // Remove type/subType from the extraData to keep it clean, but let pointsDelta through
        const { type: _, subType: __, playerId, ...extraData } = eventDataPayload;

        if (scoringState.editingId) {
             const inWindow = isEventInUndoWindow(scoringState.editingId);
             
             if (isScoring && !inWindow) {
                 // Check if important fields changed
                 const original = gameEvents.find(e => e.id === scoringState.editingId);
                 const originalData = original?.eventData || {};
                 
                 const pointsChanged = Number(originalData.pointsDelta || 0) !== Number(extraData.pointsDelta || 0);
                 const outcomeChanged = originalData.outcome !== extraData.outcome;

                 if (pointsChanged || outcomeChanged) {
                     triggerUpdateDispute(scoringState.editingId, type, side, extraData, subType, playerId);
                     return;
                 }
             }

             await store.updateGameEvent(game.id, scoringState.editingId, { 
                 actorOrgProfileId: playerId, 
                 eventData: extraData 
             });
             toast({ title: "Event Updated", description: "Details have been saved." });
        } else {
             const res = await store.addGameEvent({
                 gameId: game.id,
                 initiatorOrgProfileId: initiatorId,
                 actorOrgProfileId: playerId, 
                 type,
                 subType,
                 gameParticipantId: participant.id,
                 eventData: extraData
             });

             // Handle FollowUps or Triggers
             if (finalData.triggerEventId) {
                 startDynamicFlow(finalData.triggerEventId, side, { linkedEventId: res?.id });
                 return; 
             }
        }
        
        setScoringState({ status: 'IDLE' });
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

        while (nextIndex < activeTemplate.steps.length && activeTemplate.steps[nextIndex - 1]?.groupWithNext) {
            nextIndex++;
        }

        if (nextIndex >= activeTemplate.steps.length) {
            await commitEvent(activeTemplate, scoringState.side as 'home'|'away', newCollectedData);
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
        
        setScoringState(prev => ({
            ...prev,
            stepIndex: index
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

    const gameEvents = store.gameEvents.filter(e => e.gameId === game.id);

    const isScoringEventCheck = (evt: any) => {
        if (!evt) return false;
        if (evt.type === 'SCORE') return true;
        const eventData = evt.eventData || evt.event_data || {};
        const templateId = eventData.templateId || evt.subType;
        const template = sport?.eventTemplates?.find(t => t.id === templateId || t.name === templateId);
        return template?.section === 'Scoring';
    };

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

    const removeGameEvent = async (eventId: string, type: string, side: 'home' | 'away' | undefined, force = false) => {
        const event = gameEvents.find(e => e.id === eventId);
        const isScoring = isScoringEventCheck(event);
        const inWindow = isEventInUndoWindow(eventId);

        if (isScoring && !inWindow && !force) {
            triggerRemovalDispute(eventId, type, side ?? null);
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

    const getActiveTriggerEventId = () => {
        if (!activeTemplate || !scoringState.collectedData?.outcome) return null;
        
        const outcomeName = scoringState.collectedData.outcome;
        for (const step of activeTemplate.steps) {
            if (step.type === 'OUTCOME_SELECTION') {
                const outcome = step.outcomes?.find(o => o.name === outcomeName);
                if (outcome?.triggerEventId) return outcome.triggerEventId;
            }
        }
        
        return activeTemplate.triggerEventId;
    };

    const hasLinkedFollowUp = (eventId: string) => {
        return store.gameEvents.some(e => e.eventData?.linkedEventId === eventId && e.eventData?.status !== 'REMOVED');
    };

    return {
        game,
        scoringState,
        activeTemplate,
        templates,
        rosters,
        startDynamicFlow,
        cancelDynamicFlow,
        nextDynamicStep,
        goToStep,
        triggerRemovalDispute,
        triggerCorrectionDispute,
        removeGameEvent,
        getActiveTriggerEventId,
        hasLinkedFollowUp,
        pendingDispute,
        resolveDispute
    };
}
