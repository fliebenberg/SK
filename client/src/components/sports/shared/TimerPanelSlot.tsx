import React, { useState } from 'react';
import { Game } from '@sk/types';
import { store } from '@/app/store/store';
import { cn } from '@/lib/utils';
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

function TimingActionButton({ label, onClick, disabled, className, icon, title }: { label: string, onClick: () => void, disabled?: boolean, className?: string, icon?: React.ReactNode, title?: string }) {
    return (
        <button 
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={cn(
                "group relative flex items-center justify-center gap-1.5 rounded-md transition-all duration-200 border shadow-sm active:scale-[0.95] disabled:opacity-30 disabled:pointer-events-none px-3 h-8 sm:h-9",
                "text-foreground",
                className
            )}
        >
            {icon && <div className="shrink-0">{icon}</div>}
            <span className="font-black uppercase tracking-tight text-[10px] sm:text-[11.5px] leading-tight">{label}</span>
        </button>
    );
}

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
                        <TimingActionButton 
                            disabled={isDebouncing}
                            onClick={() => {
                                handleUpdateStatus('Live');
                                handleClockAction('START');
                            }}
                            className="bg-green-600/55 border-green-600/50 hover:bg-green-600/75 hover:border-green-600/80"
                            title="Start Game & Match Clock"
                            icon={<Play className="h-3.5 w-3.5 fill-current" />}
                            label="Start Game"
                        />
                    )}

                    {game.status === 'Live' && (
                        isPeriodActive ? (
                            <TimingActionButton 
                                disabled={isDebouncing}
                                onClick={() => handleClockAction(
                                    isRunning ? 'PAUSE' : 'RESUME',
                                    isRunning ? 'CLOCK_PAUSED' : 'CLOCK_RESUMED'
                                )}
                                className={cn(
                                    isRunning ? "bg-slate-400/40 border-slate-400/50 hover:bg-slate-400/65" : "bg-green-600/55 border-green-600/50 hover:bg-green-600/75"
                                )}
                                title={isRunning ? "Stop the clock temporarily" : "Continue timing"}
                                icon={isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                                label={isRunning ? "Pause" : "Resume"}
                            />
                        ) : (
                            <TimingActionButton 
                                disabled={isDebouncing}
                                onClick={() => handleClockAction('START_PERIOD', 'PERIOD_STARTED')}
                                className="bg-green-600/55 border-green-600/50 hover:bg-green-600/75 hover:border-green-600/80"
                                title="Start Next Period"
                                icon={<Play className="h-3.5 w-3.5 fill-current" />}
                                label="Start Period"
                            />
                        )
                    )}
                </div>
            )}
            
            {canEdit && (
                <div className="flex items-center gap-2 justify-end flex-wrap sm:flex-nowrap">
                    {/* RIGHT SIDE BUTTONS */}
                    <div className="hidden sm:block w-[1px] h-4 bg-border/40 mx-1" />
                        
                        {(game.status === 'Scheduled' || (game.status === 'Live' && !isPeriodActive && periodIndex + 1 < scheduledPeriods)) && (
                            <TimingActionButton 
                                onClick={() => setShowCancelModal(true)}
                                className="bg-red-500/10 border-red-500/30 hover:bg-red-500/20"
                                title="Cancel Game"
                                icon={<Square className="h-3 w-3" />}
                                label="Cancel Game"
                            />
                        )}

                        {game.status === 'Live' && isPeriodActive && (!isRunning || currentMS >= (clock?.periodLengthMS || 0)) && (
                            <TimingActionButton 
                                disabled={isDebouncing}
                                onClick={() => handleClockAction('END_PERIOD', 'PERIOD_ENDED')}
                                className="bg-orange-500/55 border-orange-500/50 hover:bg-orange-500/75"
                                title="End Current Period"
                                icon={<Square className="h-3 w-3 fill-current" />}
                                label="End Half"
                            />
                        )}

                        {(game.status === 'Scheduled' || (game.status === 'Live' && !isPeriodActive && periodIndex + 1 >= scheduledPeriods)) && (
                            <TimingActionButton 
                                onClick={() => handleUpdateStatus('Finished')}
                                className="bg-red-600/55 border-red-600/50 hover:bg-red-600/75"
                                title="Finalize Match"
                                icon={<Square className="h-3 w-3 fill-current" />}
                                label="End Game"
                            />
                        )}

                        {game.status === 'Finished' && (
                             <TimingActionButton 
                                onClick={() => setShowCancelModal(true)}
                                className="bg-red-500/10 border-red-500/30 text-red-600 hover:bg-red-500/20"
                                title="Cancel Finished Game"
                                icon={<RotateCcw className="h-3 w-3" />}
                                label="Cancel Game"
                            />
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
                <DialogFooter className="gap-2 sm:gap-2">
                    <TimingActionButton 
                        onClick={() => setShowCancelModal(false)}
                        label="Keep Game"
                        className="bg-secondary/10 border-secondary/20 hover:bg-secondary/20 px-4"
                    />
                    <TimingActionButton 
                        disabled={!cancelReason.trim()}
                        onClick={() => handleUpdateStatus('Cancelled', cancelReason)}
                        label="Confirm Cancellation"
                        className="bg-red-600/55 border-red-600/50 hover:bg-red-600/75 px-4"
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}
