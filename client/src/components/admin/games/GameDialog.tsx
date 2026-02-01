import { useState } from "react";
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
    
    setLoading(true);
    try {
        if (game) {
            await store.updateGame(game.id, {
                homeTeamId: formData.homeTeamId,
                awayTeamId: formData.awayTeamId,
                startTime: formData.isTbd ? "" : formData.startTime,
                venueId: formData.venueId,
            });
        } else {
            await store.addGame({
                eventId: event.id,
                homeTeamId: formData.homeTeamId,
                awayTeamId: formData.awayTeamId,
                startTime: formData.isTbd ? "" : formData.startTime,
                venueId: formData.venueId,
            });
        }
        setOpen(false);
    } catch (e) {
        console.error(e);
        alert("Failed to schedule game");
    } finally {
        setLoading(false);
    }
  };

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
                organizationId={organizationId}
                event={event}
                isSportsDay={event.type === 'SportsDay'}
                initialData={game ? {
                    homeTeamId: game.homeTeamId,
                    awayTeamId: game.awayTeamId,
                    startTime: game.startTime,
                    isTbd: !game.startTime,
                    venueId: game.venueId,
                } : undefined}
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
            disabled={loading || !formData?.homeTeamId || !formData?.awayTeamId}
          >
             {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
             {game ? "Save Changes" : "Schedule Game"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
