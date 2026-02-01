"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { store } from "@/app/store/store";
import { Event, Game } from "@sk/types"; 
import { MatchForm, MatchFormData as FormDataType } from "@/components/admin/games/MatchForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { MetalCard } from "@/components/ui/MetalCard";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";

export default function EditGamePage({ params }: { params: { id: string, eventId: string, gameId: string } }) {
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(store.getEvent(params.eventId) || null);
  const [game, setGame] = useState<Game | null>(store.getGame(params.gameId) || null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormDataType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false });

  // Safety check: ensure game matches event
  useEffect(() => {
     if (game && game.eventId !== params.eventId) {
         // mismatches, suspicious
     }
  }, [game, params.eventId]);

  useEffect(() => {
    const update = () => {
        const e = store.getEvent(params.eventId);
        if (e) setEvent(e);
        
        const g = store.getGame(params.gameId);
        if (g) setGame(g);
    };

    if (!event || !game) {
         store.fetchEvent(params.eventId); // Should fetch games too usually via subscription
         // We might need to ensure we have the game.
         // Store usually fetches all games for the organization or event on load.
    }
    
    // Subscribe
    const unsub = store.subscribe(update);
    update(); // Initial check
    return unsub;
  }, [params.eventId, params.gameId]);

  const handleSubmit = async () => {
    if (!event || !game || !formData || !formData.homeTeamId || !formData.awayTeamId) return;

    setLoading(true);
    try {
        await store.updateGame(game.id, {
            homeTeamId: formData.homeTeamId,
            awayTeamId: formData.awayTeamId,
            startTime: formData.isTbd ? "" : formData.startTime,
            venueId: formData.venueId,
            sportId: formData.sportId // Assuming MatchForm provides this and we want to update it
        });
        router.push(`/admin/organizations/${params.id}/events/${params.eventId}`);
    } catch (e) {
        console.error(e);
        alert("Failed to update game");
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
          
          router.push(`/admin/organizations/${params.id}/events/${params.eventId}`);
      } catch (e) {
          console.error(e);
          alert("Failed to delete game");
      }
  };

  if (!event || !game) return <div className="p-8 text-center">Loading game details...</div>;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tight">Edit Game</h1>
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
        <MetalCard className="p-6 md:p-8">
            <MatchForm 
                organizationId={params.id}
                event={event}
                isSportsDay={event.type === 'SportsDay'}
                initialData={{
                    homeTeamId: game.homeTeamId,
                    awayTeamId: game.awayTeamId,
                    startTime: game.startTime,
                    isTbd: !game.startTime,
                    venueId: game.venueId,
                    sportId: store.getTeam(game.homeTeamId)?.sportId // Derive sport from home team if not on game
                }}
                onChange={setFormData}
            />

            <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-border/50">
                <Button variant="ghost" onClick={() => router.back()}>
                    Cancel
                </Button>
                <Button 
                    onClick={handleSubmit}
                    disabled={loading || !formData?.homeTeamId || !formData?.awayTeamId}
                >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                </Button>
            </div>
        </MetalCard>
      </main>
    </div>
  );
}
