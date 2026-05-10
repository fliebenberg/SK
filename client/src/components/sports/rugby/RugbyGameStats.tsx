import React, { useMemo, useEffect, useState } from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { cn } from '@/lib/utils';
import { TeamStats, calculateRugbyStats } from './rugbyUtils';

interface RugbyGameStatsProps {
    game: Game;
}

export default function RugbyGameStats({ game }: RugbyGameStatsProps) {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const unsubscribe = store.subscribe(() => setTick(t => t + 1));
        return () => unsubscribe();
    }, []);

    const homeParticipantId = game.participants?.[0]?.id;
    const awayParticipantId = game.participants?.[1]?.id;

    const stats = useMemo(() => {
        const gameEvents = store.gameEvents.filter(e => e.gameId === game.id);
        return calculateRugbyStats(gameEvents, homeParticipantId, awayParticipantId);
    }, [game.id, store.gameEvents, homeParticipantId, awayParticipantId, tick]);

    const renderStatRow = (label: string, home: { main: string | number, sub?: string | null }, away: { main: string | number, sub?: string | null }, homeRaw: number, awayRaw: number) => {
        const total = homeRaw + awayRaw;
        const homeWidth = total > 0 ? (homeRaw / total) * 100 : 0;
        const awayWidth = total > 0 ? (awayRaw / total) * 100 : 0;

        const isHomeLeading = homeRaw > awayRaw;
        const isAwayLeading = awayRaw > homeRaw;

        return (
            <div className="group flex flex-col gap-0.5 py-1 border-b border-border/40 last:border-0">
                <div className="flex items-center justify-between px-2">
                    <div className={cn(
                        "flex-1 flex flex-col transition-all", 
                        isHomeLeading ? "text-blue-500" : (isAwayLeading ? "text-muted-foreground/60" : "text-foreground")
                    )}>
                        <span className="text-sm font-black leading-none">{home.main}</span>
                        {home.sub && <span className="text-tiny font-medium opacity-60 mt-0.5">{home.sub}</span>}
                    </div>
                    
                    <span className="flex-1 text-center text-tiny font-black uppercase tracking-[0.2em] text-muted-foreground px-2 group-hover:text-primary transition-colors">
                        {label}
                    </span>
                    
                    <div className={cn(
                        "flex-1 flex flex-col items-end transition-all", 
                        isAwayLeading ? "text-red-500" : (isHomeLeading ? "text-muted-foreground/60" : "text-foreground")
                    )}>
                        <span className="text-sm font-black leading-none">{away.main}</span>
                        {away.sub && <span className="text-tiny font-medium opacity-60 mt-0.5">{away.sub}</span>}
                    </div>
                </div>
                
                {/* Bi-directional progress bars */}
                <div className="flex h-1 w-full gap-1 px-4 overflow-hidden">
                    <div className="flex-1 flex justify-end">
                        <div 
                            className="h-full bg-blue-500/30 rounded-l-full transition-all duration-500 ease-out" 
                            style={{ width: `${homeWidth}%` }}
                        />
                    </div>
                    <div className="flex-1 flex justify-start">
                        <div 
                            className="h-full bg-red-500/30 rounded-r-full transition-all duration-500 ease-out" 
                            style={{ width: `${awayWidth}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    const formatAccuracy = (success: number, total: number) => {
        if (total === 0) return { main: '0', sub: null };
        const percent = Math.round((success / total) * 100);
        return { main: `${success}/${total}`, sub: `${percent}%` };
    };

    const formatSimple = (value: number | string) => ({ main: value });

    return (
        <div className="flex flex-col h-full bg-sunken-bg/30 rounded-2xl border border-border/30 overflow-hidden">
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <div className="flex flex-col">
                    
                    {/* SCORING */}
                    <div className="px-4 py-1 bg-muted/20 border-b border-border/40">
                        <h4 className="text-2tiny font-black text-primary/90 uppercase tracking-[0.3em]">Scoring</h4>
                    </div>
                    {renderStatRow('Tries', formatSimple(stats.home.tries), formatSimple(stats.away.tries), stats.home.tries, stats.away.tries)}
                    {renderStatRow('Conversions', formatAccuracy(stats.home.conversionSuccess, stats.home.conversionAttempts), formatAccuracy(stats.away.conversionSuccess, stats.away.conversionAttempts), stats.home.conversionSuccess, stats.away.conversionSuccess)}
                    {renderStatRow('Penalty Tries', formatSimple(stats.home.penaltyTries), formatSimple(stats.away.penaltyTries), stats.home.penaltyTries, stats.away.penaltyTries)}
                    {renderStatRow('Penalty Kicks', formatAccuracy(stats.home.penaltyKickSuccess, stats.home.penaltyKickAttempts), formatAccuracy(stats.away.penaltyKickSuccess, stats.away.penaltyKickAttempts), stats.home.penaltyKickSuccess, stats.away.penaltyKickSuccess)}
                    {renderStatRow('Drop Goals', formatAccuracy(stats.home.dropGoalSuccess, stats.home.dropGoalAttempts), formatAccuracy(stats.away.dropGoalSuccess, stats.away.dropGoalAttempts), stats.home.dropGoalSuccess, stats.away.dropGoalSuccess)}

                    {/* DISCIPLINE */}
                    <div className="px-4 py-1 bg-muted/20 border-b border-border/40 mt-1">
                        <h4 className="text-2tiny font-black text-amber-500/90 uppercase tracking-[0.3em]">Discipline</h4>
                    </div>
                    {renderStatRow('Penalties', formatSimple(stats.home.penaltiesAwarded), formatSimple(stats.away.penaltiesAwarded), stats.home.penaltiesAwarded, stats.away.penaltiesAwarded)}
                    {renderStatRow('Free Kicks', formatSimple(stats.home.freeKicksAwarded), formatSimple(stats.away.freeKicksAwarded), stats.home.freeKicksAwarded, stats.away.freeKicksAwarded)}
                    {renderStatRow('Yellow Cards', formatSimple(stats.home.yellowCards), formatSimple(stats.away.yellowCards), stats.home.yellowCards, stats.away.yellowCards)}
                    {renderStatRow('Red Cards', formatSimple(stats.home.redCards), formatSimple(stats.away.redCards), stats.home.redCards, stats.away.redCards)}

                    {/* SET PIECES */}
                    <div className="px-4 py-1 bg-muted/20 border-b border-border/40 mt-1">
                        <h4 className="text-2tiny font-black text-green-500/90 uppercase tracking-[0.3em]">Set Pieces</h4>
                    </div>
                    {renderStatRow('Own Scrums Won', formatAccuracy(stats.home.scrumsWon, stats.home.scrumsTotal), formatAccuracy(stats.away.scrumsWon, stats.away.scrumsTotal), stats.home.scrumsWon, stats.away.scrumsWon)}
                    {renderStatRow('Scrum Resets', formatSimple(stats.home.scrumResets), formatSimple(stats.away.scrumResets), stats.home.scrumResets, stats.away.scrumResets)}
                    {renderStatRow('Own Lineouts Won', formatAccuracy(stats.home.lineoutsWon, stats.home.lineoutsTotal), formatAccuracy(stats.away.lineoutsWon, stats.away.lineoutsTotal), stats.home.lineoutsWon, stats.away.lineoutsWon)}

                    {/* GENERAL PLAY */}
                    <div className="px-4 py-1 bg-muted/20 border-b border-border/40 mt-1">
                        <h4 className="text-2tiny font-black text-blue-500/90 uppercase tracking-[0.3em]">General Play</h4>
                    </div>
                    {renderStatRow('Knock-ons', formatSimple(stats.home.knockOns), formatSimple(stats.away.knockOns), stats.home.knockOns, stats.away.knockOns)}
                    {renderStatRow('Turnovers Won', formatSimple(stats.home.turnovers), formatSimple(stats.away.turnovers), stats.home.turnovers, stats.away.turnovers)}
                    {renderStatRow('Tackles Made', formatSimple(stats.home.tacklesMade), formatSimple(stats.away.tacklesMade), stats.home.tacklesMade, stats.away.tacklesMade)}
                    {renderStatRow('Tackles Missed', formatSimple(stats.home.tacklesMissed), formatSimple(stats.away.tacklesMissed), stats.home.tacklesMissed, stats.away.tacklesMissed)}

                </div>
            </div>
            
            {/* Legend / Info Footer */}
            <div className="px-4 py-2 border-t border-border/40 bg-card/50 flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span className="text-3tiny font-bold text-muted-foreground uppercase tracking-wider">{game.participants?.[0]?.teamId ? store.getTeam(game.participants[0].teamId)?.shortName : 'HOME'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-3tiny font-bold text-muted-foreground uppercase tracking-wider">{game.participants?.[1]?.teamId ? store.getTeam(game.participants[1].teamId)?.shortName : 'AWAY'}</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                </div>
            </div>
        </div>
    );
}
