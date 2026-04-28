import React from 'react';
import { BaseEventDialog } from './BaseEventDialog';
import { RosterGrid, ScoringActionButton, DialogSectionHeader } from '../ScoringActionButton';
import { UserPlus, Trophy, Minus, Plus } from 'lucide-react';
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
    
    // Reset Support (Scrum specifically)
    resets?: number;
    onResetsChange?: (count: number) => void;
    
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
    resets,
    onResetsChange,
    columns = 2
}: RugbyOutcomeDialogProps) {
    const isDirty = (selectedPlayerId !== initialPlayerId) || (selectedOutcomeId !== initialOutcomeId);

    const footer = !isEditing && !onSkip && !onResetsChange ? null : undefined; 

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
            <div className="space-y-3 sm:space-y-4 pt-1 sm:pt-2">
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
                <div className={cn("space-y-3 sm:space-y-4 pt-2 sm:pt-3", (roster && onPlayerSelect) ? "border-t border-white/5" : "")}>
                    <DialogSectionHeader label="Outcome" />
                    
                    <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-3")}>
                        {outcomes.map((outcome) => (
                            <div key={outcome.id} className="flex flex-col gap-2">
                                {outcome.titleLabel && (
                                    <div className={cn(
                                        "text-tiny font-black uppercase text-center tracking-widest",
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

                        {/* Special Reset Stepper for Scrums */}
                        {onResetsChange && (
                            <div className="col-span-2 mt-6 pt-6 border-t border-white/5">
                                <div className="flex flex-col items-center gap-4">
                                    <DialogSectionHeader label="Scrum Resets" className="mb-0 tracking-[0.3em]" />
                                    
                                    <div className="flex items-center gap-8">
                                        <button 
                                            onClick={() => onResetsChange(Math.max(0, (resets || 0) - 1))}
                                            disabled={(resets || 0) <= 0}
                                            className="w-12 h-12 flex items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
                                        >
                                            <Minus className="h-6 w-6 text-amber-500" />
                                        </button>
                                        
                                        <div className="flex flex-col items-center min-w-[80px]">
                                            <span className="text-5xl font-black text-amber-500 tabular-nums drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                                                {resets || 0}
                                            </span>
                                        </div>

                                        <button 
                                            onClick={() => onResetsChange((resets || 0) + 1)}
                                            className="w-12 h-12 flex items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 transition-all active:scale-95"
                                        >
                                            <Plus className="h-6 w-6 text-amber-500" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </BaseEventDialog>
    );
}
