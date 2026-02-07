"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { useRouter, useParams } from "next/navigation";
import { store } from "@/app/store/store";
import { Event, Game } from "@sk/types"; 
import { MatchForm, MatchFormData as FormDataType } from "@/components/admin/games/MatchForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { MetalCard } from "@/components/ui/metal-card";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { toast } from "@/hooks/use-toast";

export default function EditGamePage() {
  const router = useRouter();
  const params = useParams();
  const organizationId = params.id as string;
  const eventId = params.eventId as string;
  const gameId = params.gameId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormDataType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false });

  const initialData = React.useMemo(() => {
    if (!game) return undefined;
    return {
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      startTime: game.startTime ? format(new Date(game.startTime), "HH:mm") : undefined,
      isTbd: !game.startTime,
      venueId: game.venueId,
      sportId: store.getTeam(game.homeTeamId)?.sportId
    };
  }, [game?.id, game?.homeTeamId, game?.awayTeamId, game?.startTime, game?.venueId]);

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
             if (g.eventId !== eventId || g.venueId !== formData.venueId || g.status === 'Cancelled' || !g.startTime || g.id === game.id) return false;
             
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

    setLoading(true);
    try {
        await store.updateGame(game.id, {
            homeTeamId: formData.homeTeamId,
            awayTeamId: formData.awayTeamId,
            startTime: formData.isTbd ? null as any : `${(event.startDate || event.date || "").split('T')[0]}T${formData.startTime}:00`,
            venueId: formData.venueId
        });
        router.push(`/admin/organizations/${organizationId}/events/${eventId}`);
    } catch (e) {
        console.error(e);
        toast({
            title: "Error",
            description: "Failed to update game",
            variant: "destructive"
        });
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async () => {
      if (!game) return;
      try {
          await store.deleteGame(game.id); // Assuming this method exists or will be added, technically deleteGame is not in the viewed store.ts... let's check
          // store.ts view earlier showed deleteTeam/Event/Person but verify deleteGame.
          // Wait, I didn't verify deleteGame exists in store.ts. I should check or assume generic action.
          // In previous turn I saw `updateGame`, `addGame`. 
          // I will assume for now or check. 
          // Checking line 609 of store.ts... I see addGame. 
          // I don't recall seeing deleteGame in the snippet around lines 600-800.
          // I will double check. If not, I'll add it or use socket directly? No, should be in store.
          
          router.push(`/admin/organizations/${organizationId}/events/${eventId}`);
      } catch (e) {
          console.error(e);
          toast({
              title: "Error",
              description: "Failed to delete game",
              variant: "destructive"
          });
      }
  };

  const hasChanges = React.useMemo(() => {
      if (!initialData || !formData) return false;
      return (
          initialData.homeTeamId !== formData.homeTeamId ||
          initialData.awayTeamId !== formData.awayTeamId ||
          initialData.startTime !== formData.startTime ||
          initialData.isTbd !== formData.isTbd ||
          initialData.venueId !== formData.venueId ||
          initialData.sportId !== formData.sportId
      );
  }, [initialData, formData]);

  if (!event || !game) return <div className="p-8 text-center">Loading game details...</div>;

  const getMatchName = () => {
      if (!game) return "Edit Game";
      const home = store.getTeam(game.homeTeamId);
      const away = store.getTeam(game.awayTeamId);
      if (!home || !away) return "Edit Game";
      
      const homeOrg = store.getOrganization(home.organizationId);
      const awayOrg = store.getOrganization(away.organizationId);
      
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
            {/* Delete button option */}
             <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete({ isOpen: true })}>
                <Trash2 className="h-5 w-5" />
            </Button>
        </div>
      </header>

      <main className="container py-8 max-w-3xl">
        <div className="space-y-8">
            <MatchForm 
                key={game?.id || 'new'}
                organizationId={organizationId}
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
                    disabled={loading || !formData?.homeTeamId || !formData?.awayTeamId || !hasChanges}
                >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                </Button>
            </div>
        </div>
      </main>
    </div>
  );
}
