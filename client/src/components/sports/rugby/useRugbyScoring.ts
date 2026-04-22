import { useState, useEffect, useMemo, useRef } from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { useGameTimer } from '@/hooks/useGameTimer';
import { toast } from '@/hooks/use-toast';

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
    type: 'Conversion' | 'Penalty Kick' | 'Line Kick';
    playerId?: string;
    points: number;
    extraData?: any;
    editingId?: string;
    originalSuccessful?: boolean;
    initialPlayerId?: string;
    initialSuccessful?: boolean;
} | {
    status: 'SCRUM_FLOW' | 'LINEOUT_FLOW';
    side: 'home' | 'away';
    reason?: string;
    winnerSide?: 'home' | 'away';
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
};

export const RUGBY_EVENT_REASONS = {
    SCRUM: ['Knock-on', 'Forward Pass', 'Accidental Offside', 'Unplayable'],
    PENALTY: ['Offside', 'High Tackle', 'Hands in Ruck', 'Side Entry', 'Not Releasing', 'Obstruction', 'Dangerous Tackle', 'Other'],
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
        'Mark',
        'Wasting Time',
        'Kicking ball away',
        'Other'
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
        isRemoval?: boolean;
    } | null>(null);
    const [rosters, setRosters] = useState<{ [participantId: string]: any[] }>({});
    const [actionedTryIds, setActionedTryIds] = useState<Set<string>>(new Set());
    const [locallyAddedTryId, setLocallyAddedTryId] = useState<string | null>(null);
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
        
        // After first evaluation, we are no longer in cold start
        if (isColdStart.current) {
            isColdStart.current = false;
        }
    }, [pendingConversion, scoringState.status, locallyAddedTryId]);

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
                    initialPlayerOnId: config.eventId ? config.extraData?.playerOnId : undefined
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
            if (!isEditing && (!pendingConversion || pendingConversion.tryId !== scoringState.extraData?.linkedEventId)) {
                setScoringState({ status: 'IDLE' });
            }
        }
    }, [pendingConversion, scoringState.status, scoringState.type, scoringState.extraData?.linkedEventId, scoringState.editingId]);


    const handleScore = async (points: number, side: 'home' | 'away', type: string, extraData?: any, playerId?: string) => {
        const editingId = scoringState.status !== 'IDLE' ? scoringState.editingId : undefined;
        
        if (editingId) {
            // Check if outcome changed
            const isOriginalSuccessful = (scoringState as any).originalSuccessful;
            const currentSuccessful = extraData?.successful;
            
            if (isOriginalSuccessful !== undefined && currentSuccessful !== undefined && isOriginalSuccessful !== currentSuccessful) {
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
                        extraData
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
        }

        return res;
    };

    const handleAddGameEvent = async (type: string, subType: string, side: 'home' | 'away' | null, extraData?: any, actorId?: string) => {
        const editingId = scoringState.status !== 'IDLE' ? scoringState.editingId : undefined;

        if (editingId) {
            // Check if outcome changed (e.g. winnerSide or decision)
            const isOriginalWinner = (scoringState as any).originalWinnerSide;
            const currentWinner = extraData?.winnerSide;
            const isOriginalDecision = (scoringState as any).originalDecision;
            const currentDecision = extraData?.decision;
            const isOriginalSuccessful = (scoringState as any).originalSuccessful;
            const currentSuccessful = extraData?.successful;

            const hasOutcomeChanged = (isOriginalWinner !== undefined && currentWinner !== undefined && isOriginalWinner !== currentWinner) ||
                                      (isOriginalDecision !== undefined && currentDecision !== undefined && isOriginalDecision !== currentDecision) ||
                                      (isOriginalSuccessful !== undefined && currentSuccessful !== undefined && isOriginalSuccessful !== currentSuccessful);

            if (hasOutcomeChanged) {
                const myProfileIds = Array.from(store.myOrgProfileIds);
                const officialId = myProfileIds[0] || (store.globalRole === 'admin' ? store.currentUserId || 'admin' : null);
                if (officialId) {
                    setPendingDispute({
                        eventId: editingId,
                        officialId,
                        type: subType,
                        side,
                        actorId,
                        extraData
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

    const handleUpdateGameEvent = async (eventId: string, eventData: any) => {
        return store.updateGameEvent(game.id, eventId, { eventData });
    };

    const handleKickResult = async (type: 'Conversion' | 'Penalty Kick' | 'Line Kick', points: number, isMissed: boolean, side: 'home' | 'away', playerId?: string, extraData?: any) => {
        // Handle timestamp inheritance (with +1s offset to ensure it follows the parent)
        const timestampOverride = extraData?.elapsedMS !== undefined ? {
            elapsedMS: extraData.elapsedMS + 1000,
            period: extraData.period || periodLabel
        } : {};

        if (type === 'Line Kick') {
            await handleAddGameEvent('GAME_EVENT', 'Line Kick', side, {
                successful: !isMissed,
                outcome: isMissed ? 'Missed' : 'Out',
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
            if (!pendingDispute.isRemoval) {
                // Ensure any metadata (player change) is saved before dispute starts
                await store.updateGameEvent(game.id, pendingDispute.eventId, { 
                    actorOrgProfileId: pendingDispute.actorId, 
                    eventData: pendingDispute.extraData 
                });
            }
            await store.initiateUndoVote(game.id, pendingDispute.eventId, pendingDispute.officialId);
            toast({ 
                title: "Dispute Started", 
                description: pendingDispute.isRemoval 
                    ? "Removal request registered. A vote has been opened." 
                    : "Outcome change registered. A vote has been opened." 
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
        } else {
             toast({ title: "Unauthorized", description: "You do not have permission to dispute this event.", variant: "destructive" });
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
        startScoringFlow,
        triggerRemovalDispute,
        pendingDispute,
        resolveDispute
    };
}
