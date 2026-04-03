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

    const getEventLabel = (evt: GameEvent) => {
        if (evt.type === 'SCORE' && evt.subType) {
            return evt.subType.toUpperCase();
        }
        
        switch (evt.type) {
            case 'GAME_STARTED': return 'MATCH STARTED';
            case 'GAME_ENDED': return 'MATCH FINISHED';
            case 'GAME_CANCELLED': return 'MATCH CANCELLED';
            case 'PERIOD_STARTED': return 'PERIOD STARTED';
            case 'PERIOD_ENDED': return 'PERIOD ENDED';
            case 'CLOCK_PAUSED': return 'CLOCK PAUSED';
            case 'CLOCK_RESUMED': return 'CLOCK RESUMED';
            default: return evt.type.replace(/_/g, ' ').toUpperCase();
        }
    };

    const getTeamInfo = (event: GameEvent) => {
        const isScore = event.type === 'SCORE';
        const typeCode = isScore ? 'SCO' : 'TIM';
        
        if (event.gameParticipantId) {
            const game = store.getGame(gameId);
            const participant = game?.participants?.find(p => p.id === event.gameParticipantId);
            if (participant?.teamId) {
                const index = game?.participants?.indexOf(participant) ?? 0;
                
                return {
                    color: index === 0 ? 'bg-blue-500' : 'bg-red-500',
                    label: typeCode,
                    typeLabel: isScore ? 'SCORE' : 'ACTION'
                };
            }
        }

        return { 
            color: 'bg-sunken-bg', 
            label: typeCode, 
            typeLabel: isScore ? 'SCORE' : 'TIMING' 
        };
    };

    return (
        <div className="flex flex-col h-full [container-type:inline-size] [@container/playbyplay]">
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
                            const eventData = evt.eventData || (evt as any).event_data || {};
                            const snapshot = eventData.scoreSnapshot;
                            const matchTime = eventData.elapsedMS !== undefined 
                                ? formatMatchTime(eventData.elapsedMS)
                                : null;
                            const actualTime = new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                            
                            return (
                                <div key={evt.id} className="text-sm flex gap-1.5 items-center p-1 px-1 bg-card border border-border/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5">
                                    <div className="flex flex-col items-center min-w-[34px] w-fit px-1 shrink-0 bg-muted/20 py-1 rounded-lg border border-border/10">
                                        <span className="font-mono text-primary text-[10px] sm:text-xs font-black leading-none mb-0.5 text-center">
                                            {matchTime || "--:--"}
                                        </span>
                                        {eventData.period && (
                                            <span className="text-[6px] sm:text-[7px] font-black text-primary/60 uppercase leading-none truncate w-full text-center tracking-tighter">
                                                {eventData.period}
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className={cn("h-6 w-0.5 rounded-full shrink-0", team.color)} />
                                    
                                    <div className="flex flex-col min-w-0 flex-1 overflow-hidden px-0.5 gap-0">
                                        <span className="font-black text-[clamp(10.5px,4cqw,13px)] uppercase tracking-wider text-foreground/90 leading-none mb-0.5 line-clamp-2">
                                            {getEventLabel(evt)}
                                        </span>
                                        <span className="text-[clamp(10.5px,4cqw,13px)] font-medium text-muted-foreground/60 uppercase tracking-tight truncate leading-none">
                                            {team.typeLabel}
                                        </span>
                                    </div>
                                    
                                    {snapshot && (
                                        <div className="flex items-center gap-1 px-1 py-0.5 bg-sunken-bg/50 rounded-md border border-border/20 shrink-0 mx-0.5">
                                            {(() => {
                                                const game = store.getGame(gameId);
                                                const p1 = game?.participants?.[0];
                                                const p2 = game?.participants?.[1];
                                                const s1 = (snapshot as any)[p1?.id || ''] || 0;
                                                const s2 = (snapshot as any)[p2?.id || ''] || 0;
                                                return (
                                                    <>
                                                        <span className="font-black text-[10px] text-blue-500">{s1}</span>
                                                        <span className="text-[8px] font-black opacity-20">—</span>
                                                        <span className="font-black text-[10px] text-red-500">{s2}</span>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}
                                    
                                    <span className={cn(
                                        "ml-auto font-black text-[8px] px-1.5 py-0.5 rounded italic shrink-0 min-w-[28px] text-center",
                                        "bg-muted-foreground/5 text-muted-foreground/40 border border-border/10"
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
