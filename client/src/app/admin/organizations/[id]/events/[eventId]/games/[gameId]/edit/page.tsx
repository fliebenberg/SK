"use client";

import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { useRouter, useParams } from "next/navigation";
import { store } from "@/app/store/store";
import { Event, Game } from "@sk/types"; 
import { useOrganization } from "@/hooks/useOrganization";
import { useGame, useEvent } from "@/hooks/useEntity";
import { MatchForm, MatchFormData as FormDataType } from "@/components/admin/games/MatchForm";
import { Button } from "@/components/ui/button";
import { MetalButton } from "@/components/ui/MetalButton";
import { ArrowLeft, Loader2, Trash2, AlertTriangle, Ban, Calendar, MapPin, Trophy } from "lucide-react";
import { MetalCard } from "@/components/ui/metal-card";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

export default function EditGamePage() {
  const router = useRouter();
  const params = useParams();
  const orgId = params.id as string;
  const eventId = params.eventId as string;
  const gameId = params.gameId as string;

  const { user } = useAuth();
  const { metalVariant } = useThemeColors();

  const { org, isLoading: orgLoading } = useOrganization(orgId);
  const { event: hookedEvent, isLoading: eventLoading, isNotFound: eventNotFound } = useEvent(eventId, { redirectOnNotFound: false });
  const { game: hookedGame, isLoading: gameLoading, isNotFound: gameNotFound } = useGame(gameId, { redirectOnNotFound: false });

  const [event, setEvent] = useState<Event | null>(() => store.getEvent(eventId) || null);
  const [game, setGame] = useState<Game | null>(() => store.getGame(gameId) || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState<FormDataType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false });
  const [confirmCancel, setConfirmCancel] = useState({ isOpen: false });

  useEffect(() => {
      if (hookedEvent) setEvent(hookedEvent);
  }, [hookedEvent]);

  useEffect(() => {
      if (hookedGame) setGame(hookedGame);
  }, [hookedGame]);

  // Safety check: ensure game matches event
  useEffect(() => {
     if (game && game.eventId !== eventId) {
         // mismatches, suspicious
     }
  }, [game, eventId]);

  const loading = orgLoading || eventLoading || gameLoading;

  const hasChanges = React.useMemo(() => {
    if (!game || !formData || !event) return false;
    const p1 = game.participants?.[0]?.teamId || "";
    const p2 = game.participants?.[1]?.teamId || "";
    const displayTimeStr = game.scheduledStartTime || game.startTime;
    const gTime = displayTimeStr ? format(new Date(displayTimeStr), "HH:mm") : "09:00";
    const gIsTbd = !game.scheduledStartTime && !game.startTime;

    return (
        p1 !== formData.homeTeamId ||
        p2 !== formData.awayTeamId ||
        gTime !== formData.startTime ||
        gIsTbd !== formData.isTbd ||
        (game.siteId || "") !== (formData.siteId || "") ||
        (game.facilityId || "") !== (formData.facilityId || "")
    );
  }, [game, formData, event]);

  useUnsavedChanges(hasChanges);

  const handleSubmit = async () => {
    if (!event || !game || !formData || !formData.homeTeamId || !formData.awayTeamId) return;

    setIsProcessing(true);
    try {
        const dateBase = (event.startDate || event.date || "").split('T')[0];
        const dateObj = new Date(`${dateBase}T${formData.startTime}:00`);

        const gamePayload = {
            participants: [{ teamId: formData.homeTeamId }, { teamId: formData.awayTeamId }],
            scheduledStartTime: formData.isTbd ? null as any : (!isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateBase}T${formData.startTime}:00`),
            siteId: formData.siteId,
            facilityId: formData.facilityId
        };

        // If it's still Scheduled, also update startTime (as fallback/legacy)
        if (game.status === 'Scheduled') {
          (gamePayload as any).startTime = gamePayload.scheduledStartTime;
        }

        await store.updateGame(game.id, gamePayload);

        // Handle Referrals
        if (formData.referrals && user?.id) {
            for (const [orgId, emails] of Object.entries(formData.referrals)) {
                const validEmails = (emails as string[]).map(e => e.trim()).filter(e => e && e.includes('@'));
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

  if (loading && (!org || (!event && !hookedEvent && !eventNotFound) || (!game && !hookedGame && !gameNotFound))) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-orbitron">Loading game details...</p>
      </div>
    );
  }

  if (!org) return null;

  if (!event || !game) {
      if (eventNotFound || gameNotFound) {
          return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <h2 className="text-2xl font-bold font-orbitron">Match Not Found</h2>
                <p className="text-muted-foreground">The match or event you are looking for does not exist or has been removed.</p>
                <MetalButton onClick={() => router.push(`/admin/organizations/${orgId}/events`)}>
                    Back to Events
                </MetalButton>
            </div>
          );
      }
      return null;
  }

  const getMatchName = () => {
      if (!game) return "Edit Game";
      const p1 = game.participants?.[0]?.teamId;
      const p2 = game.participants?.[1]?.teamId;
      if (!p1 || !p2) return "Edit Game";

      const home = store.getTeam(p1);
      const away = store.getTeam(p2);
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
                        <h1 className="text-xl font-black uppercase tracking-tight leading-tight">{getMatchName()}</h1>
                        <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                            {(() => {
                                const status = game.status || 'Scheduled';
                                
                                // Always show scheduled time
                                const dateSource = game.scheduledStartTime || game.startTime || event.startDate || event.date || "";

                                if (!dateSource) return null;
                                const dateObj = new Date(dateSource);
                                if (isNaN(dateObj.getTime())) return null;

                                return <div className="flex items-center gap-3">
                                    <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-black tracking-tighter ${
                                        status === 'Live' ? 'bg-red-500 text-white animate-pulse' :
                                        status === 'Finished' ? 'bg-secondary text-secondary-foreground' :
                                        'bg-primary/10 text-primary'
                                    }`}>
                                        {status}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3"/> 
                                        {format(dateObj, "EEE, d MMM yyyy")}
                                        {(game.scheduledStartTime || game.startTime) && <span className="ml-1 opacity-60">@ {format(dateObj, "HH:mm")}</span>}
                                    </span>
                                </div>
                            })()}
                            {(() => {
                                const site = game.siteId ? store.getSite(game.siteId) : store.getSite(event.siteId || "");
                                const facility = game.facilityId ? store.getFacility(game.facilityId) : null;
                                const locString = [site?.name, facility?.name].filter(Boolean).join(" - ");
                                if (!locString) return null;
                                return <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {locString}</span>
                            })()}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {(store.globalRole === 'admin' || store.canScoreGame(game.id)) && (
                        <MetalButton 
                            size="sm"
                            icon={<Trophy className="w-4 h-4" />}
                            onClick={() => router.push(`/admin/games/${game.id}`)}
                            className="text-[10px] font-black uppercase tracking-wider h-8 px-3"
                        >
                            Score Match
                        </MetalButton>
                    )}
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
                initialData={game ? {
                    startTime: game.scheduledStartTime || game.startTime,
                    isTbd: !game.scheduledStartTime && !game.startTime,
                    siteId: game.siteId || "",
                    facilityId: game.facilityId || "",
                    homeTeamId: game.participants?.[0]?.teamId || "",
                    awayTeamId: game.participants?.[1]?.teamId || "",
                    sportId: event.sportIds?.[0] || ""
                } : undefined}
                onChange={setFormData}
            />

            {hasChanges && (
                <div className="flex justify-end gap-3 pt-6 border-t border-border/10">
                    <Button variant="ghost" onClick={() => router.back()}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSubmit}
                        disabled={isProcessing || !formData?.homeTeamId || !formData?.awayTeamId}
                    >
                        {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </div>
            )}

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
