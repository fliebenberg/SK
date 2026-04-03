"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { MetalButton } from "@/components/ui/MetalButton";
import { Check, X, Scale } from "lucide-react";

interface UndoVoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
  onVote: (vote: 'APPROVE' | 'REJECT') => void;
}

export function UndoVoteDialog({ isOpen, onClose, event, onVote }: UndoVoteDialogProps) {
  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-amber-500" />
            Consensus Dispute
          </DialogTitle>
          <DialogDescription>
            A dispute has been raised for the following event. Please cast your vote to approve or reject the undo.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 border-y border-border/50 my-2">
           <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1">Event Detail</div>
           <div className="text-lg font-bold">
             {event.type === 'SCORE' ? `Score: ${event.eventData?.pointsDelta} pts` : event.type}
           </div>
           <div className="text-sm text-muted-foreground">
             Sequence #{event.sequence} • {new Date(event.timestamp).toLocaleTimeString()}
           </div>
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <MetalButton 
            variantType="secondary" 
            onClick={() => onVote('REJECT')}
            icon={<X className="w-4 h-4" />}
            className="flex-1"
          >
            Reject Undo
          </MetalButton>
          <MetalButton 
            variantType="outlined" 
            glowColor="hsl(var(--primary))"
            onClick={() => onVote('APPROVE')}
            icon={<Check className="w-4 h-4" />}
            className="flex-1"
          >
            Approve Undo
          </MetalButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
