"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { store } from "@/app/store/store";
import { Event, MatchFormData } from "@sk/types"; 
// Note: MatchFormData export might need to be checked if it is exported from @sk/types or locally from MatchForm
// Checking MatchForm imports in previous turns, it was exported from local file. 
// I will import it from the component file.

import { MatchForm, MatchFormData as FormDataType } from "@/components/admin/games/MatchForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { MetalCard } from "@/components/ui/MetalCard";

export default function NewGamePage({ params }: { params: { id: string, eventId: string } }) {
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(store.getEvent(params.eventId) || null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormDataType | null>(null);

  useEffect(() => {
    // If event is not in store (e.g. refresh), fetch it
    if (!event) {
        const e = store.getEvent(params.eventId);
        if (e) setEvent(e);
        else {
             store.fetchEvent(params.eventId);
             // Subscribe effectively
             const unsub = store.subscribe(() => {
                 const updated = store.getEvent(params.eventId);
                 if (updated) setEvent(updated);
             });
             return unsub;
        }
    }
  }, [params.eventId, event]);

  const handleSubmit = async () => {
    if (!event || !formData || !formData.homeTeamId || !formData.awayTeamId) return;

    setLoading(true);
    try {
        await store.addGame({
            eventId: event.id,
            homeTeamId: formData.homeTeamId,
            awayTeamId: formData.awayTeamId,
            startTime: formData.isTbd ? "" : formData.startTime,
            venueId: formData.venueId,
            status: "Scheduled",
            homeScore: 0,
            awayScore: 0
        });
        router.push(`/admin/organizations/${params.id}/events/${params.eventId}`);
    } catch (e) {
        console.error(e);
        alert("Failed to schedule game");
    } finally {
        setLoading(false);
    }
  };

  if (!event) return <div className="p-8 text-center">Loading event...</div>;

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
        <MetalCard className="p-6 md:p-8">
            <MatchForm 
                organizationId={params.id}
                event={event}
                isSportsDay={event.type === 'SportsDay'}
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
                    Schedule Game
                </Button>
            </div>
        </MetalCard>
      </main>
    </div>
  );
}
