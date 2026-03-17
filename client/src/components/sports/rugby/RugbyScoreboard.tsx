import React from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { OrgLogo } from '@/components/ui/OrgLogo';
import { cn } from '@/lib/utils';
import { useGameTimer } from '@/hooks/useGameTimer';

export default function RugbyScoreboard({ game }: { game: Game }) {
    const { formattedTime } = useGameTimer(game.liveState?.clock);
    const scoreData = game.liveState?.score || { home: 0, away: 0 };
    
    // Fetch team and org info
    const homeTeamId = game.participants?.[0]?.teamId;
    const awayTeamId = game.participants?.[1]?.teamId;
    const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : null;
    const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : null;
    const homeOrg = homeTeam?.orgId ? store.getOrganization(homeTeam.orgId) : null;
    const awayOrg = awayTeam?.orgId ? store.getOrganization(awayTeam.orgId) : null;
    
    const isScheduled = game.status === 'Scheduled';
    const startTimeStr = game.startTime ? new Date(game.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

    return (
        <div className="relative overflow-hidden bg-muted/30 dark:bg-card text-foreground p-2 sm:p-4 border-b border-border/50 shadow-inner">
            {/* Adaptive Background Gradient/Glow */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-10 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.3),transparent_70%)]"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none"></div>
            
            <div className="relative flex flex-col gap-2 sm:gap-4">
                {/* 1. Header Section: Logos & Wrapped Names */}
                <div className="flex justify-between items-stretch w-full sm:px-2">
                    {/* Home Side */}
                    <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-start">
                        <div className="h-10 w-10 sm:h-20 sm:w-20 bg-muted/30 dark:bg-white/10 rounded-lg sm:rounded-xl flex items-center justify-center p-1 sm:p-2 border border-border/50 dark:border-white/10 shadow-sm backdrop-blur-sm overflow-hidden shrink-0">
                            <OrgLogo organization={homeOrg || null} className="w-full h-full border-none shadow-none bg-transparent" />
                        </div>
                        <div className="flex flex-col justify-center min-w-0">
                            <span className="text-[8px] sm:text-[10px] font-black text-muted-foreground dark:text-muted-foreground/70 uppercase tracking-[0.1em] leading-tight mb-0.5 max-w-[100px] sm:max-w-[240px]">
                                {homeOrg?.name || "Home Organization"}
                            </span>
                            <span className="text-sm sm:text-4xl font-black text-foreground uppercase tracking-tighter leading-none truncate max-w-[120px] sm:max-w-[320px]">
                                {homeTeam?.name || "Home"}
                            </span>
                        </div>
                    </div>

                    {/* Away Side */}
                    <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end text-right">
                        <div className="flex flex-col justify-center min-w-0 items-end">
                            <span className="text-[8px] sm:text-[10px] font-black text-muted-foreground dark:text-muted-foreground/70 uppercase tracking-[0.1em] leading-tight mb-0.5 max-w-[100px] sm:max-w-[240px]">
                                {awayOrg?.name || "Away Organization"}
                            </span>
                            <span className="text-sm sm:text-4xl font-black text-foreground uppercase tracking-tighter leading-none truncate max-w-[120px] sm:max-w-[320px]">
                                {awayTeam?.name || "Away"}
                            </span>
                        </div>
                        <div className="h-10 w-10 sm:h-20 sm:w-20 bg-muted/30 dark:bg-white/10 rounded-lg sm:rounded-xl flex items-center justify-center p-1 sm:p-2 border border-border/50 dark:border-white/10 shadow-sm backdrop-blur-sm overflow-hidden shrink-0">
                            <OrgLogo organization={awayOrg || null} className="w-full h-full border-none shadow-none bg-transparent" />
                        </div>
                    </div>
                </div>

                {/* 2. Scores & Center Info */}
                <div className="flex items-center justify-between gap-2">
                    {/* Home Score */}
                    <div className="flex-1 flex justify-center sm:justify-end sm:pr-8">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-blue-500/10 dark:bg-blue-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                            <div className="relative flex items-center justify-center bg-muted/20 dark:bg-slate-900/40 border border-border dark:border-slate-800 rounded-lg w-16 h-20 sm:w-32 sm:h-44 shadow-lg dark:shadow-2xl">
                                <span className="text-4xl sm:text-8xl font-bold font-mono text-blue-600 dark:text-blue-400 drop-shadow-[0_2px_8px_rgba(37,99,235,0.2)] dark:drop-shadow-[0_0_20px_rgba(96,165,250,0.5)]">
                                    {scoreData.home}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Center Info: Time & Status */}
                    <div className="flex flex-col items-center gap-2 sm:gap-4 min-w-[100px] sm:min-w-[180px]">
                        {!isScheduled && (
                            <div className="px-3 py-1 bg-muted/50 dark:bg-slate-800/80 border border-border dark:border-slate-700/50 rounded-full backdrop-blur-md shadow-sm">
                                <span className="text-[8px] sm:text-[10px] font-black text-muted-foreground dark:text-slate-300 uppercase tracking-widest whitespace-nowrap">
                                    {game.liveState?.periodLabel || "1st Half"}
                                </span>
                            </div>
                        )}
                        
                        <div className="flex flex-col items-center">
                            <span className="text-2xl sm:text-6xl font-mono text-amber-600 dark:text-amber-500 font-black tracking-tighter drop-shadow-sm dark:drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                                {isScheduled ? "00:00" : formattedTime}
                            </span>
                            
                            <div className="flex flex-col items-center mt-1 sm:mt-2 gap-1 sm:gap-1.5">
                                {isScheduled && startTimeStr && (
                                    <span className="text-[9px] sm:text-xs font-black text-amber-600/80 dark:text-amber-500/80 uppercase tracking-widest leading-none">
                                        Starts at {startTimeStr}
                                    </span>
                                )}
                                <div className="flex gap-1.5 items-center px-2 py-0.5 bg-muted/20 dark:bg-white/5 rounded-full border border-border/40">
                                     <div className={cn(
                                         "w-1.5 h-1.5 rounded-full",
                                         game.status === 'Live' ? "bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" : "bg-muted-foreground/30"
                                     )} />
                                     <span className={cn(
                                         "text-[8px] sm:text-[9px] font-black uppercase tracking-widest italic leading-none",
                                         game.status === 'Live' ? "text-red-500" : "text-muted-foreground"
                                     )}>
                                         {game.status}
                                     </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Away Score */}
                    <div className="flex-1 flex justify-center sm:justify-start sm:pl-8">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-red-500/10 dark:bg-red-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                            <div className="relative flex items-center justify-center bg-muted/20 dark:bg-slate-900/40 border border-border dark:border-slate-800 rounded-lg w-16 h-20 sm:w-32 sm:h-44 shadow-lg dark:shadow-2xl">
                                <span className="text-4xl sm:text-8xl font-bold font-mono text-red-600 dark:text-red-500 drop-shadow-[0_2px_8px_rgba(220,38,38,0.2)] dark:drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                                    {scoreData.away}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Metallic Border Accents - Subtle & Theme-Aware */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-border to-transparent opacity-50"></div>
            <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-border to-transparent opacity-50"></div>
        </div>
    );
}
