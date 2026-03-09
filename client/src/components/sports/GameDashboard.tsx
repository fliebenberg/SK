import React, { useState } from 'react';
import { Game } from '@sk/types';
import { SportComponentRegistry, SlotWrapper } from './SportComponentRegistry';
import { TimerPanelSlot } from './shared/TimerPanelSlot';
import { EventLogFeed } from './shared/EventLogFeed';

interface GameDashboardProps {
    game: Game;
    sportCategory: string; // e.g., 'Rugby', 'Athletics'
    userRole?: 'SCORER' | 'TIMEKEEPER' | 'JUDGE' | 'REFEREE' | 'FAN';
}

export function GameDashboard({ game, sportCategory, userRole = 'FAN' }: GameDashboardProps) {
    // Determine accessible tools based on role
    const isOfficial = ['SCORER', 'TIMEKEEPER', 'JUDGE', 'REFEREE'].includes(userRole);
    const canScore = ['SCORER', 'JUDGE'].includes(userRole);
    const canTimekeep = userRole === 'TIMEKEEPER' || (userRole === 'SCORER' /* fallback */);

    // Resolve specific slots
    const ScoreboardModule = SportComponentRegistry.getScoreboard(sportCategory);
    const ScoringPanelModule = SportComponentRegistry.getScoringPanel(sportCategory);
    const ParticipantListModule = SportComponentRegistry.getParticipantList(sportCategory);

    return (
        <div className="flex flex-col md:flex-row gap-6 p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
            
            {/* Left Column: Core Match Info & Timing */}
            <div className="flex-1 flex flex-col gap-6">
                
                {/* Scoreboard Slot */}
                <div className="bg-white rounded-xl shadow-sm border p-4">
                    <SlotWrapper>
                        <ScoreboardModule game={game} role={userRole} />
                    </SlotWrapper>
                </div>

                {/* Timing Slot (Only for officials or read-only for fans) */}
                <div className="bg-white rounded-xl shadow-sm border p-4">
                     <TimerPanelSlot game={game} canEdit={canTimekeep} />
                </div>

                {/* Event Log Trailer */}
                <div className="bg-white rounded-xl shadow-sm border p-4 flex-1">
                     <EventLogFeed gameId={game.id} />
                </div>
            </div>

            {/* Right Column: Active Management & Rosters */}
            <div className="flex-1 flex flex-col gap-6">
                
                {/* Scoring Actions Slot */}
                {canScore && (
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <SlotWrapper>
                            <ScoringPanelModule game={game} role={userRole} />
                        </SlotWrapper>
                    </div>
                )}

                {/* Rosters / Start Lists */}
                <div className="bg-white rounded-xl shadow-sm border p-4">
                     <SlotWrapper>
                         <ParticipantListModule game={game} role={userRole} />
                     </SlotWrapper>
                </div>

            </div>

        </div>
    );
}
