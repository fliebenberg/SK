"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MetalButton } from "./MetalButton";

interface ConfirmationModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
}

export function ConfirmationModal({
  isOpen,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "destructive",
}: ConfirmationModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] border-border/50 bg-card/95 backdrop-blur-md">
        <DialogHeader>
          <DialogTitle 
            className="text-xl font-bold tracking-tight" 
            style={{ fontFamily: 'var(--font-orbitron)' }}
          >
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground pt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-row gap-3 pt-6">
          <MetalButton
            variantType="outlined"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            {cancelText}
          </MetalButton>
          <MetalButton
            variantType="filled"
            glowColor={variant === "destructive" ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="flex-1 text-white"
          >
            {confirmText}
          </MetalButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
