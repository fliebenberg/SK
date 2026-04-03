import React, { useEffect, useState } from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { OrgLogo } from '@/components/ui/OrgLogo';
import { cn } from '@/lib/utils';
import { useGameTimer } from '@/hooks/useGameTimer';
import { getPeriodLabel } from '@sk/types';

export default function RugbyScoreboard({ game }: { game: Game }) {
    const { formattedTime } = useGameTimer(game.liveState?.clock);
    const [, setTick] = useState(0);

    useEffect(() => {
        if (game.siteId) store.subscribeToSite(game.siteId);
        if (game.facilityId) store.subscribeToFacility(game.facilityId);
        
        const unsubscribe = store.subscribe(() => setTick(t => t + 1));
        return () => {
            unsubscribe();
            if (game.siteId) store.unsubscribeFromSite(game.siteId);
            if (game.facilityId) store.unsubscribeFromFacility(game.facilityId);
        };
    }, [game.id, game.siteId, game.facilityId]);
    
    const homeParticipant = game.participants?.[0];
    const awayParticipant = game.participants?.[1];
    
    const scoreData = {
        home: homeParticipant ? (game.liveState?.scores?.[homeParticipant.id] || 0) : 0,
        away: awayParticipant ? (game.liveState?.scores?.[awayParticipant.id] || 0) : 0
    };
    
    // Fetch team and org info
    const homeTeamId = game.participants?.[0]?.teamId;
    const awayTeamId = game.participants?.[1]?.teamId;
    const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : null;
    const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : null;
    const homeOrg = homeTeam?.orgId ? store.getOrganization(homeTeam.orgId) : null;
    const awayOrg = awayTeam?.orgId ? store.getOrganization(awayTeam.orgId) : null;
    
    const isScheduled = game.status === 'Scheduled';
    const startTimeStr = game.startTime ? new Date(game.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

    const site = game.siteId ? store.getSite(game.siteId) : null;
    const facility = game.facilityId ? store.getFacility(game.facilityId) : null;
    const locationStr = [site?.name, facility?.name].filter(Boolean).join(", ");

    return (
        <div className="relative overflow-hidden bg-muted/30 dark:bg-card text-foreground border-b border-border/50 shadow-inner [container-type:inline-size] [@container/scoreboard]">
            {/* Adaptive Background Gradient/Glow */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-10 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.3),transparent_70%)]"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none"></div>
            
            <div className="relative flex flex-col gap-[clamp(8px,2.1cqw,32px)] p-[clamp(8px,3.2cqw,64px)]">
                {/* 1. Header Section: Logos & Wrapped Names */}
                <div className="flex justify-between items-stretch w-full gap-[clamp(8px,2cqw,32px)]">
                    {/* Home Side */}
                    <div className="flex items-center gap-[clamp(6px,2cqw,24px)] flex-1 justify-start min-w-0">
                        <div className="h-[clamp(40px,15cqw,280px)] w-[clamp(40px,15cqw,280px)] bg-muted/30 dark:bg-white/10 rounded-[clamp(6px,2cqw,24px)] flex items-center justify-center p-[clamp(4px,1.5cqw,16px)] border border-border/50 dark:border-white/10 shadow-sm backdrop-blur-sm overflow-hidden shrink-0">
                            <OrgLogo organization={homeOrg || null} className="w-full h-full border-none shadow-none bg-transparent" />
                        </div>
                        <div className="flex flex-col justify-center min-w-0 flex-1 overflow-hidden">
                            <span className="text-[clamp(8px,2.6cqw,48px)] font-black text-muted-foreground dark:text-muted-foreground/70 uppercase tracking-[0.1em] leading-tight mb-0.5 truncate">
                                <span className="xl:hidden">{homeOrg?.shortName || homeOrg?.name || "Home"}</span>
                                <span className="hidden xl:inline">{homeOrg?.name || "Home Organization"}</span>
                            </span>
                            <span className="text-[clamp(12px,4.2cqw,80px)] font-black text-foreground uppercase tracking-tight leading-none truncate">
                                {homeTeam?.name || "Home"}
                            </span>
                        </div>
                    </div>

                    {/* Away Side */}
                    <div className="flex items-center gap-[clamp(6px,2cqw,24px)] flex-1 justify-end text-right min-w-0">
                        <div className="flex flex-col justify-center min-w-0 items-end flex-1 overflow-hidden">
                            <span className="text-[clamp(8px,2.6cqw,48px)] font-black text-muted-foreground dark:text-muted-foreground/70 uppercase tracking-[0.1em] leading-tight mb-0.5 truncate">
                                <span className="xl:hidden">{awayOrg?.shortName || awayOrg?.name || "Away"}</span>
                                <span className="hidden xl:inline">{awayOrg?.name || "Away Organization"}</span>
                            </span>
                            <span className="text-[clamp(12px,4.2cqw,80px)] font-black text-foreground uppercase tracking-tighter leading-none truncate">
                                {awayTeam?.name || "Away"}
                            </span>
                        </div>
                        <div className="h-[clamp(40px,15cqw,280px)] w-[clamp(40px,15cqw,280px)] bg-muted/30 dark:bg-white/10 rounded-[clamp(6px,2cqw,24px)] flex items-center justify-center p-[clamp(4px,1.5cqw,16px)] border border-border/50 dark:border-white/10 shadow-sm backdrop-blur-sm overflow-hidden shrink-0">
                            <OrgLogo organization={awayOrg || null} className="w-full h-full border-none shadow-none bg-transparent" />
                        </div>
                    </div>
                </div>

                {/* 2. Scores & Center Info */}
                <div className="flex items-center justify-between gap-[clamp(8px,2cqw,32px)]">
                    {/* Home Score */}
                    <div className="flex-1 flex justify-center sm:justify-end min-w-0">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-blue-500/10 dark:bg-blue-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                            <div className="relative flex items-center justify-center bg-muted/20 dark:bg-slate-900/40 border border-border dark:border-slate-800 rounded-[clamp(8px,2cqw,32px)] w-[clamp(64px,22.4cqw,430px)] h-[clamp(64px,22.4cqw,430px)] shadow-lg dark:shadow-2xl">
                                <span className="text-[clamp(36px,17cqw,320px)] font-bold font-mono text-blue-600 dark:text-blue-400 drop-shadow-[0_2px_15px_rgba(37,99,235,0.4)] dark:drop-shadow-[0_0_30px_rgba(96,165,250,0.6)] leading-none select-none">
                                    {scoreData.home}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Center Info: Time & Status */}
                    <div className="flex flex-col items-center gap-[clamp(4px,1cqw,32px)] min-w-[clamp(80px,21cqw,360px)]">
                        {!isScheduled && (
                            <div className="px-[clamp(8px,2cqw,32px)] py-[clamp(2px,0.5cqw,16px)] bg-muted/50 dark:bg-slate-800/80 border border-border dark:border-slate-700/50 rounded-full backdrop-blur-md shadow-sm">
                                <span className="text-[clamp(8px,2.6cqw,48px)] font-black text-muted-foreground dark:text-slate-300 uppercase tracking-widest whitespace-nowrap">
                                    {game.liveState?.periodLabel || getPeriodLabel(game.liveState?.clock?.periodIndex ?? 0, 'Period')}
                                </span>
                            </div>
                        )}
                        
                        <div className="flex flex-col items-center">
                            <span className="text-[clamp(24px,9.6cqw,180px)] font-mono text-amber-600 dark:text-amber-500 font-black tracking-tighter drop-shadow-sm dark:drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                                {isScheduled ? "00:00" : formattedTime}
                            </span>
                            
                            <div className="flex flex-col items-center mt-[clamp(4px,1cqw,16px)] gap-[clamp(2px,0.5cqw,16px)]">
                                {isScheduled && startTimeStr && (
                                    <span className="text-[clamp(8px,2.6cqw,48px)] font-black text-amber-600/80 dark:text-amber-500/80 uppercase tracking-widest leading-none">
                                        Starts at {startTimeStr}
                                    </span>
                                )}
                                {locationStr && (
                                     <span className="text-[clamp(8px,2.6cqw,48px)] font-black text-muted-foreground/60 dark:text-muted-foreground/40 uppercase tracking-[0.2em] leading-none transition-all text-center">
                                         {locationStr}
                                     </span>
                                 )}
                            </div>
                        </div>
                    </div>

                    {/* Away Score */}
                    <div className="flex-1 flex justify-center sm:justify-start min-w-0">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-red-500/10 dark:bg-red-500/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                            <div className="relative flex items-center justify-center bg-muted/20 dark:bg-slate-900/40 border border-border dark:border-slate-800 rounded-[clamp(8px,2cqw,32px)] w-[clamp(64px,22.4cqw,430px)] h-[clamp(64px,22.4cqw,430px)] shadow-lg dark:shadow-2xl">
                                <span className="text-[clamp(36px,17cqw,320px)] font-bold font-mono text-red-600 dark:text-red-500 drop-shadow-[0_2px_15px_rgba(220,38,38,0.4)] dark:drop-shadow-[0_0_30px_rgba(239,68,68,0.6)] leading-none select-none">
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
