import React from 'react';
import { BaseEventDialog } from './BaseEventDialog';
import { RosterGrid, ScoringActionButton } from '../ScoringActionButton';
import { UserPlus } from 'lucide-react';

export interface PlayerSelectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    roster: any[];
    selectedPlayerId?: string;
    initialPlayerId?: string;
    isEditing?: boolean;
    onSelect: (playerId?: string) => void;
    onSave?: () => void;
    onClose?: () => void;
    onSkip?: () => void;
    skipLabel?: string;
    customFooterActions?: React.ReactNode;
}

export function PlayerSelectionDialog({
    open,
    onOpenChange,
    title = 'Select Player',
    roster,
    selectedPlayerId,
    initialPlayerId,
    isEditing,
    onSelect,
    onSave,
    onClose,
    onSkip,
    skipLabel = 'SKIP PLAYER',
    customFooterActions
}: PlayerSelectionDialogProps) {
    const isDirty = selectedPlayerId !== initialPlayerId;

    const footer = !isEditing && customFooterActions ? (
        <>
            {customFooterActions}
        </>
    ) : null;

    return (
        <BaseEventDialog
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            icon={<UserPlus className="h-5 w-5 text-primary" />}
            isEditing={isEditing}
            isDirty={isDirty}
            onSave={onSave}
            onClose={onClose}
            onSkip={onSkip}
            skipLabel={skipLabel === 'SKIP PLAYER' ? 'Skip Details' : skipLabel}
            footer={footer}
        >
            <div className="py-2">
                <RosterGrid 
                    roster={roster}
                    selectedPlayerId={selectedPlayerId}
                    onSelect={onSelect}
                />
            </div>
        </BaseEventDialog>
    );
}
