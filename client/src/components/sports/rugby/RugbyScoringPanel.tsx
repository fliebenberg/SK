import React, { useState } from 'react';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { OrgLogo } from '@/components/ui/OrgLogo';
import { Trophy, AlertTriangle, User, UserPlus } from 'lucide-react';
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
import { useRugbyScoring } from './useRugbyScoring';

import { ScoringActionButton, DialogSectionHeader, RosterGrid } from '../shared/ScoringActionButton';

export default function RugbyScoringPanel({ game, role }: { game: Game, role?: string }) {
    const { 
        scoringState, 
        setScoringState, 
        rosters, 
        pendingConversion,
        handleScore,
        handleKickResult,
        startScoringFlow
    } = useRugbyScoring(game);
    const participant = scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1];

    const [isFinalScoreOpen, setIsFinalScoreOpen] = useState(false);
    const [finalScores, setFinalScores] = useState<{ [key: string]: string }>({});
    const [isSaving, setIsSaving] = useState(false);

    const isScheduled = game.status === 'Scheduled';
    const isFinished = game.status === 'Finished';
    const isScoringDisabled = isScheduled;

    const handleTryClick = (side: 'home' | 'away') => {
        setScoringState({ status: 'PLAYER_SELECTION', side, points: 5, type: 'Try' });
    };

    const handlePlayerSelection = async (playerId?: string) => {
        if (scoringState.status !== 'PLAYER_SELECTION') return;
        
        const isTry = scoringState.type === 'Try';
        const res = await handleScore(scoringState.points, scoringState.side, scoringState.type, scoringState.extraData, playerId);
        
        if (isTry && res?.id) {
            setScoringState({ 
                status: 'KICK_FLOW', 
                side: scoringState.side, 
                type: 'Conversion', 
                points: 2, 
                extraData: { linkedEventId: res.id } 
            });
        } else {
            setScoringState({ status: 'IDLE' });
        }
    };

    const handlePenaltyTry = async (side: 'home' | 'away') => {
        await handleScore(7, side, 'Penalty Try');
        setScoringState({ status: 'IDLE' });
    };

    const handleUndoTry = async () => {
        if (!pendingConversion) return;
        
        const participant = pendingConversion.side === 'home' ? game.participants?.[0] : game.participants?.[1];
        const team = participant?.teamId ? store.getTeam(participant.teamId) : null;
        const initiatorId = store.getOrgProfileId(team?.orgId || '');
        
        try {
            await store.undoGameEvent(game.id, pendingConversion.tryId, initiatorId || null);
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
            
            const firstParticipant = game.participants?.[0];
            const firstTeam = firstParticipant?.teamId ? store.getTeam(firstParticipant.teamId) : null;
            const initiatorId = store.getOrgProfileId(firstTeam?.orgId || '');

            store.addGameEvent({
                gameId: game.id,
                initiatorOrgProfileId: initiatorId,
                type: 'SCORE',
                subType: 'Final Score',
                eventData: { 
                    scores, 
                    reason: 'Manual Final Score',
                    elapsedMS: 0,
                    period: 'Final'
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

    const rugbyScoreTypes = [
        { label: 'Try', points: 5, glow: '#eab308' },
        { label: 'Penalty Kick', points: 3, glow: '#f97316' },
        { label: 'Drop Goal', points: 3, glow: '#f97316' },
    ];

    const renderActionButtons = (side: 'home' | 'away') => {
        const isSomeSidePendingConversion = pendingConversion !== null;
        const teamColorClass = side === 'home' ? 'bg-blue-600/40 border-blue-600/40 hover:bg-blue-600/65 hover:border-blue-600/70' : 'bg-red-600/40 border-red-600/40 hover:bg-red-600/65 hover:border-red-600/70';

        return (
            <div className="grid grid-cols-2 gap-1 sm:gap-1.5 h-full">
                {rugbyScoreTypes.map((type) => {
                    const disabled = isScoringDisabled || isSomeSidePendingConversion;
                    
                    return (
                        <ScoringActionButton 
                            key={type.label}
                            onClick={() => {
                                if (type.label === 'Try') {
                                    handleTryClick(side);
                                } else if (type.label === 'Penalty Kick') {
                                    setScoringState({ status: 'KICK_FLOW', side, type: 'Penalty Kick', points: 3 });
                                } else {
                                    startScoringFlow(type.points, side, type.label);
                                }
                            }}
                            disabled={disabled}
                            label={type.label}
                            variant="none"
                            className={cn("h-8 sm:h-12", teamColorClass, disabled ? 'opacity-30' : '')}
                        />
                    );
                })}
            </div>
        );
    };

    return (
        <div className="flex flex-col min-h-0">
            {isFinished && (
                <div className="p-2 border-b border-white/5">
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
                <div className={cn("flex-1 flex flex-col gap-2 p-1.5 bg-blue-600/20 transition-all", 
                    scoringState.status !== 'IDLE' && scoringState.side === 'away' ? 'opacity-40 grayscale' : ''
                )}>
                    {renderActionButtons('home')}
                </div>

                {/* Away Scoring */}
                <div className={cn("flex-1 flex flex-col gap-1.5 p-1.5 bg-red-600/20 transition-all", 
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
                                            <div className="shrink-0 h-10 w-10 bg-white/10 rounded-lg flex items-center justify-center p-1 border border-white/10 shadow-sm overflow-hidden">
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

            {/* Kick Flow Dialog */}
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
                </DialogContent>
            </Dialog>

            <Dialog 
                open={scoringState.status === 'PLAYER_SELECTION'} 
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
            >
                <DialogContent className="sm:max-w-lg bg-card border-border/50">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-black uppercase tracking-tight text-primary">
                            <UserPlus className="h-5 w-5" />
                            {scoringState.status === 'PLAYER_SELECTION' && `Who scored the ${scoringState.type}?`}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="py-2">
                        <div className="max-h-[50vh] overflow-y-auto pr-1.5 custom-scrollbar">
                            <RosterGrid 
                                roster={participant ? (rosters[participant.id] || []) : []}
                                onSelect={handlePlayerSelection}
                            />
                        </div>
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t border-white/5">
                        <div className="flex-1 flex gap-2">
                            <ScoringActionButton 
                                onClick={() => handlePlayerSelection()}
                                label="SKIP PLAYER"
                                variant="muted"
                                className="flex-1 h-10"
                            />
                            
                            {scoringState.status === 'PLAYER_SELECTION' && scoringState.type === 'Try' && (
                                <ScoringActionButton 
                                    onClick={() => handlePenaltyTry(scoringState.side)}
                                    label="PENALTY TRY"
                                    className="flex-1 h-10"
                                />
                            )}
                        </div>

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
                            className="h-10 px-6"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
