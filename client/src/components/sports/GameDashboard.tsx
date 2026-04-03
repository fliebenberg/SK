import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationGuardContext } from '@/contexts/NavigationGuardContext';
import { Game } from '@sk/types';
import { SportComponentRegistry, SlotWrapper } from './SportComponentRegistry';
import { TimerPanelSlot } from './shared/TimerPanelSlot';
import { EventLogFeed } from './shared/EventLogFeed';
import { Button } from '@/components/ui/button';
import { MetalButton } from '../ui/MetalButton';
import { RotateCcw, ChevronLeft } from 'lucide-react';
import { store } from '@/app/store/store';
import { ConfirmationModal } from '../ui/ConfirmationModal';

interface GameDashboardProps {
    game: Game;
    sportCategory: string; // e.g., 'Rugby', 'Athletics'
    userRole?: 'SCORER' | 'TIMEKEEPER' | 'JUDGE' | 'REFEREE' | 'FAN';
}

export function GameDashboard({ game, sportCategory, userRole = 'FAN' }: GameDashboardProps) {
    const router = useRouter();
    const { confirmNavigation } = useNavigationGuardContext();
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);

    // Determine accessible tools based on role
    const canScore = ['SCORER', 'JUDGE'].includes(userRole) || store.globalRole === 'admin';
    const canTimekeep = userRole === 'TIMEKEEPER' || (userRole === 'SCORER' /* fallback */) || store.globalRole === 'admin';

    // Resolve specific slots
    const ScoreboardModule = SportComponentRegistry.getScoreboard(sportCategory);
    const ScoringPanelModule = SportComponentRegistry.getScoringPanel(sportCategory);
    const ParticipantListModule = SportComponentRegistry.getParticipantList(sportCategory);

    return (
        <div className="flex flex-col items-center lg:items-start lg:flex-row lg:justify-center gap-2 p-1 sm:p-2 md:p-2 md:pl-0 w-full max-w-full bg-background min-h-screen overflow-x-hidden">
            
            {/* Left Column: Active Management - Scoreboard, Timing, Scoring */}
            <div className="w-full max-w-[512px] lg:flex-1 flex flex-col gap-2 min-w-0">
                
                {/* Header with Back Navigation & Reset Action */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => confirmNavigation(() => router.back())} 
                            className="shrink-0 -ml-3 text-muted-foreground hover:text-primary transition-colors"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </Button>
                        <div className="flex flex-col">
                            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-foreground/90">
                                Game Control
                            </h1>
                            <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
                                {sportCategory} • {game.status}
                            </p>
                        </div>
                    </div>

                    {(store.globalRole === 'admin' || ['SCORER', 'JUDGE'].includes(userRole)) && (
                        <MetalButton 
                            variantType="secondary"
                            size="sm"
                            icon={<RotateCcw className="w-3.5 h-3.5" />}
                            className="bg-destructive/5 hover:bg-destructive/10 text-destructive border-destructive/20 hover:border-destructive/40 px-2 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-sm"
                            onClick={() => setIsResetModalOpen(true)}
                        >
                            Reset Game
                        </MetalButton>
                    )}
                </div>

                <ConfirmationModal 
                    isOpen={isResetModalOpen}
                    onOpenChange={setIsResetModalOpen}
                    title="Reset Game Data?"
                    description="ARE YOU ABSOLUTELY SURE? This will PERMANENTLY DELETE all scores, events, and timings for this game and reset it to scheduled status."
                    confirmText="Reset Everything"
                    variant="destructive"
                    onConfirm={() => store.resetGame(game.id)}
                />

                {/* Scoreboard Slot - Primary Focus */}
                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-primary/0 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                    <div className="relative bg-card rounded-2xl shadow-xl border border-border/50 overflow-hidden">
                        <SlotWrapper>
                            <ScoreboardModule game={game} role={userRole} />
                        </SlotWrapper>
                    </div>
                </div>

                {/* Combined Timing & Scoring area */}
                <div className="flex flex-col gap-2 mt-2">
                    {/* Timing Bar Slot - Compacted as per user request */}
                    <div className="relative bg-card rounded-2xl shadow-sm border-2 border-primary/40 px-3 py-1.5">
                        <div className="absolute -top-3 left-4 px-1.5 bg-card text-[9px] font-black text-primary uppercase tracking-widest leading-none z-10">
                            Timing
                        </div>
                        <TimerPanelSlot game={game} canEdit={canTimekeep} />
                    </div>

                    {/* Scoring Actions Slot */}
                    {canScore && (
                        <div className="relative bg-card rounded-2xl shadow-lg border-2 border-primary/40 p-3 sm:p-4 mt-2">
                            <div className="absolute -top-3 left-4 px-1.5 bg-card text-[9px] font-black text-primary uppercase tracking-widest leading-none z-10">
                                Scoring
                            </div>
                            <SlotWrapper>
                                <ScoringPanelModule game={game} role={userRole} />
                            </SlotWrapper>
                        </div>
                    )}
                </div>

                {/* Rosters / Participant Lists - Collapsible or scrollable? */}
                <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-3 sm:p-4">
                     <SlotWrapper>
                         <ParticipantListModule game={game} role={userRole} />
                     </SlotWrapper>
                </div>
            </div>

            <div className="w-full max-w-[512px] lg:w-[256px] lg:flex-none flex flex-col gap-2 min-h-[600px] min-w-0">
                <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-1.5 flex-1 flex flex-col overflow-hidden">
                     <EventLogFeed gameId={game.id} />
                </div>
            </div>
        </div>
    );
}
