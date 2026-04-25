import React from 'react';
import { BaseEventDialog } from './BaseEventDialog';
import { RosterGrid, ScoringActionButton, DialogSectionHeader } from '../ScoringActionButton';
import { UserPlus, Trophy } from 'lucide-react';
import { OutcomeDefinition } from '../../rugby/useRugbyScoring';
import { cn } from '@/lib/utils';

export interface RugbyOutcomeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    icon?: React.ReactNode;
    
    // Outcome Selection
    outcomes: OutcomeDefinition[];
    selectedOutcomeId?: string;
    initialOutcomeId?: string;
    onOutcomeSelect: (outcome: OutcomeDefinition) => void;
    
    // Player Selection (Optional)
    roster?: any[];
    selectedPlayerId?: string;
    initialPlayerId?: string;
    onPlayerSelect?: (playerId: string) => void;
    playerSectionLabel?: string;

    // Common Props
    isEditing?: boolean;
    onSave?: () => void;
    onClose?: () => void;
    onSkip?: () => void;
    onRemove?: () => void;
    skipLabel?: string;
    
    columns?: 2 | 3;
}

export function RugbyOutcomeDialog({
    open,
    onOpenChange,
    title,
    icon,
    outcomes,
    selectedOutcomeId,
    initialOutcomeId,
    onOutcomeSelect,
    roster,
    selectedPlayerId,
    initialPlayerId,
    onPlayerSelect,
    playerSectionLabel = "Select Player",
    isEditing,
    onSave,
    onClose,
    onSkip,
    onRemove,
    skipLabel = "SKIP",
    columns = 2
}: RugbyOutcomeDialogProps) {
    const isDirty = (selectedPlayerId !== initialPlayerId) || (selectedOutcomeId !== initialOutcomeId);

    const footer = !isEditing && !onSkip ? null : undefined; // Remove former footer skip button

    return (
        <BaseEventDialog
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            icon={icon || <UserPlus className="h-5 w-5 text-primary" />}
            isEditing={isEditing}
            isDirty={isDirty}
            onSave={onSave}
            onClose={onClose}
            onSkip={onSkip}
            onRemove={onRemove}
            skipLabel={skipLabel === "SKIP" ? "Skip Details" : skipLabel}
            footer={footer}
        >
            <div className="space-y-4 sm:space-y-6 pt-1 sm:pt-2">
                {/* Optional Player Selection */}
                {roster && onPlayerSelect && (
                    <div className="space-y-3 sm:space-y-4">
                        <DialogSectionHeader label={playerSectionLabel} />
                        <RosterGrid 
                            roster={roster}
                            selectedPlayerId={selectedPlayerId}
                            onSelect={onPlayerSelect}
                        />
                    </div>
                )}

                {/* Outcome Selection */}
                <div className={cn("space-y-3 sm:space-y-4 pt-3 sm:pt-4", (roster && onPlayerSelect) ? "border-t border-white/5" : "")}>
                    <DialogSectionHeader label="Outcome" />
                    <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-3")}>
                        {outcomes.map((outcome) => (
                            <div key={outcome.id} className="flex flex-col gap-2">
                                {outcome.titleLabel && (
                                    <div className={cn(
                                        "text-[10px] font-black uppercase text-center tracking-widest",
                                        outcome.id === 'home' ? "text-blue-500" : outcome.id === 'away' ? "text-red-500" : "text-muted-foreground"
                                    )}>
                                        {outcome.titleLabel}
                                    </div>
                                )}
                                <ScoringActionButton 
                                    onClick={() => onOutcomeSelect(outcome)}
                                    label={outcome.buttonText}
                                    description={outcome.description}
                                    selected={selectedOutcomeId === outcome.id}
                                    variant={outcome.variant}
                                    className="h-14 w-full"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </BaseEventDialog>
    );
}
