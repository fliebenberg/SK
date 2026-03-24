import React, { useState } from 'react';
import { Game } from '@sk/types';
import { MetalButton } from '@/components/ui/MetalButton';
import { store } from '@/app/store/store';
import { OrgLogo } from '@/components/ui/OrgLogo';
import { Trophy, AlertTriangle } from 'lucide-react';
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

export default function RugbyScoringPanel({ game }: { game: Game }) {
    const [isFinalScoreOpen, setIsFinalScoreOpen] = useState(false);
    const [finalScores, setFinalScores] = useState<{ [key: string]: string }>({});
    const [isSaving, setIsSaving] = useState(false);

    const handleScore = (points: number, side: 'home' | 'away', type: string) => {
        const participant = side === 'home' ? game.participants?.[0] : game.participants?.[1];
        if (!participant) return;

        store.addGameEvent({
            gameId: game.id,
            type: 'SCORE',
            subType: type,
            gameParticipantId: participant.id,
            eventData: { pointsDelta: points }
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
            
            store.addGameEvent({
                gameId: game.id,
                type: 'SCORE',
                subType: 'Final Score',
                eventData: { scores, reason: 'Manual Final Score' }
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
        <div className="flex flex-col gap-4 sm:gap-6">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <h3 className="font-black text-base sm:text-lg uppercase tracking-tighter text-foreground/80">Scoring Actions</h3>
                <div className="px-2 py-0.5 rounded-md bg-primary/5 text-[9px] font-bold text-primary uppercase tracking-widest border border-primary/10">Manual Override</div>
            </div>

            {isFinished && (
                <MetalButton 
                    onClick={() => {
                        const initial: { [key: string]: string } = {};
                        game.participants?.forEach(p => {
                            initial[p.id] = (game.liveState?.scores?.[p.id] || 0).toString();
                        });
                        setFinalScores(initial);
                        setIsFinalScoreOpen(true);
                    }}
                    variantType="outlined"
                    glowColor="hsl(var(--primary))"
                    className="w-full h-12 rounded-xl border-primary/20 hover:bg-primary/5 uppercase font-black tracking-widest text-primary gap-2"
                    icon={<Trophy className="w-5 h-5" />}
                >
                    Enter Final Score
                </MetalButton>
            )}

            <div className="grid grid-cols-2 gap-4 sm:gap-8">
                {/* Home Scoring */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 mb-1 p-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                        <div className="h-6 w-6 bg-white/10 rounded flex items-center justify-center p-1 border border-white/10 shadow-sm overflow-hidden">
                            <OrgLogo organization={homeOrg || null} size="xs" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[8px] font-bold text-blue-500/60 uppercase leading-none">{homeOrg?.name || "Home Org"}</span>
                            <span className="text-[10px] font-black uppercase tracking-tight text-blue-600 line-clamp-2 leading-tight">
                                {homeTeam?.name || "Home Team"}
                            </span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {rugbyScoreTypes.map((type) => (
                            <div key={type.label} className="relative group">
                                <MetalButton 
                                    onClick={() => handleScore(type.points, 'home', type.label)}
                                    disabled={isScoringDisabled}
                                    variantType="filled"
                                    glowColor={isScoringDisabled ? undefined : type.glow}
                                    size="sm"
                                    className="w-full justify-between px-3 h-9 sm:h-10 rounded-lg"
                                    title={`Award ${type.points} points (${type.label}) to ${homeTeam?.name || "home team"}`}
                                    icon={null}
                                >
                                    <span className="font-bold text-slate-900 text-[10px] sm:text-xs">{type.label}</span>
                                    <span className="text-slate-900/60 text-[9px] sm:text-xs">+{type.points}</span>
                                </MetalButton>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Away Scoring */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 mb-1 p-2 rounded-lg bg-red-500/5 border border-red-500/10 flex-row-reverse">
                        <div className="h-6 w-6 bg-white/10 rounded flex items-center justify-center p-1 border border-white/10 shadow-sm overflow-hidden">
                            <OrgLogo organization={awayOrg || null} size="xs" />
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[8px] font-bold text-red-500/60 uppercase leading-none">{awayOrg?.name || "Away Org"}</span>
                            <span className="text-[10px] font-black uppercase tracking-tight text-red-600 line-clamp-2 leading-tight">
                                {awayTeam?.name || "Away Team"}
                            </span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {rugbyScoreTypes.map((type) => (
                            <div key={type.label} className="relative group">
                                <MetalButton 
                                    onClick={() => handleScore(type.points, 'away', type.label)}
                                    disabled={isScoringDisabled}
                                    variantType="filled"
                                    glowColor={isScoringDisabled ? undefined : type.glow}
                                    size="sm"
                                    className="w-full justify-between px-3 h-9 sm:h-10 rounded-lg"
                                    title={`Award ${type.points} points (${type.label}) to ${awayTeam?.name || "away team"}`}
                                    icon={null}
                                >
                                    <span className="font-bold text-slate-900 text-[10px] sm:text-xs">{type.label}</span>
                                    <span className="text-slate-900/60 text-[9px] sm:text-xs">+{type.points}</span>
                                </MetalButton>
                            </div>
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
                    <DialogFooter className="gap-2 sm:gap-0">
                        <MetalButton 
                            variantType="secondary" 
                            onClick={() => setIsFinalScoreOpen(false)}
                            className="bg-background hover:bg-muted font-bold text-xs"
                        >
                            Cancel
                        </MetalButton>
                        <MetalButton 
                            variantType="filled"
                            glowColor="hsl(var(--primary))"
                            disabled={isSaving}
                            onClick={handleFinalScoreSubmit}
                            className="font-black text-xs uppercase tracking-widest"
                        >
                            {isSaving ? "Saving..." : "Apply Final Score"}
                        </MetalButton>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
