import React, { useState } from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { MetalButton } from '@/components/ui/MetalButton';
import { cn } from '@/lib/utils';
import { Play, Pause, RotateCcw, Square, MoreHorizontal, XCircle } from 'lucide-react';
import { useGameTimer } from '@/hooks/useGameTimer';
import { useAuth } from '@/contexts/AuthContext';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function TimerPanelSlot({ game, canEdit }: { game: Game, canEdit: boolean }) {
    const { user } = useAuth();
    const { 
        formattedTime, 
        formattedActualTime, 
        formattedTotalDuration, 
        isRunning,
        currentMS
    } = useGameTimer(game.liveState?.clock, game.startTime, game.finishTime);
    const [isDebouncing, setIsDebouncing] = useState(false);
    
    // Cancellation Modal State
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReason, setCancelReason] = useState("");

    const clock = game.liveState?.clock;
    const isPeriodActive = clock?.isPeriodActive ?? false;
    const periodIndex = clock?.periodIndex ?? 0;
    const scheduledPeriods = clock?.scheduledPeriods ?? 2;

    // Find the relevant org profile for the current user to act as initiator
    const event = store.getEvent(game.eventId);
    const eventOrgId = event?.orgId;
    const initiatorProfile = store.userOrgMemberships
        .find(m => m.orgId === eventOrgId)?.orgProfileId;

    const handleUpdateStatus = async (status: Game['status'], reason?: string) => {
        await store.updateGameStatus(game.id, status);
        
        // Record event
        let type = 'GAME_UPDATED';
        if (status === 'Live') type = 'GAME_STARTED';
        else if (status === 'Finished') type = 'GAME_ENDED';
        else if (status === 'Cancelled') type = 'GAME_CANCELLED';

        store.addGameEvent({
            gameId: game.id,
            initiatorOrgProfileId: initiatorProfile,
            type,
            eventData: { status, reason, timestamp: new Date().toISOString() }
        });
        
        if (status === 'Cancelled') {
            setShowCancelModal(false);
            setCancelReason("");
        }
    };

    const handleClockAction = async (action: 'START' | 'PAUSE' | 'RESUME' | 'RESET' | 'SET_PERIOD' | 'END_PERIOD' | 'START_PERIOD', eventType?: string) => {
        if (isDebouncing) return;
        
        await store.updateGameClock(game.id, action);
        
        // Record event if type provided
        if (eventType) {
            store.addGameEvent({
                gameId: game.id,
                initiatorOrgProfileId: initiatorProfile,
                type: eventType,
                eventData: { 
                    action, 
                    period: game.liveState?.periodLabel || `${(clock?.periodIndex ?? 0) + 1}${getOrdinalSuffix((clock?.periodIndex ?? 0) + 1)} Period`,
                    elapsedMS: clock?.elapsedMS || 0
                }
            });
        }

        setIsDebouncing(true);
        setTimeout(() => setIsDebouncing(false), 1000);
    };

    function getOrdinalSuffix(i: number) {
        const j = i % 10, k = i % 100;
        if (j === 1 && k !== 11) return "st";
        if (j === 2 && k !== 12) return "nd";
        if (j === 3 && k !== 13) return "rd";
        return "th";
    }

    return (
        <>
        <div className="flex items-center justify-between w-full h-10">
            {canEdit && (
                <div className="flex items-center gap-2 flex-1">
                    {/* LEFT SIDE BUTTONS */}
                    {game.status === 'Scheduled' && (
                        <MetalButton 
                            variantType="filled" 
                            size="sm"
                            disabled={isDebouncing}
                            onClick={() => {
                                handleUpdateStatus('Live');
                                handleClockAction('START');
                            }}
                            glowColor="hsl(var(--success))"
                            className="h-8 px-4 rounded-md"
                            title="Start Game & Match Clock"
                            icon={<Play className="h-3.5 w-3.5 fill-current" />}
                        >
                            <span className="text-[10px] font-black uppercase tracking-widest">
                                Start Game
                            </span>
                        </MetalButton>
                    )}

                    {game.status === 'Live' && (
                        isPeriodActive ? (
                            <MetalButton 
                                variantType={isRunning ? "secondary" : "filled"} 
                                size="sm"
                                disabled={isDebouncing}
                                onClick={() => handleClockAction(
                                    isRunning ? 'PAUSE' : 'RESUME',
                                    isRunning ? 'CLOCK_PAUSED' : 'CLOCK_RESUMED'
                                )}
                                glowColor={isRunning ? undefined : "hsl(var(--primary))"}
                                className="h-8 px-4 rounded-md"
                                title={isRunning ? "Stop the clock temporarily" : "Continue timing"}
                                icon={isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                            >
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                    {isRunning ? "Pause" : "Resume"}
                                </span>
                            </MetalButton>
                        ) : (
                            <MetalButton 
                                variantType="filled" 
                                size="sm"
                                disabled={isDebouncing}
                                onClick={() => handleClockAction('START_PERIOD', 'PERIOD_STARTED')}
                                glowColor="hsl(var(--primary))"
                                className="h-8 px-4 rounded-md"
                                title="Start Next Period"
                                icon={<Play className="h-3.5 w-3.5 fill-current" />}
                            >
                                <span className="text-[10px] font-black uppercase tracking-widest">
                                    Start Period
                                </span>
                            </MetalButton>
                        )
                    )}
                </div>
            )}
            
            <div className="flex items-center gap-2">
                {/* Timer Display */}
                <div className="flex flex-col items-end mr-2">
                     <span className="font-mono text-[10px] font-black text-muted-foreground/40 leading-none mb-0.5 uppercase">
                        {game.status === 'Live' ? (isPeriodActive ? "Elapsed" : "Break") : game.status}
                     </span>
                     <div className="flex items-baseline gap-2">
                        {game.status !== 'Scheduled' && (
                            <div className="flex flex-col items-end leading-tight opacity-40 hover:opacity-100 transition-opacity">
                                <span className="text-[7px] font-bold uppercase tracking-tighter">Act / Tot</span>
                                <span className="text-[8px] font-mono font-bold tracking-tighter">
                                    {formattedActualTime} / {formattedTotalDuration}
                                </span>
                            </div>
                        )}
                        <span className={cn(
                            "font-mono text-xs font-bold leading-none",
                            isRunning ? "text-primary dark:text-primary-foreground/90" : "text-muted-foreground"
                        )}>
                            {formattedTime}
                        </span>
                     </div>
                </div>

                {canEdit && (
                    <div className="flex items-center gap-2">
                        {/* RIGHT SIDE BUTTONS */}
                        <div className="w-[1px] h-4 bg-border/40 mx-1" />
                        
                        {(game.status === 'Scheduled' || (game.status === 'Live' && !isPeriodActive && periodIndex + 1 < scheduledPeriods)) && (
                            <MetalButton 
                                variantType="outlined" 
                                size="sm"
                                onClick={() => setShowCancelModal(true)}
                                glowColor="hsl(var(--destructive))"
                                className="h-8 px-3 rounded-md border-destructive/30 hover:bg-destructive/10 text-destructive"
                                title="Cancel Game"
                                icon={<Square className="h-3 w-3" />}
                            >
                                <span className="text-[9px] font-black uppercase tracking-wider">Cancel Game</span>
                            </MetalButton>
                        )}

                        {game.status === 'Live' && isPeriodActive && (!isRunning || currentMS >= (clock?.periodLengthMS || 0)) && (
                            <MetalButton 
                                variantType="outlined" 
                                size="sm"
                                disabled={isDebouncing}
                                onClick={() => handleClockAction('END_PERIOD', 'PERIOD_ENDED')}
                                className="h-8 px-3 rounded-md border-amber-500/40 text-amber-600 hover:bg-amber-500/5"
                                title="End Current Period"
                                icon={<Square className="h-3 w-3 fill-current" />}
                            >
                                <span className="text-[9px] font-bold uppercase tracking-wider">End Half</span>
                            </MetalButton>
                        )}

                        {game.status === 'Live' && !isPeriodActive && periodIndex + 1 >= scheduledPeriods && (
                            <MetalButton 
                                variantType="filled" 
                                size="sm"
                                onClick={() => handleUpdateStatus('Finished')}
                                glowColor="hsl(var(--destructive))"
                                className="h-8 px-3 rounded-md bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                title="Finalize Match"
                                icon={<Square className="h-3 w-3 fill-current" />}
                            >
                                <span className="text-[9px] font-black uppercase tracking-wider">End Game</span>
                            </MetalButton>
                        )}

                        {game.status === 'Finished' && (
                             <MetalButton 
                                variantType="outlined" 
                                size="sm"
                                onClick={() => setShowCancelModal(true)}
                                glowColor="hsl(var(--destructive))"
                                className="h-8 px-3 rounded-md border-destructive/30 hover:bg-destructive/10 text-destructive"
                                title="Cancel Finished Game"
                                icon={<RotateCcw className="h-3 w-3" />}
                            >
                                <span className="text-[9px] font-black uppercase tracking-wider">Cancel Game</span>
                            </MetalButton>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Cancel Modal */}
        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        <XCircle className="h-5 w-5" />
                        Cancel Game
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <p className="text-sm text-muted-foreground">
                        Are you sure you want to cancel this game? This action will mark the game as cancelled in the event log. Please provide a reason below.
                    </p>
                    <div className="space-y-2">
                        <Textarea 
                            placeholder="Reason for cancellation (e.g., Weather, Team Forfeit...)"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="min-h-[100px] resize-none"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <MetalButton 
                        variantType="secondary" 
                        onClick={() => setShowCancelModal(false)}
                        className="h-9 px-4 rounded-md"
                    >
                        Keep Game
                    </MetalButton>
                    <MetalButton 
                        variantType="filled"
                        glowColor="hsl(var(--destructive))"
                        disabled={!cancelReason.trim()}
                        onClick={() => handleUpdateStatus('Cancelled', cancelReason)}
                        className="h-9 px-4 rounded-md bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                        Confirm Cancellation
                    </MetalButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}
