import React, { useState } from 'react';
import { Game } from '@sk/types';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { OrgLogo } from '@/components/ui/OrgLogo';
import { Trophy, AlertTriangle } from 'lucide-react';
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

export default function RugbyScoringPanel({ game }: { game: Game }) {
    const [isFinalScoreOpen, setIsFinalScoreOpen] = useState(false);
    const [finalScores, setFinalScores] = useState<{ [key: string]: string }>({});
    const [isSaving, setIsSaving] = useState(false);

    const { currentMS } = useGameTimer(game.liveState?.clock, game.startTime, game.finishTime);
    const periodLabel = game.liveState?.periodLabel || '1st Period';

    const handleScore = (points: number, side: 'home' | 'away', type: string) => {
        const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
        if (!participant) return;

        const team = participant.teamId ? store.getTeam(participant.teamId) : null;
        const initiatorOrgProfileId = store.getOrgProfileId(team?.orgId || '');

        store.addGameEvent({
            gameId: game.id,
            initiatorOrgProfileId,
            type: 'SCORE',
            subType: type,
            gameParticipantId: participant.id,
            eventData: { 
                pointsDelta: points,
                elapsedMS: currentMS,
                period: periodLabel
            }
        });
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
        { label: 'Conversion', points: 2, glow: '#94a3b8' }, // slate-400
        { label: 'Penalty', points: 3, glow: '#f97316' }, // orange-500
        { label: 'Drop Goal', points: 3, glow: '#f97316' }, // orange-500
    ];

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
                <div className="flex-1 flex flex-col gap-2 p-1.5 sm:p-2.5 bg-blue-600/20 transition-colors">
                    <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
                        {rugbyScoreTypes.map((type) => (
                            <ScoringActionButton 
                                key={type.label}
                                onClick={() => handleScore(type.points, 'home', type.label)}
                                disabled={isScoringDisabled}
                                label={type.label}
                                points={type.points}
                                className="h-8 sm:h-12 bg-blue-600/40 border-blue-600/40 hover:bg-blue-600/65 hover:border-blue-600/70"
                                title={`Award ${type.points} points (${type.label}) to ${homeTeam?.name || "home team"}`}
                            />
                        ))}
                    </div>
                </div>

                {/* Away Scoring */}
                <div className="flex-1 flex flex-col gap-2 p-1.5 sm:p-2.5 bg-red-600/20 transition-colors">
                    <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
                        {rugbyScoreTypes.map((type) => (
                            <ScoringActionButton 
                                key={type.label}
                                onClick={() => handleScore(type.points, 'away', type.label)}
                                disabled={isScoringDisabled}
                                label={type.label}
                                points={type.points}
                                className="h-8 sm:h-12 bg-red-600/40 border-red-600/40 hover:bg-red-600/65 hover:border-red-600/70"
                                title={`Award ${type.points} points (${type.label}) to ${awayTeam?.name || "away team"}`}
                            />
                        ))}
                    </div>
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
        </div>
    );
}
