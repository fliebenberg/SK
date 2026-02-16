"use client";

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MetalButton } from '@/components/ui/MetalButton';
import { Label } from '@/components/ui/label';
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { store } from '@/app/store/store';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'organization' | 'event' | 'user';
  entityId: string;
  entityName: string;
}

export function ReportDialog({ 
  isOpen, 
  onClose, 
  entityType, 
  entityId, 
  entityName 
}: ReportDialogProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
        toast({
            title: "Authentication Required",
            description: "Please log in to submit a report.",
            variant: "destructive"
        });
        return;
    }

    if (!reason) {
        toast({
            title: "Reason Required",
            description: "Please select a reason for your report.",
            variant: "destructive"
        });
        return;
    }

    setIsSubmitting(true);
    try {
      await store.submitReport({
        entityType,
        entityId,
        reason,
        description,
        reporterUserId: user.id
      });
      
      toast({
        title: "Report Submitted",
        description: "Thank you for helping us keep ScoreKeeper safe. We'll review your report shortly.",
        variant: "success"
      });
      onClose();
      setReason('');
      setDescription('');
    } catch (error: any) {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit report. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-orbitron font-bold text-destructive flex items-center gap-2">
            REPORT {entityType.toUpperCase()}
          </DialogTitle>
          <DialogDescription>
            Help us understand what's wrong with <span className="font-bold text-foreground">{entityName}</span>. 
            All reports are reviewed by our moderation team.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="reason">Reason for Report</Label>
            <Select onValueChange={setReason} value={reason}>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="impersonation">Impersonation / False Organization</SelectItem>
                <SelectItem value="inappropriate_content">Inappropriate Content</SelectItem>
                <SelectItem value="spam">Spam or Misleading Info</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="description">Additional Details (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Please provide more context to help our team investigate..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
        </div>
        
        <DialogFooter>
          <MetalButton 
            variantType="secondary" 
            onClick={onClose} 
            disabled={isSubmitting}
          >
            Cancel
          </MetalButton>
          <MetalButton 
            variantType="filled" 
            glowColor="hsl(var(--destructive))"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </MetalButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
