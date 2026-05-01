import { useState, useEffect, useMemo, useRef } from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { useGameTimer } from '@/hooks/useGameTimer';
import { toast } from '@/hooks/use-toast';

export interface OutcomeDefinition {
    id: string;
    buttonText: string;
    description?: string;
    listText?: string;
    isSuccessful: boolean;
    variant: 'success' | 'danger' | 'warning' | 'primary';
    titleLabel?: string;
}

export type ScoringFlowState = {
    status: 'IDLE';
} | {
    status: 'TRY_TYPE_SELECTION';
    side: 'home' | 'away';
} | {
    status: 'PLAYER_SELECTION';
    side: 'home' | 'away';
    points: number;
    type: string;
    extraData?: any;
    isInfringer?: boolean;
    editingId?: string;
    playerId?: string;
    initialPlayerId?: string;
} | {
    status: 'KICK_FLOW';
    side: 'home' | 'away';
    type: 'Conversion' | 'Penalty Kick' | 'Drop Goal' | 'Line Kick' | 'Kick-off' | '22m Dropout' | 'Goalline Dropout';
    playerId?: string;
    points: number;
    extraData?: any;
    editingId?: string;
    originalSuccessful?: boolean;
    initialPlayerId?: string;
    initialSuccessful?: boolean;
    outcome?: string;
    originalOutcome?: string;
    initialOutcome?: string;
} | {
    status: 'SCRUM_FLOW' | 'LINEOUT_FLOW';
    side: 'home' | 'away';
    reason?: string;
    winnerSide?: 'home' | 'away';
    resets?: number;
    isFromPenalty?: boolean;
    pendingEventId?: string;
    editingId?: string;
    originalWinnerSide?: 'home' | 'away';
    initialWinnerSide?: 'home' | 'away';
} | {
    status: 'EVENT_REASON_SELECTION';
    side: 'home' | 'away';
    type: string;
    reasons: string[];
    nextStatus: ScoringFlowState['status'];
    editingId?: string;
    reason?: string;
    initialReason?: string;
    decision?: string;
    initialDecision?: string;
} | {
    status: 'PENALTY_DECISION_SELECTION';
    side: 'home' | 'away';
    reason?: string;
    editingId?: string;
    originalDecision?: string;
    initialDecision?: string;
} | {
    status: 'FREE_KICK_DECISION_SELECTION';
    side: 'home' | 'away';
    reason?: string;
    editingId?: string;
    originalDecision?: string;
    initialDecision?: string;
} | {
    status: 'REPLACEMENT_OFF_SELECTION';
    side: 'home' | 'away';
    editingId?: string;
    playerOffId?: string;
    initialPlayerOffId?: string;
} | {
    status: 'REPLACEMENT_ON_SELECTION';
    side: 'home' | 'away';
    playerOffId: string;
    playerOnId?: string;
    editingId?: string;
    initialPlayerOnId?: string;
} | {
    status: 'CONFIRM_REMOVAL';
    eventId: string;
    type: string;
    side: 'home' | 'away' | null;
};

export const RUGBY_EVENT_REASONS = {
    SCRUM: ['Knock-on', 'Forward Pass', 'Accidental Offside', 'Unplayable Ruck', 'Unsuccessful Maul', 'Penalty', 'Other'],
    PENALTY: [
        'Tackle - Dangerous',
        'Tackle - Late',
        'Ruck - Not Releasing',
        'Ruck - Not Rolling',
        'Ruck - Hands in',
        'Ruck - Side Entry',
        'Ruck - Off Feet',
        'Set Piece - Collapsing Scrum',
        'Set Piece - Scrum Other',
        'Set Piece - Lineout Foul',
        'General - Offside',
        'General - Obstruction',
        'General - Pro Foul',
        'General - Other'
    ],
    DROPOUT_22M: ['Kicked Dead by Opponent', 'Missed Kick'],
    DROPOUT_GOALLINE: ['Held up in Goal', 'Grounded in Goal'],
    FREE_KICK: [
        'Scrum - Early Push', 
        'Scrum - Delaying the Feed', 
        'Scrum - Pre-engagement', 
        'Scrum - Illegal Feed',
        'Lineout - Closing the Gap', 
        'Lineout - Delaying the Lineout', 
        'Lineout - Early Lift', 
        'Lineout - Too Many Players',
        'Lineout - Faking a Throw',
        'General - Mark',
        'General - Wasting Time',
        'General - Kicking ball away',
        'General - Other'
    ]
};

export const RUGBY_OUTCOMES: Record<string, OutcomeDefinition[]> = {
    'Kick-off': [
        { id: 'Successful', buttonText: 'Success', description: 'Ball travels 10m and is caught/played', listText: '', isSuccessful: true, variant: 'success' },
        { id: 'Directly Out', buttonText: 'Out', description: 'Ball goes out of bounds without bouncing', listText: 'Out', isSuccessful: false, variant: 'danger' },
        { id: 'Too Short', buttonText: 'Short', description: 'Ball does not travel 10 meters', listText: 'Short', isSuccessful: false, variant: 'danger' },
        { id: 'Long', buttonText: 'Long', description: 'Ball goes into the in-goal area or dead-ball line without being touched', listText: 'Long', isSuccessful: false, variant: 'danger' },
    ],
    '22m Dropout': [
        { id: 'Successful', buttonText: 'Success', description: 'Ball travels past the 22m line', listText: '', isSuccessful: true, variant: 'success' },
        { id: 'Directly Out', buttonText: 'Out', description: 'Ball goes out of bounds without bouncing', listText: 'Out', isSuccessful: false, variant: 'danger' },
        { id: 'Too Short', buttonText: 'Short', description: 'Ball does not reach 22m line', listText: 'Short', isSuccessful: false, variant: 'danger' },
    ],
    'Goalline Dropout': [
        { id: 'Successful', buttonText: 'Success', description: 'Ball travels past the 5m line', listText: '', isSuccessful: true, variant: 'success' },
        { id: 'Directly Out', buttonText: 'Out', description: 'Ball goes out of bounds without bouncing', listText: 'Out', isSuccessful: false, variant: 'danger' },
        { id: 'Too Short', buttonText: 'Short', description: 'Ball does not reach 5m line', listText: 'Short', isSuccessful: false, variant: 'danger' },
    ],
    'Conversion': [
        { id: 'Successful', buttonText: 'Success', description: 'Kick goes through the posts', listText: '', isSuccessful: true, variant: 'success' },
        { id: 'Missed', buttonText: 'Missed', description: 'Kick misses or falls short', listText: 'Missed', isSuccessful: false, variant: 'danger' },
    ],
    'Penalty Kick': [
        { id: 'Successful', buttonText: 'Success', description: 'Kick goes through the posts', listText: '', isSuccessful: true, variant: 'success' },
        { id: 'Missed', buttonText: 'Missed', description: 'Kick misses or falls short', listText: 'Missed', isSuccessful: false, variant: 'danger' },
    ],
    'Line Kick': [
        { id: 'Successful', buttonText: 'Out', description: 'Ball successfully finds touch', listText: 'Out', isSuccessful: true, variant: 'success' },
        { id: 'Missed', buttonText: 'Missed', description: 'Kick fails to find touch or stays in field', listText: 'Missed', isSuccessful: false, variant: 'danger' },
    ],
    'Drop Goal': [
        { id: 'Successful', buttonText: 'Success', description: 'Kick goes through the posts', listText: '', isSuccessful: true, variant: 'success' },
        { id: 'Missed', buttonText: 'Missed', description: 'Kick misses or falls short', listText: 'Missed', isSuccessful: false, variant: 'danger' },
    ]
};

export function useRugbyScoring(game: Game) {
    const [scoringState, setScoringState] = useState<ScoringFlowState>({ status: 'IDLE' });
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
    const [actionedTryIds, setActionedTryIds] = useState<Set<string>>(new Set());
    const [locallyAddedTryId, setLocallyAddedTryId] = useState<string | null>(null);
    const [locallyAddedAt, setLocallyAddedAt] = useState<number>(0);
    const [pendingPenaltyId, setPendingPenaltyId] = useState<string | null>(null);
    const penaltyTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isColdStart = useRef(true);
    const { currentMS } = useGameTimer(game.liveState?.clock, game.startTime, game.finishTime);
    const periodLabel = game.liveState?.periodLabel || '1st Period';

    useEffect(() => {
        game.participants?.forEach(p => {
            store.fetchGameRoster(p.id).then(roster => {
                setRosters(prev => ({ ...prev, [p.id]: roster }));
            });
        });
    }, [game.id, game.participants]);


    const gameEvents = store.gameEvents.filter(e => e.gameId === game.id);
    const mostRecentScore = useMemo(() => {
        return [...gameEvents]
            .filter(e => e.type === 'SCORE' && (e.eventData?.pointsDelta ?? 0) > 0)
            .sort((a, b) => {
                if (a.sequence !== undefined && b.sequence !== undefined) {
                    return b.sequence - a.sequence;
                }
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            })[0];
    }, [gameEvents]);

    const pendingConversion = useMemo(() => {
        if (mostRecentScore && mostRecentScore.subType === 'Try' && !actionedTryIds.has(mostRecentScore.id)) {
            const hasLinkedConversion = gameEvents.some(e => e.eventData?.linkedEventId === mostRecentScore.id && e.eventData?.status !== 'REMOVED');
            if (!hasLinkedConversion) {
                return {
                    tryId: mostRecentScore.id,
                    side: mostRecentScore.gameParticipantId === game.participants?.[0]?.id ? 'home' : 'away',
                    initiatorId: mostRecentScore.initiatorOrgProfileId
                } as const;
            }
        }
        return null;
    }, [mostRecentScore, gameEvents, game.participants, actionedTryIds]);

    // Automatically trigger conversion flow IF user is initiator AND it was logged in this window (or cold start)
    useEffect(() => {
        if (scoringState.status === 'IDLE' && pendingConversion) {
            const isMyTry = store.isMyOrgProfileId(pendingConversion.initiatorId || '') || store.globalRole === 'admin';
            const shouldTrigger = isMyTry && (isColdStart.current || pendingConversion.tryId === locallyAddedTryId);

            if (shouldTrigger) {
                setScoringState({
                    status: 'KICK_FLOW',
                    side: pendingConversion.side,
                    type: 'Conversion',
                    points: 2,
                    extraData: { linkedEventId: pendingConversion.tryId }
                });
            }
        }
    }, [pendingConversion, scoringState.status, locallyAddedTryId]);

    // After first evaluation, we are no longer in cold start
    useEffect(() => {
        if (isColdStart.current) {
            isColdStart.current = false;
        }
    }, []);

    // Cleanup penalty timer on unmount
    useEffect(() => {
        return () => {
            if (penaltyTimerRef.current) clearTimeout(penaltyTimerRef.current);
        };
    }, []);

    // Observe manual flow trigger from Store (e.g. from Feed)
    useEffect(() => {
        const syncManualFlow = () => {
            if (store.pendingManualFlow && scoringState.status === 'IDLE') {
                const config = store.pendingManualFlow;
                store.startManualFlow(null); // Consume the trigger
                
                // Determine initial status based on type
                let status: ScoringFlowState['status'] = 'KICK_FLOW';
                if (config.type === 'Try' || config.type === 'Penalty Try' || config.type === 'Yellow Card' || config.type === 'Red Card') {
                    status = 'PLAYER_SELECTION';
                } else if (config.type === 'Scrum') {
                    status = 'SCRUM_FLOW';
                } else if (config.type === 'Lineout') {
                    status = 'LINEOUT_FLOW';
                } else if (config.type === 'Replacement') {
                    status = 'REPLACEMENT_OFF_SELECTION';
                } else if (config.type === 'Penalty Awarded') {
                    status = 'EVENT_REASON_SELECTION';
                    (config as any).reasons = RUGBY_EVENT_REASONS.PENALTY;
                    (config as any).nextStatus = 'PENALTY_DECISION_SELECTION';
                } else if (config.type === 'Free Kick Awarded') {
                    status = 'EVENT_REASON_SELECTION';
                    (config as any).reasons = RUGBY_EVENT_REASONS.FREE_KICK;
                    (config as any).nextStatus = 'FREE_KICK_DECISION_SELECTION';
                }

                setScoringState({
                    status,
                    ...config,
                    editingId: config.eventId,
                    playerId: config.actorId,
                    initialPlayerId: config.actorId,
                    originalSuccessful: config.successful,
                    initialSuccessful: config.successful,
                    originalWinnerSide: config.winnerSide,
                    initialWinnerSide: config.winnerSide,
                    originalDecision: config.decision,
                    initialDecision: config.decision,
                    reason: config.reason,
                    initialReason: config.reason,
                    playerOffId: config.eventId ? config.extraData?.playerOffId : undefined,
                    initialPlayerOffId: config.eventId ? config.extraData?.playerOffId : undefined,
                    playerOnId: config.eventId ? config.extraData?.playerOnId : undefined,
                    initialPlayerOnId: config.eventId ? config.extraData?.playerOnId : undefined,
                    resets: config.eventId ? config.extraData?.resets : undefined,
                    outcome: config.eventId ? config.extraData?.outcome : undefined,
                    originalOutcome: config.eventId ? config.extraData?.outcome : undefined,
                    initialOutcome: config.eventId ? config.extraData?.outcome : undefined
                } as any);
            }
        };

        syncManualFlow();
        return store.subscribe(syncManualFlow);
    }, [scoringState.status]);

    // Auto-dismiss conversion dialog if it's no longer pending (e.g. actioned by another official)
    useEffect(() => {
        if (scoringState.status === 'KICK_FLOW' && scoringState.type === 'Conversion') {
            const isEditing = !!scoringState.editingId;
            const linkedTryId = (scoringState as any).extraData?.linkedEventId;
            
            // If it's a conversion we just added locally, don't auto-dismiss it just because the store hasn't updated yet.
            // We only allow dismissal once the try actually appears in the game events list, or after a 5s grace period.
            const isRecentlyAddedByMe = linkedTryId === locallyAddedTryId;
            const tryIsLoaded = gameEvents.some(e => e.id === linkedTryId);
            const isWithinGracePeriod = Date.now() - locallyAddedAt < 5000;

            if (!isEditing) {
                const isNoLongerPending = !pendingConversion || pendingConversion.tryId !== linkedTryId;
                const shouldDismiss = isNoLongerPending && (!isRecentlyAddedByMe || tryIsLoaded || !isWithinGracePeriod);
                
                if (shouldDismiss) {
                    setScoringState({ status: 'IDLE' });
                }
            }
        }
    }, [pendingConversion, scoringState.status, (scoringState as any).type, (scoringState as any).extraData?.linkedEventId, (scoringState as any).editingId, locallyAddedTryId, locallyAddedAt, gameEvents]);


    const handleScore = async (points: number, side: 'home' | 'away', type: string, extraData?: any, playerId?: string) => {
        const editingId = scoringState.status !== 'IDLE' ? (scoringState as any).editingId : undefined;
        
        if (editingId) {
            // Check if outcome changed
            const isOriginalSuccessful = !!(scoringState as any).originalSuccessful;
            const currentSuccessful = !!extraData?.successful;
            if (isOriginalSuccessful !== currentSuccessful) {
                // Outcome changed, trigger dispute confirmation
                const myProfileIds = Array.from(store.myOrgProfileIds);
                const officialId = myProfileIds[0] || (store.globalRole === 'admin' ? store.currentUserId || 'admin' : null);
                if (officialId) {
                    setPendingDispute({
                        eventId: editingId,
                        officialId,
                        type,
                        side,
                        actorId: playerId,
                        extraData: { ...extraData, pointsDelta: points },
                        subType: type,
                        isRemoval: false
                    });
                    return; // Do NOT close the scoring state yet
                }
            } else {
                // Just update the event (e.g. player change)
                const mergedEventData = {
                    ...extraData,
                    pointsDelta: points // Ensure points are synced if outcome changed but not disputed (rare) or just to be safe
                };
                await store.updateGameEvent(game.id, editingId, { actorOrgProfileId: playerId, eventData: mergedEventData });
                toast({ title: "Event Updated", description: "Details have been saved." });
                setScoringState({ status: 'IDLE' });
            }
            return;
        }

        const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
        if (!participant) return;

        const team = participant.teamId ? store.getTeam(participant.teamId) : null;
        const initiatorId = store.getOrgProfileId(team?.orgId || '');

        const res = await store.addGameEvent({
            gameId: game.id,
            initiatorOrgProfileId: initiatorId,
            actorOrgProfileId: playerId,
            type: 'SCORE',
            subType: type,
            gameParticipantId: participant.id,
            eventData: { 
                pointsDelta: points,
                elapsedMS: currentMS,
                period: periodLabel,
                ...extraData
            }
        });

        if (type === 'Try' && res?.id) {
            setLocallyAddedTryId(res.id);
            setLocallyAddedAt(Date.now());
        }

        return res;
    };

    const handleAddGameEvent = async (type: string, subType: string, side: 'home' | 'away' | null, extraData?: any, actorId?: string) => {
        const editingId = scoringState.status !== 'IDLE' ? (scoringState as any).editingId : undefined;

        if (editingId) {
            // Check if outcome changed (e.g. winnerSide or decision)
            const isOriginalWinner = (scoringState as any).originalWinnerSide;
            const currentWinner = extraData?.winnerSide;
            const isOriginalDecision = (scoringState as any).originalDecision;
            const currentDecision = extraData?.decision;
            const isOriginalSuccessful = !!(scoringState as any).originalSuccessful;
            const currentSuccessful = !!extraData?.successful;
            const isOriginalOutcome = (scoringState as any).originalOutcome;
            const currentOutcome = extraData?.outcome;

            const hasOutcomeChanged = (isOriginalWinner !== currentWinner && (isOriginalWinner || currentWinner)) ||
                                      (isOriginalDecision !== currentDecision && (isOriginalDecision || currentDecision)) ||
                                      (isOriginalSuccessful !== currentSuccessful) ||
                                      (isOriginalOutcome !== currentOutcome && (isOriginalOutcome || currentOutcome));

            const isDisputable = type === 'SCORE';

            if (hasOutcomeChanged && isDisputable) {
                const myProfileIds = Array.from(store.myOrgProfileIds);
                const officialId = myProfileIds[0] || (store.globalRole === 'admin' ? store.currentUserId || 'admin' : null);
                if (officialId) {
                    setPendingDispute({
                        eventId: editingId,
                        officialId,
                        type: subType,
                        side,
                        actorId,
                        extraData,
                        subType
                    });
                    return; // Do NOT close the scoring state yet
                }
            } else {
                await store.updateGameEvent(game.id, editingId, { actorOrgProfileId: actorId, eventData: extraData });
                toast({ title: "Event Updated", description: "Details have been saved." });
                setScoringState({ status: 'IDLE' });
            }
            return;
        }

        const participant = side ? (side === 'home' ? game.participants?.[0] : game.participants?.[1]) : null;
        const team = participant?.teamId ? store.getTeam(participant.teamId) : null;
        const firstTeam = game.participants?.[0]?.teamId ? store.getTeam(game.participants[0].teamId) : null;
        const initiatorId = store.getOrgProfileId(team?.orgId || firstTeam?.orgId || '');

        return store.addGameEvent({
            gameId: game.id,
            initiatorOrgProfileId: initiatorId,
            actorOrgProfileId: actorId,
            type,
            subType,
            gameParticipantId: participant?.id,
            eventData: { 
                elapsedMS: currentMS,
                period: periodLabel,
                ...extraData
            }
        });
    };

    const handleUpdateGameEvent = async (eventId: string, updatedData: any) => {
        const existingEvent = store.gameEvents.find(e => e.id === eventId);
        const mergedData = {
            ...(existingEvent?.eventData || {}),
            ...updatedData
        };
        return store.updateGameEvent(game.id, eventId, { eventData: mergedData });
    };

    const handleKickResult = async (type: 'Conversion' | 'Penalty Kick' | 'Drop Goal' | 'Line Kick' | 'Kick-off' | '22m Dropout' | 'Goalline Dropout', points: number, isMissed: boolean, side: 'home' | 'away', playerId?: string, extraData?: any) => {
        // Handle timestamp inheritance (with +1s offset to ensure it follows the parent)
        const timestampOverride = extraData?.elapsedMS !== undefined ? {
            elapsedMS: extraData.elapsedMS + 1000,
            period: extraData.period || periodLabel
        } : {};

        if (type !== 'Conversion' && type !== 'Penalty Kick' && type !== 'Drop Goal') {
            await handleAddGameEvent('GAME_EVENT', type, side, {
                successful: !isMissed,
                outcome: extraData?.outcome,
                ...extraData,
                ...timestampOverride
            }, playerId);
        } else {
            await handleScore(isMissed ? 0 : points, side, type, { 
                ...extraData, 
                successful: !isMissed,
                pointsDelta: isMissed ? 0 : points, // Explicitly include pointsDelta for updates
                ...timestampOverride
            }, playerId);
        }

        if (type === 'Conversion' && extraData?.linkedEventId) {
            setActionedTryIds(prev => new Set(prev).add(extraData.linkedEventId));
        }
        setScoringState({ status: 'IDLE' });
    };

    const startScoringFlow = async (points: number, side: 'home' | 'away', type: string, extraData?: any) => {
        const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
        const roster = participant ? rosters[participant.id] : null;

        if (roster && roster.length > 0 && type !== 'Penalty Try') {
            setScoringState({ status: 'PLAYER_SELECTION', side, points, type, extraData });
            return true;
        } else {
            await handleScore(points, side, type, extraData);
            return false;
        }
    };

    const resolveDispute = async (confirmed: boolean) => {
        if (!pendingDispute) return;

        if (confirmed) {
            await store.initiateUndoVote(game.id, pendingDispute.eventId, pendingDispute.officialId);
            
            // If we are removing a Try, automatically remove the linked Conversion
            if (pendingDispute.isRemoval && pendingDispute.type === 'Try') {
                const linkedConversion = gameEvents.find(e => 
                    e.type === 'SCORE' && 
                    e.subType === 'Conversion' && 
                    e.eventData?.linkedEventId === pendingDispute.eventId && 
                    e.eventData?.status !== 'REMOVED'
                );
                if (linkedConversion) {
                    await store.removeGameEvent(game.id, linkedConversion.id);
                }
            }

            toast({ 
                title: "Dispute Started", 
                description: "Removal request registered. A vote has been opened." 
            });
            setScoringState({ status: 'IDLE' });
        }
        setPendingDispute(null);
    };

    const triggerRemovalDispute = (eventId: string, type: string, side: 'home' | 'away' | null) => {
        const myProfileIds = Array.from(store.myOrgProfileIds);
        const officialId = myProfileIds[0] || (store.globalRole === 'admin' ? store.currentUserId || 'admin' : null);
        
        if (officialId) {
            setPendingDispute({
                eventId,
                officialId,
                type,
                side,
                isRemoval: true
            });
            setScoringState({ status: 'IDLE' });
        } else {
             toast({ title: "Unauthorized", description: "You do not have permission to dispute this event.", variant: "destructive" });
        }
    };

    const removeGameEvent = async (eventId: string, type: string, side: 'home' | 'away' | null, force = false) => {
        if (type === 'Conversion') {
            toast({ 
                title: "Cannot Remove Conversion", 
                description: "Conversions are linked to a Try. To remove this conversion, you must remove the linked Try event.",
                variant: "warning"
            });
            return;
        }

        // Scoring events: Try, Penalty Try, Penalty Kick, Drop Goal
        const scoringTypes = ['Try', 'Penalty Try', 'Penalty Kick', 'Drop Goal'];
        const isScoringEvent = scoringTypes.includes(type);

        if (isScoringEvent) {
            triggerRemovalDispute(eventId, type, side);
        } else if (!force) {
            setScoringState({ status: 'CONFIRM_REMOVAL', eventId, type, side });
        } else {
            const res = await store.removeGameEvent(game.id, eventId);
            if (res.success) {
                toast({ title: "Event Removed", description: "The event has been removed from the list.", variant: "success" });
                setScoringState({ status: 'IDLE' });
            } else {
                toast({ 
                    title: "Removal Failed", 
                    description: res.error || "The event could not be removed.", 
                    variant: "destructive" 
                });
            }
        }
    };

    const handlePenaltyReasonSelected = (side: 'home' | 'away', reason?: string) => {
        if (penaltyTimerRef.current) clearTimeout(penaltyTimerRef.current);
        setPendingPenaltyId(null);

        penaltyTimerRef.current = setTimeout(async () => {
            const res = await handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', side, { reason });
            if (res?.id) {
                setPendingPenaltyId(res.id);
            }
            penaltyTimerRef.current = null;
        }, 5000);

        setScoringState({ status: 'PENALTY_DECISION_SELECTION', side, reason });
    };

    const handlePenaltyDecisionSelected = async (decision: string) => {
        if (scoringState.status !== 'PENALTY_DECISION_SELECTION') return;
        const { side, reason } = scoringState;

        let eventId = pendingPenaltyId;
        if (penaltyTimerRef.current) {
            clearTimeout(penaltyTimerRef.current);
            penaltyTimerRef.current = null;
            const res = await handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', side, { reason, decision });
            eventId = res?.id || null;
        } else if (eventId) {
            await handleUpdateGameEvent(eventId, { reason, decision });
        } else {
            const res = await handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', side, { reason, decision });
            eventId = res?.id || null;
        }

        setPendingPenaltyId(null);

        if (decision === 'Penalty Kick') {
            setScoringState({ status: 'KICK_FLOW', side, type: 'Penalty Kick', points: 3, extraData: { reason } });
        } else if (decision === 'Line Kick') {
            setScoringState({ status: 'KICK_FLOW', side, type: 'Line Kick', points: 0, extraData: { reason } });
        } else if (decision === 'Scrum') {
            const res = await handleAddGameEvent('GAME_EVENT', 'Scrum', side, { reason: 'Penalty' });
            setScoringState({ status: 'SCRUM_FLOW', side, reason: 'Penalty', isFromPenalty: true, pendingEventId: res?.id });
        } else if (decision === 'Tap n Go') {
            setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Tap n Go', extraData: { reason } });
        } else {
            setScoringState({ status: 'IDLE' });
        }
    };

    const handlePlayerSelected = async (playerId?: string) => {
        if (scoringState.status !== 'PLAYER_SELECTION') return;

        const { side, type, points, extraData, editingId } = scoringState as any;
        
        if (editingId) {
            setScoringState({ ...scoringState, playerId } as any);
            return;
        }

        const scoringTypes = ['Try', 'Penalty Try', 'Penalty Kick', 'Drop Goal'];
        const isTry = type === 'Try';

        if (scoringTypes.includes(type)) {
            const actualPoints = type === 'Try' ? 5 : (points || 0);
            const res = await handleScore(actualPoints, side, type, extraData, playerId);
            
            if (isTry && res?.id) {
                setScoringState({ 
                    status: 'KICK_FLOW', 
                    side, 
                    type: 'Conversion', 
                    points: 2, 
                    extraData: { ...extraData, linkedEventId: res.id } 
                });
            } else {
                setScoringState({ status: 'IDLE' });
            }
        } else {
            await handleAddGameEvent('GAME_EVENT', type, side, extraData, playerId);
            setScoringState({ status: 'IDLE' });
        }
    };

    const handleScrumResetsChange = async (count: number) => {
        if (scoringState.status !== 'SCRUM_FLOW') return;
        
        setScoringState({ ...scoringState, resets: count });
        
        const eventId = scoringState.pendingEventId || scoringState.editingId;
        if (eventId) {
            await handleUpdateGameEvent(eventId, { resets: count });
        }
    };

    return {
        scoringState,
        setScoringState,
        rosters,
        currentMS,
        periodLabel,
        pendingConversion,
        handleScore,
        handleAddGameEvent,
        handleUpdateGameEvent,
        handleKickResult,
        handlePenaltyReasonSelected,
        handlePenaltyDecisionSelected,
        handlePlayerSelected,
        handleScrumResetsChange,
        startScoringFlow,
        triggerRemovalDispute,
        removeGameEvent,
        pendingDispute,
        resolveDispute
    };
}
