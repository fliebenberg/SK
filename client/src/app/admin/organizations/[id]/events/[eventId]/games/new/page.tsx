"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { store } from "@/app/store/store";
import { Event } from "@sk/types"; 
import { useOrganization } from "@/hooks/useOrganization";
import { MatchForm, MatchFormData as FormDataType } from "@/components/admin/games/MatchForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { MetalCard } from "@/components/ui/metal-card";
import { toast } from "@/hooks/use-toast";

export default function NewGamePage() {
  const router = useRouter();
  const params = useParams();
  const orgId = params.id as string;
  const eventId = params.eventId as string;

  const { org, isLoading: orgLoading } = useOrganization(orgId);
  const [event, setEvent] = useState<Event | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState<FormDataType | null>(null);

  useEffect(() => {
    // If event is not in store (e.g. refresh), fetch it
    if (!event) {
        const e = store.getEvent(eventId);
        if (e) setEvent(e);
        else {
             store.fetchEvent(eventId);
             // Subscribe effectively
             const unsub = store.subscribe(() => {
                 const updated = store.getEvent(eventId);
                 if (updated) setEvent(updated);
             });
             return unsub;
        }
    }
  }, [eventId, event]);

  const handleSubmit = async () => {
    if (!event || !formData || !formData.homeTeamId || !formData.awayTeamId) return;

    if (!formData.isTbd && formData.startTime) {
         // Construct full date string for proposed time (Local Time interpretation)
         const dateBase = (event.startDate || event.date || "").split('T')[0];
         const proposedDate = new Date(`${dateBase}T${formData.startTime}:00`);

         const conflicts = store.getGames().filter(g => {
             if (g.eventId !== eventId || g.siteId !== formData.siteId || g.status === 'Cancelled' || !g.startTime) return false;
             
             // Compare timestamps to handle timezone differences (UTC vs Local)
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
        await store.addGame({
            eventId: event.id,
            participants: [{ teamId: formData.homeTeamId }, { teamId: formData.awayTeamId }],
            startTime: formData.isTbd ? undefined : `${(event.startDate || event.date || "").split('T')[0]}T${formData.startTime}:00`,
            siteId: formData.siteId
        });
        router.push(`/admin/organizations/${orgId}/events/${eventId}`);
    } catch (e) {
        console.error(e);
        toast({
            title: "Error",
            description: "Failed to schedule game",
            variant: "destructive"
        });
    } finally {
        setIsProcessing(false);
    }
  };

  if (orgLoading && !org) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading game setup...</p>
      </div>
    );
  }

  if (!org) return null;

  if (!event) return <div className="p-8 text-center font-orbitron">Loading event details...</div>;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl font-black uppercase tracking-tight">Schedule Game</h1>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{event.name}</p>
                </div>
            </div>
        </div>
      </header>

      <main className="container py-8 max-w-3xl">
        <div className="space-y-8">
            <MatchForm 
                orgId={orgId}
                event={event}
                isSportsDay={event.type === 'SportsDay'}
                onChange={setFormData}
            />

            <div className="flex justify-end gap-3 pt-6 border-t border-border/10">
                <Button variant="ghost" onClick={() => router.back()}>
                    Cancel
                </Button>
                <Button 
                    onClick={handleSubmit}
                    disabled={isProcessing || !formData?.homeTeamId || !formData?.awayTeamId}
                >
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Schedule Game
                </Button>
            </div>
        </div>
      </main>
    </div>
  );
}
