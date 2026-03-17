import React from 'react';
import { cn } from '@/lib/utils';

export function EventLogFeed({ gameId }: { gameId: string }) {
    // In a real implementation, this listens to the game:[id]:events socket room
    // and prepends items to this list.
    const mockEvents = [
        { id: '1', time: '14:23', type: 'TRY', team: 'Home', player: 'John Smith' },
        { id: '2', time: '12:05', type: 'PENALTY', team: 'Away', player: 'Mike Davis' },
        { id: '3', time: '00:00', type: 'KICK-OFF', team: 'Home', player: '' }
    ];

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-sm text-muted-foreground uppercase tracking-[0.2em]">Play-by-Play</h3>
                <div className="h-1 flex-1 bg-border/30 ml-4 rounded-full"></div>
            </div>
            <div className="flex-1 bg-sunken-bg/50 border border-border/30 rounded-2xl p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <div className="flex flex-col gap-3">
                    {mockEvents.map(evt => (
                        <div key={evt.id} className="text-sm flex gap-4 items-center p-3 bg-card border border-border/40 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5">
                            <span className="font-mono text-muted-foreground w-10 text-[10px] font-bold">{evt.time}</span>
                            <div className={cn(
                                "h-6 w-1 rounded-full",
                                evt.team === 'Home' ? 'bg-blue-500' : 'bg-red-500'
                            )} />
                            <div className="flex flex-col">
                                <span className="font-black text-[10px] uppercase tracking-wider text-foreground/80 leading-none mb-1">
                                    {evt.type}
                                </span>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                                    {evt.player || 'System'}
                                </span>
                            </div>
                            <span className={cn(
                                "ml-auto font-black text-[10px] px-2 py-0.5 rounded italic",
                                evt.team === 'Home' ? 'bg-blue-500/10 text-blue-600' : 'bg-red-500/10 text-red-600'
                            )}>
                                {evt.team.toUpperCase()}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
