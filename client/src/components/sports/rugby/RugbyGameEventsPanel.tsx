import React from 'react';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { useRugbyScoring, RUGBY_EVENT_REASONS } from './useRugbyScoring';
import { RugbyEventDialog } from './RugbyEventDialog';

import { ScoringActionButton, DialogSectionHeader, RosterGrid } from '../shared/ScoringActionButton';

export default function RugbyGameEventsPanel({ game, role }: { game: Game, role?: string }) {
    const { 
        scoringState, 
        setScoringState, 
        rosters, 
        handleAddGameEvent, 
        handleUpdateGameEvent,
        handleKickResult,
        triggerRemovalDispute,
        pendingDispute,
        resolveDispute
    } = useRugbyScoring(game);

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
            { label: 'Penalty', title: 'Penalty Awarded', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: 'Penalty Awarded', reasons: RUGBY_EVENT_REASONS.PENALTY, nextStatus: 'PENALTY_DECISION_SELECTION' }) },
            { label: 'Scrum', title: 'Scrum', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: 'Scrum', reasons: RUGBY_EVENT_REASONS.SCRUM, nextStatus: 'SCRUM_FLOW' }) },
            { label: 'Lineout', title: 'Lineout', action: () => setScoringState({ status: 'LINEOUT_FLOW', side }) },
            { label: 'Free Kick', title: 'Free Kick Awarded', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: 'Free Kick Awarded', reasons: RUGBY_EVENT_REASONS.FREE_KICK, nextStatus: 'FREE_KICK_DECISION_SELECTION' }) },
            // Row 2
            { label: 'Kick-Off', title: 'Kick-off', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Kick-off' }) },
            { label: '22m Drop', title: '22m Dropout', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: '22m Dropout', reasons: RUGBY_EVENT_REASONS.DROPOUT_22M, nextStatus: 'PLAYER_SELECTION' }) },
            { label: 'GL Drop', title: 'Goal-line Dropout', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: 'Goalline Dropout', reasons: RUGBY_EVENT_REASONS.DROPOUT_GOALLINE, nextStatus: 'PLAYER_SELECTION' }) },
            // Row 3
            { label: 'Sub', title: 'Replacement / Substitution', action: () => setScoringState({ status: 'REPLACEMENT_OFF_SELECTION', side }) },
            { label: 'Yellow Card', title: 'Yellow Card', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Yellow Card', isInfringer: true }) },
            { label: 'Red Card', title: 'Red Card', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Red Card', isInfringer: true }) },
            // Row 4
            { label: 'Knock-on', title: 'Knock-on', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Knock-on', isInfringer: true }) },
            { label: 'Turnover', title: 'Turnover', action: () => setScoringState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Turnover' }) },
        ];

        return (
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                {events.map((evt) => (
                    <ScoringActionButton 
                        key={evt.label}
                        onClick={evt.action}
                        disabled={disabled}
                        label={evt.label}
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
            <div className="flex-1 p-1.5 bg-blue-600/5">
                {renderGameEvents('home')}
            </div>
            <div className="flex-1 p-1.5 bg-red-600/5">
                {renderGameEvents('away')}
            </div>

            <RugbyEventDialog 
                state={scoringState}
                rosters={rosters}
                game={game}
                onSetState={setScoringState}
                onSelectPlayer={(id) => setScoringState({ ...scoringState, playerId: id } as any)}
                onSave={() => {
                    const s = scoringState as any;
                    if (scoringState.status === 'EVENT_REASON_SELECTION') {
                        handleAddGameEvent('GAME_EVENT', s.type, s.side, { reason: s.reason });
                    } else if (scoringState.status === 'PENALTY_DECISION_SELECTION' || scoringState.status === 'FREE_KICK_DECISION_SELECTION') {
                        handleAddGameEvent('GAME_EVENT', s.status === 'PENALTY_DECISION_SELECTION' ? 'Penalty Awarded' : 'Free Kick Awarded', s.side, { reason: s.reason, decision: s.decision });
                    } else if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                        handleUpdateGameEvent(scoringState.editingId!, { 
                            winnerSide: s.winnerSide,
                            winnerName: s.winnerSide === 'home' ? homeTeam?.name : (s.winnerSide === 'away' ? awayTeam?.name : undefined)
                        });
                    } else if (scoringState.status === 'KICK_FLOW') {
                        handleKickResult(s.type, s.successful ? s.points : 0, !s.successful, s.side, s.playerId, s.extraData);
                    } else if (scoringState.status === 'REPLACEMENT_OFF_SELECTION' || scoringState.status === 'REPLACEMENT_ON_SELECTION') {
                        handleAddGameEvent('GAME_EVENT', 'Replacement', s.side, {
                            playerOffId: s.playerOffId,
                            playerOffName: store.orgProfiles.find(p => p.id === s.playerOffId)?.name,
                            playerOnId: s.playerOnId,
                            playerOnName: store.orgProfiles.find(p => p.id === s.playerOnId)?.name
                        });
                    } else if (scoringState.status === 'PLAYER_SELECTION') {
                        handleAddGameEvent('GAME_EVENT', s.type, s.side, {}, s.playerId);
                    }
                    setScoringState({ status: 'IDLE' });
                }}
                onClose={() => setScoringState({ status: 'IDLE' })}
                onRemove={(eventId, type, side) => triggerRemovalDispute(eventId, type, side)}
                onAddGameEvent={handleAddGameEvent}
                onUpdateGameEvent={handleUpdateGameEvent}
                onKickResult={handleKickResult}
                pendingDispute={pendingDispute}
                resolveDispute={resolveDispute}
            />
        </div>
    );
}
