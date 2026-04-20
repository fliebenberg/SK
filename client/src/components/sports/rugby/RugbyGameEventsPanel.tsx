import React, { useState } from 'react';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { AlertTriangle, User, UserPlus, Pencil, Check, X } from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from "@/components/ui/dialog";
import { useRugbyScoring, RUGBY_EVENT_REASONS } from './useRugbyScoring';

import { ScoringActionButton, DialogSectionHeader, RosterGrid } from '../shared/ScoringActionButton';

export default function RugbyGameEventsPanel({ game, role }: { game: Game, role?: string }) {
    const { 
        scoringState, 
        setScoringState, 
        rosters, 
        handleAddGameEvent, 
        handleUpdateGameEvent,
        handleKickResult,
        pendingDispute,
        resolveDispute
    } = useRugbyScoring(game);
    const participant = scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1];

    const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);

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

            {/* Dialogs moved here */}
            {/* Generic Reason Selection Dialog */}
            <Dialog 
                open={scoringState.status === 'EVENT_REASON_SELECTION'} 
                onOpenChange={(open) => {
                    if (!open) {
                        const isDirty = (scoringState as any).reason !== (scoringState as any).initialReason;
                        if (isDirty && scoringState.editingId) {
                            setShowDiscardConfirmation(true);
                            return;
                        }
                        setScoringState({ status: 'IDLE' });
                    }
                }}
            >
                <DialogContent hideCloseButton className="sm:max-w-lg bg-card border-border/50 pr-4 flex flex-col overflow-hidden">
                    <DialogHeader className="relative pr-12">
                        <DialogTitle className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                            {scoringState.status === 'EVENT_REASON_SELECTION' && scoringState.editingId ? <Pencil className="h-5 w-5 text-primary" /> : <AlertTriangle className="h-5 w-5 text-primary" />}
                            {scoringState.status === 'EVENT_REASON_SELECTION' && (scoringState.editingId ? `Edit ${scoringState.type} Reason` : `${scoringState.type} Reason`)}
                        </DialogTitle>
                        <div className="absolute right-0 top-0 flex items-center gap-1">
                            {scoringState.editingId && (scoringState as any).reason !== (scoringState as any).initialReason && (
                                <button 
                                    onClick={() => {
                                        handleAddGameEvent('GAME_EVENT', (scoringState as any).type, (scoringState as any).side, { reason: (scoringState as any).reason });
                                        setScoringState({ status: 'IDLE' });
                                    }}
                                    className="p-2 text-success hover:bg-success/10 rounded-full transition-colors"
                                    title="Save Changes"
                                >
                                    <Check className="w-6 h-6" />
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    const isDirty = (scoringState as any).reason !== (scoringState as any).initialReason;
                                    if (isDirty && scoringState.editingId) {
                                        setShowDiscardConfirmation(true);
                                    } else {
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors"
                                title="Close"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                        <div className="grid grid-cols-2 gap-2">
                            {scoringState.status === 'EVENT_REASON_SELECTION' && (() => {
                                let lastCategory = '';
                                return scoringState.reasons.map((reason) => {
                                    let category = '';
                                    if (reason.startsWith('Scrum -')) category = 'SCRUM';
                                    else if (reason.startsWith('Lineout -')) category = 'LINEOUT';
                                    else if (scoringState.type === 'Free Kick Awarded') category = 'OTHER';

                                    const showHeader = category && category !== lastCategory;
                                    if (showHeader) lastCategory = category;

                                    return (
                                        <React.Fragment key={reason}>
                                            {showHeader && (
                                                <div className="col-span-2 mt-3 mb-1 px-1 border-b border-white/10 flex items-center justify-between">
                                                    <span className="text-[10px] font-black uppercase text-primary/70 tracking-[0.2em]">{category}</span>
                                                </div>
                                            )}
                                            <ScoringActionButton 
                                                onClick={() => {
                                                    if (scoringState.editingId) {
                                                        setScoringState({ ...scoringState, reason } as any);
                                                    } else {
                                                        const next = (scoringState as any).nextStatus;
                                                        if (next === 'IDLE') {
                                                            handleAddGameEvent('GAME_EVENT', (scoringState as any).type, (scoringState as any).side, { reason });
                                                            setScoringState({ status: 'IDLE' });
                                                        } else if (next === 'PLAYER_SELECTION') {
                                                            setScoringState({ status: 'PLAYER_SELECTION', side: (scoringState as any).side, points: 0, type: (scoringState as any).type, extraData: { reason } });
                                                        } else if (next === 'SCRUM_FLOW' || next === 'LINEOUT_FLOW') {
                                                            handleAddGameEvent('GAME_EVENT', (scoringState as any).type, (scoringState as any).side, { reason }).then(res => {
                                                                setScoringState({ status: next, side: (scoringState as any).side, reason, pendingEventId: res.id });
                                                            });
                                                        } else if (next === 'PENALTY_DECISION_SELECTION') {
                                                            setScoringState({ status: 'PENALTY_DECISION_SELECTION', side: (scoringState as any).side, reason });
                                                        } else if (next === 'FREE_KICK_DECISION_SELECTION') {
                                                            setScoringState({ status: 'FREE_KICK_DECISION_SELECTION', side: (scoringState as any).side, reason });
                                                        }
                                                    }
                                                }}
                                                label={reason.includes(' - ') ? reason.split(' - ')[1] : reason}
                                                selected={(scoringState.editingId ? (scoringState as any).reason : (scoringState as any).initialReason) === reason}
                                                variant="primary"
                                                className="h-12"
                                            />
                                        </React.Fragment>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                     <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t border-white/5">
                        {!scoringState.editingId && (
                            <ScoringActionButton 
                                onClick={() => {
                                    if (scoringState.status === 'EVENT_REASON_SELECTION') {
                                        const next = scoringState.nextStatus;
                                        if (next === 'IDLE') {
                                            handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side);
                                            setScoringState({ status: 'IDLE' });
                                        } else if (next === 'PLAYER_SELECTION') {
                                            setScoringState({ status: 'PLAYER_SELECTION', side: scoringState.side, points: 0, type: scoringState.type });
                                        } else if (next === 'SCRUM_FLOW' || next === 'LINEOUT_FLOW') {
                                            handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side).then(res => {
                                                setScoringState({ status: next, side: scoringState.side, pendingEventId: res.id });
                                            });
                                        } else if (next === 'PENALTY_DECISION_SELECTION') {
                                            setScoringState({ status: 'PENALTY_DECISION_SELECTION', side: scoringState.side });
                                        } else if (next === 'FREE_KICK_DECISION_SELECTION') {
                                            setScoringState({ status: 'FREE_KICK_DECISION_SELECTION', side: scoringState.side });
                                        }
                                    }
                                }}
                                label="SKIP REASON"
                                variant="muted"
                                className="h-10 w-full"
                            />
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Penalty Decision Dialog */}
            <Dialog 
                open={scoringState.status === 'PENALTY_DECISION_SELECTION'} 
                onOpenChange={(open) => {
                    if (!open) {
                        const isDirty = (scoringState as any).decision !== (scoringState as any).initialDecision;
                        if (isDirty && scoringState.editingId) {
                            setShowDiscardConfirmation(true);
                            return;
                        }
                        setScoringState({ status: 'IDLE' });
                    }
                }}
            >
                <DialogContent hideCloseButton className="sm:max-w-lg bg-card border-border/50">
                    <DialogHeader className="relative pr-12">
                        <DialogTitle className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                             {scoringState.status === 'PENALTY_DECISION_SELECTION' && scoringState.editingId ? <Pencil className="h-5 w-5 text-primary" /> : null}
                            Decision
                        </DialogTitle>
                        <div className="absolute right-0 top-0 flex items-center gap-1">
                            {scoringState.editingId && (scoringState as any).decision !== (scoringState as any).initialDecision && (
                                <button 
                                    onClick={() => {
                                        handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', (scoringState as any).side, { reason: (scoringState as any).reason, decision: (scoringState as any).decision });
                                        setScoringState({ status: 'IDLE' });
                                    }}
                                    className="p-2 text-success hover:bg-success/10 rounded-full transition-colors"
                                    title="Save Changes"
                                >
                                    <Check className="w-6 h-6" />
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    const isDirty = (scoringState as any).decision !== (scoringState as any).initialDecision;
                                    if (isDirty && scoringState.editingId) {
                                        setShowDiscardConfirmation(true);
                                    } else {
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors"
                                title="Close"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2 py-4">
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.editingId) {
                                    setScoringState({ ...scoringState, decision: 'Penalty Kick' } as any);
                                } else {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', (scoringState as any).side, { reason: (scoringState as any).reason, decision: 'Penalty Kick' });
                                    setScoringState({ status: 'KICK_FLOW', side: (scoringState as any).side, type: 'Penalty Kick', points: 3 });
                                }
                            }}
                            label="PENALTY KICK"
                            selected={(scoringState.editingId ? (scoringState as any).decision : (scoringState as any).initialDecision) === 'Penalty Kick'}
                            variant="primary"
                            className="h-16 bg-blue-600/30 border-blue-600/40 hover:bg-blue-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.editingId) {
                                    setScoringState({ ...scoringState, decision: 'Line Kick' } as any);
                                } else {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', (scoringState as any).side, { reason: (scoringState as any).reason, decision: 'Line Kick' });
                                    setScoringState({ status: 'KICK_FLOW', side: (scoringState as any).side, type: 'Line Kick', points: 0 });
                                }
                            }}
                            label="LINE KICK"
                            selected={(scoringState.editingId ? (scoringState as any).decision : (scoringState as any).initialDecision) === 'Line Kick'}
                            variant="success"
                            className="h-16 bg-green-600/30 border-green-600/40 hover:bg-green-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.editingId) {
                                    setScoringState({ ...scoringState, decision: 'Scrum' } as any);
                                } else {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', (scoringState as any).side, { reason: (scoringState as any).reason, decision: 'Scrum' }).then(res => {
                                        setScoringState({ status: 'SCRUM_FLOW', side: (scoringState as any).side, reason: 'Penalty', isFromPenalty: true, pendingEventId: res.id });
                                    });
                                }
                            }}
                            label="SCRUM"
                            selected={(scoringState.editingId ? (scoringState as any).decision : (scoringState as any).initialDecision) === 'Scrum'}
                            variant="primary"
                            className="h-16 bg-amber-600/30 border-amber-600/40 hover:bg-amber-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.editingId) {
                                    setScoringState({ ...scoringState, decision: 'Tap n Go' } as any);
                                } else {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', (scoringState as any).side, { reason: (scoringState as any).reason, decision: 'Tap n Go' });
                                    setScoringState({ status: 'PLAYER_SELECTION', side: (scoringState as any).side, points: 0, type: 'Tap n Go' });
                                }
                            }}
                            label="TAP 'N GO"
                            selected={(scoringState.editingId ? (scoringState as any).decision : (scoringState as any).initialDecision) === 'Tap n Go'}
                            variant="primary"
                            className="h-16 bg-purple-600/30 border-purple-600/40 hover:bg-purple-600/50"
                        />
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t border-white/5" />
                </DialogContent>
            </Dialog>

            {/* Free Kick Decision Dialog */}
            <Dialog 
                open={scoringState.status === 'FREE_KICK_DECISION_SELECTION'} 
                onOpenChange={(open) => {
                    if (!open) {
                        const isDirty = (scoringState as any).decision !== (scoringState as any).initialDecision;
                        if (isDirty && scoringState.editingId) {
                            setShowDiscardConfirmation(true);
                            return;
                        }
                        setScoringState({ status: 'IDLE' });
                    }
                }}
            >
                <DialogContent hideCloseButton className="sm:max-w-lg bg-card border-border/50">
                    <DialogHeader className="relative pr-12">
                        <DialogTitle className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                            {scoringState.status === 'FREE_KICK_DECISION_SELECTION' && scoringState.editingId ? <Pencil className="h-5 w-5 text-primary" /> : null}
                            Decision
                        </DialogTitle>
                        <div className="absolute right-0 top-0 flex items-center gap-1">
                            {scoringState.editingId && (scoringState as any).decision !== (scoringState as any).initialDecision && (
                                <button 
                                    onClick={() => {
                                        handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', (scoringState as any).side, { reason: (scoringState as any).reason, decision: (scoringState as any).decision });
                                        setScoringState({ status: 'IDLE' });
                                    }}
                                    className="p-2 text-success hover:bg-success/10 rounded-full transition-colors"
                                    title="Save Changes"
                                >
                                    <Check className="w-6 h-6" />
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    const isDirty = (scoringState as any).decision !== (scoringState as any).initialDecision;
                                    if (isDirty && scoringState.editingId) {
                                        setShowDiscardConfirmation(true);
                                    } else {
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors"
                                title="Close"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2 py-4">
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.editingId) {
                                    setScoringState({ ...scoringState, decision: 'Line Kick' } as any);
                                } else {
                                    handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', (scoringState as any).side, { reason: (scoringState as any).reason, decision: 'Line Kick' });
                                    setScoringState({ status: 'KICK_FLOW', side: (scoringState as any).side, type: 'Line Kick', points: 0 });
                                }
                            }}
                            label="LINE KICK"
                            selected={(scoringState.editingId ? (scoringState as any).decision : (scoringState as any).initialDecision) === 'Line Kick'}
                            variant="primary"
                            className="h-16 bg-blue-600/30 border-blue-600/40 hover:bg-blue-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.editingId) {
                                    setScoringState({ ...scoringState, decision: 'Scrum' } as any);
                                } else {
                                    handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', (scoringState as any).side, { reason: (scoringState as any).reason, decision: 'Scrum' }).then(res => {
                                        setScoringState({ status: 'SCRUM_FLOW', side: (scoringState as any).side, reason: 'Free Kick', isFromPenalty: true, pendingEventId: res.id });
                                    });
                                }
                            }}
                            label="SCRUM"
                            selected={(scoringState.editingId ? (scoringState as any).decision : (scoringState as any).initialDecision) === 'Scrum'}
                            variant="primary"
                            className="h-16 bg-amber-600/30 border-amber-600/40 hover:bg-amber-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.editingId) {
                                    setScoringState({ ...scoringState, decision: `Tap n Go` } as any);
                                } else {
                                    handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', (scoringState as any).side, { reason: (scoringState as any).reason, decision: 'Tap n Go' });
                                    setScoringState({ status: 'PLAYER_SELECTION', side: (scoringState as any).side, points: 0, type: 'Tap n Go' });
                                }
                            }}
                            label="TAP 'N GO"
                            selected={(scoringState.editingId ? (scoringState as any).decision : (scoringState as any).initialDecision) === 'Tap n Go'}
                            variant="primary"
                            className="h-16 bg-purple-600/30 border-purple-600/40 hover:bg-purple-600/50"
                        />
                    </div>
                    <DialogFooter className="pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-2">
                        {!scoringState.editingId && (
                            <ScoringActionButton 
                                onClick={() => {
                                    if (scoringState.status === 'FREE_KICK_DECISION_SELECTION') {
                                        handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', scoringState.side, { reason: scoringState.reason });
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                label="SKIP DECISION"
                                variant="muted"
                                className="h-10 w-full"
                            />
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Scrum / Lineout Winner Dialog */}
            <Dialog 
                open={scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW'} 
                onOpenChange={(open) => {
                    if (!open) {
                        const isDirty = (scoringState as any).winnerSide !== (scoringState as any).initialWinnerSide;
                        if (isDirty && scoringState.editingId) {
                            setShowDiscardConfirmation(true);
                            return;
                        }
                        setScoringState({ status: 'IDLE' });
                    }
                }}
            >
                <DialogContent hideCloseButton className="sm:max-w-lg bg-card border-border/50">
                    <DialogHeader className="relative pr-12">
                        <DialogTitle className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                            {scoringState.editingId ? <Pencil className="h-5 w-5 text-primary" /> : null}
                             Winner
                        </DialogTitle>
                        <div className="absolute right-0 top-0 flex items-center gap-1">
                            {scoringState.editingId && (scoringState as any).winnerSide !== (scoringState as any).initialWinnerSide && (
                                <button 
                                    onClick={() => {
                                        const winnerSide = (scoringState as any).winnerSide;
                                        handleUpdateGameEvent(scoringState.editingId!, { 
                                            eventData: {
                                                winnerSide,
                                                winnerName: winnerSide === 'home' ? homeTeam?.name : (winnerSide === 'away' ? awayTeam?.name : undefined)
                                            }
                                        });
                                        setScoringState({ status: 'IDLE' });
                                    }}
                                    className="p-2 text-success hover:bg-success/10 rounded-full transition-colors"
                                    title="Save Changes"
                                >
                                    <Check className="w-6 h-6" />
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    const isDirty = (scoringState as any).winnerSide !== (scoringState as any).initialWinnerSide;
                                    if (isDirty && scoringState.editingId) {
                                        setShowDiscardConfirmation(true);
                                    } else {
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors"
                                title="Close"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-6">
                        <div className="flex flex-col gap-2">
                            <div className="text-[10px] font-black uppercase text-center text-blue-500 tracking-widest">{homeTeam?.name || 'Home Team'}</div>
                                <ScoringActionButton 
                                    onClick={() => {
                                        if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                                            if (scoringState.editingId) {
                                                setScoringState({ ...scoringState, winnerSide: 'home' } as any);
                                            } else {
                                                if ((scoringState as any).pendingEventId) {
                                                    handleUpdateGameEvent((scoringState as any).pendingEventId, { 
                                                        winnerSide: 'home',
                                                        winnerName: homeTeam?.name || 'Home'
                                                    });
                                                }
                                                setScoringState({ status: 'IDLE' });
                                            }
                                        }
                                    }}
                                    label="HOME WON"
                                    selected={(scoringState.editingId ? (scoringState as any).winnerSide : (scoringState as any).initialWinnerSide) === 'home'}
                                    variant="success"
                                    className="h-14 bg-blue-600/20 border-blue-600/40 hover:bg-blue-600/40"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <div className="text-[10px] font-black uppercase text-center text-red-500 tracking-widest">{awayTeam?.name || 'Away Team'}</div>
                                <ScoringActionButton 
                                    onClick={() => {
                                        if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                                            if (scoringState.editingId) {
                                                setScoringState({ ...scoringState, winnerSide: 'away' } as any);
                                            } else {
                                                if ((scoringState as any).pendingEventId) {
                                                    handleUpdateGameEvent((scoringState as any).pendingEventId, { 
                                                        winnerSide: 'away',
                                                        winnerName: awayTeam?.name || 'Away'
                                                    });
                                                }
                                                setScoringState({ status: 'IDLE' });
                                            }
                                        }
                                    }}
                                    label="AWAY WON"
                                    selected={(scoringState.editingId ? (scoringState as any).winnerSide : (scoringState as any).initialWinnerSide) === 'away'}
                                    variant="success"
                                    className="h-14 bg-red-600/20 border-red-600/40 hover:bg-red-600/40"
                                />
                        </div>
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t border-white/5">
                        {!scoringState.editingId && (
                            <ScoringActionButton 
                                onClick={() => {
                                    if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                label="SKIP WINNER"
                                variant="muted"
                                className="h-10 w-full"
                            />
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Kick Flow Dialog (Conversion, Penalty, Line Kick) */}
            <Dialog 
                open={scoringState.status === 'KICK_FLOW'} 
                onOpenChange={(open) => {
                    if (!open) {
                        const isDirty = (scoringState as any).playerId !== (scoringState as any).initialPlayerId || (scoringState as any).successful !== (scoringState as any).initialSuccessful;
                        if (isDirty && scoringState.editingId) {
                            setShowDiscardConfirmation(true);
                            return;
                        }
                        setScoringState({ status: 'IDLE' });
                    }
                }}
            >
                <DialogContent hideCloseButton className="sm:max-w-lg bg-card border-border/50 flex flex-col overflow-hidden">
                    <DialogHeader className="relative pr-12">
                        <DialogTitle className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                            {scoringState.status === 'KICK_FLOW' && scoringState.editingId ? <Pencil className="h-5 w-5 text-primary" /> : <UserPlus className="h-5 w-5 text-primary" />}
                            {scoringState.status === 'KICK_FLOW' && (scoringState.editingId ? `Edit ${scoringState.type}` : scoringState.type)}
                        </DialogTitle>
                        <div className="absolute right-0 top-0 flex items-center gap-1">
                            {(scoringState as any).playerId !== (scoringState as any).initialPlayerId || (scoringState as any).successful !== (scoringState as any).initialSuccessful ? (
                                scoringState.editingId && (
                                    <button 
                                        onClick={() => handleKickResult((scoringState as any).type, (scoringState as any).successful ? (scoringState as any).points : 0, !(scoringState as any).successful, (scoringState as any).side, scoringState.playerId, (scoringState as any).extraData)}
                                        className="p-2 text-success hover:bg-success/10 rounded-full transition-colors"
                                        title="Save Changes"
                                    >
                                        <Check className="w-6 h-6" />
                                    </button>
                                )
                            ) : null}
                            <button 
                                onClick={() => {
                                    const state = scoringState as any;
                                    const isDirty = (state.playerId !== state.initialPlayerId) || (state.successful !== state.initialSuccessful);
                                    if (isDirty && scoringState.editingId) {
                                        setShowDiscardConfirmation(true);
                                    } else {
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors"
                                title="Close"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                        {scoringState.status === 'KICK_FLOW' && (
                            <div className="space-y-6">
                                {/* Player Selection Section */}
                                <div className="space-y-4">
                                    <DialogSectionHeader label="Select Kicker" />
                                    <RosterGrid 
                                        roster={participant ? (rosters[participant.id] || []) : []}
                                        selectedPlayerId={scoringState.playerId}
                                        onSelect={(id) => setScoringState({ ...scoringState, playerId: id })}
                                    />
                                </div>

                                {/* Outcome Section */}
                                <div className="space-y-4 pt-6 border-t border-white/5">
                                    <DialogSectionHeader label="Outcome" />
                                    <div className="grid grid-cols-2 gap-4">
                                        <ScoringActionButton 
                                            onClick={() => {
                                                if (scoringState.editingId) {
                                                    setScoringState({ ...scoringState, successful: true } as any);
                                                } else {
                                                    handleKickResult((scoringState as any).type, (scoringState as any).points, false, (scoringState as any).side, scoringState.playerId, (scoringState as any).extraData);
                                                }
                                            }}
                                            label={(scoringState as any).type === 'Line Kick' ? 'OUT' : 'SUCCESSFUL'}
                                            selected={scoringState.editingId ? (scoringState as any).successful === true : (scoringState as any).initialSuccessful === true}
                                            variant="success"
                                            className="h-14"
                                        />
                                        <ScoringActionButton 
                                            onClick={() => {
                                                if (scoringState.editingId) {
                                                    setScoringState({ ...scoringState, successful: false } as any);
                                                } else {
                                                    handleKickResult((scoringState as any).type, 0, true, (scoringState as any).side, scoringState.playerId, (scoringState as any).extraData);
                                                }
                                            }}
                                            label="MISSED"
                                            selected={scoringState.editingId ? (scoringState as any).successful === false : (scoringState as any).initialSuccessful === false}
                                            variant="danger"
                                            className="h-14"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t border-white/5">
                        {!scoringState.editingId && (
                            scoringState.status === 'KICK_FLOW' && scoringState.type === 'Line Kick' && (
                                <ScoringActionButton 
                                    onClick={() => {
                                        handleAddGameEvent('GAME_EVENT', 'Line Kick', scoringState.side, { outcome: 'Skipped' }, scoringState.playerId);
                                        setScoringState({ status: 'IDLE' });
                                    }}
                                    label="SKIP KICK DETAILS"
                                    variant="muted"
                                    className="h-10 flex-1"
                                />
                            )
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Replacement Dialog (Dual Flow) */}
            <Dialog 
                open={scoringState.status === 'REPLACEMENT_OFF_SELECTION' || scoringState.status === 'REPLACEMENT_ON_SELECTION'} 
                onOpenChange={(open) => {
                    if (!open) {
                        const isDirty = (scoringState as any).playerOffId !== (scoringState as any).initialPlayerOffId || (scoringState as any).playerOnId !== (scoringState as any).initialPlayerOnId;
                        if (isDirty && scoringState.editingId) {
                            setShowDiscardConfirmation(true);
                            return;
                        }
                        setScoringState({ status: 'IDLE' });
                    }
                }}
            >
                <DialogContent hideCloseButton className="sm:max-w-lg bg-card border-border/50 flex flex-col overflow-hidden">
                    <DialogHeader className="relative pr-12">
                        <DialogTitle className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                            {scoringState.editingId ? <Pencil className="h-5 w-5 text-primary" /> : <UserPlus className="h-5 w-5 text-primary" />}
                            {scoringState.status === 'REPLACEMENT_OFF_SELECTION' ? 'Player Coming OFF' : 'Player Coming ON'}
                        </DialogTitle>
                        <div className="absolute right-0 top-0 flex items-center gap-1">
                            {scoringState.editingId && ((scoringState as any).playerOffId !== (scoringState as any).initialPlayerOffId || (scoringState as any).playerOnId !== (scoringState as any).initialPlayerOnId) && (
                                <button 
                                    onClick={() => {
                                        handleAddGameEvent('GAME_EVENT', 'Replacement', (scoringState as any).side, {
                                            playerOffId: (scoringState as any).playerOffId,
                                            playerOffName: store.orgProfiles.find(p => p.id === (scoringState as any).playerOffId)?.name,
                                            playerOnId: (scoringState as any).playerOnId,
                                            playerOnName: store.orgProfiles.find(p => p.id === (scoringState as any).playerOnId)?.name
                                        });
                                        setScoringState({ status: 'IDLE' });
                                    }}
                                    className="p-2 text-success hover:bg-success/10 rounded-full transition-colors"
                                    title="Save Changes"
                                >
                                    <Check className="w-6 h-6" />
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    const isDirty = (scoringState as any).playerOffId !== (scoringState as any).initialPlayerOffId || (scoringState as any).playerOnId !== (scoringState as any).initialPlayerOnId;
                                    if (isDirty && scoringState.editingId) {
                                        setShowDiscardConfirmation(true);
                                    } else {
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors"
                                title="Close"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                            <RosterGrid 
                                roster={participant ? (rosters[participant.id] || []) : []}
                                selectedPlayerId={scoringState.status === 'REPLACEMENT_OFF_SELECTION' ? (scoringState.editingId ? scoringState.playerOffId : undefined) : scoringState.playerOnId}
                                onSelect={(playerId) => {
                                    const profile = store.orgProfiles.find(p => p.id === playerId);
                                    if (scoringState.editingId) {
                                        if (scoringState.status === 'REPLACEMENT_OFF_SELECTION') {
                                            setScoringState({ ...scoringState, playerOffId: playerId } as any);
                                        } else {
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
                            />
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t border-white/5">
                        {!scoringState.editingId && (
                            <>
                                {scoringState.status === 'REPLACEMENT_ON_SELECTION' && (
                                    <ScoringActionButton 
                                        onClick={() => {
                                            handleAddGameEvent('GAME_EVENT', 'Replacement', (scoringState as any).side, {
                                                playerOffId: (scoringState as any).playerOffId,
                                                playerOffName: store.orgProfiles.find(p => p.id === (scoringState as any).playerOffId)?.name,
                                            });
                                            setScoringState({ status: 'IDLE' });
                                        }}
                                        label="SKIP ON"
                                        variant="muted"
                                        className="h-10 px-6"
                                    />
                                )}
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Standard Player Selection Dialog */}
            <Dialog 
                open={scoringState.status === 'PLAYER_SELECTION'} 
                onOpenChange={(open) => {
                    if (!open) {
                        const isDirty = (scoringState as any).playerId !== (scoringState as any).initialPlayerId;
                        if (isDirty && scoringState.editingId) {
                            setShowDiscardConfirmation(true);
                            return;
                        }
                        setScoringState({ status: 'IDLE' });
                    }
                }}
            >
                <DialogContent hideCloseButton className="sm:max-w-lg bg-card border-border/50 overflow-hidden">
                    <DialogHeader className="relative pr-12">
                        <DialogTitle className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                            {scoringState.status === 'PLAYER_SELECTION' && scoringState.editingId ? <Pencil className="h-5 w-5 text-primary" /> : <UserPlus className="h-5 w-5 text-primary" />}
                            {scoringState.status === 'PLAYER_SELECTION' && (() => {
                                if (scoringState.editingId) return scoringState.type;
                                if (scoringState.type === 'Tap n Go') return `Who took the Tap 'n Go?`;
                                return scoringState.isInfringer ? `Who committed the ${scoringState.type}?` : `Who scored the ${scoringState.type}?`;
                            })()}
                        </DialogTitle>
                        <div className="absolute right-0 top-0 flex items-center gap-1">
                            {scoringState.editingId && (scoringState as any).playerId !== (scoringState as any).initialPlayerId && (
                                <button 
                                    onClick={() => {
                                        handleAddGameEvent('GAME_EVENT', (scoringState as any).type, (scoringState as any).side, {}, scoringState.playerId);
                                        setScoringState({ status: 'IDLE' });
                                    }}
                                    className="p-2 text-success hover:bg-success/10 rounded-full transition-colors"
                                    title="Save Changes"
                                >
                                    <Check className="w-6 h-6" />
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    const isDirty = (scoringState as any).playerId !== (scoringState as any).initialPlayerId;
                                    if (isDirty && scoringState.editingId) {
                                        setShowDiscardConfirmation(true);
                                    } else {
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors"
                                title="Close"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </DialogHeader>
                    
                    <div className="py-2">
                        <div className="max-h-[50vh] overflow-y-auto pr-1.5 custom-scrollbar">
                            <RosterGrid 
                                roster={participant ? (rosters[participant.id] || []) : []}
                                selectedPlayerId={scoringState.playerId}
                                onSelect={(id) => {
                                    if (scoringState.editingId) {
                                        setScoringState({ ...scoringState, playerId: id } as any);
                                    } else {
                                        if (scoringState.status === 'PLAYER_SELECTION') {
                                            handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, {}, id);
                                            setScoringState({ status: 'IDLE' });
                                        }
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t border-white/5">
                        {!scoringState.editingId && (
                            <ScoringActionButton 
                                onClick={() => {
                                    if (scoringState.status === 'PLAYER_SELECTION') {
                                        handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side);
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                label="SKIP PLAYER"
                                variant="muted"
                                className="h-10 w-full"
                            />
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmationModal 
                isOpen={!!pendingDispute}
                onOpenChange={(open) => !open && resolveDispute(false)}
                title="Dispute Score"
                description={`Are you sure you want to dispute this ${pendingDispute?.type?.toUpperCase() || 'EVENT'}? This will reserve the score and initiate a 5-minute vote among all officials.`}
                confirmText="Yes, start dispute"
                onConfirm={() => resolveDispute(true)}
                variant="destructive"
            />

            <ConfirmationModal 
                isOpen={showDiscardConfirmation}
                onOpenChange={setShowDiscardConfirmation}
                title="Unsaved Changes"
                description="You have unsaved changes. Are you sure you want to discard them?"
                confirmText="Yes, discard"
                cancelText="No, stay"
                onConfirm={() => {
                    setShowDiscardConfirmation(false);
                    setScoringState({ status: 'IDLE' });
                }}
                variant="destructive"
            />
        </div>
    );
}
