import React from 'react';
import { BaseEventDialog } from './BaseEventDialog';
import { ScoringActionButton } from '../ScoringActionButton';
import { AlertTriangle, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DecisionOption {
    id: string;
    label: string;
    category?: string;
    variant?: 'primary' | 'success' | 'danger' | 'muted' | 'ghost' | 'scrim' | 'none';
    className?: string; // Additional classes (e.g. background color, height)
    titleLabel?: string; // e.g. 'HOME WON' (used in Winner dialog)
}

export interface DecisionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: React.ReactNode;
    options: DecisionOption[];
    selectedId?: string;
    initialId?: string;
    isEditing?: boolean;
    onSelect: (optionId: string) => void;
    onSave?: () => void;
    onClose?: () => void;
    onSkip?: () => void;
    skipLabel?: string;
    columns?: 2 | 3;
    icon?: React.ReactNode;
}

export function DecisionDialog({
    open,
    onOpenChange,
    title,
    options,
    selectedId,
    initialId,
    isEditing,
    onSelect,
    onSave,
    onClose,
    onSkip,
    skipLabel = 'SKIP',
    columns = 2,
    icon = <AlertTriangle className="h-5 w-5 text-primary" />
}: DecisionDialogProps) {
    const isDirty = selectedId !== initialId;

    const footer = !isEditing && onSkip ? (
        <ScoringActionButton 
            onClick={onSkip}
            label={skipLabel}
            variant="muted"
            className="flex-1 h-10 w-full"
        />
    ) : null;

    let lastCategory = '';

    return (
        <BaseEventDialog
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            icon={icon}
            isEditing={isEditing}
            isDirty={isDirty}
            onSave={onSave}
            onClose={onClose}
            footer={footer}
        >
            <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-3")}>
                {options.map((opt) => {
                    const category = opt.category || '';
                    const showHeader = category && category !== lastCategory;
                    if (showHeader) lastCategory = category;

                    return (
                        <React.Fragment key={opt.id}>
                            {showHeader && (
                                <div className={cn("mt-3 mb-1 px-1 border-b border-white/10 flex items-center justify-between", columns === 2 ? "col-span-2" : "col-span-3")}>
                                    <span className="text-[10px] font-black uppercase text-primary/70 tracking-[0.2em]">{category}</span>
                                </div>
                            )}
                            {opt.titleLabel ? (
                                <div className="flex flex-col gap-2">
                                    <div className={`text-[10px] font-black uppercase text-center tracking-widest ${opt.id === 'home' ? 'text-blue-500' : 'text-red-500'}`}>{opt.titleLabel}</div>
                                    <ScoringActionButton 
                                        onClick={() => onSelect(opt.id)}
                                        label={opt.label}
                                        selected={selectedId === opt.id}
                                        variant={opt.variant || "primary"}
                                        className={cn("w-full", opt.className || "h-14")}
                                    />
                                </div>
                            ) : (
                                <ScoringActionButton 
                                    onClick={() => onSelect(opt.id)}
                                    label={opt.label}
                                    selected={selectedId === opt.id}
                                    variant={opt.variant || "primary"}
                                    className={opt.className || "h-12"}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </BaseEventDialog>
    );
}
