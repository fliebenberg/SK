import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { GameEvent } from '@sk/types';
import { useAuth } from '@/contexts/AuthContext';

export function EventLogFeed({ gameId }: { gameId: string }) {
    const [events, setEvents] = useState<GameEvent[]>([]);
    const { user } = useAuth();

    useEffect(() => {
        // Subscribe to live updates (Server will push last 20 events on join)
        store.subscribeToGame(gameId);

        // Sync local state with store
        const sync = () => {
            setEvents([...store.gameEvents].reverse()); // Newest first for feed? 
            // Actually the mock shows 14:23, 12:05, 00:00 - which is newest first.
        };

        sync();
        return store.subscribe(sync);
    }, [gameId]);

    const formatMatchTime = (ms?: number) => {
        if (ms === undefined) return "--:--";
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getEventLabel = (type: string) => {
        switch (type) {
            case 'GAME_STARTED': return 'Match Started';
            case 'GAME_ENDED': return 'Match Finished';
            case 'GAME_CANCELLED': return 'Match Cancelled';
            case 'PERIOD_STARTED': return 'Period Started';
            case 'PERIOD_ENDED': return 'Period Ended';
            case 'CLOCK_PAUSED': return 'Clock Paused';
            case 'CLOCK_RESUMED': return 'Clock Resumed';
            default: return type.replace(/_/g, ' ');
        }
    };

    const getTeamInfo = (event: GameEvent) => {
        // For now, these system/timer events aren't team-specific.
        // We might later add actorTeamId to GameEvent.
        return { name: 'Timing', color: 'bg-muted-foreground/30', label: 'TIM' };
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
                <h3 className="font-black text-sm text-muted-foreground uppercase tracking-[0.2em]">Play-by-Play</h3>
                <div className="h-1 flex-1 bg-border/30 ml-4 rounded-full"></div>
            </div>
            <div className="flex-1 bg-sunken-bg/50 border border-border/30 rounded-2xl p-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <div className="flex flex-col gap-1">
                    {events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/40">
                             <span className="text-[10px] font-black uppercase tracking-widest italic">Waiting for kickoff...</span>
                        </div>
                    ) : (
                        events.map(evt => {
                            const team = getTeamInfo(evt);
                            const matchTime = evt.eventData?.elapsedMS !== undefined 
                                ? formatMatchTime(evt.eventData.elapsedMS)
                                : null;
                            const actualTime = new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                            
                            return (
                                <div key={evt.id} className="text-sm flex gap-2 sm:gap-4 items-center p-1.5 bg-card border border-border/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5">
                                    <div className="flex flex-col items-center w-10 sm:w-12 shrink-0">
                                        <span className="font-mono text-muted-foreground text-[10px] font-bold leading-none mb-1 text-center">
                                            {matchTime || actualTime}
                                        </span>
                                        {evt.eventData?.period && (
                                            <span className="text-[7px] font-black text-primary/60 uppercase leading-none truncate w-full text-center">
                                                {evt.eventData.period}
                                            </span>
                                        )}
                                        {matchTime && (
                                            <span className="text-[8px] font-medium text-muted-foreground/50 leading-none mt-1 text-center">
                                                {actualTime}
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className={cn("h-8 w-1 rounded-full", team.color)} />
                                    
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="font-black text-[10px] uppercase tracking-wider text-foreground/80 leading-none mb-1 truncate">
                                            {getEventLabel(evt.type)}
                                        </span>
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight truncate">
                                            {evt.eventData?.reason || team.name}
                                        </span>
                                    </div>
                                    
                                    <span className={cn(
                                        "ml-auto font-black text-[9px] px-2 py-1 rounded italic shrink-0",
                                        "bg-muted-foreground/10 text-muted-foreground/60"
                                    )}>
                                        {team.label}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
