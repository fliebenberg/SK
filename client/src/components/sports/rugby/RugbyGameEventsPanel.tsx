import React from 'react';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useRugbyScoring, RUGBY_EVENT_REASONS, RUGBY_OUTCOMES } from './useRugbyScoring';
import { useSharedRugbyScoring } from './RugbyScoringContext';

import { ScoringActionButton } from '../shared/ScoringActionButton';

import { AlertTriangle, UserPlus, Trophy } from 'lucide-react';

export default function RugbyGameEventsPanel({ game, role }: { game: Game, role?: string }) {
    const { 
        scoringState, 
        setScoringState, 
        rosters, 
        handleAddGameEvent, 
        handleUpdateGameEvent,
        handleKickResult,
        handlePenaltyReasonSelected,
        handlePenaltyDecisionSelected,
        pendingDispute,
        triggerRemovalDispute,
        removeGameEvent,
        resolveDispute
    } = useSharedRugbyScoring();
    const participant = scoringState.status !== 'IDLE' && 'side' in scoringState ? (scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1]) : null;

    const isScoringDisabled = game.status === 'Scheduled';
    const homeTeamId = game.participants?.[0]?.teamId;
    const awayTeamId = game.participants?.[1]?.teamId;
    const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : null;
    const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : null;

    const renderGameEvents = (side: 'home' | 'away') => {
        const teamColorClass = side === 'home' ? 'bg-blue-600/40 border-blue-600/40 hover:bg-blue-600/65 hover:border-blue-600/70' : 'bg-red-600/40 border-red-600/40 hover:bg-red-600/65 hover:border-red-600/70';
        const disabled = isScoringDisabled || (scoringState.status !== 'IDLE' && scoringState.side !== side);

        const events = [
            // Row 1
            { label: 'Kick-Off', title: 'Kick-off', action: () => setScoringState({ status: 'KICK_FLOW', side, points: 0, type: 'Kick-off' }) },
            { label: 'Penalty', title: 'Penalty Awarded', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: 'Penalty Awarded', reasons: RUGBY_EVENT_REASONS.PENALTY, nextStatus: 'PENALTY_DECISION_SELECTION' }) },
            { label: 'Scrum', title: 'Scrum', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: 'Scrum', reasons: RUGBY_EVENT_REASONS.SCRUM, nextStatus: 'SCRUM_FLOW' }) },
            // Row 2
            { label: 'Lineout', title: 'Lineout', action: () => {
                handleAddGameEvent('GAME_EVENT', 'Lineout', side).then(res => {
                    setScoringState({ status: 'LINEOUT_FLOW', side, pendingEventId: res?.id });
                });
            } },
            { label: 'Free Kick', mobileLabel: 'Free K', title: 'Free Kick Awarded', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: 'Free Kick Awarded', reasons: RUGBY_EVENT_REASONS.FREE_KICK, nextStatus: 'FREE_KICK_DECISION_SELECTION' }) },
            { label: '22m Drop', mobileLabel: '22m', title: '22m Dropout', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: '22m Dropout', reasons: RUGBY_EVENT_REASONS.DROPOUT_22M, nextStatus: 'KICK_FLOW' }) },
            // Row 3
            { label: 'GL Drop', mobileLabel: 'GL', title: 'Goal-line Dropout', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: 'Goalline Dropout', reasons: RUGBY_EVENT_REASONS.DROPOUT_GOALLINE, nextStatus: 'KICK_FLOW' }) },
            { label: 'Sub', title: 'Replacement / Substitution', action: () => setScoringState({ status: 'REPLACEMENT_OFF_SELECTION', side }) },
            { label: 'Yellow Card', mobileLabel: 'Yellow', title: 'Yellow Card', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Yellow Card', isInfringer: true }) },
            // Row 4
            { label: 'Red Card', mobileLabel: 'Red', title: 'Red Card', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Red Card', isInfringer: true }) },
        ];

        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-1.5">
                {events.map((evt) => (
                        <ScoringActionButton 
                            key={evt.label}
                            onClick={evt.action}
                            disabled={disabled}
                            label={evt.label}
                            mobileLabel={(evt as any).mobileLabel}
                            title={evt.title}
                            variant="none"
                            className={cn(teamColorClass, disabled ? 'opacity-30' : '', "h-8 sm:h-11")}
                        />
                ))}
            </div>
        );
    };

    return (
        <div className="flex divide-x divide-white/10">
            <div className={cn("flex-1 p-1.5 bg-blue-600/5 transition-all", scoringState.status !== 'IDLE' && scoringState.side === 'away' ? 'opacity-40 grayscale' : '')}>
                {renderGameEvents('home')}
            </div>
            <div className={cn("flex-1 p-1.5 bg-red-600/5 transition-all", scoringState.status !== 'IDLE' && scoringState.side === 'home' ? 'opacity-40 grayscale' : '')}>
                {renderGameEvents('away')}
            </div>


        </div>
    );
}
