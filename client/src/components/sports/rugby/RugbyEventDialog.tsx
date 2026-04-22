import React from 'react';
import { Pencil, UserPlus, Check, X, AlertTriangle, User } from 'lucide-react';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from "@/components/ui/dialog";
import { ScoringActionButton, DialogSectionHeader, RosterGrid } from '../shared/ScoringActionButton';
import { ScoringFlowState } from './useRugbyScoring';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';

interface RugbyEventDialogProps {
    state: ScoringFlowState;
    rosters: { [participantId: string]: any[] };
    game: Game;
    onSetState: (state: any) => void;
    onSelectPlayer: (id?: string) => void;
    onSave: () => void;
    onClose: () => void;
    onRemove: (eventId: string, type: string, side: 'home' | 'away' | null) => void;
    // Contextual actions
    onPenaltyTry?: (side: 'home' | 'away') => void;
    onSkip?: () => void;
    onAddGameEvent: (type: string, subType: string, side: 'home' | 'away' | null, extraData?: any, actorId?: string) => Promise<any>;
    onKickResult: (type: any, points: number, missed: boolean, side: any, playerId: any, extraData: any) => void;
    onUpdateGameEvent: (eventId: string, eventData: any) => void;
    // Dispute props
    pendingDispute: any;
    resolveDispute: (confirmed: boolean) => void;
}

export function RugbyEventDialog({ 
    state, 
    rosters, 
    game, 
    onSetState,
    onSelectPlayer, 
    onSave, 
    onClose, 
    onRemove,
    onPenaltyTry,
    onSkip,
    onAddGameEvent,
    onKickResult,
    onUpdateGameEvent,
    pendingDispute,
    resolveDispute
}: RugbyEventDialogProps) {
    if (state.status === 'IDLE') return null;

    const editingId = (state as any).editingId;
    const side = (state as any).side;
    const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
    const teamId = side === 'home' ? game.participants?.[0]?.teamId : game.participants?.[1]?.teamId;
    const team = teamId ? store.getTeam(teamId) : null;
    
    // Determine title and icon
    let title = 'Select Action';
    if (state.status === 'PLAYER_SELECTION') {
        if (editingId) title = state.type;
        else if (state.type === 'Tap n Go') title = `Who took the Tap 'n Go?`;
        else title = state.isInfringer ? `Who committed the ${state.type}?` : `Who scored the ${state.type}?`;
    } else if (state.status === 'KICK_FLOW') {
        title = editingId ? `Edit ${state.type}` : state.type;
    } else if (state.status === 'EVENT_REASON_SELECTION') {
        title = editingId ? `Edit ${state.type} Reason` : `${state.type} Reason`;
    } else if (state.status === 'PENALTY_DECISION_SELECTION' || state.status === 'FREE_KICK_DECISION_SELECTION') {
        title = 'Select Decision';
    } else if (state.status === 'SCRUM_FLOW' || state.status === 'LINEOUT_FLOW') {
        title = 'Select Winner';
    } else if (state.status === 'REPLACEMENT_OFF_SELECTION') {
        title = 'Player Coming OFF';
    } else if (state.status === 'REPLACEMENT_ON_SELECTION') {
        title = 'Player Coming ON';
    }

    const isDirty = (() => {
        const s = state as any;
        if (!editingId) return false;
        return (s.playerId !== s.initialPlayerId) || 
               (s.successful !== s.initialSuccessful) ||
               (s.reason !== s.initialReason) ||
               (s.decision !== s.initialDecision) ||
               (s.winnerSide !== s.initialWinnerSide) ||
               (s.playerOffId !== s.initialPlayerOffId) ||
               (s.playerOnId !== s.initialPlayerOnId);
    })();

    const handleInternalSave = () => {
        if (!editingId) return;
        onSave();
    };

    const isConversion = state.status === 'KICK_FLOW' && state.type === 'Conversion';

    return (
        <>
            <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent hideCloseButton className="sm:max-w-lg bg-card border-border/50 flex flex-col overflow-hidden max-h-[90vh]">
                <DialogHeader className="relative pr-12 shrink-0">
                    <DialogTitle className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                        {editingId ? <Pencil className="h-5 w-5 text-primary" /> : (state.status === 'EVENT_REASON_SELECTION' ? <AlertTriangle className="h-5 w-5 text-primary" /> : <UserPlus className="h-5 w-5 text-primary" />)}
                        {title}
                    </DialogTitle>
                    <div className="absolute right-0 top-0 flex items-center gap-1">
                        {editingId && isDirty && (
                            <button 
                                onClick={handleInternalSave}
                                className="p-2 text-success hover:bg-success/10 rounded-full transition-colors"
                                title="Save Changes"
                            >
                                <Check className="w-6 h-6" />
                            </button>
                        )}
                        <button 
                            onClick={onClose}
                            className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors"
                            title="Close"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4 px-1 custom-scrollbar">
                    {/* Content areas based on status */}
                    <div className="space-y-6">
                        
                        {/* Reason Selection */}
                        {state.status === 'EVENT_REASON_SELECTION' && (
                            <div className="grid grid-cols-2 gap-2">
                                {(() => {
                                    let lastCategory = '';
                                    return state.reasons.map((reason) => {
                                        let category = '';
                                        if (reason.startsWith('Scrum -')) category = 'SCRUM';
                                        else if (reason.startsWith('Lineout -')) category = 'LINEOUT';
                                        else if (state.type === 'Free Kick Awarded') category = 'OTHER';

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
                                                        if (editingId) {
                                                            onSetState({ ...state, reason });
                                                        } else {
                                                            const next = state.nextStatus;
                                                            if (next === 'IDLE') {
                                                                onAddGameEvent('GAME_EVENT', state.type, side, { reason });
                                                                onClose();
                                                            } else if (next === 'PLAYER_SELECTION') {
                                                                onSetState({ status: 'PLAYER_SELECTION', side, points: 0, type: state.type, extraData: { reason } });
                                                            } else if (next === 'SCRUM_FLOW' || next === 'LINEOUT_FLOW') {
                                                                onAddGameEvent('GAME_EVENT', state.type, side, { reason }).then(res => {
                                                                    onSetState({ status: next, side, reason, pendingEventId: res.id });
                                                                });
                                                            } else if (next === 'PENALTY_DECISION_SELECTION') {
                                                                onSetState({ status: 'PENALTY_DECISION_SELECTION', side, reason });
                                                            } else if (next === 'FREE_KICK_DECISION_SELECTION') {
                                                                onSetState({ status: 'FREE_KICK_DECISION_SELECTION', side, reason });
                                                            }
                                                        }
                                                    }}
                                                    label={reason.includes(' - ') ? reason.split(' - ')[1] : reason}
                                                    selected={(editingId ? (state as any).reason : (state as any).initialReason) === reason}
                                                    variant="primary"
                                                    className="h-12"
                                                />
                                            </React.Fragment>
                                        );
                                    });
                                })()}
                            </div>
                        )}

                        {/* Penalty/Free Kick Decision */}
                        {(state.status === 'PENALTY_DECISION_SELECTION' || state.status === 'FREE_KICK_DECISION_SELECTION') && (
                            <div className="grid grid-cols-2 gap-2">
                                {state.status === 'PENALTY_DECISION_SELECTION' && (
                                    <>
                                        <ScoringActionButton 
                                            onClick={() => editingId ? onSetState({ ...state, decision: 'Penalty Kick' }) : (onAddGameEvent('GAME_EVENT', 'Penalty Awarded', side, { reason: state.reason, decision: 'Penalty Kick' }), onSetState({ status: 'KICK_FLOW', side, type: 'Penalty Kick', points: 3 }))}
                                            label="PENALTY KICK"
                                            selected={(editingId ? (state as any).decision : (state as any).initialDecision) === 'Penalty Kick'}
                                            variant="primary"
                                            className="h-16 bg-blue-600/30 border-blue-600/40 hover:bg-blue-600/50"
                                        />
                                        <ScoringActionButton 
                                            onClick={() => editingId ? onSetState({ ...state, decision: 'Line Kick' }) : (onAddGameEvent('GAME_EVENT', 'Penalty Awarded', side, { reason: state.reason, decision: 'Line Kick' }), onSetState({ status: 'KICK_FLOW', side, type: 'Line Kick', points: 0 }))}
                                            label="LINE KICK"
                                            selected={(editingId ? (state as any).decision : (state as any).initialDecision) === 'Line Kick'}
                                            variant="success"
                                            className="h-16 bg-green-600/30 border-green-600/40 hover:bg-green-600/50"
                                        />
                                        <ScoringActionButton 
                                            onClick={() => editingId ? onSetState({ ...state, decision: 'Scrum' }) : (onAddGameEvent('GAME_EVENT', 'Penalty Awarded', side, { reason: state.reason, decision: 'Scrum' }).then(res => onSetState({ status: 'SCRUM_FLOW', side, reason: 'Penalty', isFromPenalty: true, pendingEventId: res.id })))}
                                            label="SCRUM"
                                            selected={(editingId ? (state as any).decision : (state as any).initialDecision) === 'Scrum'}
                                            variant="primary"
                                            className="h-16 bg-amber-600/30 border-amber-600/40 hover:bg-amber-600/50"
                                        />
                                        <ScoringActionButton 
                                            onClick={() => editingId ? onSetState({ ...state, decision: 'Tap n Go' }) : (onAddGameEvent('GAME_EVENT', 'Penalty Awarded', side, { reason: state.reason, decision: 'Tap n Go' }), onSetState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Tap n Go' }))}
                                            label="TAP 'N GO"
                                            selected={(editingId ? (state as any).decision : (state as any).initialDecision) === 'Tap n Go'}
                                            variant="primary"
                                            className="h-16 bg-purple-600/30 border-purple-600/40 hover:bg-purple-600/50"
                                        />
                                    </>
                                )}
                                {state.status === 'FREE_KICK_DECISION_SELECTION' && (
                                    <>
                                        <ScoringActionButton 
                                            onClick={() => editingId ? onSetState({ ...state, decision: 'Line Kick' }) : (onAddGameEvent('GAME_EVENT', 'Free Kick Awarded', side, { reason: state.reason, decision: 'Line Kick' }), onSetState({ status: 'KICK_FLOW', side, type: 'Line Kick', points: 0 }))}
                                            label="LINE KICK"
                                            selected={(editingId ? (state as any).decision : (state as any).initialDecision) === 'Line Kick'}
                                            variant="primary"
                                            className="h-16 bg-blue-600/30 border-blue-600/40 hover:bg-blue-600/50"
                                        />
                                        <ScoringActionButton 
                                            onClick={() => editingId ? onSetState({ ...state, decision: 'Scrum' }) : (onAddGameEvent('GAME_EVENT', 'Free Kick Awarded', side, { reason: state.reason, decision: 'Scrum' }).then(res => onSetState({ status: 'SCRUM_FLOW', side, reason: 'Free Kick', isFromPenalty: true, pendingEventId: res.id })))}
                                            label="SCRUM"
                                            selected={(editingId ? (state as any).decision : (state as any).initialDecision) === 'Scrum'}
                                            variant="primary"
                                            className="h-16 bg-amber-600/30 border-amber-600/40 hover:bg-amber-600/50"
                                        />
                                        <ScoringActionButton 
                                            onClick={() => editingId ? onSetState({ ...state, decision: 'Tap n Go' }) : (onAddGameEvent('GAME_EVENT', 'Free Kick Awarded', side, { reason: state.reason, decision: 'Tap n Go' }), onSetState({ status: 'PLAYER_SELECTION', side, points: 0, type: 'Tap n Go' }))}
                                            label="TAP 'N GO"
                                            selected={(editingId ? (state as any).decision : (state as any).initialDecision) === 'Tap n Go'}
                                            variant="primary"
                                            className="h-16 bg-purple-600/30 border-purple-600/40 hover:bg-purple-600/50"
                                        />
                                    </>
                                )}
                            </div>
                        )}

                        {/* Winner Selection (Scrum/Lineout) */}
                        {(state.status === 'SCRUM_FLOW' || state.status === 'LINEOUT_FLOW') && (
                            <div className="grid grid-cols-2 gap-4 py-2">
                                {game.participants?.slice(0, 2).map((p, idx) => {
                                    const pSide = idx === 0 ? 'home' : 'away';
                                    const pTeamId = p.teamId;
                                    const pTeam = pTeamId ? store.getTeam(pTeamId) : null;
                                    const isSelected = (editingId ? (state as any).winnerSide : (state as any).initialWinnerSide) === pSide;
                                    
                                    return (
                                        <div key={pSide} className="flex flex-col gap-2">
                                            <div className={cn("text-[10px] font-black uppercase text-center tracking-widest", idx === 0 ? "text-blue-500" : "text-red-500")}>
                                                {pTeam?.name || (idx === 0 ? 'Home' : 'Away')}
                                            </div>
                                            <ScoringActionButton 
                                                onClick={() => {
                                                    if (editingId) {
                                                        onSetState({ ...state, winnerSide: pSide });
                                                    } else {
                                                        if (state.pendingEventId) {
                                                            onUpdateGameEvent(state.pendingEventId, { 
                                                                winnerSide: pSide,
                                                                winnerName: pTeam?.name || (idx === 0 ? 'Home' : 'Away')
                                                            });
                                                        }
                                                        onClose();
                                                    }
                                                }}
                                                label={`${pSide.toUpperCase()} WON`}
                                                selected={isSelected}
                                                variant="success"
                                                className={cn("h-14", idx === 0 ? "bg-blue-600/20 border-blue-600/40 hover:bg-blue-600/40" : "bg-red-600/20 border-red-600/40 hover:bg-red-600/40")}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Player Selection (Roster Grid) */}
                        {(state.status === 'PLAYER_SELECTION' || state.status === 'KICK_FLOW' || state.status === 'REPLACEMENT_OFF_SELECTION' || state.status === 'REPLACEMENT_ON_SELECTION') && (
                            <div className="space-y-4">
                                <DialogSectionHeader label={
                                    state.status === 'KICK_FLOW' ? 'Select Kicker' : 
                                    state.status === 'REPLACEMENT_OFF_SELECTION' ? 'Player Coming OFF' :
                                    state.status === 'REPLACEMENT_ON_SELECTION' ? 'Player Coming ON' :
                                    'Select Player'
                                } />
                                <div className="max-h-[40vh] overflow-y-auto pr-1.5 custom-scrollbar">
                                    <RosterGrid 
                                        roster={participant ? (rosters[participant.id] || []) : []}
                                        selectedPlayerId={
                                            state.status === 'REPLACEMENT_OFF_SELECTION' ? (editingId ? state.playerOffId : undefined) :
                                            state.status === 'REPLACEMENT_ON_SELECTION' ? state.playerOnId :
                                            state.playerId
                                        }
                                        onSelect={(id) => {
                                            if (state.status === 'REPLACEMENT_OFF_SELECTION') {
                                                if (editingId) onSetState({ ...state, playerOffId: id });
                                                else onSetState({ status: 'REPLACEMENT_ON_SELECTION', side, playerOffId: id });
                                            } else if (state.status === 'REPLACEMENT_ON_SELECTION') {
                                                if (editingId) onSetState({ ...state, playerOnId: id });
                                                else {
                                                    onAddGameEvent('GAME_EVENT', 'Replacement', side, {
                                                        playerOffId: state.playerOffId,
                                                        playerOffName: store.orgProfiles.find(p => p.id === state.playerOffId)?.name,
                                                        playerOnId: id,
                                                        playerOnName: store.orgProfiles.find(p => p.id === id)?.name
                                                    });
                                                    onClose();
                                                }
                                            } else {
                                                onSelectPlayer(id);
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Outcome Section (for Kicks) */}
                        {state.status === 'KICK_FLOW' && (
                            <div className="space-y-4 pt-6 border-t border-white/5">
                                <DialogSectionHeader label="Outcome" />
                                <div className="grid grid-cols-2 gap-4">
                                    <ScoringActionButton 
                                        onClick={() => {
                                            if (editingId) {
                                                onSetState({ ...state, successful: true });
                                            } else {
                                                onKickResult(state.type, (state as any).points, false, side, state.playerId, state.extraData);
                                            }
                                        }}
                                        label={state.type === 'Line Kick' ? 'OUT' : 'SUCCESSFUL'}
                                        selected={editingId ? (state as any).successful === true : (state as any).originalSuccessful === true}
                                        variant="success"
                                        className="h-14"
                                    />
                                    <ScoringActionButton 
                                        onClick={() => {
                                            if (editingId) {
                                                onSetState({ ...state, successful: false });
                                            } else {
                                                onKickResult(state.type, 0, true, side, state.playerId, state.extraData);
                                            }
                                        }}
                                        label="MISSED"
                                        selected={editingId ? (state as any).successful === false : (state as any).originalSuccessful === false}
                                        variant="danger"
                                        className="h-14"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-2 shrink-0">
                    <div className="flex flex-col sm:flex-row gap-2 w-full">
                        {editingId ? (
                            !isConversion && (
                                <ScoringActionButton 
                                    onClick={() => onRemove(editingId, (state as any).type || (state as any).subType || state.status, side)}
                                    label={`REMOVE ${(state as any).type?.toUpperCase() || (state as any).subType?.toUpperCase() || 'EVENT'}`}
                                    variant="danger"
                                    className="flex-1 h-10"
                                />
                            )
                        ) : (
                            <>
                                {(state.status === 'PLAYER_SELECTION' || state.status === 'KICK_FLOW' || state.status === 'EVENT_REASON_SELECTION' || state.status === 'FREE_KICK_DECISION_SELECTION' || state.status === 'SCRUM_FLOW' || state.status === 'LINEOUT_FLOW' || state.status === 'REPLACEMENT_ON_SELECTION') && (
                                    <ScoringActionButton 
                                        onClick={() => {
                                            if (state.status === 'PLAYER_SELECTION') onSelectPlayer();
                                            else if (state.status === 'KICK_FLOW' && state.type === 'Line Kick') {
                                                 onAddGameEvent('GAME_EVENT', 'Line Kick', side, { outcome: 'Skipped' }, (state as any).playerId);
                                                 onClose();
                                            } else if (state.status === 'EVENT_REASON_SELECTION') {
                                                 const next = state.nextStatus;
                                                 if (next === 'IDLE') {
                                                     onAddGameEvent('GAME_EVENT', state.type, side);
                                                     onClose();
                                                 } else if (next === 'PLAYER_SELECTION') {
                                                     onSetState({ status: 'PLAYER_SELECTION', side, points: 0, type: state.type });
                                                 } else if (next === 'SCRUM_FLOW' || next === 'LINEOUT_FLOW') {
                                                     onAddGameEvent('GAME_EVENT', state.type, side).then(res => onSetState({ status: next, side, pendingEventId: res.id }));
                                                 } else if (next === 'PENALTY_DECISION_SELECTION') {
                                                     onSetState({ status: 'PENALTY_DECISION_SELECTION', side });
                                                 } else if (next === 'FREE_KICK_DECISION_SELECTION') {
                                                     onSetState({ status: 'FREE_KICK_DECISION_SELECTION', side });
                                                 }
                                            } else if (state.status === 'FREE_KICK_DECISION_SELECTION') {
                                                 onAddGameEvent('GAME_EVENT', 'Free Kick Awarded', side, { reason: (state as any).reason });
                                                 onClose();
                                            } else if (state.status === 'SCRUM_FLOW' || state.status === 'LINEOUT_FLOW') {
                                                 onClose();
                                            } else if (state.status === 'REPLACEMENT_ON_SELECTION') {
                                                 onAddGameEvent('GAME_EVENT', 'Replacement', side, { playerOffId: state.playerOffId, playerOffName: store.orgProfiles.find(p => p.id === state.playerOffId)?.name });
                                                 onClose();
                                            }
                                        }}
                                        label={state.status === 'REPLACEMENT_ON_SELECTION' ? 'SKIP ON' : (state.status === 'EVENT_REASON_SELECTION' ? 'SKIP REASON' : (state.status === 'FREE_KICK_DECISION_SELECTION' ? 'SKIP DECISION' : (state.status === 'SCRUM_FLOW' || state.status === 'LINEOUT_FLOW' ? 'SKIP WINNER' : 'SKIP PLAYER')))}
                                        variant="muted"
                                        className="flex-1 h-10"
                                    />
                                )}
                                {state.status === 'PLAYER_SELECTION' && state.type === 'Try' && onPenaltyTry && (
                                    <ScoringActionButton 
                                        onClick={() => onPenaltyTry(side)}
                                        label="PENALTY TRY"
                                        variant="danger"
                                        className="flex-1 h-10"
                                    />
                                )}
                            </>
                        )}
                    </div>
                </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmationModal 
                isOpen={!!pendingDispute}
                onOpenChange={(open) => !open && resolveDispute(false)}
                title={pendingDispute?.isRemoval ? "Dispute Event Removal" : "Dispute Event Change"}
                description={
                    pendingDispute?.isRemoval
                        ? `Are you sure you want to dispute and REMOVE this ${pendingDispute?.type?.toUpperCase() || 'EVENT'}? This will initiate a 5-minute vote among all officials.`
                        : `Are you sure you want to dispute this ${pendingDispute?.type?.toUpperCase() || 'EVENT'}? This will reserve the score/outcome and initiate a 5-minute vote among all officials.`
                }
                confirmText={pendingDispute?.isRemoval ? "Yes, start removal dispute" : "Yes, start dispute"}
                onConfirm={() => resolveDispute(true)}
                variant="destructive"
            />
        </>
    );
}
