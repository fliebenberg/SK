import { useState, useEffect, useMemo } from 'react';
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
} | {
    status: 'KICK_FLOW';
    side: 'home' | 'away';
    type: 'Conversion' | 'Penalty Kick' | 'Line Kick';
    playerId?: string;
    points: number;
    extraData?: any;
} | {
    status: 'SCRUM_FLOW' | 'LINEOUT_FLOW';
    side: 'home' | 'away';
    reason?: string;
    winnerSide?: 'home' | 'away';
    isFromPenalty?: boolean;
} | {
    status: 'EVENT_REASON_SELECTION';
    side: 'home' | 'away';
    type: string;
    reasons: string[];
    nextStatus: ScoringFlowState['status'];
} | {
    status: 'PENALTY_DECISION_SELECTION';
    side: 'home' | 'away';
    reason?: string;
} | {
    status: 'REPLACEMENT_OFF_SELECTION';
    side: 'home' | 'away';
} | {
    status: 'REPLACEMENT_ON_SELECTION';
    side: 'home' | 'away';
    playerOffId: string;
};

export const RUGBY_EVENT_REASONS = {
    SCRUM: ['Knock-on', 'Forward Pass', 'Accidental Offside', 'Unplayable'],
    PENALTY: ['Offside', 'High Tackle', 'Hands in Ruck', 'Side Entry', 'Not Releasing', 'Obstruction', 'Dangerous Tackle', 'Other'],
    DROPOUT_22M: ['Kicked Dead by Opponent', 'Missed Kick'],
    DROPOUT_GOALLINE: ['Held up in Goal', 'Grounded in Goal']
};

export function useRugbyScoring(game: Game) {
    const [scoringState, setScoringState] = useState<ScoringFlowState>({ status: 'IDLE' });
    const [rosters, setRosters] = useState<{ [participantId: string]: any[] }>({});
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
        if (mostRecentScore && mostRecentScore.subType === 'Try') {
            const hasLinkedConversion = gameEvents.some(e => e.eventData?.linkedEventId === mostRecentScore.id);
            if (!hasLinkedConversion) {
                return {
                    tryId: mostRecentScore.id,
                    side: mostRecentScore.gameParticipantId === game.participants?.[0]?.id ? 'home' : 'away'
                } as const;
            }
        }
        return null;
    }, [mostRecentScore, gameEvents, game.participants]);

    const handleScore = async (points: number, side: 'home' | 'away', type: string, extraData?: any, playerId?: string) => {
        const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
        if (!participant) return;

        const team = participant.teamId ? store.getTeam(participant.teamId) : null;
        const initiatorId = store.getOrgProfileId(team?.orgId || '');

        return store.addGameEvent({
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
    };

    const handleAddGameEvent = async (type: string, subType: string, side: 'home' | 'away' | null, extraData?: any, actorId?: string) => {
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

    const handleKickResult = async (type: 'Conversion' | 'Penalty Kick' | 'Line Kick', points: number, isMissed: boolean, side: 'home' | 'away', playerId?: string, extraData?: any) => {
        if (type === 'Line Kick') {
            await handleAddGameEvent('GAME_EVENT', 'Line Kick', side, {
                successful: !isMissed,
                outcome: isMissed ? 'Missed' : 'Out',
                ...extraData
            }, playerId);
        } else {
            await handleScore(isMissed ? 0 : points, side, type, { ...extraData, successful: !isMissed }, playerId);
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

    return {
        scoringState,
        setScoringState,
        rosters,
        currentMS,
        periodLabel,
        pendingConversion,
        handleScore,
        handleAddGameEvent,
        handleKickResult,
        startScoringFlow
    };
}
