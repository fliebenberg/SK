import React, { useState } from 'react';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { OrgLogo } from '@/components/ui/OrgLogo';
import { Trophy, AlertTriangle } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useRugbyScoring, RUGBY_OUTCOMES } from './useRugbyScoring';

import { ScoringActionButton } from '../shared/ScoringActionButton';
import { BaseEventDialog } from '../shared/dialogs/BaseEventDialog';
import { PlayerSelectionDialog } from '../shared/dialogs/PlayerSelectionDialog';
import { RugbyOutcomeDialog } from '../shared/dialogs/RugbyOutcomeDialog';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';

export default function RugbyScoringPanel({ game, role }: { game: Game, role?: string }) {
    const { 
        scoringState, 
        setScoringState, 
        rosters, 
        pendingConversion,
        handleKickResult,
        startScoringFlow,
        pendingDispute,
        triggerRemovalDispute,
        resolveDispute,
        handleScore
    } = useRugbyScoring(game);
    const participant = scoringState.status !== 'IDLE' && 'side' in scoringState ? (scoringState.side === 'home' ? game.participants?.[0] : game.participants?.[1]) : null;

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
        
        // If editing, only update local state
        if (scoringState.editingId) {
            setScoringState({ ...scoringState, playerId } as any);
            return;
        }

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
        
        // Disable inactive side completely when scoring flow is active
        const isActiveSideDisabled = scoringState.status !== 'IDLE' && scoringState.side !== side;

        return (
            <div className="grid grid-cols-2 gap-1 sm:gap-1.5 h-full">
                {rugbyScoreTypes.map((type) => {
                    const disabled = isScoringDisabled || isSomeSidePendingConversion || isActiveSideDisabled;
                    
                    return (
                        <ScoringActionButton 
                            key={type.label}
                            onClick={() => {
                                if (type.label === 'Try') {
                                    handleTryClick(side);
                                } else if (type.label === 'Penalty Kick') {
                                    setScoringState({ status: 'KICK_FLOW', side, type: 'Penalty Kick', points: 3 });
                                } else if (type.label === 'Drop Goal') {
                                    setScoringState({ status: 'KICK_FLOW', side, type: 'Drop Goal', points: 3 });
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
                <div className={cn("flex-1 flex flex-col gap-2 p-1.5 bg-blue-600/20 transition-all", 
                    scoringState.status !== 'IDLE' && scoringState.side === 'away' ? 'opacity-40 grayscale' : ''
                )}>
                    {renderActionButtons('home')}
                </div>

                <div className={cn("flex-1 flex flex-col gap-1.5 p-1.5 bg-red-600/20 transition-all", 
                    scoringState.status !== 'IDLE' && scoringState.side === 'home' ? 'opacity-40 grayscale' : ''
                )}>
                    {renderActionButtons('away')}
                </div>
            </div>

            <BaseEventDialog
                open={isFinalScoreOpen}
                onOpenChange={setIsFinalScoreOpen}
                title="Final Score Override"
                icon={<Trophy className="h-5 w-5 text-primary" />}
                footer={
                    <>
                        <ScoringActionButton 
                            onClick={() => setIsFinalScoreOpen(false)}
                            label="Cancel"
                            variant="muted"
                            className="h-9 px-4"
                        />
                        <ScoringActionButton 
                            onClick={handleFinalScoreSubmit}
                            disabled={isSaving}
                            label={isSaving ? "Saving..." : "Apply Final Score"}
                            className="h-9 px-4 bg-primary/10"
                        />
                    </>
                }
            >
                <div className="space-y-6 pt-2 pb-6">
                    <div className="grid grid-cols-2 gap-6">
                        {game.participants?.slice(0, 2).map((p: any, idx: number) => {
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
            </BaseEventDialog>

            {/* Shared Modular Dialogs */}

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
                onClose={() => setScoringState({ status: 'IDLE' })}
                onSkip={scoringState.status === 'KICK_FLOW' && !scoringState.editingId ? () => {
                    if (scoringState.type === 'Conversion' || scoringState.type === 'Penalty Kick' || scoringState.type === 'Drop Goal') {
                        handleKickResult(scoringState.type as any, 0, true, scoringState.side, scoringState.playerId, scoringState.extraData);
                    } else {
                        handleAddGameEvent('GAME_EVENT', scoringState.type, scoringState.side, scoringState.extraData, scoringState.playerId);
                    }
                    setScoringState({ status: 'IDLE' });
                } : undefined}
                columns={(scoringState.status === 'KICK_FLOW' && (scoringState.type === 'Kick-off' || scoringState.type === '22m Dropout' || scoringState.type === 'Goalline Dropout')) ? 3 : 2}
            />

            <PlayerSelectionDialog
                open={scoringState.status === 'PLAYER_SELECTION' && (scoringState.type !== 'Penalty Try' || !(scoringState as any).editingId)}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title={scoringState.status === 'PLAYER_SELECTION' ? scoringState.type : 'Select Player'}
                roster={participant ? (rosters[participant.id] || []) : []}
                selectedPlayerId={scoringState.status === 'PLAYER_SELECTION' ? scoringState.playerId : undefined}
                initialPlayerId={scoringState.status === 'PLAYER_SELECTION' ? (scoringState as any).initialPlayerId : undefined}
                isEditing={!!(scoringState as any).editingId}
                onSelect={handlePlayerSelection}
                onSave={scoringState.status === 'PLAYER_SELECTION' && scoringState.editingId ? () => {
                    handleScore(scoringState.points, scoringState.side, scoringState.type, scoringState.extraData, scoringState.playerId);
                } : undefined}
                onClose={() => setScoringState({ status: 'IDLE' })}
                onSkip={() => handlePlayerSelection()}
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

            <BaseEventDialog
                open={scoringState.status === 'PLAYER_SELECTION' && scoringState.type === 'Penalty Try' && !!(scoringState as any).editingId}
                onOpenChange={(open) => !open && setScoringState({ status: 'IDLE' })}
                title="Edit Penalty Try"
                icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
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
        </div>
    );
}
