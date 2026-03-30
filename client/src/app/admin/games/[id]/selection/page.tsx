"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { store } from "@/app/store/store";
import { Game, Team, OrgProfile, Sport } from "@sk/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, Save, User, Users, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

interface RosterItem {
    orgProfileId: string;
    position?: string;
    isReserve: boolean;
}

export default function SelectionPage() {
    const params = useParams();
    const router = useRouter();
    const gameId = params.id as string;

    const [game, setGame] = useState<Game | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
    const [team, setTeam] = useState<Team | undefined>(undefined);
    const [availablePlayers, setAvailablePlayers] = useState<(OrgProfile & { membershipId: string })[]>([]);
    const [roster, setRoster] = useState<RosterItem[]>([]);
    const [originalRoster, setOriginalRoster] = useState<RosterItem[]>([]);
    const [positions, setPositions] = useState<{ id: string; name: string }[]>([]);
    const [activePositionId, setActivePositionId] = useState<string | null>(null);
    const [dragOverPositionId, setDragOverPositionId] = useState<string | null>(null);
    const [isOverReserves, setIsOverReserves] = useState(false);

    useEffect(() => {
        const update = async () => {
            const g = store.getGame(gameId);
            if (g) {
                setGame(g);
                
                const participant = g.participants?.[0];
                if (participant && !selectedParticipantId) {
                    setSelectedParticipantId(participant.id);
                }

                if (selectedParticipantId) {
                    const p = g.participants?.find(part => part.id === selectedParticipantId);
                    if (p?.teamId) {
                        const t = store.getTeam(p.teamId);
                        setTeam(t);
                        setAvailablePlayers(store.getTeamMembers(p.teamId));
                        
                        const sport = t ? store.getSport(t.sportId) : null;
                        const resolvedPositions = 
                            g.customSettings?.positions || 
                            store.getEvent(g.eventId || "")?.settings?.positions || 
                            sport?.defaultSettings?.positions || [];
                        setPositions(resolvedPositions);

                        // Load current roster
                        const currentRoster = await store.fetchGameRoster(selectedParticipantId);
                        const mappedRoster = currentRoster.map(r => ({
                            orgProfileId: r.orgProfileId,
                            position: r.position,
                            isReserve: r.isReserve
                        }));
                        setRoster(mappedRoster);
                        setOriginalRoster(mappedRoster);
                    }
                }
                setLoading(false);
            }
        };

        update();
        store.subscribeToGame(gameId);
        const unsubscribe = store.subscribe(update);
        return () => {
            unsubscribe();
            store.unsubscribeFromGame(gameId);
        };
    }, [gameId, selectedParticipantId]);

    const handlePlayerClick = (profileId: string) => {
        setRoster(prev => {
            const existing = prev.find(item => item.orgProfileId === profileId);
            
            if (activePositionId) {
                if (existing?.position === activePositionId) {
                    setActivePositionId(null);
                    return prev.filter(item => item.orgProfileId !== profileId);
                }
                const filtered = prev.filter(item => item.orgProfileId !== profileId);
                const final = filtered.filter(item => item.position !== activePositionId);
                setActivePositionId(null);
                return [...final, { orgProfileId: profileId, position: activePositionId, isReserve: false }];
            }

            if (existing) {
                return prev.filter(item => item.orgProfileId !== profileId);
            } else {
                return [...prev, { orgProfileId: profileId, isReserve: true }];
            }
        });
    };

    const handleDragStart = (e: React.DragEvent, profileId: string) => {
        e.dataTransfer.setData("profileId", profileId);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOverPosition = (e: React.DragEvent, positionId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverPositionId !== positionId) {
            setDragOverPositionId(positionId);
        }
    };

    const handleDropOnPosition = (e: React.DragEvent, positionId: string) => {
        e.preventDefault();
        setDragOverPositionId(null);
        const profileId = e.dataTransfer.getData("profileId");
        if (!profileId) return;

        setRoster(prev => {
            const filtered = prev.filter(item => item.orgProfileId !== profileId);
            const final = filtered.filter(item => item.position !== positionId);
            return [...final, { orgProfileId: profileId, position: positionId, isReserve: false }];
        });
    };

    const handleDropOnReserves = (e: React.DragEvent) => {
        e.preventDefault();
        setIsOverReserves(false);
        const profileId = e.dataTransfer.getData("profileId");
        if (!profileId) return;

        setRoster(prev => {
            const existing = prev.find(item => item.orgProfileId === profileId);
            if (existing && existing.isReserve) return prev; 

            const filtered = prev.filter(item => item.orgProfileId !== profileId);
            return [...filtered, { orgProfileId: profileId, isReserve: true }];
        });
    };

    const removeFromRoster = (profileId: string) => {
        setRoster(prev => prev.filter(item => item.orgProfileId !== profileId));
    };

    const handleSave = async () => {
        if (!selectedParticipantId) return;
        setSaving(true);
        try {
            await store.saveGameRoster(gameId, selectedParticipantId, roster);
            setOriginalRoster(roster); // Clear dirty state
            toast({ title: "Selection Saved", description: "The team roster has been updated." });
            router.back();
        } catch (error) {
            toast({ title: "Error", description: "Failed to save selection.", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const isDirty = useMemo(() => {
        if (roster.length !== originalRoster.length) return true;
        const sortedRoster = [...roster].sort((a, b) => a.orgProfileId.localeCompare(b.orgProfileId));
        const sortedOriginal = [...originalRoster].sort((a, b) => a.orgProfileId.localeCompare(b.orgProfileId));
        return JSON.stringify(sortedRoster) !== JSON.stringify(sortedOriginal);
    }, [roster, originalRoster]);

    useUnsavedChanges(isDirty);

    const assignedReserves = roster.filter(r => r.isReserve);

    if (loading) return <div className="p-8 flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
    if (!game || !team) return <div className="p-8 text-center text-muted-foreground uppercase font-black tracking-widest text-lg opacity-20">Game or Team not found.</div>;

    return (
        <div className="min-h-screen bg-background pb-20 md:pb-8">
            {/* Header */}
            <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/10 px-4 py-3">
                <div className="container mx-auto flex items-center justify-between gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0">
                        <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-xl font-black uppercase tracking-tighter truncate">Team Selection</h1>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
                            {team.name} • {game.status}
                        </p>
                    </div>
                    <Button 
                        onClick={handleSave} 
                        disabled={saving}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[10px] h-9 px-4 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
                    >
                        {saving ? "Saving..." : <><Save className="w-3.5 h-3.5 mr-2" /> Save</>}
                    </Button>
                </div>
            </div>

            <div className="container mx-auto p-4 md:p-6 flex flex-col lg:flex-row gap-8 items-start">
                
                {/* Match Lineup (LEFT/FIXED) */}
                <div className="space-y-8 w-full lg:w-80 shrink-0 lg:sticky lg:top-24">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-sm font-black uppercase tracking-widest text-foreground/70 flex items-center gap-2">
                                <Users className="w-4 h-4 text-primary" /> Starting Lineup
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            {positions.map(pos => {
                                const assignedPlayer = roster.find(r => r.position === pos.id);
                                const player = assignedPlayer ? availablePlayers.find(p => p.id === assignedPlayer.orgProfileId) : null;
                                const isActive = activePositionId === pos.id;
                                const isDraggingOver = dragOverPositionId === pos.id;

                                return (
                                    <div 
                                        key={pos.id}
                                        onClick={() => setActivePositionId(isActive ? null : pos.id)}
                                        onDragOver={(e) => handleDragOverPosition(e, pos.id)}
                                        onDragLeave={() => setDragOverPositionId(null)}
                                        onDrop={(e) => handleDropOnPosition(e, pos.id)}
                                        className={cn(
                                            "flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden group",
                                            isActive ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.1)] ring-1 ring-primary/20 scale-[1.02]" :
                                            isDraggingOver ? "border-primary bg-primary/20 shadow-[0_0_20px_rgba(var(--primary),0.2)] scale-[1.05] z-10" :
                                            player ? "border-primary/20 bg-primary/5" : "border-border/40 bg-muted/5 border-dashed"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 shadow-sm transition-colors",
                                            isActive ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border/20 text-foreground/40"
                                        )}>
                                            <span className="text-xs font-black">{pos.id}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn(
                                                "text-[10px] font-black uppercase tracking-widest leading-none mb-1",
                                                isActive ? "text-primary" : "text-muted-foreground"
                                            )}>{pos.name}</p>
                                            {player ? (
                                                <p className="text-sm font-black text-foreground">{player.name}</p>
                                            ) : (
                                                <p className="text-[10px] font-bold text-muted-foreground/30 italic">
                                                    {isActive ? "Tap player..." : "Drop player or tap"}
                                                </p>
                                            )}
                                        </div>
                                        {player && (
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={(e) => { e.stopPropagation(); removeFromRoster(player.id); }}
                                                className="h-7 px-2 text-[9px] font-black uppercase tracking-widest text-destructive hover:text-destructive hover:bg-destructive/10 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                            >
                                                Clear
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Reserves Drop Zone */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h2 className="text-sm font-black uppercase tracking-widest text-foreground/70 flex items-center gap-2">
                                <Users className="w-4 h-4 text-emerald-500" /> Reserves
                            </h2>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase">{assignedReserves.length}</span>
                        </div>

                        <div 
                            onDragOver={(e) => { e.preventDefault(); setIsOverReserves(true); e.dataTransfer.dropEffect = "move"; }}
                            onDragLeave={() => setIsOverReserves(false)}
                            onDrop={handleDropOnReserves}
                            className={cn(
                                "min-h-[100px] p-4 border-2 border-dashed rounded-2xl transition-all flex flex-col gap-2",
                                isOverReserves ? "border-emerald-500 bg-emerald-500/10 scale-[1.02]" : "border-border/40 bg-muted/5"
                            )}
                        >
                            {assignedReserves.length === 0 ? (
                                <div className="m-auto text-center">
                                    <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Drop here for reserves</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-2">
                                    {assignedReserves.map(r => {
                                        const player = availablePlayers.find(p => p.id === r.orgProfileId);
                                        if (!player) return null;
                                        return (
                                            <div 
                                                key={player.id} 
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, player.id)}
                                                className="flex items-center gap-3 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl cursor-grab active:cursor-grabbing"
                                            >
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                                    <User className="w-3 h-3 text-emerald-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-black truncate">{player.name}</p>
                                                </div>
                                                <button 
                                                    onClick={() => removeFromRoster(player.id)}
                                                    className="h-5 w-5 rounded-full flex items-center justify-center text-destructive hover:bg-destructive/10 text-lg leading-none"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Available Roster (RIGHT/FLEX) */}
                <div className="space-y-4 flex-1">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-sm font-black uppercase tracking-widest text-foreground/70 flex items-center gap-2">
                            <Users className="w-4 h-4" /> Available Roster
                        </h2>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-40">{availablePlayers.length} Members</span>
                    </div>
                    
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                        {availablePlayers.map(player => {
                            const rosterItem = roster.find(r => r.orgProfileId === player.id);
                            const isSelected = !!rosterItem;
                            const isAssignedToActive = activePositionId && rosterItem?.position === activePositionId;
                            const isReserve = rosterItem?.isReserve;
                            
                            return (
                                <Card 
                                    key={player.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, player.id)}
                                    onClick={() => handlePlayerClick(player.id)}
                                    className={cn(
                                        "cursor-grab active:cursor-grabbing transition-all border-border/40 hover:border-primary/40 active:scale-[0.98] group",
                                        isSelected ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10 shadow-md" : "bg-muted/5",
                                        isAssignedToActive && "ring-2 ring-primary border-primary",
                                        isReserve && "bg-emerald-500/5 border-emerald-500/20 ring-emerald-500/10"
                                    )}
                                >
                                    <CardContent className="p-3 flex items-center gap-3 relative overflow-hidden">
                                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/20 group-hover:scale-110 transition-transform">
                                            <User className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-black truncate text-foreground/90 leading-tight">{player.name}</p>
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                                                {rosterItem ? (
                                                    isReserve ? "Reserve" : positions.find(p => p.id === rosterItem.position)?.name
                                                ) : "Not Selected"}
                                            </p>
                                        </div>
                                        {isSelected ? (
                                            isReserve ? <Users className="w-4 h-4 text-emerald-500" /> : <CheckCircle2 className="w-4 h-4 text-primary" />
                                        ) : <Circle className="w-4 h-4 text-muted-foreground/20" />}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </div>
            
            {/* Mobile Sticky Footer */}
            <div className="fixed lg:hidden bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border/10 z-40">
                <Button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest shadow-xl shadow-primary/20 rounded-2xl active:scale-[0.98] transition-all"
                >
                    {saving ? "Saving Selection..." : <><Save className="w-5 h-5 mr-3" /> Save Selection</>}
                </Button>
            </div>
        </div>
    );
}
