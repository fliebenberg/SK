"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useNavigationGuardContext } from "@/contexts/NavigationGuardContext";
import { format } from "date-fns";
import { store } from "@/app/store/store";
import { Game, Team, OrgProfile, Sport } from "@sk/types";
import { Button } from "@/components/ui/button";
import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, Save, User, Users, Circle, X, Search } from "lucide-react";
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
    const { confirmNavigation } = useNavigationGuardContext();
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
    const [pickerSearch, setPickerSearch] = useState("");
    const [sport, setSport] = useState<Sport | undefined>(undefined);

    // Effect 1: subscribe to live store updates for non-roster data only
    useEffect(() => {
        const update = () => {
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

                        const s = t ? store.getSport(t.sportId) : undefined;
                        setSport(s);
                        const rawPositions =
                            g.customSettings?.positions ||
                            store.getEvent(g.eventId || "")?.settings?.positions ||
                            s?.defaultSettings?.positions || [];
                        
                        // Self-healing: Filter out legacy "Reserve" positions (IDs 16-23)
                        const filteredPositions = rawPositions.filter((p: any) => {
                            const isLegacyId = /^(1[6-9]|2[0-3])$/.test(p.id);
                            const isReserveName = p.name?.toLowerCase() === "reserve";
                            return !(isLegacyId && isReserveName);
                        });
                        setPositions(filteredPositions);
                    }
                }

                if (g.siteId) store.subscribeToSite(g.siteId);
                if (g.facilityId) store.subscribeToFacility(g.facilityId);

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

    // Effect 2: fetch roster exactly once when we have a participantId
    useEffect(() => {
        if (!selectedParticipantId) return;
        let cancelled = false;
        store.fetchGameRoster(selectedParticipantId).then(currentRoster => {
            if (cancelled) return;
            const mappedRoster = currentRoster.map(r => {
                // Self-healing: If assigned to a legacy reserve position (16-23), migrate to isReserve: true
                const isLegacyReserve = r.position && /^(1[6-9]|2[0-3])$/.test(r.position);
                return {
                    orgProfileId: r.orgProfileId,
                    position: isLegacyReserve ? undefined : r.position,
                    isReserve: r.isReserve || !!isLegacyReserve
                };
            });
            setRoster(mappedRoster);
            setOriginalRoster(mappedRoster);
        });
        return () => { cancelled = true; };
    }, [selectedParticipantId]);


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
                const currentReserves = prev.filter(r => r.isReserve).length;
                if (maxReserves > 0 && currentReserves >= maxReserves) {
                    toast({
                        title: "Reserve Limit",
                        description: `Reserve limit reached (${maxReserves} maximum)`,
                        variant: "destructive"
                    });
                    return prev;
                }
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

            const currentReserves = prev.filter(r => r.isReserve).length;
            if (maxReserves > 0 && currentReserves >= maxReserves) {
                toast({
                    title: "Reserve Limit",
                    description: `Reserve limit reached (${maxReserves} maximum)`,
                    variant: "destructive"
                });
                return prev;
            }

            const filtered = prev.filter(item => item.orgProfileId !== profileId);
            return [...filtered, { orgProfileId: profileId, isReserve: true }];
        });
    };

    const removeFromRoster = (profileId: string) => {
        setRoster(prev => prev.filter(item => item.orgProfileId !== profileId));
    };

    const handleCancel = () => {
        setRoster(originalRoster);
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

    const sortedAvailablePlayers = useMemo(() => {
        return [...availablePlayers].sort((a, b) => {
            const aSelected = !!roster.find(r => r.orgProfileId === a.id);
            const bSelected = !!roster.find(r => r.orgProfileId === b.id);
            if (aSelected === bSelected) {
                return a.name.localeCompare(b.name);
            }
            return aSelected ? 1 : -1;
        });
    }, [availablePlayers, roster]);

    const totalPositions = positions.length;
    const allocatedCount = roster.filter(r => !!r.position && !r.isReserve).length;
    const isFullyAllocated = totalPositions > 0 && allocatedCount === totalPositions;

    useUnsavedChanges(isDirty);

    const assignedReserves = roster.filter(r => r.isReserve);
    const sportMaxReserves = sport?.defaultSettings?.maxReserves ?? 0;
    const gameMaxReserves = (game?.customSettings as any)?.maxReserves;
    const maxReserves = gameMaxReserves !== undefined ? gameMaxReserves : sportMaxReserves;

    if (loading) return <div className="p-8 flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
    if (!game || !team) return <div className="p-8 text-center text-muted-foreground uppercase font-black tracking-widest text-lg opacity-20">Game or Team not found.</div>;

    return (
        <div className="min-h-screen bg-background pb-20 md:pb-8">
            {/* Header */}
            <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/10 px-2 py-3">
                <div className="w-full flex items-center justify-between gap-1">
                    <Button variant="ghost" size="icon" onClick={() => confirmNavigation(() => router.back())} className="shrink-0 -ml-3">
                        <ChevronLeft className="w-6 h-6" />
                    </Button>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                            <h1 className="text-xl font-black uppercase tracking-tighter truncate">Team Selection</h1>
                            {totalPositions > 0 && (
                                <div className={cn(
                                    "px-2 py-0.5 rounded-full border text-[10px] font-black transition-all",
                                    isFullyAllocated 
                                        ? "bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(var(--primary),0.2)]" 
                                        : "bg-muted/40 border-border/20 text-muted-foreground"
                                )}>
                                    {allocatedCount}/{totalPositions}
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate">
                            {team.name} • {game.scheduledStartTime ? format(new Date(game.scheduledStartTime), "HH:mm") : "TBD"} • {store.getSite(game.siteId || "")?.name || "TBD"}{store.getFacility(game.facilityId || "") ? `, ${store.getFacility(game.facilityId || "")?.name}` : ""}
                        </p>
                    </div>
                    {isDirty && (
                        <div className="hidden lg:flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                            <MetalButton
                                type="button"
                                variantType="outlined"
                                icon={<X className="w-4 h-4" />}
                                onClick={handleCancel}
                                disabled={saving}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                Cancel
                            </MetalButton>
                            <MetalButton
                                type="button"
                                variantType="filled"
                                icon={<Save className="w-3.5 h-3.5" />}
                                glowColor="hsl(var(--primary))"
                                onClick={handleSave}
                                disabled={saving}
                                className="text-primary-foreground"
                            >
                                {saving ? "Saving..." : "Save"}
                            </MetalButton>
                        </div>
                    )}
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
                            <span className={cn(
                                "text-[10px] font-bold uppercase transition-colors",
                                isFullyAllocated ? "text-primary" : "text-muted-foreground/40"
                            )}>
                                {allocatedCount} / {totalPositions}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-1">
                            {positions.map(pos => {
                                const assignedPlayer = roster.find(r => r.position === pos.id);
                                const player = assignedPlayer ? availablePlayers.find(p => p.id === assignedPlayer.orgProfileId) : null;
                                const isActive = activePositionId === pos.id;
                                const isDraggingOver = dragOverPositionId === pos.id;

                                return (
                                    <div 
                                        key={pos.id}
                                        onClick={() => { setActivePositionId(isActive ? null : pos.id); setPickerSearch(""); }}
                                        onDragOver={(e) => handleDragOverPosition(e, pos.id)}
                                        onDragLeave={() => setDragOverPositionId(null)}
                                        onDrop={(e) => handleDropOnPosition(e, pos.id)}
                                        className={cn(
                                            "flex items-center gap-1 p-1 rounded-xl border transition-all cursor-pointer relative overflow-hidden group min-h-[40px]",
                                            isActive ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.1)] ring-1 ring-primary/20 scale-[1.02]" :
                                            isDraggingOver ? "border-primary bg-primary/20 shadow-[0_0_20px_rgba(var(--primary),0.2)] scale-[1.05] z-10" :
                                            player ? "border-primary/20 bg-primary/5" : "border-border/40 bg-muted/5 border-dashed"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 shadow-sm transition-colors",
                                            isActive || !!assignedPlayer ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20" : "bg-background border-border/20 text-foreground/40"
                                        )}>
                                            <span className="text-base font-black leading-none">{pos.id}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {player ? (
                                                <p className="text-sm font-black text-foreground truncate">{player.name}</p>
                                            ) : (
                                                <p className="text-[10px] font-bold text-muted-foreground/30 italic truncate">
                                                    {isActive ? "Tap player..." : "Empty"}
                                                </p>
                                            )}
                                        </div>
                                        {player && (
                                            <div className="ml-auto relative shrink-0">
                                                <div className="w-8 h-8 rounded-full border-2 border-primary/20 overflow-hidden shadow-sm bg-muted flex items-center justify-center">
                                                    {player.image ? (
                                                        <img src={player.image} alt={player.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-3 h-3 text-muted-foreground/50" />
                                                    )}
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={(e) => { e.stopPropagation(); removeFromRoster(player.id); }}
                                                    className="absolute inset-0 w-full h-full rounded-full p-0 text-[8px] font-black uppercase tracking-widest text-destructive hover:text-destructive hover:bg-destructive/20 opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    ✕
                                                </Button>
                                            </div>
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
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest transition-colors",
                                (maxReserves > 0 && assignedReserves.length >= maxReserves) ? "text-red-500" : "text-muted-foreground/40"
                            )}>
                                {assignedReserves.length} {maxReserves > 0 ? `/ ${maxReserves}` : ""}
                            </span>
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
                    
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1">
                        {sortedAvailablePlayers.map(player => {
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
                                    <div className="p-1 gap-1 flex items-center relative overflow-hidden min-h-[40px]">
                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/20 group-hover:scale-110 transition-transform">
                                            <User className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="text-sm font-black truncate text-foreground/90">{player.name}</p>
                                        </div>
                                        {isSelected ? (
                                            isReserve
                                                ? <Users className="w-4 h-4 text-emerald-500 mr-2 shrink-0" />
                                                : (
                                                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-sm shadow-primary/30 mr-1">
                                                        <span className="text-base font-black text-primary-foreground leading-none">
                                                            {rosterItem?.position}
                                                        </span>
                                                    </div>
                                                )
                                        ) : <Circle className="w-4 h-4 text-muted-foreground/20 mr-3 shrink-0" />}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Mobile Player Picker Bottom Sheet */}
            {activePositionId && (
                <div className="fixed lg:hidden inset-0 z-50 flex flex-col justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => { setActivePositionId(null); setPickerSearch(""); }}
                    />
                    {/* Sheet */}
                    <div className="relative bg-background rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh] animate-in slide-in-from-bottom-4 duration-300">
                        {/* Sheet Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assigning position</p>
                                <p className="text-lg font-black uppercase tracking-tight">
                                    {positions.find(p => p.id === activePositionId)?.id}
                                    <span className="text-muted-foreground font-medium normal-case tracking-normal text-base ml-2">
                                        {positions.find(p => p.id === activePositionId)?.name}
                                    </span>
                                </p>
                            </div>
                            <button
                                onClick={() => { setActivePositionId(null); setPickerSearch(""); }}
                                className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Search */}
                        <div className="px-5 pb-3 shrink-0">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search players..."
                                    value={pickerSearch}
                                    onChange={e => setPickerSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-muted/40 border border-border/30 text-sm font-medium placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                                />
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 px-3 pb-6">
                            {sortedAvailablePlayers
                                .filter(p => p.name.toLowerCase().includes(pickerSearch.toLowerCase()))
                                .map(player => {
                                    const rosterItem = roster.find(r => r.orgProfileId === player.id);
                                    const isSelected = !!rosterItem;
                                    return (
                                        <button
                                            key={player.id}
                                            onClick={() => { handlePlayerClick(player.id); setPickerSearch(""); }}
                                            className={cn(
                                                "w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary/5 active:bg-primary/10 transition-colors text-left group",
                                                isSelected && "bg-muted/10 opacity-80"
                                            )}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/20 overflow-hidden">
                                                {player.image
                                                    ? <img src={player.image} alt={player.name} className="w-full h-full object-cover" />
                                                    : <User className="w-5 h-5 text-muted-foreground" />}
                                            </div>
                                            <p className="flex-1 text-sm font-black text-foreground/90">{player.name}</p>
                                            <div className="shrink-0 flex items-center justify-center">
                                                {isSelected ? (
                                                    rosterItem.isReserve ? (
                                                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                                            <Users className="w-4 h-4 text-emerald-500" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm shadow-primary/30">
                                                            <span className="text-base font-black text-primary-foreground leading-none">
                                                                {rosterItem.position}
                                                            </span>
                                                        </div>
                                                    )
                                                ) : (
                                                    <Circle className="w-4 h-4 text-muted-foreground/20 mr-2" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
                            }
                            {sortedAvailablePlayers.filter(p => p.name.toLowerCase().includes(pickerSearch.toLowerCase())).length === 0 && (
                                <p className="text-center text-[11px] font-bold text-muted-foreground/40 uppercase tracking-widest py-8">
                                    No players match "{pickerSearch}"
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Sticky Footer */}
            {isDirty && (
                <div className="fixed lg:hidden bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border/10 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="flex gap-3">
                        <MetalButton
                            type="button"
                            variantType="outlined"
                            icon={<X className="w-4 h-4" />}
                            onClick={handleCancel}
                            disabled={saving}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            Cancel
                        </MetalButton>
                        <MetalButton
                            type="button"
                            variantType="filled"
                            icon={<Save className="w-4 h-4" />}
                            glowColor="hsl(var(--primary))"
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 text-primary-foreground"
                        >
                            {saving ? "Saving..." : "Save Selection"}
                        </MetalButton>
                    </div>
                </div>
            )}
        </div>
    );
}
