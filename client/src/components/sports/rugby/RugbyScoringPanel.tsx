import React from 'react';
import { Game } from '@sk/types';
import { MetalButton } from '@/components/ui/MetalButton';
import { store } from '@/app/store/store';
import { OrgLogo } from '@/components/ui/OrgLogo';

export default function RugbyScoringPanel({ game }: { game: Game }) {
    const handleScore = (points: number, team: 'home' | 'away', type: string) => {
        // Here we would emit SocketAction.ADD_GAME_EVENT
        console.log(`Scored ${points} (${type}) for ${team}`);
    };

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
                                    variantType="filled"
                                    glowColor={type.glow}
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
                                    variantType="filled"
                                    glowColor={type.glow}
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
        </div>
    );
}
