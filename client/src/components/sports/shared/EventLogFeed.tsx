import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { GameEvent } from '@sk/types';
import { useAuth } from '@/contexts/AuthContext';
import { RotateCcw, Clock, Trophy, Activity, Pencil, User, Zap } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogFooter 
} from "@/components/ui/dialog";
import { DialogSectionHeader, RosterGrid, ScoringActionButton } from './ScoringActionButton';
import { useSharedDynamicScoring } from './DynamicScoringContext';

export function EventLogFeed({ gameId }: { gameId: string }) {
    const [events, setEvents] = useState<GameEvent[]>([]);
    const [, setTick] = useState(0);
    const { user } = useAuth();
    const [now, setNow] = useState(Date.now());
    const [roosters, setRosters] = useState<{ [participantId: string]: any[] }>({});
    const [correctionEvent, setCorrectionEvent] = useState<GameEvent | null>(null);
    const scoring = useSharedDynamicScoring();

    useEffect(() => {
        // Subscribe to live updates (Server will push last 20 events on join)
        store.subscribeToGame(gameId);
        store.fetchSystemSettings();

        // Sync local state with store
        const sync = () => {
            setEvents([...store.gameEvents].reverse());
            setTick(t => t + 1);
        };

        sync();
        const interval = setInterval(() => setNow(Date.now()), 1000);
        const unsubscribe = store.subscribe(sync);

        // Fetch rosters for editing
        const game = store.getGame(gameId);
        game?.participants?.forEach(p => {
            store.fetchGameRoster(p.id).then(roster => {
                setRosters(prev => ({ ...prev, [p.id]: roster }));
            });
        });

        return () => {
            clearInterval(interval);
            unsubscribe();
        };
    }, [gameId]);

    const formatMatchTime = (ms?: number) => {
        if (ms === undefined) return "--:--";
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const resolveEventTemplate = (evt: GameEvent) => {
        const game = store.getGame(gameId);
        const eventData = evt.eventData || (evt as any).event_data || {};
        
        let sportId = game?.sportId;
        let warning = "";
        let error = "";

        if (!sportId) {
            // Fallback for missing sportId to resolve the template, but still flag it
            const p1TeamId = game?.participants?.[0]?.teamId;
            const p1Team = p1TeamId ? store.getTeam(p1TeamId) : null;
            sportId = p1Team?.sportId;
            
            if (sportId) {
                warning = "Game missing sportId; falling back to team sport.";
            } else {
                error = "Game missing sportId and no team fallback found.";
            }
        }

        const sport = store.sports.find(s => s.id === sportId);
        if (sportId && !sport) {
            error = `Sport config not found for ID: ${sportId}`;
        }

        const templateId = eventData.templateId || evt.subType;
        const template = sport?.eventTemplates?.find(t => 
            t.id === templateId || t.name === templateId
        );

        // System events don't usually have templates
        if (sport && !template && evt.type !== 'SYSTEM' && !['GAME_STARTED', 'GAME_ENDED', 'PERIOD_STARTED', 'PERIOD_ENDED'].includes(evt.subType || '')) {
            warning = `Template not found for: ${templateId}`;
        }

        return { template, sport, error, warning, sportId };
    };

    const getEventLabel = (evt: GameEvent) => {
        const eventData = evt.eventData || (evt as any).event_data || {};
        const { template, error, warning } = resolveEventTemplate(evt);
        
        // 2. If we have a template, use its display pattern
        if (template) {
            let label = template.displayPattern || (eventData.outcome ? "{name} → {outcome}" : "{name}");
            
            // Handle outcome overrides (e.g. "Penalty Kick" -> "KICK")
            let outcome = eventData.outcome || '';

            // Check if there is a displayOverride in the outcome object itself
            const outcomeObj = template.steps
                .find(s => s.type === 'OUTCOME_SELECTION')
                ?.outcomes?.find(o => o.name === outcome);
            
            if (outcomeObj?.displayOverride) {
                outcome = outcomeObj.displayOverride;
            } else if (template.outcomeOverrides && template.outcomeOverrides[outcome]) {
                outcome = template.outcomeOverrides[outcome];
            }

            // Fill the pattern
            label = label
                .replace(/{name}/g, template.name.toUpperCase())
                // Handle {outcome|FALLBACK}
                .replace(/{outcome\|([^}]+)}/g, (match, fallback) => {
                    return outcome ? outcome.toUpperCase() : fallback.toUpperCase();
                })
                .replace(/{outcome}/g, outcome ? outcome.toUpperCase() : "");

            return {
                label: label.trim().replace(/ →$/, ""), // Clean up trailing arrows
                error,
                warning
            };
        }

        // 3. Fallback for events without templates (like STATUS or TIME events)
        const key = evt.subType || evt.type;
        let label = "";
        switch (key) {
            case 'GAME_STARTED': label = 'MATCH STARTED'; break;
            case 'GAME_ENDED': label = 'MATCH FINISHED'; break;
            case 'GAME_CANCELLED': label = 'MATCH CANCELLED'; break;
            case 'GAME_UPDATED': label = 'MATCH UPDATED'; break;
            case 'PERIOD_STARTED': label = 'PERIOD STARTED'; break;
            case 'PERIOD_ENDED': label = 'PERIOD ENDED'; break;
            case 'CLOCK_PAUSED': label = 'CLOCK PAUSED'; break;
            case 'CLOCK_RESUMED': label = 'CLOCK RESUMED'; break;
            default: label = key.replace(/_/g, ' ').toUpperCase(); break;
        }

        return { label, error, warning };
    };

    const getTeamColor = (event: GameEvent) => {
        if (event.gameParticipantId) {
            const game = store.getGame(gameId);
            const participant = game?.participants?.find(p => p.id === event.gameParticipantId);
            if (participant?.teamId) {
                const index = game?.participants?.indexOf(participant) ?? 0;
                return index === 0 ? 'bg-blue-500' : 'bg-red-500';
            }
        }
        return 'bg-sunken-bg';
    };

    const handleUndo = async (evt: GameEvent) => {
        try {
            const orgId = store.getEvent(evt.id)?.orgId || '';
            const initiatorId = evt.initiatorOrgProfileId || null;
            const res = await store.undoGameEvent(gameId, evt.id, initiatorId);
            if (res.success) {
                toast({ title: "Event Undone", description: "The score has been reversed.", variant: "success" });
            } else {
                toast({ title: "Undo Failed", description: res.error || "Could not undo event.", variant: "destructive" });
            }
        } catch (err) {
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        }
    };


    const toggleFilter = (filter: string) => {
        const next = new Set(store.eventLogFilters);
        if (next.has(filter)) {
            next.delete(filter);
        } else {
            next.add(filter);
        }
        store.setEventLogFilters(next);
    };

    const filteredEvents = useMemo(() => {
        const activeFilters = store.eventLogFilters;
        return events.filter(evt => {
            if (evt.type === 'SCORE' && activeFilters.has('SCORE')) return true;
            if ((evt.type === 'STATUS' || evt.type === 'TIME') && activeFilters.has('TIME')) return true;
            
            if (evt.type === 'GAME_EVENT') {
                const subType = evt.subType || '';
                const isGeneralPlay = ['Knock-on', 'Turnover', 'Turnover Won', 'Tackle Made', 'Tackle Missed'].includes(subType);
                
                if (isGeneralPlay && activeFilters.has('GENERAL')) return true;
                if (!isGeneralPlay && activeFilters.has('DETAIL')) return true;
            }
            
            return false;
        });
    }, [events, store.eventLogFilters]);

    return (
        <div className="flex flex-col h-full [container-type:inline-size] [@container/playbyplay]">
            <div className="flex items-center justify-between mb-2">
                <h3 className="font-black text-tiny text-muted-foreground uppercase tracking-[0.2em] whitespace-nowrap">Play-by-Play</h3>
                <div className="flex gap-0.5 items-center ml-4">
                    <Button 
                        size="icon" 
                        variant={store.eventLogFilters.has('TIME') ? 'default' : 'ghost'}
                        className={cn(
                            "h-7 w-7", 
                            !store.eventLogFilters.has('TIME') && "text-muted-foreground/40"
                        )}
                        title="Time Events"
                        onClick={() => toggleFilter('TIME')}
                    >
                        <Clock className="w-3.5 h-3.5" />
                    </Button>
                    <Button 
                        size="icon" 
                        variant={store.eventLogFilters.has('SCORE') ? 'default' : 'ghost'}
                        className={cn(
                            "h-7 w-7", 
                            store.eventLogFilters.has('SCORE') ? "bg-amber-500 hover:bg-amber-600 text-white" : "text-muted-foreground/40"
                        )}
                        title="Scoring Events"
                        onClick={() => toggleFilter('SCORE')}
                    >
                        <Trophy className="w-3.5 h-3.5" />
                    </Button>
                    <Button 
                        size="icon" 
                        variant={store.eventLogFilters.has('DETAIL') ? 'default' : 'ghost'}
                        className={cn(
                            "h-7 w-7", 
                            store.eventLogFilters.has('DETAIL') ? "bg-blue-500 hover:bg-blue-600 text-white" : "text-muted-foreground/40"
                        )}
                        title="Game Events"
                        onClick={() => toggleFilter('DETAIL')}
                    >
                        <Activity className="w-3.5 h-3.5" />
                    </Button>
                    <Button 
                        size="icon" 
                        variant={store.eventLogFilters.has('GENERAL') ? 'default' : 'ghost'}
                        className={cn(
                            "h-7 w-7", 
                            store.eventLogFilters.has('GENERAL') ? "bg-indigo-500 hover:bg-indigo-600 text-white" : "text-muted-foreground/40"
                        )}
                        title="General Play"
                        onClick={() => toggleFilter('GENERAL')}
                    >
                        <Zap className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>
            <div className="flex-1 bg-sunken-bg/50 border border-border/30 rounded-2xl p-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <div className="flex flex-col gap-1">
                    {filteredEvents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/40">
                             <span className="text-tiny font-black uppercase tracking-widest italic">
                                 {events.length === 0 ? 'Waiting for kickoff...' : 'No events match filters'}
                             </span>
                        </div>
                    ) : (
                        filteredEvents.map(evt => {
                            const eventData = evt.eventData || (evt as any).event_data || {};
                            const snapshot = eventData.scoreSnapshot;
                            const matchTime = eventData.elapsedMS !== undefined 
                                ? formatMatchTime(eventData.elapsedMS)
                                : null;
                            
                            const isScore = evt.type === 'SCORE';
                            const { template, error, warning } = resolveEventTemplate(evt);
                            const isScoringEvent = isScore || template?.section === 'Scoring';

                            const age = now - new Date(evt.timestamp).getTime();
                            const undoDelay = store.undoDelay;
                            const inUndoWindow = age < undoDelay;
                            
                            let isInitiator = store.isMyOrgProfileId(evt.initiatorOrgProfileId || '');
                            if (!evt.initiatorOrgProfileId && store.globalRole === 'admin') {
                                isInitiator = true; // Initial global admins have no org profile
                            }
                            const canScore = store.canScoreGame(gameId);

                            const isRemoved = eventData.status === 'REMOVED';
                            
                            // Check if this event is currently disputed
                            const isCurrentlyDisputed = store.activeDisputes.some(d => d.gameEventId === evt.id);

                            // showUndo: Only for the person who submitted the event
                            const showUndo = isScoringEvent && isInitiator && inUndoWindow && !isRemoved && !isCurrentlyDisputed;
                            
                            // showDispute: For everyone else once the undo window has expired
                            const showDispute = isScoringEvent && !inUndoWindow && canScore && !isRemoved && !isCurrentlyDisputed;
                            
                            const showEdit = canScore && !isRemoved && !isCurrentlyDisputed;

                            return (
                                <div 
                                    key={evt.id} 
                                    onClick={() => {
                                        if (!canScore || isRemoved || isCurrentlyDisputed) return;
                                        
                                        // Prevent disputing/editing another scorer's event during their undo window
                                        if (inUndoWindow && !isInitiator && isScoringEvent) {
                                            toast({ 
                                                title: "Event Locked", 
                                                description: "Scorer is still in the undo window. Please wait.", 
                                                variant: "warning" 
                                            });
                                            return;
                                        }

                                        const game = store.getGame(gameId);
                                        const side = evt.gameParticipantId === game?.participants?.[0]?.id ? 'home' : 'away';
                                        
                                        store.startManualFlow({
                                            type: evt.subType || evt.type,
                                            side,
                                            points: eventData.pointsDelta || 0,
                                            extraData: eventData,
                                            eventId: evt.id,
                                            actorId: evt.actorOrgProfileId,
                                            successful: eventData.successful,
                                            reason: eventData.reason,
                                            decision: eventData.decision,
                                            winnerSide: eventData.winnerSide
                                        });
                                    }}
                                    className={cn(
                                        "text-sm flex gap-1.5 items-center p-1 px-1 rounded-xl transition-all duration-300 min-h-[44px] shadow-sm hover:shadow-md transform hover:-translate-y-0.5 bg-card border border-border/40",
                                        isRemoved ? "opacity-50 grayscale" : "",
                                        canScore && !isRemoved && !isCurrentlyDisputed && "cursor-pointer hover:border-primary/30"
                                    )}
                                >
                                    <div className="flex flex-col items-center min-w-[34px] w-fit px-1 shrink-0 bg-muted/20 py-1 rounded-lg border border-border/10">
                                        <span className="font-mono text-primary text-tiny sm:text-xs font-black leading-none mb-0.5 text-center">
                                            {matchTime || "--:--"}
                                        </span>
                                        {eventData.period && (
                                            <span className="text-3tiny sm:text-3tiny font-black text-primary/60 uppercase leading-none truncate w-full text-center tracking-tighter">
                                                {eventData.period}
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className={cn("h-6 w-0.5 rounded-full shrink-0", getTeamColor(evt))} />
                                    
                                    <div className="flex flex-col min-w-0 flex-1 overflow-hidden px-0.5 gap-0">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={cn("font-black text-event-primary uppercase tracking-wider text-foreground/90 leading-none mb-0.5 line-clamp-1", isRemoved && "line-through text-muted-foreground")}>
                                                {(() => {
                                                    const { label, error: labelError, warning: labelWarning } = getEventLabel(evt);
                                                    return (
                                                        <span className="flex items-center gap-1.5">
                                                            {label}
                                                            {(labelError || labelWarning) && (
                                                                <span 
                                                                    className={cn("text-[10px]", labelError ? "text-red-500" : "text-amber-500")}
                                                                    title={labelError || labelWarning}
                                                                >
                                                                    ⚠️
                                                                </span>
                                                            )}
                                                        </span>
                                                    );
                                                })()}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                                            {(() => {
                                                const actorProfile = evt.actorOrgProfileId ? store.orgProfiles.find(p => p.id === evt.actorOrgProfileId) : null;
                                                
                                                if (evt.subType === 'Replacement') {
                                                    const offName = evt.eventData?.playerOffName || 'Unknown';
                                                    const onName = evt.eventData?.playerOnName || 'Unknown';
                                                    return (
                                                        <span className={cn("text-event-secondary font-bold text-muted-foreground/60 uppercase tracking-tight whitespace-nowrap overflow-hidden leading-none")}>
                                                            {offName} <span className="text-amber-500/50">↔</span> {onName}
                                                        </span>
                                                    );
                                                }

                                                const details: string[] = [];
                                                // Only show reason for non-scoring events to avoid redundancy with preceding Awarded event
                                                if (evt.eventData?.reason && evt.type !== 'SCORE') {
                                                    const cleanReason = evt.eventData.reason.replace(/^(General|Set Piece) - /i, '');
                                                    details.push(cleanReason);
                                                }
                                                if (evt.eventData?.winnerName && (evt.subType === 'Scrum' || evt.subType === 'Lineout')) {
                                                    details.push(`Won by ${evt.eventData.winnerName}`);
                                                }

                                                const hasActor = !!actorProfile;

                                                return (
                                                    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                                                        {actorProfile && (
                                                            <span className={cn("text-event-primary font-bold text-muted-foreground/60 uppercase tracking-tight whitespace-nowrap overflow-hidden leading-none", isRemoved && "line-through")}>
                                                                {actorProfile.name}
                                                            </span>
                                                        )}
                                                        {details.length > 0 && (
                                                            <span className={cn(
                                                                "uppercase whitespace-nowrap overflow-hidden",
                                                                hasActor 
                                                                    ? "text-2tiny font-black text-muted-foreground/30 tracking-widest" 
                                                                    : "text-event-primary font-bold text-muted-foreground/60 tracking-tight leading-none"
                                                            )}>
                                                                {details.join(' • ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            {snapshot && (
                                                <div className="flex items-center gap-1 px-1 py-0.5 bg-sunken-bg/50 rounded-md border border-border/20 shrink-0">
                                                    {(() => {
                                                        const p1 = game?.participants?.[0];
                                                        const p2 = game?.participants?.[1];
                                                        const s1 = (snapshot as any)[p1?.id || ''] || 0;
                                                        const s2 = (snapshot as any)[p2?.id || ''] || 0;
                                                        return (
                                                            <>
                                                                <span className="font-black text-tiny text-blue-500 leading-none">{s1}</span>
                                                                <span className="text-2tiny font-black opacity-20 leading-none">—</span>
                                                                <span className="font-black text-tiny text-red-500 leading-none">{s2}</span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="ml-auto shrink-0 flex items-center gap-1.5 h-[28px]">
                                         {/* Correction Button (for outside undo window or specific templates) */}
                                         {(() => {
                                             const eventData = evt.eventData || (evt as any).event_data || {};
                                             const { template } = resolveEventTemplate(evt);
                                             const supportsCorrection = template?.disputeConfig?.type === 'CHANGE_OUTCOME';
                                             
                                             if (supportsCorrection && !isRemoved && !isCurrentlyDisputed && !inUndoWindow) {
                                                 return (
                                                     <button 
                                                         onClick={(e) => {
                                                             e.stopPropagation();
                                                             setCorrectionEvent(evt);
                                                         }}
                                                         className="w-7 h-7 flex items-center justify-center bg-sunken-bg hover:bg-border/20 text-muted-foreground hover:text-foreground rounded-full transition-colors border border-border/10 shadow-sm"
                                                         title="Correct Outcome"
                                                     >
                                                         <Pencil className="w-3 h-3" />
                                                     </button>
                                                 );
                                             }
                                             return null;
                                         })()}

                                         <div className="w-[28px] h-[28px] flex items-center justify-center relative">
                                        {(isScoringEvent && inUndoWindow && !isRemoved && !isCurrentlyDisputed) ? (
                                            <div className="relative w-full h-full flex items-center justify-center text-muted-foreground">
                                                {/* Circular Progress */}
                                                <svg className="absolute inset-0 w-full h-full -rotate-90 transform">
                                                    <circle
                                                        cx="14" cy="14" r="11"
                                                        stroke="currentColor" strokeWidth="2" fill="transparent"
                                                        className="text-muted-foreground/10"
                                                    />
                                                    <circle
                                                        cx="14" cy="14" r="11"
                                                        stroke="currentColor" strokeWidth="2" fill="transparent"
                                                        strokeDasharray={2 * Math.PI * 11}
                                                        strokeDashoffset={(2 * Math.PI * 11) * (age / undoDelay)}
                                                        className="text-muted-foreground transition-all duration-300"
                                                    />
                                                </svg>
                                                {isInitiator ? (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleUndo(evt);
                                                        }}
                                                        className="w-full h-full flex items-center justify-center hover:text-foreground transition-colors group relative z-10"
                                                        title="Undo"
                                                    >
                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                    </button>
                                                ) : (
                                                    <Clock className="w-3.5 h-3.5 opacity-40 relative z-10" />
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                                
                                {isCurrentlyDisputed && (
                                        <div className="absolute inset-0 bg-red-500/5 border border-red-500/40 rounded-xl pointer-events-none" />
                                    )}
                                    {isCurrentlyDisputed && (
                                        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-1 rounded shadow-sm z-20 uppercase">Disputed</div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Correction Dialog */}
            <Dialog open={!!correctionEvent} onOpenChange={(open) => !open && setCorrectionEvent(null)}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Pencil className="w-4 h-4 text-event-primary" />
                            Correct Outcome
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-6 flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground mb-2">
                            Select the correct outcome for this {correctionEvent?.subType}. This will initiate a consensus vote.
                        </p>
                        {(() => {
                            if (!correctionEvent) return null;
                            const eventData = correctionEvent.eventData || (correctionEvent as any).event_data || {};
                            const game = store.getGame(gameId);
                            const sportId = game?.customSettings?.sportId;
                            const sport = store.sports.find(s => s.id === sportId);
                            const template = sport?.eventTemplates?.find(t => t.id === correctionEvent.subType || t.id === eventData.templateId);
                            const outcomes = template?.steps.find(s => s.type === 'OUTCOME_SELECTION')?.outcomes || [];
                            const currentOutcome = eventData.outcome;

                            return outcomes.map(o => (
                                <Button
                                    key={o.name}
                                    variant={o.name === currentOutcome ? "secondary" : "outline"}
                                    className={cn(
                                        "justify-start h-12 px-4 gap-3",
                                        o.name === currentOutcome && "border-event-primary/50 bg-event-primary/5"
                                    )}
                                    disabled={o.name === currentOutcome}
                                    onClick={() => {
                                        scoring.triggerCorrectionDispute(
                                            correctionEvent.id,
                                            correctionEvent.type,
                                            correctionEvent.subType || '',
                                            null, // side
                                            o.name
                                        );
                                        setCorrectionEvent(null);
                                    }}
                                >
                                    <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        o.variant === 'success' ? 'bg-green-500' : 
                                        o.variant === 'danger' ? 'bg-red-500' : 'bg-muted-foreground'
                                    )} />
                                    {o.name}
                                </Button>
                            ));
                        })()}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setCorrectionEvent(null)}>Cancel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
