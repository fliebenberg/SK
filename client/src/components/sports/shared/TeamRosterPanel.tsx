import React, { useEffect, useState } from 'react';
import { store } from '@/app/store/store';
import { cn } from '@/lib/utils';

interface TeamRosterPanelProps {
    gameId: string;
    participantId: string;
}

export function TeamRosterPanel({ participantId }: TeamRosterPanelProps) {
    const [roster, setRoster] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        store.fetchGameRoster(participantId).then(data => {
            if (isMounted) {
                // Sort by position number (if available)
                const sorted = [...(data || [])].sort((a, b) => {
                    const posA = parseInt(a.position) || 999;
                    const posB = parseInt(b.position) || 999;
                    return posA - posB;
                });
                setRoster(sorted);
                setIsLoading(false);
            }
        });
        return () => { isMounted = false; };
    }, [participantId]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-48 animate-pulse text-muted-foreground uppercase text-[10px] font-black tracking-widest italic">
                Loading Roster...
            </div>
        );
    }

    if (roster.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground uppercase text-[10px] font-black tracking-widest italic opacity-40">
                No players registered.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 gap-2 p-1 overflow-y-auto custom-scrollbar">
                {roster.map((item) => {
                    const profile = store.orgProfiles.find(p => p.id === item.orgProfileId);
                    const [firstName, ...rest] = (profile?.name || 'Unknown Player').split(' ');
                    const lastName = rest.join(' ');

                    return (
                        <div 
                            key={item.orgProfileId}
                            className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-card border border-border/40 hover:border-primary/30 transition-all group relative shadow-sm"
                        >
                            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-muted border border-border/50 flex items-center justify-center overflow-hidden relative shadow-sm group-hover:scale-105 transition-all">
                                <span className={cn(
                                    "text-primary font-black transition-all",
                                    item.position?.length > 2 ? "text-sm" : "text-xl sm:text-2xl"
                                )}>
                                    {item.position}
                                </span>
                                {profile?.image && (
                                    <img 
                                        src={profile.image} 
                                        alt={profile.name} 
                                        className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity" 
                                    />
                                )}
                            </div>
                            <div className="flex flex-col items-center w-full min-w-0">
                                <span className="text-[10px] font-bold uppercase truncate w-full text-center leading-tight text-foreground/80">
                                    {firstName}
                                </span>
                                <span className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-tighter truncate w-full text-center leading-none">
                                    {lastName || 'Player'}
                                </span>
                            </div>
                            
                            {item.isReserve && (
                                <div className="absolute top-1 right-1 px-1 rounded bg-amber-500/10 border border-amber-500/30">
                                    <span className="text-[6px] font-black text-amber-600 uppercase">RES</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
