import React, { useState } from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { MetalButton } from '@/components/ui/MetalButton';
import { cn } from '@/lib/utils';
import { Play, Pause, RotateCcw, Square, MoreHorizontal } from 'lucide-react';
import { useGameTimer } from '@/hooks/useGameTimer';

export function TimerPanelSlot({ game, canEdit }: { game: Game, canEdit: boolean }) {
    const { formattedTime, isRunning } = useGameTimer(game.liveState?.clock);
    const [isDebouncing, setIsDebouncing] = useState(false);

    const handleUpdateStatus = (status: "Scheduled" | "Live" | "Finished") => {
        store.updateGameStatus(game.id, status);
    };

    const handleClockAction = (action: 'START' | 'PAUSE' | 'RESUME' | 'RESET' | 'SET_PERIOD') => {
        if (isDebouncing) return;
        
        store.updateGameClock(game.id, action);
        setIsDebouncing(true);
        setTimeout(() => setIsDebouncing(false), 1000);
    };

    return (
        <div className="flex items-center justify-between w-full h-10">
            {canEdit && (
                <div className="flex items-center gap-2 flex-1">
                    {/* Primary Action: Start/Pause - Far Left */}
                    <MetalButton 
                        variantType={isRunning ? "secondary" : "filled"} 
                        size="sm"
                        disabled={isDebouncing}
                        onClick={() => {
                            if (game.status === 'Scheduled') {
                                handleUpdateStatus('Live');
                                handleClockAction('START');
                            } else {
                                handleClockAction(isRunning ? 'PAUSE' : 'RESUME');
                            }
                        }}
                        glowColor={isRunning ? undefined : "hsl(var(--success))"}
                        className="h-8 px-4 rounded-md"
                        title={game.status === 'Scheduled' ? "Start Match" : (isRunning ? "Pause Clock" : "Resume Clock")}
                        icon={isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                    >
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {game.status === 'Scheduled' ? "Start Match" : (isRunning ? "Pause" : "Resume")}
                        </span>
                    </MetalButton>

                    <div className="w-[1px] h-4 bg-border/40 mx-1" />

                    {/* Period Controls - Mutually Exclusive */}
                    {!isRunning ? (
                        <MetalButton 
                            variantType="outlined" 
                            size="sm"
                            disabled={isDebouncing}
                            onClick={() => handleClockAction('RESUME')} // Or a specific START_PERIOD action if we add it
                            className="h-8 px-3 rounded-md border-border/60"
                            title="Start Next Half/Period"
                            icon={<RotateCcw className="h-3 w-3" />}
                        >
                            <span className="text-[9px] font-bold uppercase tracking-wider">Start Half</span>
                        </MetalButton>
                    ) : (
                        <MetalButton 
                            variantType="outlined" 
                            size="sm"
                            disabled={isDebouncing}
                            onClick={() => handleClockAction('PAUSE')}
                            className="h-8 px-3 rounded-md border-border/60"
                            title="End Current Half/Period"
                            icon={<Square className="h-3 w-3 fill-current" />}
                        >
                            <span className="text-[9px] font-bold uppercase tracking-wider">End Half</span>
                        </MetalButton>
                    )}
                </div>
            )}
            
            <div className="flex items-center gap-2">
                {/* Timer Display */}
                <span className="font-mono text-xs font-bold text-muted-foreground mr-2">{formattedTime}</span>

                {canEdit && (
                    <>
                        <MetalButton 
                            variantType="outlined" 
                            size="sm"
                            onClick={() => handleUpdateStatus('Finished')}
                            glowColor="hsl(var(--destructive))"
                            className="h-8 px-3 rounded-md border-destructive/30"
                            title="End Match"
                            icon={<Square className="h-3 w-3 fill-current" />}
                        >
                            <span className="text-[9px] font-black uppercase tracking-wider">End Game</span>
                        </MetalButton>

                        <div className="w-[1px] h-4 bg-border/40 mx-1" />
                        
                        <MetalButton 
                            variantType="secondary" 
                            size="icon"
                            className="h-8 w-8 rounded-md"
                            title="More Timing Options"
                            icon={<MoreHorizontal className="h-3.5 w-3.5" />}
                        >
                            {null}
                        </MetalButton>
                    </>
                )}
            </div>
        </div>
    );
}

// Minimal change to fix RugbyScoreboard lint in same tool call if possible, 
// but replace_file_content is for one specific file as per instructions.
// I will do it in a separate multi_replace_file_content call if I want to be safe,
// but the instruction says "Fix the OrgLogo typing in RugbyScoreboard" so I'll try to include it if I can.
// Wait, I can only edit ONE file with replace_file_content.
