import React from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { useSharedRugbyScoring } from './RugbyScoringContext';
import { RUGBY_EVENT_REASONS, RUGBY_OUTCOMES } from './useRugbyScoring';
import { PlayerSelectionDialog } from '../shared/dialogs/PlayerSelectionDialog';
import { DecisionDialog } from '../shared/dialogs/DecisionDialog';
import { RugbyOutcomeDialog } from '../shared/dialogs/RugbyOutcomeDialog';
import { ReplacementDialog } from '../shared/dialogs/ReplacementDialog';
import { BaseEventDialog } from '../shared/dialogs/BaseEventDialog';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { AlertTriangle, Trophy } from 'lucide-react';
import { ScoringActionButton } from '../shared/ScoringActionButton';

export function RugbyScoringDialogs({ game }: { game: Game }) {
    const { 
        scoringState, 
        setScoringState, 
        rosters, 
        handleAddGameEvent, 
        handleUpdateGameEvent,
        handleKickResult,
        handlePenaltyReasonSelected,
        handlePenaltyDecisionSelected,
        handlePlayerSelected,
        triggerRemovalDispute,
        removeGameEvent,
        pendingDispute,
        resolveDispute,
        handleScore,
        handleScrumResetsChange
    } = useSharedRugbyScoring();

    const participant = scoringState.status !== 'IDLE' && 'side' in scoringState ? (scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1]) : null;

    const homeTeamId = game.participants?.[0]?.teamId;
    const awayTeamId = game.participants?.[1]?.teamId;
    const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : null;
    const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : null;

    const handlePenaltyTry = async (side: 'home' | 'away') => {
        await handleScore(7, side, 'Penalty Try');
        setScoringState({ status: 'IDLE' });
    };

    return (
        <>
            {/* Player Selection Dialog */}
            <PlayerSelectionDialog
                open={scoringState.status === 'PLAYER_SELECTION' && (scoringState.type !== 'Penalty Try' || !(scoringState as any).editingId)}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title={scoringState.status === 'PLAYER_SELECTION' && (scoringState as any).editingId ? scoringState.type.replace(' Awarded', '') : 'Select Player'}
                roster={participant ? (rosters[participant.id] || []) : []}
                selectedPlayerId={scoringState.status === 'PLAYER_SELECTION' ? scoringState.playerId : undefined}
                initialPlayerId={scoringState.status === 'PLAYER_SELECTION' ? (scoringState as any).initialPlayerId : undefined}
                isEditing={!!(scoringState as any).editingId}
                onSelect={(playerId) => handlePlayerSelected(playerId)}
                onSave={scoringState.status === 'PLAYER_SELECTION' && scoringState.editingId ? () => {
                    handlePlayerSelected((scoringState as any).playerId);
                } : undefined}
                onRemove={scoringState.status === 'PLAYER_SELECTION' && scoringState.editingId ? () => removeGameEvent(scoringState.editingId!, scoringState.type, scoringState.side) : undefined}
                onClose={() => setScoringState({ status: 'IDLE' })}
                onSkip={() => handlePlayerSelected(undefined)}
                customFooterActions={
                    scoringState.status === 'PLAYER_SELECTION' && scoringState.type === 'Try' && !(scoringState as any).editingId ? (
                        <ScoringActionButton 
                            onClick={() => handlePenaltyTry(scoringState.side)}
                            label="PENALTY TRY"
                            variant="danger"
                            className="flex-1 h-10"
                        />
                    ) : undefined
                }
            />

            {/* Event Reason Selection (Scrum, Penalty, Free Kick, etc) */}
            <DecisionDialog 
                open={scoringState.status === 'EVENT_REASON_SELECTION'}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title={scoringState.status === 'EVENT_REASON_SELECTION' ? `${scoringState.type.replace(' Awarded', '')} Reason` : ''}
                options={scoringState.status === 'EVENT_REASON_SELECTION' ? scoringState.reasons.map(r => {
                    let category = '';
                    if (r.startsWith('Scrum -')) category = 'SCRUM';
                    else if (r.startsWith('Lineout -')) category = 'LINEOUT';
                    else if (scoringState.type === 'Free Kick Awarded') category = 'OTHER';
                    return { id: r, label: r.includes(' - ') ? r.split(' - ')[1] : r, category, variant: 'primary' as const };
                }) : []}
                selectedId={scoringState.status === 'EVENT_REASON_SELECTION' ? scoringState.reason : undefined}
                initialId={scoringState.status === 'EVENT_REASON_SELECTION' ? (scoringState as any).initialReason : undefined}
                isEditing={!!(scoringState as any).editingId}
                onSelect={(reason) => {
                    if (scoringState.status !== 'EVENT_REASON_SELECTION') return;
                    if (scoringState.editingId) {
                        setScoringState({ ...scoringState, reason } as any);
                    } else {
                        const next = scoringState.nextStatus;
                        if (next === 'IDLE') {
                            handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, { reason });
                            setScoringState({ status: 'IDLE' });
                        } else if (next === 'PLAYER_SELECTION') {
                            setScoringState({ status: 'PLAYER_SELECTION', side: scoringState.side, points: 0, type: scoringState.type, extraData: { reason } });
                        } else if (next === 'KICK_FLOW') {
                            setScoringState({ status: 'KICK_FLOW', side: scoringState.side, type: scoringState.type as any, points: 0, extraData: { reason } });
                        } else if (next === 'SCRUM_FLOW' || next === 'LINEOUT_FLOW') {
                            handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, { reason }).then(res => {
                                setScoringState({ status: next, side: scoringState.side, reason, pendingEventId: res?.id });
                            });
                        } else if (next === 'PENALTY_DECISION_SELECTION') {
                            handlePenaltyReasonSelected(scoringState.side, reason);
                        } else if (next === 'FREE_KICK_DECISION_SELECTION') {
                            setScoringState({ status: 'FREE_KICK_DECISION_SELECTION', side: scoringState.side, reason });
                        }
                    }
                }}
                onSave={scoringState.status === 'EVENT_REASON_SELECTION' && scoringState.editingId ? () => {
                    handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, { 
                        reason: scoringState.reason,
                        decision: (scoringState as any).decision
                    });
                    setScoringState({ status: 'IDLE' });
                } : undefined}
                onRemove={scoringState.status === 'EVENT_REASON_SELECTION' && scoringState.editingId ? () => removeGameEvent(scoringState.editingId!, scoringState.type, scoringState.side) : undefined}
                onClose={() => setScoringState({ status: 'IDLE' })}
                onSkip={() => {
                    if (scoringState.status === 'EVENT_REASON_SELECTION') {
                        const next = scoringState.nextStatus;
                        if (next === 'IDLE') {
                            handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side);
                            setScoringState({ status: 'IDLE' });
                        } else if (next === 'PLAYER_SELECTION') {
                            setScoringState({ status: 'PLAYER_SELECTION', side: scoringState.side, points: 0, type: scoringState.type });
                        } else if (next === 'KICK_FLOW') {
                            setScoringState({ status: 'KICK_FLOW', side: scoringState.side, type: scoringState.type as any, points: 0 });
                        } else if (next === 'SCRUM_FLOW' || next === 'LINEOUT_FLOW') {
                            handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side).then(res => {
                                setScoringState({ status: next, side: scoringState.side, pendingEventId: res?.id });
                            });
                        } else if (next === 'PENALTY_DECISION_SELECTION') {
                            handlePenaltyReasonSelected(scoringState.side);
                        } else if (next === 'FREE_KICK_DECISION_SELECTION') {
                            setScoringState({ status: 'FREE_KICK_DECISION_SELECTION', side: scoringState.side });
                        }
                    }
                }}
                skipLabel="SKIP REASON"
                customFooterActions={
                    (scoringState.status === 'EVENT_REASON_SELECTION' && scoringState.editingId && (scoringState.type === 'Penalty Awarded' || scoringState.type === 'Free Kick Awarded')) ? (
                        <ScoringActionButton 
                            onClick={() => setScoringState({ ...scoringState, status: scoringState.nextStatus })}
                            label="DECISION"
                            variant="primary"
                            className="flex-1 h-10"
                        />
                    ) : undefined
                }
            />

            {/* Penalty Decision Selection */}
            <DecisionDialog 
                open={scoringState.status === 'PENALTY_DECISION_SELECTION'}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title="Decision"
                options={[
                    { id: 'Penalty Kick', label: 'PENALTY KICK', variant: 'primary', className: 'h-16 bg-blue-600/30 border-blue-600/40 hover:bg-blue-600/50' },
                    { id: 'Line Kick', label: 'LINE KICK', variant: 'success', className: 'h-16 bg-green-600/30 border-green-600/40 hover:bg-green-600/50' },
                    { id: 'Scrum', label: 'SCRUM', variant: 'primary', className: 'h-16 bg-amber-600/30 border-amber-600/40 hover:bg-amber-600/50' },
                    { id: 'Tap n Go', label: 'TAP \'N GO', variant: 'primary', className: 'h-16 bg-purple-600/30 border-purple-600/40 hover:bg-purple-600/50' }
                ]}
                selectedId={scoringState.status === 'PENALTY_DECISION_SELECTION' ? (scoringState as any).decision : undefined}
                initialId={scoringState.status === 'PENALTY_DECISION_SELECTION' ? (scoringState as any).initialDecision : undefined}
                isEditing={!!(scoringState as any).editingId}
                onSelect={(decision) => {
                    if (scoringState.status !== 'PENALTY_DECISION_SELECTION') return;
                    if (scoringState.editingId) {
                        setScoringState({ ...scoringState, decision } as any);
                    } else {
                        handlePenaltyDecisionSelected(decision);
                    }
                }}
                onSave={scoringState.status === 'PENALTY_DECISION_SELECTION' && scoringState.editingId ? () => {
                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', scoringState.side, { reason: scoringState.reason, decision: (scoringState as any).decision });
                    setScoringState({ status: 'IDLE' });
                } : undefined}
                onRemove={scoringState.status === 'PENALTY_DECISION_SELECTION' && scoringState.editingId ? () => removeGameEvent(scoringState.editingId!, 'Penalty Awarded', scoringState.side) : undefined}
                onClose={() => setScoringState({ status: 'IDLE' })}
                customFooterActions={
                    (scoringState.status === 'PENALTY_DECISION_SELECTION' && scoringState.editingId) ? (
                        <ScoringActionButton 
                            onClick={() => setScoringState({ ...scoringState, status: 'EVENT_REASON_SELECTION' })}
                            label="REASON"
                            variant="primary"
                            className="flex-1 h-10"
                        />
                    ) : undefined
                }
            />

            {/* Free Kick Decision Selection */}
            <DecisionDialog 
                open={scoringState.status === 'FREE_KICK_DECISION_SELECTION'}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title="Decision"
                options={[
                    { id: 'Line Kick', label: 'LINE KICK', variant: 'primary', className: 'h-16 bg-blue-600/30 border-blue-600/40 hover:bg-blue-600/50' },
                    { id: 'Scrum', label: 'SCRUM', variant: 'primary', className: 'h-16 bg-amber-600/30 border-amber-600/40 hover:bg-amber-600/50' },
                    { id: 'Tap n Go', label: 'TAP \'N GO', variant: 'primary', className: 'h-16 bg-purple-600/30 border-purple-600/40 hover:bg-purple-600/50' }
                ]}
                selectedId={scoringState.status === 'FREE_KICK_DECISION_SELECTION' ? (scoringState as any).decision : undefined}
                initialId={scoringState.status === 'FREE_KICK_DECISION_SELECTION' ? (scoringState as any).initialDecision : undefined}
                isEditing={!!(scoringState as any).editingId}
                onSelect={(decision) => {
                    if (scoringState.status !== 'FREE_KICK_DECISION_SELECTION') return;
                    if (scoringState.editingId) {
                        setScoringState({ ...scoringState, decision } as any);
                    } else {
                        if (decision === 'Line Kick') {
                            handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Line Kick' });
                            setScoringState({ status: 'KICK_FLOW', side: scoringState.side, type: 'Line Kick', points: 0 });
                        } else if (decision === 'Scrum') {
                            handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Scrum' }).then(res => {
                                setScoringState({ status: 'SCRUM_FLOW', side: scoringState.side, reason: 'Free Kick', isFromPenalty: true, pendingEventId: res?.id });
                            });
                        } else if (decision === 'Tap n Go') {
                            handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Tap n Go' });
                            setScoringState({ status: 'PLAYER_SELECTION', side: scoringState.side, points: 0, type: 'Tap n Go' });
                        }
                    }
                }}
                onSave={scoringState.status === 'FREE_KICK_DECISION_SELECTION' && scoringState.editingId ? () => {
                    handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', scoringState.side, { reason: scoringState.reason, decision: (scoringState as any).decision });
                    setScoringState({ status: 'IDLE' });
                } : undefined}
                onRemove={scoringState.status === 'FREE_KICK_DECISION_SELECTION' && scoringState.editingId ? () => removeGameEvent(scoringState.editingId!, 'Free Kick Awarded', scoringState.side) : undefined}
                onClose={() => setScoringState({ status: 'IDLE' })}
                onSkip={() => {
                     if (scoringState.status === 'FREE_KICK_DECISION_SELECTION') {
                        handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', scoringState.side, { reason: scoringState.reason });
                        setScoringState({ status: 'IDLE' });
                    }
                }}
                skipLabel="SKIP DECISION"
                customFooterActions={
                    (scoringState.status === 'FREE_KICK_DECISION_SELECTION' && scoringState.editingId) ? (
                        <ScoringActionButton 
                            onClick={() => setScoringState({ ...scoringState, status: 'EVENT_REASON_SELECTION' })}
                            label="REASON"
                            variant="primary"
                            className="flex-1 h-10"
                        />
                    ) : undefined
                }
            />

            {/* Scrum / Lineout Winner Selection */}
            <RugbyOutcomeDialog 
                open={scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW'}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title={scoringState.status === 'SCRUM_FLOW' ? 'Scrum Winner' : (scoringState.status === 'LINEOUT_FLOW' ? 'Lineout Winner' : 'Winner')}
                icon={<Trophy className="h-5 w-5 text-primary" />}
                outcomes={[
                    { id: 'home', titleLabel: homeTeam?.name || 'Home Team', buttonText: 'WON', variant: 'success', isSuccessful: true },
                    { id: 'away', titleLabel: awayTeam?.name || 'Away Team', buttonText: 'WON', variant: 'success', isSuccessful: true }
                ]}
                selectedOutcomeId={(scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') ? scoringState.winnerSide : undefined}
                initialOutcomeId={(scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') ? (scoringState as any).initialWinnerSide : undefined}
                resets={scoringState.status === 'SCRUM_FLOW' ? scoringState.resets : undefined}
                onResetsChange={scoringState.status === 'SCRUM_FLOW' ? handleScrumResetsChange : undefined}
                isEditing={!!(scoringState as any).editingId}
                onOutcomeSelect={(outcome) => {
                    const winnerSide = outcome.id as 'home' | 'away';
                    if (scoringState.status !== 'SCRUM_FLOW' && scoringState.status !== 'LINEOUT_FLOW') return;
                    if (scoringState.editingId) {
                        setScoringState({ ...scoringState, winnerSide });
                    } else {
                        if (scoringState.pendingEventId) {
                            handleUpdateGameEvent(scoringState.pendingEventId, { 
                                winnerSide,
                                winnerName: winnerSide === 'home' ? (homeTeam?.name || 'Home') : (awayTeam?.name || 'Away'),
                                resets: scoringState.status === 'SCRUM_FLOW' ? scoringState.resets : undefined
                            });
                        }
                        setScoringState({ status: 'IDLE' });
                    }
                }}
                onSave={(scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') && scoringState.editingId ? () => {
                    handleUpdateGameEvent(scoringState.editingId!, { 
                        eventData: {
                            winnerSide: scoringState.winnerSide,
                            winnerName: scoringState.winnerSide === 'home' ? homeTeam?.name : (scoringState.winnerSide === 'away' ? awayTeam?.name : undefined),
                            resets: scoringState.status === 'SCRUM_FLOW' ? scoringState.resets : undefined
                        }
                    });
                    setScoringState({ status: 'IDLE' });
                } : undefined}
                onRemove={(scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') && scoringState.editingId ? () => removeGameEvent(scoringState.editingId!, scoringState.status === 'SCRUM_FLOW' ? 'Scrum' : 'Lineout', scoringState.side) : undefined}
                onClose={() => setScoringState({ status: 'IDLE' })}
                onSkip={() => setScoringState({ status: 'IDLE' })}
                skipLabel="SKIP WINNER"
            />

            {/* Kick Outcomes Selection */}
            <RugbyOutcomeDialog
                open={scoringState.status === 'KICK_FLOW'}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title={scoringState.status === 'KICK_FLOW' ? scoringState.type : ''}
                roster={participant ? (rosters[participant.id] || []) : []}
                selectedPlayerId={scoringState.status === 'KICK_FLOW' ? scoringState.playerId : undefined}
                initialPlayerId={scoringState.status === 'KICK_FLOW' ? (scoringState as any).initialPlayerId : undefined}
                outcomes={scoringState.status === 'KICK_FLOW' ? (RUGBY_OUTCOMES[scoringState.type] || []) : []}
                selectedOutcomeId={scoringState.status === 'KICK_FLOW' ? (scoringState as any).outcome : undefined}
                initialOutcomeId={scoringState.status === 'KICK_FLOW' ? (scoringState as any).initialOutcome : undefined}
                isEditing={!!(scoringState as any).editingId}
                onPlayerSelect={(id) => {
                    if (scoringState.status === 'KICK_FLOW') setScoringState({ ...scoringState, playerId: id });
                }}
                onOutcomeSelect={(outcome) => {
                    if (scoringState.status !== 'KICK_FLOW') return;
                    const successful = outcome.isSuccessful;
                    const outcomeStr = outcome.id;
                    if (scoringState.editingId) {
                        setScoringState({ ...scoringState, successful, outcome: outcomeStr } as any);
                    } else {
                        handleKickResult(scoringState.type, scoringState.points, !successful, scoringState.side, scoringState.playerId, { ...scoringState.extraData, outcome: outcomeStr });
                    }
                }}
                onSave={scoringState.status === 'KICK_FLOW' && scoringState.editingId ? () => {
                    const outcome = (RUGBY_OUTCOMES[scoringState.type!]?.find(o => o.id === (scoringState as any).outcome));
                    const successful = outcome ? outcome.isSuccessful : (scoringState as any).successful;
                    handleKickResult(scoringState.type!, successful ? scoringState.points : 0, !successful, scoringState.side, scoringState.playerId, { ...scoringState.extraData, outcome: (scoringState as any).outcome });
                } : undefined}
                onRemove={scoringState.status === 'KICK_FLOW' && scoringState.editingId && scoringState.type !== 'Conversion' ? () => removeGameEvent(scoringState.editingId!, scoringState.type!, scoringState.side) : undefined}
                onClose={() => setScoringState({ status: 'IDLE' })}
                onSkip={scoringState.status === 'KICK_FLOW' && !scoringState.editingId ? () => {
                    if (scoringState.type === 'Conversion' || scoringState.type === 'Penalty Kick' || scoringState.type === 'Drop Goal') {
                        handleKickResult(scoringState.type as any, 0, true, scoringState.side, scoringState.playerId, scoringState.extraData);
                    } else {
                        handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, scoringState.extraData, scoringState.playerId);
                    }
                    setScoringState({ status: 'IDLE' });
                } : undefined}
                skipLabel="Skip Details"
                columns={(scoringState.status === 'KICK_FLOW' && (scoringState.type === 'Kick-off' || scoringState.type === '22m Dropout' || scoringState.type === 'Goalline Dropout')) ? 3 : 2}
            />

            {/* Replacements Dialog */}
            <ReplacementDialog
                open={scoringState.status === 'REPLACEMENT_OFF_SELECTION' || scoringState.status === 'REPLACEMENT_ON_SELECTION'}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title={scoringState.status === 'REPLACEMENT_OFF_SELECTION' ? 'Player Coming OFF' : 'Player Coming ON'}
                roster={participant ? (rosters[participant.id] || []) : []}
                selectedPlayerId={(scoringState.status === 'REPLACEMENT_OFF_SELECTION' || scoringState.status === 'REPLACEMENT_ON_SELECTION') ? (scoringState.status === 'REPLACEMENT_OFF_SELECTION' && (scoringState as any).editingId ? scoringState.playerOffId : (scoringState as any).playerOnId) : undefined}
                isEditing={!!(scoringState as any).editingId}
                isDirty={(scoringState.status === 'REPLACEMENT_OFF_SELECTION' || scoringState.status === 'REPLACEMENT_ON_SELECTION') ? ((scoringState.playerOffId !== (scoringState as any).initialPlayerOffId) || ((scoringState as any).playerOnId !== (scoringState as any).initialPlayerOnId)) : false}
                onSelect={(playerId) => {
                    const profile = store.orgProfiles.find(p => p.id === playerId);
                    if ((scoringState as any).editingId) {
                        if (scoringState.status === 'REPLACEMENT_OFF_SELECTION') {
                            setScoringState({ ...scoringState, playerOffId: playerId } as any);
                        } else if (scoringState.status === 'REPLACEMENT_ON_SELECTION') {
                            setScoringState({ ...scoringState, playerOnId: playerId } as any);
                        }
                    } else {
                        if (scoringState.status === 'REPLACEMENT_OFF_SELECTION') {
                            setScoringState({ status: 'REPLACEMENT_ON_SELECTION', side: scoringState.side, playerOffId: playerId });
                        } else if (scoringState.status === 'REPLACEMENT_ON_SELECTION') {
                            handleAddGameEvent('GAME_EVENT', 'Replacement', scoringState.side, {
                                playerOffId: scoringState.playerOffId,
                                playerOffName: store.orgProfiles.find(p => p.id === scoringState.playerOffId)?.name,
                                playerOnId: playerId,
                                playerOnName: profile?.name || 'Unknown'
                            });
                            setScoringState({ status: 'IDLE' });
                        }
                    }
                }}
                onSave={(scoringState.status === 'REPLACEMENT_OFF_SELECTION' || scoringState.status === 'REPLACEMENT_ON_SELECTION') && (scoringState as any).editingId ? () => {
                    handleAddGameEvent('GAME_EVENT', 'Replacement', scoringState.side, {
                        playerOffId: scoringState.playerOffId,
                        playerOffName: store.orgProfiles.find(p => p.id === scoringState.playerOffId)?.name,
                        playerOnId: (scoringState as any).playerOnId,
                        playerOnName: store.orgProfiles.find(p => p.id === (scoringState as any).playerOnId)?.name
                    });
                    setScoringState({ status: 'IDLE' });
                } : undefined}
                onRemove={(scoringState.status === 'REPLACEMENT_OFF_SELECTION' || scoringState.status === 'REPLACEMENT_ON_SELECTION') && (scoringState as any).editingId ? () => removeGameEvent((scoringState as any).editingId, 'Replacement', scoringState.side) : undefined}
                onClose={() => setScoringState({ status: 'IDLE' })}
                onSkip={scoringState.status === 'REPLACEMENT_ON_SELECTION' && !(scoringState as any).editingId ? () => {
                    handleAddGameEvent('GAME_EVENT', 'Replacement', scoringState.side, {
                        playerOffId: scoringState.playerOffId,
                        playerOffName: store.orgProfiles.find(p => p.id === scoringState.playerOffId)?.name,
                    });
                    setScoringState({ status: 'IDLE' });
                } : undefined}
                skipLabel="SKIP ON"
            />

            {/* Editing Penalty Try explicitly (no player) */}
            <BaseEventDialog
                open={scoringState.status === 'PLAYER_SELECTION' && scoringState.type === 'Penalty Try' && !!(scoringState as any).editingId}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title="Edit Penalty Try"
                icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
                isEditing={true}
                onRemove={() => {
                    if (scoringState.status === 'PLAYER_SELECTION' && scoringState.editingId) {
                        removeGameEvent(scoringState.editingId, scoringState.type, scoringState.side);
                    }
                }}
                onClose={() => setScoringState({ status: 'IDLE' })}
            >
                <div className="p-6 space-y-4">
                    <p className="text-sm text-muted-foreground font-medium uppercase tracking-tight">
                        Penalty tries are assigned to the team and cannot have a player selector.
                    </p>
                    <div className="pt-2">
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'PLAYER_SELECTION' && scoringState.editingId) {
                                    triggerRemovalDispute(scoringState.editingId, scoringState.type, scoringState.side);
                                }
                            }}
                            label="REMOVE PENALTY TRY"
                            variant="danger"
                            className="w-full h-14 text-lg font-black"
                        />
                    </div>
                </div>
            </BaseEventDialog>

            {/* Confirm Removals */}
            <ConfirmationModal 
                isOpen={scoringState.status === 'CONFIRM_REMOVAL'}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title="Remove Event?"
                description={`Are you sure you want to remove this ${scoringState.status === 'CONFIRM_REMOVAL' ? scoringState.type : ''} event? This action cannot be undone.`}
                confirmText="Remove"
                cancelText="Cancel"
                onConfirm={() => {
                    if (scoringState.status === 'CONFIRM_REMOVAL') {
                        removeGameEvent(scoringState.eventId, scoringState.type, scoringState.side, true);
                    }
                }}
                variant="destructive"
            />

            <ConfirmationModal 
                isOpen={!!pendingDispute}
                onOpenChange={(open) => !open && resolveDispute(false)}
                title={pendingDispute?.isRemoval ? "Dispute Event Removal" : "Dispute Score"}
                description={
                    pendingDispute?.isRemoval
                        ? `Are you sure you want to dispute and REMOVE this ${pendingDispute?.type?.toUpperCase() || 'EVENT'}? This will initiate a 5-minute vote among all officials.`
                        : `Are you sure you want to dispute this ${pendingDispute?.type?.toUpperCase() || 'SCORE'}? This will reserve the score and initiate a 5-minute vote among all officials.`
                }
                confirmText={pendingDispute?.isRemoval ? "Yes, start removal dispute" : "Yes, start dispute"}
                onConfirm={() => resolveDispute(true)}
                variant="destructive"
            />
        </>
    );
}
