import React from 'react';
import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';

interface ScoringActionButtonProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    title?: string;
    variant?: 'primary' | 'success' | 'danger' | 'muted' | 'ghost' | 'scrim' | 'none';
    selected?: boolean;
}

export function ScoringActionButton({ 
    label, 
    onClick, 
    disabled, 
    className, 
    title,
    variant = 'primary',
    selected = false
}: ScoringActionButtonProps) {
    const variants = {
        primary: selected 
            ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25" 
            : "bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 hover:border-primary/30",
        success: selected
            ? "bg-green-600 text-white border-green-700 shadow-lg shadow-green-900/20"
            : "bg-green-600/20 border-green-600/30 text-green-500 hover:bg-green-600/30 hover:border-green-600/40",
        danger: selected
            ? "bg-red-600 text-white border-red-700 shadow-lg shadow-red-900/20"
            : "bg-red-600/20 border-red-600/30 text-red-500 hover:bg-red-600/30 hover:border-red-600/40",
        muted: selected
            ? "bg-white/20 text-white border-white/30"
            : "bg-white/5 border-white/10 text-foreground/70 hover:bg-white/10 hover:border-white/20",
        ghost: "bg-transparent border-white/10 hover:bg-white/5 text-foreground/60 focus-visible:ring-0",
        scrim: selected
            ? "bg-sunken-bg border-primary/50 text-foreground shadow-inner"
            : "bg-sunken-bg/50 border-border/20 text-foreground/70 hover:bg-sunken-bg hover:border-border/30",
        none: "",
    };

    return (
        <button 
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={cn(
                "group relative flex flex-col items-center justify-center rounded-md transition-all duration-200 border shadow-sm active:scale-[0.95] disabled:opacity-30 disabled:pointer-events-none p-2",
                variant !== 'none' && variants[variant],
                selected && "scale-[1.02] z-10",
                className
            )}
        >
            <span className={cn(
                "font-black uppercase tracking-tight leading-tight text-center text-[10.5px] sm:text-[13.5px]",
                variant === 'none' ? "text-foreground" : ""
            )}>{label}</span>
        </button>
    );
}

export function DialogSectionHeader({ label, className }: { label: string, className?: string }) {
    return (
        <div className={cn("text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] mb-4", className)}>
            {label}
        </div>
    );
}

export function RosterGrid({ 
    roster, 
    onSelect, 
    selectedPlayerId,
    className 
}: { 
    roster: any[], 
    onSelect: (playerId: string) => void, 
    selectedPlayerId?: string,
    className?: string
}) {
    if (roster.length === 0) {
        return (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground/60 border border-dashed border-white/10 rounded-xl bg-white/5">
                <User className="w-8 h-8 mb-2 opacity-20" />
                <span className="text-xs font-bold uppercase tracking-wider">No players provided for this team</span>
            </div>
        );
    }

    return (
        <div className={cn("grid grid-cols-4 sm:grid-cols-6 gap-x-2 gap-y-3", className)}>
            {[...roster].sort((a, b) => (parseInt(a.position || '999') - parseInt(b.position || '999'))).map(item => {
                const profile = store.orgProfiles.find(p => p.id === item.orgProfileId);
                if (!profile) return null;
                const isSelected = selectedPlayerId === item.orgProfileId;

                return (
                    <button
                        key={item.orgProfileId}
                        onClick={() => onSelect(item.orgProfileId)}
                        className={cn(
                            "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all border group relative",
                            isSelected 
                                ? "bg-primary/20 border-primary/40" 
                                : "hover:bg-primary/10 border-transparent hover:border-primary/20"
                        )}
                    >
                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-muted border border-border/50 flex items-center justify-center relative overflow-hidden group-hover:scale-105 transition-transform">
                            <span className="text-primary font-black text-sm absolute inset-0 flex items-center justify-center group-hover:opacity-0">
                                {item.isReserve ? `R${item.position || ''}` : (item.position || '?')}
                            </span>
                            {profile.image && <img src={profile.image} className="w-full h-full object-cover opacity-0 group-hover:opacity-100" />}
                            {isSelected && <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-primary animate-pulse" /></div>}
                        </div>
                        <div className="flex flex-col items-center w-full min-w-0">
                            <span className="text-[8px] font-bold uppercase truncate w-full text-center text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                                {profile.name.split(' ')[0]}
                            </span>
                            <span className="text-[7px] font-bold uppercase truncate w-full text-center text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors leading-tight">
                                {profile.name.split(' ').slice(1).join(' ')}
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
