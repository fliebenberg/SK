import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { GameEvent } from '@sk/types';
import { useAuth } from '@/contexts/AuthContext';
import { RotateCcw, Scale } from 'lucide-react';
import { UndoVoteDialog } from './UndoVoteDialog';
import { toast } from '@/hooks/use-toast';

export function EventLogFeed({ gameId }: { gameId: string }) {
    const [events, setEvents] = useState<GameEvent[]>([]);
    const { user } = useAuth();
    const [now, setNow] = useState(Date.now());
    const [disputeEvent, setDisputeEvent] = useState<GameEvent | null>(null);

    useEffect(() => {
        // Subscribe to live updates (Server will push last 20 events on join)
        store.subscribeToGame(gameId);
        store.fetchSystemSettings();

        // Sync local state with store
        const sync = () => {
            setEvents([...store.gameEvents].reverse());
        };

        sync();
        const interval = setInterval(() => setNow(Date.now()), 1000);
        const unsubscribe = store.subscribe(sync);

        return () => {
            clearInterval(interval);
            unsubscribe();
        };
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

    const getTeamColor = (event: GameEvent) => {
        if (event.gameParticipantId) {
            const game = store.getGame(gameId);
            const participant = game?.participants?.find(p => p.id === event.gameParticipantId);
            if (participant?.teamId) {
                const index = game?.participants?.indexOf(participant) ?? 0;
                return index === 0 ? 'bg-blue-500' : 'bg-red-500';
            }
        }
        return 'bg-sunken-bg';
    };

    const handleUndo = async (evt: GameEvent) => {
        try {
            const orgId = store.getEvent(evt.id)?.orgId || '';
            const initiatorId = evt.initiatorOrgProfileId || null;
            const res = await store.undoGameEvent(gameId, evt.id, initiatorId);
            if (res.success) {
                toast({ title: "Event Undone", description: "The score has been reversed.", variant: "success" });
            } else {
                toast({ title: "Undo Failed", description: res.error || "Could not undo event.", variant: "destructive" });
            }
        } catch (err) {
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        }
    };

    const handleVote = async (vote: 'APPROVE' | 'REJECT') => {
        if (!disputeEvent) return;
        // In a real implementation, we'd emit CAST_UNDO_VOTE here.
        // For now, we just close the dialog.
        setDisputeEvent(null);
        toast({ title: "Vote Cast", description: `You voted to ${vote.toLowerCase()} the undo.` });
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
                            const eventData = evt.eventData || (evt as any).event_data || {};
                            const snapshot = eventData.scoreSnapshot;
                            const matchTime = eventData.elapsedMS !== undefined 
                                ? formatMatchTime(eventData.elapsedMS)
                                : null;
                            
                            const isScore = evt.type === 'SCORE';
                            const age = now - new Date(evt.timestamp).getTime();
                            const undoDelay = store.undoDelay;
                            const inUndoWindow = age < undoDelay;
                            
                            // Permission & Identity
                            const game = store.getGame(gameId);
                            let isInitiator = store.isMyOrgProfileId(evt.initiatorOrgProfileId || '');
                            if (!evt.initiatorOrgProfileId && store.globalRole === 'admin') {
                                isInitiator = true; // Initial global admins have no org profile
                            }
                            const canScore = store.canScoreGame(gameId);

                            const showUndo = isScore && isInitiator && inUndoWindow;
                            const showDispute = isScore && !inUndoWindow && canScore;

                            return (
                                <div key={evt.id} className="text-sm flex gap-1.5 items-center p-1 px-1 bg-card border border-border/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5 min-h-[44px]">
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
                                    
                                    <div className={cn("h-6 w-0.5 rounded-full shrink-0", getTeamColor(evt))} />
                                    
                                    <div className="flex flex-col min-w-0 flex-1 overflow-hidden px-0.5 gap-0">
                                        <span className="font-black text-[clamp(10.5px,4cqw,13px)] uppercase tracking-wider text-foreground/90 leading-none mb-0.5 line-clamp-2">
                                            {getEventLabel(evt)}
                                        </span>
                                        <span className="text-[clamp(10.5px,4cqw,13px)] font-medium text-muted-foreground/60 uppercase tracking-tight truncate leading-none">
                                            {isScore ? 'SCORE' : (evt.type.includes('CLOCK') ? 'TIMING' : 'ACTION')}
                                        </span>
                                    </div>
                                    
                                    {snapshot && (
                                        <div className="flex items-center gap-1 px-1 py-0.5 bg-sunken-bg/50 rounded-md border border-border/20 shrink-0 mx-0.5">
                                            {(() => {
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
                                    
                                    <div className="ml-auto shrink-0 w-[28px] h-[28px] flex items-center justify-center relative">
                                        {showUndo ? (
                                            <button 
                                                onClick={() => handleUndo(evt)}
                                                className="relative w-full h-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors group"
                                            >
                                                {/* Circular Progress */}
                                                <svg className="absolute inset-0 w-full h-full -rotate-90 transform">
                                                    <circle
                                                        cx="14" cy="14" r="11"
                                                        stroke="currentColor" strokeWidth="2" fill="transparent"
                                                        className="text-muted-foreground/10"
                                                    />
                                                    <circle
                                                        cx="14" cy="14" r="11"
                                                        stroke="currentColor" strokeWidth="2" fill="transparent"
                                                        strokeDasharray={2 * Math.PI * 11}
                                                        strokeDashoffset={(2 * Math.PI * 11) * (age / undoDelay)}
                                                        className="text-muted-foreground group-hover:text-primary transition-all duration-300"
                                                    />
                                                </svg>
                                                <RotateCcw className="w-3.5 h-3.5 relative z-10" />
                                            </button>
                                        ) : showDispute ? (
                                            <button 
                                                onClick={() => setDisputeEvent(evt)}
                                                className="w-[28px] h-[28px] flex items-center justify-center rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer"
                                                title="Dispute this score"
                                            >
                                                <Scale className="w-3.5 h-3.5" />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <UndoVoteDialog 
                isOpen={!!disputeEvent} 
                onClose={() => setDisputeEvent(null)}
                event={disputeEvent}
                onVote={handleVote}
            />
        </div>
    );
}
