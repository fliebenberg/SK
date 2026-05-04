import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigationGuardContext } from '@/contexts/NavigationGuardContext';
import { Game } from '@sk/types';
import { SportComponentRegistry, SlotWrapper } from './SportComponentRegistry';
import { TimerPanelSlot } from './shared/TimerPanelSlot';
import { EventLogFeed } from './shared/EventLogFeed';
import { Button } from '@/components/ui/button';
import { MetalButton } from '../ui/MetalButton';
import { RotateCcw, ChevronLeft, ChevronUp, ChevronDown } from 'lucide-react';
import { ActiveDisputesPanel } from './shared/ActiveDisputesPanel';
import { store } from '@/app/store/store';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamRosterPanel } from './shared/TeamRosterPanel';
import { Users, Activity, BarChart3 } from 'lucide-react';
import { DynamicScoringProvider, useSharedDynamicScoring } from './shared/DynamicScoringContext';
import { DynamicScoringDialog } from './shared/DynamicScoringDialog';
import RugbyGameStats from './rugby/RugbyGameStats';

const DynamicScoringDialogRenderer = () => {
    const { scoringState, pendingDispute, resolveDispute, confirmRemoval } = useSharedDynamicScoring();
    
    return (
        <>
            {scoringState.status === 'ACTIVE' && <DynamicScoringDialog />}
            {scoringState.status === 'CONFIRM_REMOVAL' && (
                <ConfirmationModal 
                    isOpen={true}
                    onOpenChange={(open) => { if(!open) confirmRemoval(false); }}
                    title="Confirm Removal"
                    description="Are you sure you want to remove this event? This will affect the game score if it's a scoring event."
                    confirmText="Remove Event"
                    cancelText="Cancel"
                    onConfirm={() => confirmRemoval(true)}
                    variant="destructive"
                />
            )}
            {pendingDispute && (
                <ConfirmationModal 
                    isOpen={true}
                    onOpenChange={(open) => { if(!open) resolveDispute(false); }}
                    title={pendingDispute.isRemoval ? "Dispute Event Removal" : "Dispute Event Correction"}
                    description={`You are ${pendingDispute.isRemoval ? 'removing' : 'correcting'} a scoring event. This requires official consensus. Proceed?`}
                    confirmText="Request Consensus"
                    cancelText="Cancel"
                    onConfirm={() => resolveDispute(true)}
                    variant={pendingDispute.isRemoval ? "destructive" : "default"}
                />
            )}
        </>
    );
};

interface GameDashboardProps {
    game: Game;
    sportCategory: string; // e.g., 'Rugby', 'Athletics'
    userRole?: 'SCORER' | 'TIMEKEEPER' | 'JUDGE' | 'REFEREE' | 'FAN';
}

interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    storageKey: string;
    className?: string;
    defaultExpanded?: boolean;
}

const CollapsibleDashboardSection = ({ 
    title, 
    children, 
    storageKey, 
    className = "", 
    defaultExpanded = true 
}: CollapsibleSectionProps) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    React.useEffect(() => {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) {
            setIsExpanded(stored === 'true');
        }
    }, [storageKey]);

    const toggle = () => {
        const newState = !isExpanded;
        setIsExpanded(newState);
        localStorage.setItem(storageKey, String(newState));
    };

    return (
        <div className={`relative bg-card rounded-2xl border-2 border-primary/40 px-3 py-1.5 ${className}`}>
            <div 
                className="absolute -top-3 left-4 px-1.5 bg-card text-2tiny font-black text-primary uppercase tracking-widest leading-none z-10 flex items-center gap-1 cursor-pointer select-none hover:text-primary/80 transition-colors"
                onClick={toggle}
            >
                {title}
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </div>
            {isExpanded ? (
                <div className="mt-1">
                    {children}
                </div>
            ) : (
                <div className="h-2" /> // Spacer for when collapsed
            )}
        </div>
    );
};

export function GameDashboard({ game, sportCategory, userRole = 'FAN' }: GameDashboardProps) {
    const router = useRouter();
    const { confirmNavigation } = useNavigationGuardContext();
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);

    // Determine accessible tools based on role
    const canScore = ['SCORER', 'JUDGE'].includes(userRole) || store.globalRole === 'admin';
    const canTimekeep = userRole === 'TIMEKEEPER' || (userRole === 'SCORER' /* fallback */) || store.globalRole === 'admin';

    // Resolve specific slots
    const ScoreboardModule = useMemo(() => SportComponentRegistry.getScoreboard(sportCategory), [sportCategory]);
    const ScoringPanelModule = useMemo(() => SportComponentRegistry.getScoringPanel(sportCategory), [sportCategory]);
    const GameEventsPanelModule = useMemo(() => SportComponentRegistry.getGameEventsPanel(sportCategory), [sportCategory]);
    const GeneralPlayPanelModule = useMemo(() => SportComponentRegistry.getGeneralPlayPanel(sportCategory), [sportCategory]);
    

    const p1 = game.participants?.[0];
    const p2 = game.participants?.[1];
    const team1 = p1?.teamId ? store.getTeam(p1.teamId) : null;
    const team2 = p2?.teamId ? store.getTeam(p2.teamId) : null;
    const team1Name = team1?.shortName || team1?.name || 'Home';
    const team2Name = team2?.shortName || team2?.name || 'Away';

    return (
        <DynamicScoringProvider game={game}>
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
                            className="bg-destructive/5 hover:bg-destructive/10 text-destructive border-destructive/20 hover:border-destructive/40 px-2 py-1.5 sm:px-4 sm:py-2 text-tiny sm:text-sm"
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

                {/* Combined Timing, Scoring & Events area */}
                <div className="flex flex-col gap-2 mt-2">
                    {/* Timing Bar Slot - Compacted as per user request */}
                    <CollapsibleDashboardSection 
                        title="Timing" 
                        storageKey={`game-${game.id}-timing-expanded`}
                        className="shadow-sm"
                    >
                        <TimerPanelSlot game={game} canEdit={canTimekeep} />
                    </CollapsibleDashboardSection>
                    <div className="flex flex-col gap-2 mt-2">
                         {/* Scoring Actions Slot */}
                        {canScore && (
                            <>
                                <ActiveDisputesPanel gameId={game.id} />
                                <CollapsibleDashboardSection 
                                    title="Scoring" 
                                    storageKey={`game-${game.id}-scoring-expanded`}
                                    className="shadow-lg mt-2"
                                >
                                    <SlotWrapper>
                                        <ScoringPanelModule game={game} role={userRole} />
                                    </SlotWrapper>
                                </CollapsibleDashboardSection>
                            </>
                        )}

                        {/* Game Events Actions Slot */}
                        {canScore && GameEventsPanelModule && (
                            <CollapsibleDashboardSection 
                                title="Game Events" 
                                storageKey={`game-${game.id}-events-expanded`}
                                className="shadow-lg mt-2"
                            >
                                <SlotWrapper>
                                    <GameEventsPanelModule game={game} role={userRole} />
                                </SlotWrapper>
                            </CollapsibleDashboardSection>
                        )}

                        {/* General Play Actions Slot */}
                        {canScore && GeneralPlayPanelModule && (
                            <CollapsibleDashboardSection 
                                title="General Play" 
                                storageKey={`game-${game.id}-play-expanded`}
                                className="shadow-lg mt-2"
                            >
                                <SlotWrapper>
                                    <GeneralPlayPanelModule game={game} role={userRole} />
                                </SlotWrapper>
                            </CollapsibleDashboardSection>
                        )}
                        <DynamicScoringDialogRenderer />
                    </div>
                </div>
            </div>

            <div className="w-full max-w-[512px] lg:w-[320px] xl:w-[380px] lg:flex-none flex flex-col gap-2 min-h-[600px] min-w-0">
                <div className="bg-card rounded-2xl shadow-xl border border-border/50 p-2 flex-1 flex flex-col overflow-hidden relative">
                    <Tabs defaultValue="feed" className="flex-1 flex flex-col overflow-hidden">
                        <TabsList className="grid grid-cols-4 bg-muted/50 p-1 mb-2">
                            <TabsTrigger value="team1" className="text-tiny font-black uppercase tracking-tight py-1.5 flex gap-1 items-center">
                                <Users className="w-3 h-3" />
                                <span className="hidden sm:inline truncate">{team1Name}</span>
                                <span className="sm:hidden">T1</span>
                            </TabsTrigger>
                            <TabsTrigger value="team2" className="text-tiny font-black uppercase tracking-tight py-1.5 flex gap-1 items-center">
                                <Users className="w-3 h-3" />
                                <span className="hidden sm:inline truncate">{team2Name}</span>
                                <span className="sm:hidden">T2</span>
                            </TabsTrigger>
                            <TabsTrigger value="feed" className="text-tiny font-black uppercase tracking-tight py-1.5 flex gap-1 items-center">
                                <Activity className="w-3 h-3" />
                                <span className="truncate">Feed</span>
                            </TabsTrigger>
                            <TabsTrigger value="stats" className="text-tiny font-black uppercase tracking-tight py-1.5 flex gap-1 items-center">
                                <BarChart3 className="w-3 h-3" />
                                <span className="truncate">Stats</span>
                            </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="team1" className="flex-1 overflow-hidden mt-0">
                            {p1 && <TeamRosterPanel gameId={game.id} participantId={p1.id} />}
                        </TabsContent>
                        <TabsContent value="team2" className="flex-1 overflow-hidden mt-0">
                            {p2 && <TeamRosterPanel gameId={game.id} participantId={p2.id} />}
                        </TabsContent>
                        <TabsContent value="feed" className="flex-1 overflow-hidden mt-0">
                            <EventLogFeed gameId={game.id} />
                        </TabsContent>
                        <TabsContent value="stats" className="flex-1 overflow-hidden mt-0">
                            {sportCategory.toLowerCase() === 'rugby' ? (
                                <RugbyGameStats game={game} />
                            ) : (
                                <div className="flex items-center justify-center h-32 text-muted-foreground/40 text-tiny font-black uppercase tracking-widest italic">
                                    Stats coming soon for {sportCategory}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    </DynamicScoringProvider>
    );
}
