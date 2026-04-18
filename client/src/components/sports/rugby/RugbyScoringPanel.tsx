import React, { useState, useEffect } from 'react';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { OrgLogo } from '@/components/ui/OrgLogo';
import { Trophy, AlertTriangle, User, UserPlus } from 'lucide-react';
import { useGameTimer } from '@/hooks/useGameTimer';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

function ScoringActionButton({ label, points, onClick, disabled, className, title }: { label: string, points?: number, onClick: () => void, disabled?: boolean, className?: string, title?: string }) {
    return (
        <button 
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={cn(
                "group relative flex flex-col items-center justify-center rounded-md transition-all duration-200 border shadow-sm active:scale-[0.95] disabled:opacity-30 disabled:pointer-events-none",
                className
            )}
        >
            <span className="font-black uppercase tracking-tight text-foreground text-[10.5px] sm:text-[13.5px] leading-none">{label}</span>
        </button>
    );
}

type ScoringFlowState = {
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
};

export default function RugbyScoringPanel({ game }: { game: Game }) {
    const [isFinalScoreOpen, setIsFinalScoreOpen] = useState(false);
    const [finalScores, setFinalScores] = useState<{ [key: string]: string }>({});
    const [isSaving, setIsSaving] = useState(false);
    const [scoringState, setScoringState] = useState<ScoringFlowState>({ status: 'IDLE' });
    const [rosters, setRosters] = useState<{ [participantId: string]: any[] }>({});

    useEffect(() => {
        game.participants?.forEach(p => {
            store.fetchGameRoster(p.id).then(roster => {
                setRosters(prev => ({ ...prev, [p.id]: roster }));
            });
        });
    }, [game.id, game.participants]);

    const { currentMS } = useGameTimer(game.liveState?.clock, game.startTime, game.finishTime);
    const periodLabel = game.liveState?.periodLabel || '1st Period';

    // ------------------------------------------------------------------------
    // Derived Global State for Active Conversions
    // ------------------------------------------------------------------------
    const gameEvents = store.gameEvents.filter(e => e.gameId === game.id);
    const mostRecentScore = gameEvents
        .filter(e => e.type === 'SCORE' && (e.eventData?.pointsDelta ?? 0) > 0)
        .sort((a, b) => {
            if (a.sequence !== undefined && b.sequence !== undefined) {
                return b.sequence - a.sequence;
            }
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        })[0];

    let pendingConversionSide: 'home' | 'away' | null = null;
    let pendingTryEventId: string | null = null;

    if (mostRecentScore && mostRecentScore.subType === 'Try') {
        const hasLinkedConversion = gameEvents.some(e => e.eventData?.linkedEventId === mostRecentScore.id);
        if (!hasLinkedConversion) {
            pendingTryEventId = mostRecentScore.id;
            pendingConversionSide = mostRecentScore.gameParticipantId === game.participants?.[0]?.id ? 'home' : 'away';
        }
    }
    // ------------------------------------------------------------------------

    const handleScore = async (points: number, side: 'home' | 'away', type: string, extraData?: any, playerId?: string) => {
        const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
        if (!participant) return;

        const team = participant.teamId ? store.getTeam(participant.teamId) : null;
        const initiatorOrgProfileId = store.getOrgProfileId(team?.orgId || '');

        return store.addGameEvent({
            gameId: game.id,
            initiatorOrgProfileId,
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

    const handleTryClick = (side: 'home' | 'away') => {
        setScoringState({ status: 'TRY_TYPE_SELECTION', side });
    };

    const handleNormalTry = async (side: 'home' | 'away') => {
        try {
            const handled = await startScoringFlow(5, side, 'Try');
            if (!handled) setScoringState({ status: 'IDLE' });
        } catch (e) {
            console.error(e);
            setScoringState({ status: 'IDLE' });
        }
    };

    const handlePenaltyTry = async (side: 'home' | 'away') => {
        await handleScore(7, side, 'Penalty Try');
        setScoringState({ status: 'IDLE' });
    };

    const handleConversion = async (points: number, isMissed: boolean) => {
        if (!pendingTryEventId || !pendingConversionSide) return;
        
        try {
            if (!isMissed) {
                const handled = await startScoringFlow(points, pendingConversionSide, 'Conversion', {
                    linkedEventId: pendingTryEventId,
                    successful: true
                });
                if (!handled) setScoringState({ status: 'IDLE' });
            } else {
                await handleScore(points, pendingConversionSide, 'Conversion', {
                    linkedEventId: pendingTryEventId,
                    successful: false
                });
                setScoringState({ status: 'IDLE' });
            }
        } catch (e) {
            console.error(e);
            setScoringState({ status: 'IDLE' });
        }
    };

    const handleUndoTry = async () => {
        if (!pendingTryEventId || !pendingConversionSide) return;
        
        const participant = pendingConversionSide === 'home' ? game.participants?.[0] : game.participants?.[1];
        const team = participant?.teamId ? store.getTeam(participant.teamId) : null;
        const initiatorOrgProfileId = store.getOrgProfileId(team?.orgId || '');
        
        try {
            await store.undoGameEvent(game.id, pendingTryEventId, initiatorOrgProfileId || null);
        } catch (e) {
            console.error('Failed to undo try', e);
        }
        setScoringState({ status: 'IDLE' });
    };

    const handleFinalScoreSubmit = async () => {
        if (!game.participants) return;
        setIsSaving(true);
        try {
            const scores: { [key: string]: number } = {};
            game.participants.forEach(p => {
                scores[p.id] = parseInt(finalScores[p.id] || "0", 10);
            });
            await store.updateScore(game.id, scores);
            
            // For final score, use the first participant's org (or tournament org)
            const firstParticipant = game.participants?.[0];
            const firstTeam = firstParticipant?.teamId ? store.getTeam(firstParticipant.teamId) : null;
            const initiatorOrgProfileId = store.getOrgProfileId(firstTeam?.orgId || '');

            store.addGameEvent({
                gameId: game.id,
                initiatorOrgProfileId,
                type: 'SCORE',
                subType: 'Final Score',
                eventData: { 
                    scores, 
                    reason: 'Manual Final Score',
                    elapsedMS: currentMS,
                    period: periodLabel
                }
            });
            
            setIsFinalScoreOpen(false);
            toast({ title: "Score Updated", description: "The final score has been manually set." });
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Failed to update score", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const isScheduled = game.status === 'Scheduled';
    const isFinished = game.status === 'Finished';
    const isScoringDisabled = isScheduled;

    const rugbyScoreTypes = [
        { label: 'Try', points: 5, glow: '#eab308' }, // yellow-500
        { label: 'Penalty', points: 3, glow: '#f97316' }, // orange-500
        { label: 'Drop Goal', points: 3, glow: '#f97316' }, // orange-500
    ];

    const renderActionButtons = (side: 'home' | 'away') => {
        const isLocallyActive = scoringState.status !== 'IDLE' && scoringState.side === side;
        const isPendingConversionHere = pendingConversionSide === side;
        const isSomeSidePendingConversion = pendingConversionSide !== null;
        const org = side === 'home' ? homeOrg : awayOrg;
        const team = side === 'home' ? homeTeam : awayTeam;
        
        const teamColorStr = side === 'home' ? 'blue' : 'red';
        const teamColorClass = side === 'home' ? 'bg-blue-600/40 border-blue-600/40 hover:bg-blue-600/65 hover:border-blue-600/70' : 'bg-red-600/40 border-red-600/40 hover:bg-red-600/65 hover:border-red-600/70';

        if (scoringState.status === 'TRY_TYPE_SELECTION' && isLocallyActive) {
            // Cancel out of TRY_TYPE_SELECTION if a pending conversion somehow pops up (e.g. from another client)
            if (isSomeSidePendingConversion) {
                 setScoringState({ status: 'IDLE' });
            } else {
                return (
                    <div className="grid grid-cols-2 gap-1 sm:gap-1.5 h-full">
                        <ScoringActionButton 
                            onClick={() => handleNormalTry(side)}
                            label="Normal Try (5)"
                            className={`h-8 sm:h-12 ${teamColorClass}`}
                        />
                        <ScoringActionButton 
                            onClick={() => handlePenaltyTry(side)}
                            label="Penalty Try (7)"
                            className={`h-8 sm:h-12 ${teamColorClass}`}
                        />
                        <ScoringActionButton 
                            onClick={() => setScoringState({ status: 'IDLE' })}
                            label="Cancel"
                            className="h-8 sm:h-12 bg-white/10 hover:bg-white/20 border-white/20 col-span-2"
                        />
                    </div>
                );
            }
        }

        if (isPendingConversionHere) {
            return (
                <div className="grid grid-cols-2 gap-1 sm:gap-1.5 h-full">
                    <ScoringActionButton 
                        onClick={() => handleConversion(2, false)}
                        label="Conversion (+2)"
                        className={`h-8 sm:h-12 ${teamColorClass}`}
                    />
                    <ScoringActionButton 
                        onClick={() => handleConversion(0, true)}
                        label="Missed"
                        className="h-8 sm:h-12 bg-white/10 hover:bg-white/20 border-white/20"
                    />
                    <ScoringActionButton 
                        onClick={handleUndoTry}
                        label="Undo Try"
                        className="h-8 sm:h-12 bg-amber-500/20 hover:bg-amber-500/40 border-amber-500/30 col-span-2 text-amber-500"
                    />
                </div>
            );
        }

        // Default IDLE State or the other side's panel when this side is inactive
        // Usually, to maintain layout, we might fade the inactive side
        const disabled = isScoringDisabled || isSomeSidePendingConversion || (scoringState.status !== 'IDLE' && scoringState.side !== side);

        return (
            <div className="grid grid-cols-2 gap-1 sm:gap-1.5 h-full opacity-100 transition-opacity">
                {rugbyScoreTypes.map((type) => (
                    <ScoringActionButton 
                        key={type.label}
                        onClick={() => {
                            if (type.label === 'Try') {
                                handleTryClick(side);
                            } else {
                                startScoringFlow(type.points, side, type.label);
                            }
                        }}
                        disabled={disabled}
                        label={type.label}
                        points={type.points}
                        className={`h-8 sm:h-12 ${teamColorClass} ${disabled ? 'opacity-30' : ''}`}
                        title={`Award ${type.points} points (${type.label}) to ${team?.name || side + " team"}`}
                    />
                ))}
            </div>
        );
    };

    const homeTeamId = game.participants?.[0]?.teamId;
    const awayTeamId = game.participants?.[1]?.teamId;
    const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : null;
    const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : null;
    const homeOrg = homeTeam?.orgId ? store.getOrganization(homeTeam.orgId) : null;
    const awayOrg = awayTeam?.orgId ? store.getOrganization(awayTeam.orgId) : null;

    return (
        <div className="-m-3 sm:-m-4 overflow-hidden rounded-xl sm:rounded-[14px] flex flex-col min-h-0">
            {isFinished && (
                <div className="p-2 bg-secondary/5 border-b border-white/5">
                    <ScoringActionButton 
                        onClick={() => {
                            const initial: { [key: string]: string } = {};
                            game.participants?.forEach(p => {
                                initial[p.id] = (game.liveState?.scores?.[p.id] || 0).toString();
                            });
                            setFinalScores(initial);
                            setIsFinalScoreOpen(true);
                        }}
                        label="ENTER FINAL SCORE"
                        className="w-full h-10 bg-primary/40 border-primary/50 hover:bg-primary/65 text-foreground transition-all duration-200"
                    />
                </div>
            )}

            <div className="flex divide-x divide-white/10">
                {/* Home Scoring */}
                <div className={cn("flex-1 flex flex-col gap-2 p-1.5 sm:p-2.5 bg-blue-600/20 transition-all", 
                    scoringState.status !== 'IDLE' && scoringState.side === 'away' ? 'opacity-40 grayscale' : ''
                )}>
                    {renderActionButtons('home')}
                </div>

                {/* Away Scoring */}
                <div className={cn("flex-1 flex flex-col gap-2 p-1.5 sm:p-2.5 bg-red-600/20 transition-all", 
                    scoringState.status !== 'IDLE' && scoringState.side === 'home' ? 'opacity-40 grayscale' : ''
                )}>
                    {renderActionButtons('away')}
                </div>
            </div>

            {/* Final Score Dialog */}
            <Dialog open={isFinalScoreOpen} onOpenChange={setIsFinalScoreOpen}>
                <DialogContent className="sm:max-w-md bg-card border-border/50">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            <Trophy className="h-5 w-5" />
                            Final Score Override
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-6">
                        <div className="grid grid-cols-2 gap-6">
                            {game.participants?.slice(0, 2).map((p, idx) => {
                                const team = p.teamId ? store.getTeam(p.teamId) : null;
                                const org = team?.orgId ? store.getOrganization(team.orgId) : null;
                                const orgName = org?.shortName || org?.name || (idx === 0 ? 'Home' : 'Away');

                                return (
                                    <div key={p.id} className="space-y-3 p-3 rounded-xl bg-sunken-bg/20 border border-border/10">
                                        <div className="flex items-start gap-3">
                                            <div className="h-10 w-10 bg-white/10 rounded-lg flex items-center justify-center p-1 border border-white/10 shadow-sm overflow-hidden shrink-0">
                                                <OrgLogo organization={org || null} size="sm" />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest truncate mb-0.5">
                                                    {orgName}
                                                </Label>
                                                <span className="text-xs font-black uppercase truncate text-foreground/90 leading-tight">
                                                    {team?.name || 'Team'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-border/5">
                                            <Input
                                                type="number"
                                                value={finalScores[p.id] || ""}
                                                onChange={(e) => setFinalScores({ ...finalScores, [p.id]: e.target.value })}
                                                className="bg-sunken-bg/50 border-border/30 h-10 text-xl font-bold font-mono text-center focus-visible:ring-primary/30"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 flex gap-3 italic">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-500/80 leading-relaxed font-bold uppercase tracking-tight">
                                This will override the live scoreboard.
                            </p>
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <ScoringActionButton 
                            onClick={() => setIsFinalScoreOpen(false)}
                            label="Cancel"
                            className="h-9 px-4 bg-background hover:bg-muted font-bold text-xs border-border/40"
                        />
                        <ScoringActionButton 
                            onClick={handleFinalScoreSubmit}
                            disabled={isSaving}
                            label={isSaving ? "Saving..." : "Apply Final Score"}
                            className="h-9 px-4 font-black text-xs uppercase tracking-widest bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Player Selection Dialog */}
            <Dialog 
                open={scoringState.status === 'PLAYER_SELECTION'} 
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
            >
                <DialogContent className="sm:max-w-lg bg-card border-border/50">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            <UserPlus className="h-5 w-5" />
                            Who {scoringState.status === 'PLAYER_SELECTION' && (scoringState.type === 'Conversion' ? 'attempted' : 'scored')} the {scoringState.status === 'PLAYER_SELECTION' && scoringState.type}?
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="py-2">
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-x-1 gap-y-2 sm:gap-x-1.5 sm:gap-y-3 max-h-[50vh] overflow-y-auto pr-1.5 custom-scrollbar">
                            {scoringState.status === 'PLAYER_SELECTION' && (() => {
                                const participant = scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1];
                                const rawRoster = participant ? rosters[participant.id] : [];

                                // Sort roster: 1-15 first, then reserves by position, then by name
                                const sortedRoster = [...rawRoster].sort((a, b) => {
                                    if (a.isReserve !== b.isReserve) return a.isReserve ? 1 : -1;
                                    const aPos = parseInt(a.position || '999', 10);
                                    const bPos = parseInt(b.position || '999', 10);
                                    if (aPos !== bPos) return aPos - bPos;
                                    
                                    const aName = store.orgProfiles.find(p => p.id === a.orgProfileId)?.name || '';
                                    const bName = store.orgProfiles.find(p => p.id === b.orgProfileId)?.name || '';
                                    return aName.localeCompare(bName);
                                });
                                
                                return sortedRoster.map(item => {
                                    const profile = store.orgProfiles.find(p => p.id === item.orgProfileId);
                                    if (!profile) return null;
                                    
                                    return (
                                        <button
                                            key={item.orgProfileId}
                                            onClick={() => {
                                                handleScore(scoringState.points, scoringState.side, scoringState.type, scoringState.extraData, item.orgProfileId);
                                                setScoringState({ status: 'IDLE' });
                                            }}
                                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-primary/10 transition-all border border-transparent hover:border-primary/20 group relative"
                                        >
                                            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-muted border border-border/50 flex items-center justify-center overflow-hidden relative shadow-sm group-hover:scale-105 transition-all">
                                                <div className={cn(
                                                    "w-full h-full transition-opacity duration-300 flex items-center justify-center",
                                                    item.position ? "opacity-20 group-hover:opacity-100" : "opacity-100"
                                                )}>
                                                    {profile.image ? (
                                                        <img src={profile.image} alt={profile.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground/40" />
                                                    )}
                                                </div>
                                                
                                                {item.position && (
                                                    <div className="absolute inset-0 flex items-center justify-center group-hover:opacity-0 transition-opacity duration-300 bg-primary/10">
                                                        <span className="text-primary text-xl sm:text-2xl font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
                                                            {item.isReserve ? `R${item.position || ''}` : item.position}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex flex-col items-center">
                                                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-tight text-center truncate w-full leading-tight text-foreground/70 group-hover:text-primary transition-colors">
                                                    {profile.name.split(' ')[0]}
                                                    {profile.name.split(' ').length > 1 && <><br />{profile.name.split(' ').slice(1).join(' ')}</>}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                });
                            })()}
                        </div>
                    </div>

                    <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border/10">
                        <ScoringActionButton 
                            onClick={() => {
                                if (scoringState.status === 'PLAYER_SELECTION') {
                                    handleScore(scoringState.points, scoringState.side, scoringState.type, scoringState.extraData);
                                    setScoringState({ status: 'IDLE' });
                                }
                            }}
                            label="SKIP / SCORE ONLY"
                            className="h-10 px-4 bg-muted hover:bg-muted/80 text-foreground/70 font-black text-xs border-border/40 flex-1 sm:flex-none"
                        />
                        <ScoringActionButton 
                            onClick={() => setScoringState({ status: 'IDLE' })}
                            label="CANCEL"
                            className="h-10 px-4 bg-background hover:bg-muted font-bold text-xs border-border/40 flex-1 sm:flex-none"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
