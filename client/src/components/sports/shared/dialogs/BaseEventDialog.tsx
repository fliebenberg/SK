import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pencil, Check, X, Trash2 } from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';

export interface BaseEventDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: React.ReactNode;
    icon?: React.ReactNode;
    isEditing?: boolean;
    isDirty?: boolean;
    onSave?: () => void;
    onClose?: () => void;
    onSkip?: () => void;
    onRemove?: () => void;
    skipLabel?: string;
    footer?: React.ReactNode;
    children: React.ReactNode;
}

export function BaseEventDialog({
    open,
    onOpenChange,
    title,
    icon,
    isEditing,
    isDirty,
    onSave,
    onClose,
    onSkip,
    onRemove,
    skipLabel = "Skip Details",
    footer,
    children
}: BaseEventDialogProps) {
    const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);

    const handleClose = () => {
        if (isDirty && isEditing) {
            setShowDiscardConfirmation(true);
        } else {
            if (onClose) onClose();
            else onOpenChange(false);
        }
    };

    return (
        <>
            <Dialog 
                open={open} 
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        handleClose();
                    } else {
                        onOpenChange(true);
                    }
                }}
            >
                <DialogContent hideCloseButton className="sm:max-w-lg bg-card border-border/50 flex flex-col overflow-hidden max-h-[90vh]">
                    <DialogHeader className="relative pr-12 shrink-0">
                        <DialogTitle className="text-xl font-black italic tracking-tighter flex items-center gap-2">
                            {isEditing ? <Pencil className="h-5 w-5 text-primary" /> : icon}
                            {isEditing ? <>Edit {title}</> : title}
                        </DialogTitle>
                        <div className="absolute right-0 top-0 flex items-center gap-1 h-full">
                            {onSkip && !isEditing && (
                                <button 
                                    onClick={onSkip}
                                    className="px-3 py-1 mr-1 text-[10px] font-black uppercase text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-full transition-all border border-transparent hover:border-border/30"
                                >
                                    {skipLabel}
                                </button>
                            )}
                            {isEditing && isDirty && onSave && (
                                <button 
                                    onClick={onSave}
                                    className="p-2 text-success hover:bg-success/10 rounded-full transition-colors"
                                    title="Save Changes"
                                >
                                    <Check className="w-6 h-6" />
                                </button>
                            )}
                            {isEditing && onRemove && (
                                <button 
                                    onClick={onRemove}
                                    className="p-2 text-danger hover:bg-danger/10 rounded-full transition-colors"
                                    title="Remove Event"
                                >
                                    <Trash2 className="w-6 h-6" />
                                </button>
                            )}
                            <button 
                                onClick={handleClose}
                                className="p-2 text-muted-foreground hover:bg-white/10 rounded-full transition-colors"
                                title="Close"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto py-4 custom-scrollbar min-h-0">
                        {children}
                    </div>

                    {footer && (
                        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t border-white/5 shrink-0">
                            {footer}
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            <ConfirmationModal 
                isOpen={showDiscardConfirmation}
                onOpenChange={setShowDiscardConfirmation}
                title="Unsaved Changes"
                description="You have unsaved changes. Would you like to save them before exiting, or discard them?"
                confirmText="Discard"
                secondaryConfirmText="Save and exit"
                cancelText="Stay"
                onConfirm={() => {
                    setShowDiscardConfirmation(false);
                    if (onClose) onClose();
                    else onOpenChange(false);
                }}
                onSecondaryConfirm={() => {
                    if (onSave) onSave();
                    setShowDiscardConfirmation(false);
                    if (onClose) onClose();
                    else onOpenChange(false);
                }}
                variant="destructive"
            />
        </>
    );
}
