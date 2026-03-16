import React, { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Event, Game } from "@sk/types";
import { store } from "@/app/store/store";
import { MetalButton } from "@/components/ui/MetalButton";
import { Loader2 } from "lucide-react";
import { MatchForm, MatchFormData } from "./MatchForm";
import { toast } from "@/hooks/use-toast";

import { useAuth } from "@/contexts/AuthContext";

interface GameDialogProps {
  orgId: string;
  event: Event;
  trigger?: React.ReactNode;
  game?: Game;
  onOpenChange?: (open: boolean) => void;
}

export function GameDialog({
  orgId,
  event,
  trigger,
  game,
  onOpenChange
}: GameDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = onOpenChange ? true : internalOpen;
  const setOpen = (val: boolean) => {
      if (onOpenChange) onOpenChange(val);
      else setInternalOpen(val);
  };
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<MatchFormData | null>(null);

  const handleSubmit = async () => {
    if (!formData || !formData.homeTeamId || !formData.awayTeamId) return;

    if (!formData.isTbd && formData.startTime) {
         const dateBase = format(new Date(event.startDate || event.date || ""), "yyyy-MM-dd");
         const proposedDate = new Date(`${dateBase}T${formData.startTime}:00`);

         const conflicts = store.getGames().filter(g => {
             if (g.eventId !== event.id || g.siteId !== formData.siteId || g.status === 'Cancelled' || !g.startTime || g.id === game?.id) return false;
             
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
    
    const { user } = useAuth();
    setLoading(true);
    try {
        const dateBase = (event.startDate || event.date || "").split('T')[0];
        const dateObj = new Date(`${dateBase}T${formData.startTime}:00`);
        let savedGame: Game;
        if (game) {
            savedGame = await store.updateGame(game.id, {
                participants: [{ teamId: formData.homeTeamId }, { teamId: formData.awayTeamId }],
                startTime: formData.isTbd ? null as any : (!isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateBase}T${formData.startTime}:00`),
                siteId: formData.siteId,
                facilityId: formData.facilityId,
            });
        } else {
            savedGame = await store.addGame({
                eventId: event.id,
                participants: [{ teamId: formData.homeTeamId }, { teamId: formData.awayTeamId }],
                startTime: formData.isTbd ? undefined : (!isNaN(dateObj.getTime()) ? dateObj.toISOString() : `${dateBase}T${formData.startTime}:00`),
                siteId: formData.siteId,
                facilityId: formData.facilityId,
            });
        }

        // Process Referrals if any
        if (formData.referrals && user) {
            const orgIds = Object.keys(formData.referrals);
            for (const orgId of orgIds) {
                const emails = formData.referrals[orgId].filter(e => e.trim() !== "");
                if (emails.length > 0) {
                    await store.referOrgContact(orgId, emails, user.id);
                }
            }
        }

        setOpen(false);
    } catch (e) {
        console.error(e);
        toast({
            title: "Error",
            description: "Failed to schedule game",
            variant: "destructive"
        });
    } finally {
        setLoading(false);
    }
  };


  const hasChanges = React.useMemo(() => {
    if (!game || !formData) return true; // Always allow if not editing
    const p1 = game.participants?.[0]?.teamId || "";
    const p2 = game.participants?.[1]?.teamId || "";
    const gTime = game.startTime ? format(new Date(game.startTime), "HH:mm") : "09:00";
    const gIsTbd = !game.startTime;

    return (
        p1 !== formData.homeTeamId ||
        p2 !== formData.awayTeamId ||
        gTime !== formData.startTime ||
        gIsTbd !== formData.isTbd ||
        (game.siteId || "") !== (formData.siteId || "") ||
        (game.facilityId || "") !== (formData.facilityId || "")
    );
  }, [game, formData]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{game ? "Edit Game" : "Schedule Game"}</DialogTitle>
          <DialogDescription>
            {game ? "Update the details for this match." : "Add a game to this event. Select your team and the opponent."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
            <MatchForm 
                key={game?.id || 'new'}
                orgId={orgId}
                event={event}
                isSportsDay={event.type === 'SportsDay'}
                initialData={game ? {
                    startTime: game.startTime,
                    isTbd: !game.startTime,
                    siteId: game.siteId || "",
                    facilityId: game.facilityId || "",
                    homeTeamId: game.participants?.[0]?.teamId || "",
                    awayTeamId: game.participants?.[1]?.teamId || "",
                    sportId: event.sportIds?.[0] || ""
                } : undefined}
                onChange={setFormData}
            />
        </div>

        <DialogFooter className="mt-6">
          {(!game || hasChanges) ? (
            <div className="flex gap-2 w-full justify-end animate-in fade-in slide-in-from-right-2">
              <MetalButton 
                variantType="outlined" 
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </MetalButton>
              <Button 
                onClick={handleSubmit} 
                disabled={loading || !formData?.homeTeamId || !formData?.awayTeamId}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {game ? "Save Changes" : "Schedule Game"}
              </Button>
            </div>
          ) : (
            <MetalButton 
              variantType="outlined" 
              onClick={() => setOpen(false)}
              className="w-full sm:w-auto"
            >
              Close
            </MetalButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

