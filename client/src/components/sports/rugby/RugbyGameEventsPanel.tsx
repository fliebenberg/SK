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

function ScoringActionButton({ label, onClick, disabled, className, title }: { label: string, onClick: () => void, disabled?: boolean, className?: string, title?: string }) {
    return (
        <button 
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={cn(
                "group relative flex flex-col items-center justify-center rounded-md transition-all duration-200 border shadow-sm active:scale-[0.95] disabled:opacity-30 disabled:pointer-events-none p-2",
                className
            )}
        >
            <span className="font-black uppercase tracking-tight text-foreground text-[10px] sm:text-[12px] leading-tight text-center">{label}</span>
        </button>
    );
}

export default function RugbyGameEventsPanel({ game }: { game: Game }) {
    const { 
        scoringState, 
        setScoringState, 
        rosters, 
        handleAddGameEvent, 
        handleKickResult 
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
            // Row 2
            { label: 'Kick-Off', title: 'Kick-off', action: () => handleAddGameEvent('GAME_EVENT', 'Kick-off', side) },
            { label: '22m Drop', title: '22m Dropout', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: '22m Dropout', reasons: RUGBY_EVENT_REASONS.DROPOUT_22M, nextStatus: 'IDLE' }) },
            { label: 'GL Drop', title: 'Goal-line Dropout', action: () => setScoringState({ status: 'EVENT_REASON_SELECTION', side, type: 'Goalline Dropout', reasons: RUGBY_EVENT_REASONS.DROPOUT_GOALLINE, nextStatus: 'IDLE' }) },
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
                        {scoringState.status === 'EVENT_REASON_SELECTION' && scoringState.reasons.map(reason => (
                            <ScoringActionButton 
                                key={reason}
                                onClick={() => {
                                    const next = scoringState.nextStatus;
                                    if (next === 'IDLE') {
                                        handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, { reason });
                                        setScoringState({ status: 'IDLE' });
                                    } else if (next === 'SCRUM_FLOW') {
                                        setScoringState({ status: 'SCRUM_FLOW', side: scoringState.side, reason });
                                    } else if (next === 'PENALTY_DECISION_SELECTION') {
                                        setScoringState({ status: 'PENALTY_DECISION_SELECTION', side: scoringState.side, reason });
                                    }
                                }}
                                label={reason}
                                className="h-12 bg-white/5 hover:bg-white/10 border-white/10"
                            />
                        ))}
                    </div>
                    <DialogFooter>
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'EVENT_REASON_SELECTION') {
                                    const next = scoringState.nextStatus;
                                    if (next === 'IDLE') {
                                        handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side);
                                        setScoringState({ status: 'IDLE' });
                                    } else if (next === 'SCRUM_FLOW') {
                                        setScoringState({ status: 'SCRUM_FLOW', side: scoringState.side });
                                    } else if (next === 'PENALTY_DECISION_SELECTION') {
                                        setScoringState({ status: 'PENALTY_DECISION_SELECTION', side: scoringState.side });
                                    }
                                }
                            }}
                            label="SKIP REASON"
                            className="h-10 px-4 bg-muted hover:bg-muted/80 text-foreground/70 font-black text-xs border-border/40 w-full"
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
                            className="h-16 bg-green-600/30 border-green-600/40 hover:bg-green-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'PENALTY_DECISION_SELECTION') {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Scrum' });
                                    setScoringState({ status: 'SCRUM_FLOW', side: scoringState.side, reason: 'Penalty', isFromPenalty: true });
                                }
                            }}
                            label="SCRUM"
                            className="h-16 bg-amber-600/30 border-amber-600/40 hover:bg-amber-600/50"
                        />
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'PENALTY_DECISION_SELECTION') {
                                    handleAddGameEvent('GAME_EVENT', 'Penalty Awarded', scoringState.side, { reason: scoringState.reason, decision: 'Tap n Go' });
                                    handleAddGameEvent('GAME_EVENT', 'Tap n Go', scoringState.side);
                                    setScoringState({ status: 'IDLE' });
                                }
                            }}
                            label="TAP 'N GO"
                            className="h-16 bg-purple-600/30 border-purple-600/40 hover:bg-purple-600/50"
                        />
                    </div>
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
                            <div className="text-[10px] font-black uppercase text-center text-blue-500 tracking-widest">Home Team</div>
                            <ScoringActionButton 
                                onClick={() => {
                                    if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                                        const type = scoringState.status === 'SCRUM_FLOW' ? 'Scrum' : 'Lineout';
                                        handleAddGameEvent('GAME_EVENT', type, scoringState.side, { 
                                            reason: scoringState.reason,
                                            winnerSide: 'home',
                                            winnerName: homeTeam?.name || 'Home'
                                        });
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                label="HOME WON"
                                className="h-20 bg-blue-600/20 border-blue-600/40 hover:bg-blue-600/40"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="text-[10px] font-black uppercase text-center text-red-500 tracking-widest">Away Team</div>
                            <ScoringActionButton 
                                onClick={() => {
                                    if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                                        const type = scoringState.status === 'SCRUM_FLOW' ? 'Scrum' : 'Lineout';
                                        handleAddGameEvent('GAME_EVENT', type, scoringState.side, { 
                                            reason: scoringState.reason,
                                            winnerSide: 'away',
                                            winnerName: awayTeam?.name || 'Away'
                                        });
                                        setScoringState({ status: 'IDLE' });
                                    }
                                }}
                                label="AWAY WON"
                                className="h-20 bg-red-600/20 border-red-600/40 hover:bg-red-600/40"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'SCRUM_FLOW' || scoringState.status === 'LINEOUT_FLOW') {
                                    const type = scoringState.status === 'SCRUM_FLOW' ? 'Scrum' : 'Lineout';
                                    handleAddGameEvent('GAME_EVENT', type, scoringState.side, { reason: scoringState.reason });
                                    setScoringState({ status: 'IDLE' });
                                }
                            }}
                            label="SKIP WINNER"
                            className="h-10 px-4 bg-muted hover:bg-muted/80 text-foreground/70 font-black text-xs border-border/40 w-full"
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
                                        <div className="text-xs font-black uppercase text-muted-foreground tracking-widest">Select Kicker</div>
                                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                            {(() => {
                                                const participant = scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1];
                                                const rawRoster = participant ? rosters[participant.id] : [];
                                                return [...rawRoster].sort((a, b) => (parseInt(a.position || '999') - parseInt(b.position || '999'))).map(item => {
                                                    const profile = store.orgProfiles.find(p => p.id === item.orgProfileId);
                                                    if (!profile) return null;
                                                    return (
                                                        <button
                                                            key={item.orgProfileId}
                                                            onClick={() => setScoringState({ ...scoringState, playerId: item.orgProfileId })}
                                                            className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group"
                                                        >
                                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted border border-border/50 flex items-center justify-center relative overflow-hidden">
                                                                <span className="text-primary font-black text-sm absolute inset-0 flex items-center justify-center group-hover:opacity-0">{item.position}</span>
                                                                {profile.image && <img src={profile.image} className="w-full h-full object-cover opacity-0 group-hover:opacity-100" />}
                                                            </div>
                                                            <span className="text-[8px] font-bold uppercase truncate w-full text-center">{profile.name.split(' ')[0]}</span>
                                                        </button>
                                                    );
                                                });
                                            })()}
                                        </div>
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
                                            className="h-8 px-4 text-[10px] bg-white/5 border-white/10"
                                        />
                                    </div>
                                )}

                                {/* Outcome Section */}
                                <div className="space-y-4 pt-6 border-t border-white/10">
                                    <div className="text-xs font-black uppercase text-muted-foreground tracking-widest">Outcome</div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <ScoringActionButton 
                                            onClick={() => handleKickResult(scoringState.type, scoringState.points, false, scoringState.side, scoringState.playerId, scoringState.extraData)}
                                            label={scoringState.type === 'Line Kick' ? 'OUT' : 'SUCCESSFUL'}
                                            className="h-24 bg-green-600/30 border-green-600/40 hover:bg-green-600/50 text-xl"
                                        />
                                        <ScoringActionButton 
                                            onClick={() => handleKickResult(scoringState.type, 0, true, scoringState.side, scoringState.playerId, scoringState.extraData)}
                                            label="MISSED"
                                            className="h-24 bg-red-600/30 border-red-600/40 hover:bg-red-600/50 text-xl"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
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
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                            {(() => {
                                if (scoringState.status !== 'REPLACEMENT_OFF_SELECTION' && scoringState.status !== 'REPLACEMENT_ON_SELECTION') return null;
                                const participant = scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1];
                                const rawRoster = participant ? rosters[participant.id] : [];
                                
                                // For "ON", we might want to prioritize reserves, but rugby subs can be anyone
                                return [...rawRoster].sort((a, b) => (parseInt(a.position || '999') - parseInt(b.position || '999'))).map(item => {
                                    const profile = store.orgProfiles.find(p => p.id === item.orgProfileId);
                                    if (!profile) return null;
                                    if (scoringState.status === 'REPLACEMENT_ON_SELECTION' && item.orgProfileId === scoringState.playerOffId) return null;

                                    return (
                                        <button
                                            key={item.orgProfileId}
                                            onClick={() => {
                                                if (scoringState.status === 'REPLACEMENT_OFF_SELECTION') {
                                                    setScoringState({ status: 'REPLACEMENT_ON_SELECTION', side: scoringState.side, playerOffId: item.orgProfileId });
                                                } else if (scoringState.status === 'REPLACEMENT_ON_SELECTION') {
                                                    handleAddGameEvent('GAME_EVENT', 'Replacement', scoringState.side, {
                                                        playerOffId: scoringState.playerOffId,
                                                        playerOffName: store.orgProfiles.find(p => p.id === scoringState.playerOffId)?.name,
                                                        playerOnId: item.orgProfileId,
                                                        playerOnName: profile.name
                                                    });
                                                    setScoringState({ status: 'IDLE' });
                                                }
                                            }}
                                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all group"
                                        >
                                            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-muted border border-border/50 flex items-center justify-center relative overflow-hidden group-hover:scale-105 transition-transform">
                                                <span className="text-primary font-black text-sm absolute inset-0 flex items-center justify-center group-hover:opacity-0">
                                                    {item.isReserve ? `R${item.position}` : item.position}
                                                </span>
                                                {profile.image && <img src={profile.image} className="w-full h-full object-cover opacity-0 group-hover:opacity-100" />}
                                            </div>
                                            <span className="text-[9px] font-bold uppercase truncate w-full text-center">{profile.name.split(' ')[0]}</span>
                                        </button>
                                    );
                                });
                            })()}
                        </div>
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
                            {scoringState.status === 'PLAYER_SELECTION' && (scoringState.isInfringer ? `Who committed the ${scoringState.type}?` : `Who scored the ${scoringState.type}?`)}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="py-2">
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-x-1 gap-y-2 sm:gap-x-1.5 sm:gap-y-3 max-h-[50vh] overflow-y-auto pr-1.5 custom-scrollbar">
                            {scoringState.status === 'PLAYER_SELECTION' && (() => {
                                const participant = scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1];
                                const rawRoster = participant ? rosters[participant.id] : [];

                                return [...rawRoster].sort((a, b) => (parseInt(a.position || '999') - parseInt(b.position || '999'))).map(item => {
                                    const profile = store.orgProfiles.find(p => p.id === item.orgProfileId);
                                    if (!profile) return null;
                                    
                                    return (
                                        <button
                                            key={item.orgProfileId}
                                            onClick={() => {
                                                if (scoringState.status === 'PLAYER_SELECTION') {
                                                    handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, {}, item.orgProfileId);
                                                    setScoringState({ status: 'IDLE' });
                                                }
                                            }}
                                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-primary/10 transition-all border border-transparent hover:border-primary/20 group relative"
                                        >
                                            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-muted border border-border/50 flex items-center justify-center overflow-hidden relative shadow-sm group-hover:scale-105 transition-all">
                                                <span className="text-primary text-xl sm:text-2xl font-black">{item.position}</span>
                                                {profile.image && <img src={profile.image} className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100" />}
                                            </div>
                                            <span className="text-[9px] font-bold uppercase truncate w-full text-center">{profile.name.split(' ')[0]}</span>
                                        </button>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
