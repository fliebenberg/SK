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

interface GameDialogProps {
  organizationId: string;
  event: Event;
  trigger?: React.ReactNode;
  game?: Game;
  onOpenChange?: (open: boolean) => void;
}

export function GameDialog({
  organizationId,
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
         const dateBase = (event.startDate || event.date || "").split('T')[0];
         const proposedDate = new Date(`${dateBase}T${formData.startTime}:00`);

         const conflicts = store.getGames().filter(g => {
             if (g.eventId !== event.id || g.venueId !== formData.venueId || g.status === 'Cancelled' || !g.startTime || g.id === game?.id) return false;
             
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
        if (game) {
            await store.updateGame(game.id, {
                homeTeamId: formData.homeTeamId,
                awayTeamId: formData.awayTeamId,
                startTime: formData.isTbd ? null as any : `${(event.startDate || event.date || "").split('T')[0]}T${formData.startTime}:00`,
                venueId: formData.venueId,
            });
        } else {
            await store.addGame({
                eventId: event.id,
                homeTeamId: formData.homeTeamId,
                awayTeamId: formData.awayTeamId,
                startTime: formData.isTbd ? undefined : `${(event.startDate || event.date || "").split('T')[0]}T${formData.startTime}:00`,
                venueId: formData.venueId,
            });
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
  }, [game]);

  const hasChanges = React.useMemo(() => {
      if (!game || !initialData || !formData) return true; // Always allow if not editing
      return (
          initialData.homeTeamId !== formData.homeTeamId ||
          initialData.awayTeamId !== formData.awayTeamId ||
          initialData.startTime !== formData.startTime ||
          initialData.isTbd !== formData.isTbd ||
          initialData.venueId !== formData.venueId
      );
  }, [game, initialData, formData]);

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
                organizationId={organizationId}
                event={event}
                isSportsDay={event.type === 'SportsDay'}
                initialData={initialData}
                onChange={setFormData}
            />
        </div>

        <DialogFooter className="mt-6">
          <MetalButton 
            variantType="outlined" 
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </MetalButton>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || !formData?.homeTeamId || !formData?.awayTeamId || (game && !hasChanges)}
          >
             {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
             {game ? "Save Changes" : "Schedule Game"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
