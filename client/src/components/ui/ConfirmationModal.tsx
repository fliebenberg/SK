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
  secondaryConfirmText?: string;
  onSecondaryConfirm?: () => void;
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
  secondaryConfirmText,
  onSecondaryConfirm,
  variant = "destructive",
}: ConfirmationModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-border/50 bg-card/95 backdrop-blur-md">
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
        <DialogFooter className="flex flex-row gap-2 pt-6">
          <MetalButton
            variantType="outlined"
            onClick={() => onOpenChange(false)}
            className="flex-1 px-4"
          >
            {cancelText}
          </MetalButton>
          
          {secondaryConfirmText && onSecondaryConfirm && (
             <MetalButton
                variantType="filled"
                glowColor="hsl(var(--primary))"
                onClick={() => {
                  onSecondaryConfirm();
                  onOpenChange(false);
                }}
                className="flex-[1.5] text-white px-4"
              >
                {secondaryConfirmText}
              </MetalButton>
          )}

          <MetalButton
            variantType="filled"
            glowColor={variant === "destructive" ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="flex-1 text-white px-4"
          >
            {confirmText}
          </MetalButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

