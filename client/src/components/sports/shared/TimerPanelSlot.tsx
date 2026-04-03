import React, { useState } from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { MetalButton } from '@/components/ui/MetalButton';
import { Play, Pause, RotateCcw, Square, XCircle } from 'lucide-react';
import { useGameTimer } from '@/hooks/useGameTimer';
import { getPeriodLabel } from '@sk/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function TimerPanelSlot({ game, canEdit }: { game: Game, canEdit: boolean }) {
    const { 
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
        
        // Fetch updated game state from store to get correct period/state
        const updatedGame = store.getGame(game.id);

        // Record event
        let type = 'GAME_UPDATED';
        if (status === 'Live') type = 'GAME_STARTED';
        else if (status === 'Finished') type = 'GAME_ENDED';
        else if (status === 'Cancelled') type = 'GAME_CANCELLED';

        store.addGameEvent({
            gameId: game.id,
            initiatorOrgProfileId: initiatorProfile,
            type,
            eventData: { 
                status, 
                reason, 
                timestamp: new Date().toISOString(),
                elapsedMS: currentMS,
                period: updatedGame?.liveState?.periodLabel || game.liveState?.periodLabel
            }
        });
        
        if (status === 'Cancelled') {
            setShowCancelModal(false);
            setCancelReason("");
        }
    };

    const handleClockAction = async (action: 'START' | 'PAUSE' | 'RESUME' | 'RESET' | 'SET_PERIOD' | 'END_PERIOD' | 'START_PERIOD', eventType?: string) => {
        if (isDebouncing) return;
        
        // Capture the current live time BEFORE the action changes the state
        const actionElapsedMS = currentMS;
        const currentPeriodLabel = game.liveState?.periodLabel || getPeriodLabel(clock?.periodIndex ?? 0, 'Period');

        await store.updateGameClock(game.id, action);
        
        // Fetch updated game state from store (it should have been updated optimistically)
        const updatedGame = store.getGame(game.id);
        const updatedPeriodLabel = updatedGame?.liveState?.periodLabel || currentPeriodLabel;

        // Record event if type provided
        if (eventType) {
            store.addGameEvent({
                gameId: game.id,
                initiatorOrgProfileId: initiatorProfile,
                type: eventType,
                eventData: { 
                    action, 
                    period: updatedPeriodLabel,
                    elapsedMS: actionElapsedMS
                }
            });
        }

        setIsDebouncing(true);
        setTimeout(() => setIsDebouncing(false), 1000);
    };

    // getOrdinalSuffix removed as it is now in shared gameUtils

    return (
        <>
        <div className="flex flex-wrap items-center justify-between w-full h-auto min-h-[40px] gap-y-3 py-1 sm:py-0">
            {canEdit && (
                <div className="flex items-center gap-2 flex-1 min-w-fit">
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
            
            {canEdit && (
                <div className="flex items-center gap-2 justify-end flex-wrap sm:flex-nowrap">
                    {/* RIGHT SIDE BUTTONS */}
                    <div className="hidden sm:block w-[1px] h-4 bg-border/40 mx-1" />
                        
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

                        {(game.status === 'Scheduled' || (game.status === 'Live' && !isPeriodActive && periodIndex + 1 >= scheduledPeriods)) && (
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
