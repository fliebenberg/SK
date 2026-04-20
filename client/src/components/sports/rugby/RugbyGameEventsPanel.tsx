import React from 'react';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { AlertTriangle, User, UserPlus } from 'lucide-react';
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
        handleKickResult 
    } = useRugbyScoring(game);
    const participant = scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1];

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
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
            >
                <DialogContent className="sm:max-w-md bg-card border-border/50">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            <AlertTriangle className="h-5 w-5" />
                            {scoringState.status === 'EVENT_REASON_SELECTION' && scoringState.type} Reason
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2 py-4">
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
                                                const next = scoringState.nextStatus;
                                                if (next === 'IDLE') {
                                                    handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, { reason });
                                                    setScoringState({ status: 'IDLE' });
                                                } else if (next === 'PLAYER_SELECTION') {
                                                    setScoringState({ status: 'PLAYER_SELECTION', side: scoringState.side, points: 0, type: scoringState.type, extraData: { reason } });
                                                } else if (next === 'SCRUM_FLOW' || next === 'LINEOUT_FLOW') {
                                                    handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, { reason }).then(res => {
                                                        setScoringState({ status: next, side: scoringState.side, reason, pendingEventId: res.id });
                                                    });
                                                } else if (next === 'PENALTY_DECISION_SELECTION') {
                                                    setScoringState({ status: 'PENALTY_DECISION_SELECTION', side: scoringState.side, reason });
                                                } else if (next === 'FREE_KICK_DECISION_SELECTION') {
                                                    setScoringState({ status: 'FREE_KICK_DECISION_SELECTION', side: scoringState.side, reason });
                                                }
                                            }}
                                            label={reason.includes(' - ') ? reason.split(' - ')[1] : reason}
                                            variant="muted"
                                            className="h-12"
                                        />
                                    </React.Fragment>
                                );
                            });
                        })()}
                    </div>
                    <DialogFooter className="pt-4 border-t border-white/5">
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
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Penalty Decision Dialog */}
            <Dialog 
                open={scoringState.status === 'PENALTY_DECISION_SELECTION'} 
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
            >
                <DialogContent className="sm:max-w-md bg-card border-border/50">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            What was the decision?
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2 py-4">
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'PENALTY_DECISION_SELECTION') {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Penalty Kick' });
                                    setScoringState({ status: 'KICK_FLOW', side: scoringState.side, type: 'Penalty Kick', points: 3 });
                                }
                            }}
                            label="PENALTY KICK"
                            variant="none"
                            className="h-16 bg-blue-600/30 border-blue-600/40 hover:bg-blue-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'PENALTY_DECISION_SELECTION') {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Line Kick' });
                                    setScoringState({ status: 'KICK_FLOW', side: scoringState.side, type: 'Line Kick', points: 0 });
                                }
                            }}
                            label="LINE KICK"
                            variant="none"
                            className="h-16 bg-green-600/30 border-green-600/40 hover:bg-green-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'PENALTY_DECISION_SELECTION') {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Scrum' }).then(res => {
                                        setScoringState({ status: 'SCRUM_FLOW', side: scoringState.side, reason: 'Penalty', isFromPenalty: true, pendingEventId: res.id });
                                    });
                                }
                            }}
                            label="SCRUM"
                            variant="none"
                            className="h-16 bg-amber-600/30 border-amber-600/40 hover:bg-amber-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'PENALTY_DECISION_SELECTION') {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Tap n Go' });
                                    setScoringState({ status: 'PLAYER_SELECTION', side: scoringState.side, points: 0, type: 'Tap n Go' });
                                }
                            }}
                            label="TAP 'N GO"
                            variant="none"
                            className="h-16 bg-purple-600/30 border-purple-600/40 hover:bg-purple-600/50"
                        />
                    </div>
                    <DialogFooter className="pt-4 border-t border-white/5">
                        <ScoringActionButton 
                            onClick={() => setScoringState({ status: 'IDLE' })}
                            label="CANCEL"
                            variant="ghost"
                            className="h-10 w-full"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Free Kick Decision Dialog */}
            <Dialog 
                open={scoringState.status === 'FREE_KICK_DECISION_SELECTION'} 
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
            >
                <DialogContent className="sm:max-w-md bg-card border-border/50">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            Free Kick Decision
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2 py-4">
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'FREE_KICK_DECISION_SELECTION') {
                                    handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Line Kick' });
                                    setScoringState({ status: 'KICK_FLOW', side: scoringState.side, type: 'Line Kick', points: 0 });
                                }
                            }}
                            label="LINE KICK"
                            variant="none"
                            className="h-16 bg-blue-600/30 border-blue-600/40 hover:bg-blue-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'FREE_KICK_DECISION_SELECTION') {
                                    handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Scrum' }).then(res => {
                                        setScoringState({ status: 'SCRUM_FLOW', side: scoringState.side, reason: 'Free Kick', isFromPenalty: true, pendingEventId: res.id });
                                    });
                                }
                            }}
                            label="SCRUM"
                            variant="none"
                            className="h-16 bg-amber-600/30 border-amber-600/40 hover:bg-amber-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'FREE_KICK_DECISION_SELECTION') {
                                    handleAddGameEvent('GAME_EVENT', 'Free Kick Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Tap n Go' });
                                    // Go to player selection for the Tap 'n Go
                                    setScoringState({ status: 'PLAYER_SELECTION', side: scoringState.side, points: 0, type: 'Tap n Go' });
                                }
                            }}
                            label="TAP 'N GO"
                            variant="none"
                            className="h-16 bg-purple-600/30 border-purple-600/40 hover:bg-purple-600/50"
                        />
                    </div>
                    <DialogFooter className="pt-4 border-t border-white/5 flex flex-col gap-2">
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
                        <ScoringActionButton 
                            onClick={() => setScoringState({ status: 'IDLE' })}
                            label="CANCEL"
                            variant="ghost"
                            className="h-10 w-full"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Scrum / Lineout Winner Dialog */}
            <Dialog 
                open={scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW'} 
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
            >
                <DialogContent className="sm:max-w-md bg-card border-border/50">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            Who won the {scoringState.status === 'SCRUM_FLOW' ? 'Scrum' : 'Lineout'}?
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-6">
                        <div className="flex flex-col gap-2">
                            <div className="text-[10px] font-black uppercase text-center text-blue-500 tracking-widest">{homeTeam?.name || 'Home Team'}</div>
                            <ScoringActionButton 
                                onClick={() => {
                                    if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                                        if (scoringState.pendingEventId) {
                                            handleUpdateGameEvent(scoringState.pendingEventId, { 
                                                winnerSide: 'home',
                                                winnerName: homeTeam?.name || 'Home'
                                            });
                                        }
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                label="HOME WON"
                                variant="none"
                                className="h-14 bg-blue-600/20 border-blue-600/40 hover:bg-blue-600/40"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="text-[10px] font-black uppercase text-center text-red-500 tracking-widest">{awayTeam?.name || 'Away Team'}</div>
                            <ScoringActionButton 
                                onClick={() => {
                                    if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                                        if (scoringState.pendingEventId) {
                                            handleUpdateGameEvent(scoringState.pendingEventId, { 
                                                winnerSide: 'away',
                                                winnerName: awayTeam?.name || 'Away'
                                            });
                                        }
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                label="AWAY WON"
                                variant="none"
                                className="h-14 bg-red-600/20 border-red-600/40 hover:bg-red-600/40"
                            />
                        </div>
                    </div>
                    <DialogFooter className="pt-4 border-t border-white/5">
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                                    // No update needed, the base event is already sent
                                    setScoringState({ status: 'IDLE' });
                                }
                            }}
                            label="SKIP WINNER"
                            variant="muted"
                            className="h-10 w-full"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Kick Flow Dialog (Conversion, Penalty, Line Kick) */}
            <Dialog 
                open={scoringState.status === 'KICK_FLOW'} 
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
            >
                <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            <UserPlus className="h-5 w-5" />
                            {scoringState.status === 'KICK_FLOW' && scoringState.type}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto py-4">
                        {scoringState.status === 'KICK_FLOW' && (
                            <div className="space-y-6">
                                {/* Player Selection Section */}
                                {!scoringState.playerId ? (
                                    <div className="space-y-4">
                                        <DialogSectionHeader label="Select Kicker" />
                                        <RosterGrid 
                                            roster={participant ? (rosters[participant.id] || []) : []}
                                            selectedPlayerId={scoringState.playerId}
                                            onSelect={(id) => setScoringState({ ...scoringState, playerId: id })}
                                        />
                                    </div>
                                ) : (
                                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                                                <User className="w-6 h-6 text-primary" />
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-black uppercase text-primary tracking-widest">Kicker Selected</div>
                                                <div className="font-black uppercase text-lg leading-none">
                                                    {store.orgProfiles.find(p => p.id === scoringState.playerId)?.name}
                                                </div>
                                            </div>
                                        </div>
                                        <ScoringActionButton 
                                            onClick={() => setScoringState({ ...scoringState, playerId: undefined })}
                                            label="CHANGE"
                                            variant="muted"
                                            className="h-8 px-4"
                                        />
                                    </div>
                                )}

                                {/* Outcome Section */}
                                <div className="space-y-4 pt-6 border-t border-white/5">
                                    <DialogSectionHeader label="Outcome" />
                                    <div className="grid grid-cols-2 gap-4">
                                        <ScoringActionButton 
                                            onClick={() => handleKickResult(scoringState.type, scoringState.points, false, scoringState.side, scoringState.playerId, scoringState.extraData)}
                                            label={scoringState.type === 'Line Kick' ? 'OUT' : 'SUCCESSFUL'}
                                            variant="success"
                                            className="h-14"
                                        />
                                        <ScoringActionButton 
                                            onClick={() => handleKickResult(scoringState.type, 0, true, scoringState.side, scoringState.playerId, scoringState.extraData)}
                                            label="MISSED"
                                            variant="danger"
                                            className="h-14"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter className="pt-4 border-t border-white/5">
                        {scoringState.status === 'KICK_FLOW' && scoringState.type === 'Line Kick' && (
                            <ScoringActionButton 
                                onClick={() => {
                                    handleAddGameEvent('GAME_EVENT', 'Line Kick', scoringState.side, { outcome: 'Skipped' }, scoringState.playerId);
                                    setScoringState({ status: 'IDLE' });
                                }}
                                label="SKIP KICK DETAILS"
                                variant="muted"
                                className="h-10 w-full"
                            />
                        )}
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'KICK_FLOW' && scoringState.type === 'Conversion') {
                                    handleKickResult(scoringState.type, 0, true, scoringState.side, scoringState.playerId, scoringState.extraData);
                                } else {
                                    setScoringState({ status: 'IDLE' });
                                }
                            }}
                            label="CANCEL"
                            variant="ghost"
                            className="h-10 w-full"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Replacement Dialog (Dual Flow) */}
            <Dialog 
                open={scoringState.status === 'REPLACEMENT_OFF_SELECTION' || scoringState.status === 'REPLACEMENT_ON_SELECTION'} 
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
            >
                <DialogContent className="sm:max-w-2xl bg-card border-border/50 max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            <UserPlus className="h-5 w-5" />
                            {scoringState.status === 'REPLACEMENT_OFF_SELECTION' ? 'Player Coming OFF' : 'Player Coming ON'}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto py-4">
                            <RosterGrid 
                                roster={participant ? (rosters[participant.id] || []) : []}
                                selectedPlayerId={scoringState.status === 'REPLACEMENT_OFF_SELECTION' ? undefined : scoringState.playerOffId}
                                onSelect={(playerId) => {
                                    const profile = store.orgProfiles.find(p => p.id === playerId);
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
                                }}
                            />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Standard Player Selection Dialog */}
            <Dialog 
                open={scoringState.status === 'PLAYER_SELECTION'} 
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
            >
                <DialogContent className="sm:max-w-lg bg-card border-border/50">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            <UserPlus className="h-5 w-5" />
                            {scoringState.status === 'PLAYER_SELECTION' && (() => {
                                if (scoringState.type === 'Tap n Go') return `Who took the Tap 'n Go?`;
                                return scoringState.isInfringer ? `Who committed the ${scoringState.type}?` : `Who scored the ${scoringState.type}?`;
                            })()}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="py-2">
                        <div className="max-h-[50vh] overflow-y-auto pr-1.5 custom-scrollbar">
                            <RosterGrid 
                                roster={participant ? (rosters[participant.id] || []) : []}
                                onSelect={(id) => {
                                    if (scoringState.status === 'PLAYER_SELECTION') {
                                        handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, {}, id);
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter className="pt-4 border-t border-white/5">
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
                        <ScoringActionButton 
                            onClick={() => setScoringState({ status: 'IDLE' })}
                            label="CANCEL"
                            variant="ghost"
                            className="h-10 w-full"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
