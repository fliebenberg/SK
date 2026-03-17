import React, { useState } from 'react';
import { Game } from '@sk/types';
import { SportComponentRegistry, SlotWrapper } from './SportComponentRegistry';
import { TimerPanelSlot } from './shared/TimerPanelSlot';
import { EventLogFeed } from './shared/EventLogFeed';
import { MetalButton } from '../ui/MetalButton';
import { RotateCcw } from 'lucide-react';
import { store } from '@/app/store/store';
import { ConfirmationModal } from '../ui/ConfirmationModal';

interface GameDashboardProps {
    game: Game;
    sportCategory: string; // e.g., 'Rugby', 'Athletics'
    userRole?: 'SCORER' | 'TIMEKEEPER' | 'JUDGE' | 'REFEREE' | 'FAN';
}

export function GameDashboard({ game, sportCategory, userRole = 'FAN' }: GameDashboardProps) {
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);

    // Determine accessible tools based on role
    const canScore = ['SCORER', 'JUDGE'].includes(userRole) || store.globalRole === 'admin';
    const canTimekeep = userRole === 'TIMEKEEPER' || (userRole === 'SCORER' /* fallback */) || store.globalRole === 'admin';

    // Resolve specific slots
    const ScoreboardModule = SportComponentRegistry.getScoreboard(sportCategory);
    const ScoringPanelModule = SportComponentRegistry.getScoringPanel(sportCategory);
    const ParticipantListModule = SportComponentRegistry.getParticipantList(sportCategory);

    return (
        <div className="flex flex-col lg:flex-row gap-8 p-4 md:p-8 max-w-[1600px] mx-auto bg-background min-h-screen">
            
            {/* Left Column: Active Management - Scoreboard, Timing, Scoring */}
            <div className="flex-[1.5] flex flex-col gap-6">
                
                {/* Header with Reset Action */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                        <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight text-foreground/90">
                            Game Control
                        </h1>
                        <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
                            {sportCategory} • {game.status}
                        </p>
                    </div>

                    {(store.globalRole === 'admin' || ['SCORER', 'JUDGE'].includes(userRole)) && (
                        <MetalButton 
                            variantType="secondary"
                            size="sm"
                            icon={<RotateCcw className="w-3.5 h-3.5" />}
                            className="bg-destructive/5 hover:bg-destructive/10 text-destructive border-destructive/20 hover:border-destructive/40"
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
                <div className="flex flex-col gap-6">
                    {/* Timing Bar Slot - Compacted as per user request */}
                    <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-4 py-2">
                         <TimerPanelSlot game={game} canEdit={canTimekeep} />
                    </div>

                    {/* Scoring Actions Slot */}
                    {canScore && (
                        <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-6">
                            <SlotWrapper>
                                <ScoringPanelModule game={game} role={userRole} />
                            </SlotWrapper>
                        </div>
                    )}
                </div>

                {/* Rosters / Participant Lists - Collapsible or scrollable? */}
                <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-6">
                     <SlotWrapper>
                         <ParticipantListModule game={game} role={userRole} />
                     </SlotWrapper>
                </div>
            </div>

            {/* Right Column: Event Log Feed (Game Events) */}
            <div className="flex-1 flex flex-col gap-8 min-h-[600px]">
                <div className="bg-card rounded-2xl shadow-lg border border-border/50 p-6 flex-1 flex flex-col overflow-hidden">
                     <EventLogFeed gameId={game.id} />
                </div>
            </div>
        </div>
    );
}
