"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { useRouter, useParams } from "next/navigation";
import { store } from "@/app/store/store";
import { Event, Game } from "@sk/types"; 
import { useOrganization } from "@/hooks/useOrganization";
import { MatchForm, MatchFormData as FormDataType } from "@/components/admin/games/MatchForm";
import { Button } from "@/components/ui/button";
import { MetalButton } from "@/components/ui/MetalButton";
import { ArrowLeft, Loader2, Trash2, AlertTriangle, Ban } from "lucide-react";
import { MetalCard } from "@/components/ui/metal-card";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function EditGamePage() {
  const router = useRouter();
  const params = useParams();
  const orgId = params.id as string;
  const eventId = params.eventId as string;
  const gameId = params.gameId as string;

  const { user } = useAuth();
  const { metalVariant } = useThemeColors();

  const { org, isLoading: orgLoading } = useOrganization(orgId);
  const [event, setEvent] = useState<Event | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState<FormDataType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false });
  const [confirmCancel, setConfirmCancel] = useState({ isOpen: false });

  const initialData = React.useMemo(() => {
    if (!game) return undefined;
    return {
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      startTime: game.startTime ? format(new Date(game.startTime), "HH:mm") : undefined,
      isTbd: !game.startTime,
      siteId: game.siteId,
      sportId: store.getTeam(game.homeTeamId)?.sportId
    };
  }, [game?.id, game?.homeTeamId, game?.awayTeamId, game?.startTime, game?.siteId]);

  // Safety check: ensure game matches event
  useEffect(() => {
     if (game && game.eventId !== eventId) {
         // mismatches, suspicious
     }
  }, [game, eventId]);

  const update = () => {
    const e = store.getEvent(eventId);
    if (e) setEvent(e);
    
    const g = store.getGame(gameId);
    if (g) setGame(g);
  };

  useEffect(() => {
    if (!event || !game) {
         store.fetchEvent(eventId);
    }
    
    // Subscribe
    const unsub = store.subscribe(update);
    update(); // Initial check
    return unsub;
  }, [eventId, gameId]);

  const handleSubmit = async () => {
    if (!event || !game || !formData || !formData.homeTeamId || !formData.awayTeamId) return;

    if (!formData.isTbd && formData.startTime) {
         // Construct full date string for proposed time (Local Time interpretation)
         const dateBase = (event.startDate || event.date || "").split('T')[0];
         const proposedDate = new Date(`${dateBase}T${formData.startTime}:00`);

         const conflicts = store.getGames().filter(g => {
             if (g.eventId !== eventId || g.siteId !== formData.siteId || g.status === 'Cancelled' || !g.startTime || g.id === game.id) return false;
             
             const gameDate = new Date(g.startTime);
             return gameDate.getTime() === proposedDate.getTime();
         });

         if (conflicts.length > 0) {
             toast({
                 title: "Scheduling Conflict",
                 description: "A game is already scheduled on this field at this time.",
                 variant: "destructive"
             });
             return;
         }
    }

    setIsProcessing(true);
    try {
        await store.updateGame(game.id, {
            homeTeamId: formData.homeTeamId,
            awayTeamId: formData.awayTeamId,
            startTime: formData.isTbd ? null as any : `${(event.startDate || event.date || "").split('T')[0]}T${formData.startTime}:00`,
            siteId: formData.siteId
        });

        // Handle Referrals
        if (formData.referrals && user?.id) {
            for (const [orgId, emails] of Object.entries(formData.referrals)) {
                const validEmails = emails.map(e => e.trim()).filter(e => e && e.includes('@'));
                if (validEmails.length > 0) {
                    try {
                        await store.referOrgContact(orgId, validEmails, user.id);
                    } catch (e) {
                        console.error(`Failed to refer contacts for org ${orgId}`, e);
                    }
                }
            }
        }

        router.push(`/admin/organizations/${orgId}/events/${eventId}`);
    } catch (e) {
        console.error(e);
        toast({
            title: "Error",
            description: "Failed to update game",
            variant: "destructive"
        });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
      if (!game || !event) return;
      setIsProcessing(true);
      try {
          if (event.type === 'SingleMatch') {
              await store.deleteEvent(event.id);
              router.push(`/admin/organizations/${orgId}/events`);
          } else {
              await store.deleteGame(game.id);
              router.push(`/admin/organizations/${orgId}/events/${eventId}`);
          }
      } catch (e) {
          console.error(e);
          toast({
              title: "Error",
              description: "Failed to delete match",
              variant: "destructive"
          });
      } finally {
          setIsProcessing(false);
      }
  };

  const handleCancelGame = async () => {
    if (!game || !event) return;
    setIsProcessing(true);
    try {
        await store.updateGame(game.id, { status: 'Cancelled' });
        
        // If it's a single match, cancel the event too
        if (event.type === 'SingleMatch') {
            await store.updateEvent(event.id, { status: 'Cancelled' });
        }
        
        setConfirmCancel({ isOpen: false });
        toast({
            title: "Success",
            description: "Match has been cancelled.",
        });
    } catch (err) {
        console.error(err);
        toast({
            title: "Error",
            description: "Failed to cancel match",
            variant: "destructive"
        });
    } finally {
        setIsProcessing(false);
    }
  };

  const hasChanges = React.useMemo(() => {
      if (!initialData || !formData) return false;
      return (
          initialData.homeTeamId !== formData.homeTeamId ||
          initialData.awayTeamId !== formData.awayTeamId ||
          initialData.startTime !== formData.startTime ||
          initialData.isTbd !== formData.isTbd ||
          initialData.siteId !== formData.siteId ||
          initialData.sportId !== formData.sportId
      );
  }, [initialData, formData]);

  if (orgLoading && !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading game details...</p>
      </div>
    );
  }

  if (!org) return null;

  if (!event || !game) return <div className="p-8 text-center font-orbitron">Loading match info...</div>;

  const getMatchName = () => {
      if (!game) return "Edit Game";
      const home = store.getTeam(game.homeTeamId);
      const away = store.getTeam(game.awayTeamId);
      if (!home || !away) return "Edit Game";
      
      const homeOrg = store.getOrganization(home.orgId);
      const awayOrg = store.getOrganization(away.orgId);
      
      const homeName = `${homeOrg?.shortName || homeOrg?.name || ''} ${home.name}`.trim();
      const awayName = `${awayOrg?.shortName || awayOrg?.name || ''} ${away.name}`.trim();
      
      return `${homeName} vs ${awayName}`;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-black uppercase tracking-tight">{getMatchName()}</h1>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{event.name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive hover:bg-destructive/10" 
                        onClick={() => setConfirmDelete({ isOpen: true })}
                    >
                        <Trash2 className="h-5 w-5" />
                    </Button>
                </div>
        </div>
      </header>

      <main className="container py-8 max-w-3xl">
        <div className="space-y-8">
            <MatchForm 
                key={game?.id || 'new'}
                orgId={orgId}
                event={event}
                isSportsDay={event.type === 'SportsDay'}
                initialData={initialData}
                onChange={setFormData}
            />

            <div className="flex justify-end gap-3 pt-6 border-t border-border/10">
                <Button variant="ghost" onClick={() => router.back()}>
                    Cancel
                </Button>
                <Button 
                    onClick={handleSubmit}
                    disabled={isProcessing || !formData?.homeTeamId || !formData?.awayTeamId || !hasChanges}
                >
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                </Button>
            </div>

            {/* Danger Zone */}
            <section className="mt-12 pt-12 border-t border-destructive/10 space-y-6">
                <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    <h2 className="text-xl font-black uppercase tracking-tight">Danger Zone</h2>
                </div>
                
                <div className="grid gap-6">
                    {/* Cancel Game */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border border-destructive/10 bg-destructive/5">
                        <div className="space-y-1">
                            <h3 className="font-bold text-lg">Cancel Match</h3>
                            <p className="text-sm text-muted-foreground italic">Temporarily cancel this match. This can be reversed later by changing the status back to Scheduled.</p>
                        </div>
                        <MetalButton 
                            variantType="outlined" 
                            className="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0" 
                            glowColor="hsl(38, 92%, 50%)" // Orange glow for cancel
                            onClick={() => setConfirmCancel({ isOpen: true })}
                            disabled={isProcessing || game.status === 'Cancelled'}
                        >
                            Cancel Match
                        </MetalButton>
                    </div>

                    {/* Delete Game */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl border border-destructive/10 bg-destructive/5">
                        <div className="space-y-1">
                            <h3 className="font-bold text-lg text-destructive">Delete Match</h3>
                            <p className="text-sm text-muted-foreground italic">
                                {event.type === 'SingleMatch' 
                                    ? "Permanently remove this match and the entire event record. This action cannot be undone."
                                    : "Permanently remove this match from the event. This action cannot be undone."}
                            </p>
                        </div>
                        <MetalButton 
                            variantType="outlined" 
                            className="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0" 
                            glowColor="hsl(var(--destructive))"
                            onClick={() => setConfirmDelete({ isOpen: true })}
                            disabled={isProcessing}
                        >
                            Delete Match
                        </MetalButton>
                    </div>
                </div>
            </section>
        </div>
      </main>

      <ConfirmationModal
        isOpen={confirmCancel.isOpen}
        onOpenChange={(open) => setConfirmCancel({ isOpen: open })}
        onConfirm={handleCancelGame}
        title="Cancel Match?"
        description="Are you sure you want to cancel this match? You can restore it later by editing the status."
        confirmText="Cancel Match"
      />

      <ConfirmationModal
        isOpen={confirmDelete.isOpen}
        onOpenChange={(open) => setConfirmDelete({ isOpen: open })}
        onConfirm={handleDelete}
        title={event.type === 'SingleMatch' ? "Delete Match & Event?" : "Delete Match?"}
        description={event.type === 'SingleMatch' 
            ? "Are you sure you want to delete this match and the parent event? This will permanently remove all data and cannot be undone."
            : "Are you sure you want to delete this match? This will permanently remove all data for this specific game and cannot be undone."}
        confirmText="Delete Match"
        variant="destructive"
      />
    </div>
  );
}
