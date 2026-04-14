import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { store } from '@/app/store/store';
import { useAuth } from '@/contexts/AuthContext';
import { Check, X, AlertTriangle } from 'lucide-react';

function DisputeActionButton({ label, onClick, className, icon, active, activeClass, sublabel, type }: { label: React.ReactNode, onClick: () => void, className?: string, icon?: React.ReactNode, active: boolean, activeClass: string, sublabel?: string, type: 'APPROVE' | 'REJECT' }) {
    return (
        <button 
            onClick={onClick}
            className={cn(
                "group relative flex flex-col items-center justify-center gap-0.5 rounded-xl transition-all duration-300 border-2 shadow-md active:scale-[0.95] px-4 h-14 min-w-[120px] flex-1 sm:flex-none",
                active 
                    ? cn(activeClass, "text-white ring-4 ring-offset-2 ring-offset-sunken-bg") 
                    : cn(
                        "bg-transparent hover:bg-white/5 text-foreground/70 hover:text-foreground",
                        type === 'APPROVE' ? "border-emerald-500/30 hover:border-emerald-500/60" : "border-rose-500/30 hover:border-rose-500/60"
                    ),
                className
            )}
        >
            <div className="flex items-center gap-2">
                {active && icon && <div className="shrink-0 animate-in zoom-in duration-300">{icon}</div>}
                <span className={cn("font-black uppercase tracking-tight text-[11px] sm:text-[13px] leading-tight")}>
                    {label}
                </span>
            </div>
            {sublabel && (
                <span className={cn("text-[9px] font-bold uppercase tracking-widest leading-none", active ? "text-white/80" : "text-muted-foreground/40")}>
                    {sublabel}
                </span>
            )}
            {active && (
                <div className="absolute -top-3 -right-2 bg-white text-primary text-[8px] font-black px-2 py-0.5 rounded-full shadow-xl border-2 border-primary/20 animate-in fade-in zoom-in slide-in-from-top-2 duration-500 uppercase tracking-tighter">
                    Your Vote
                </div>
            )}
        </button>
    );
}

export function ActiveDisputesPanel({ gameId }: { gameId: string }) {
    const [disputes, setDisputes] = useState<any[]>([]);
    const [now, setNow] = useState(Date.now());
    const { user } = useAuth();
    
    useEffect(() => {
        let lastDisputesStr = "";
        const sync = () => {
            const currentStr = JSON.stringify(store.activeDisputes);
            if (currentStr !== lastDisputesStr) {
                console.log(`[ActiveDisputesPanel] Disputes changed for ${gameId}:`, store.activeDisputes);
                lastDisputesStr = currentStr;
            }
            setDisputes(store.activeDisputes || []);
        };
        sync();
        const unsubscribe = store.subscribe(sync);
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => {
            unsubscribe();
            clearInterval(interval);
        };
    }, [gameId]);

    const gameDisputes = disputes.filter(d => d.gameId === gameId);
    if (gameDisputes.length === 0) return null;

    const game = store.getGame(gameId);
    if (!game) return null;

    // Check if current user has scoring rights (needed to vote)
    const canScore = store.canScoreGame(gameId);
    if (!canScore) return null;

    const myProfileIds = Array.from(store.myOrgProfileIds);
    console.log(`[ActiveDisputesPanel] Permissions check: globalRole=${store.globalRole}, canScore=${canScore}, myProfileIds=`, myProfileIds);

    const handleVote = async (disputeId: string, vote: 'APPROVE' | 'REJECT') => {
        const officialId = myProfileIds[0] || (store.globalRole === 'admin' ? store.currentUserId || 'admin' : null);
        if (!officialId) return;
        await store.castUndoVote(gameId, disputeId, officialId, vote);
    };

    return (
        <div className="flex flex-col gap-2 mb-4 px-1">
            {disputes.map(dispute => {
                const targetEvent = store.gameEvents.find(e => e.id === dispute.gameEventId);
                const eventLabel = targetEvent ? (targetEvent.subType || targetEvent.type).toUpperCase() : 'UNKNOWN EVENT';
                const pointsDelta = targetEvent?.eventData?.pointsDelta || 0;
                
                const expiresAt = new Date(dispute.expiresAt).getTime();
                const timeLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));
                
                const mins = Math.floor(timeLeft / 60);
                const secs = timeLeft % 60;
                const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

                const approveCount = dispute.approveCount || 0;
                const rejectCount = dispute.rejectCount || 0;
                const totalEligible = dispute.totalEligibleVoters || 1;

                const isConversion = targetEvent?.subType === 'Conversion';
                const isMissedConversion = targetEvent?.subType === 'Conversion Missed';

                let rejectLabel = "Reject";
                let approveLabel = "Approve";

                if (isConversion) {
                    approveLabel = "Vote: Missed";
                    rejectLabel = "Vote: Converted";
                } else if (isMissedConversion) {
                    approveLabel = "Vote: Converted";
                    rejectLabel = "Vote: Missed";
                }

                const mySlots = store.userTeamMemberships
                    .filter(m => game.participants.some((p: any) => p.teamId === m.teamId))
                    .map(m => ({
                        teamId: m.teamId,
                        role: ['role-coach', 'role-assistant-coach'].includes(m.roleId) ? 'Coach' : (m.roleId === 'role-scorer' ? 'Scorer' : null)
                    }))
                    .filter(s => s.role !== null);

                const mySlotVote = dispute.votes?.find((v: any) => {
                    if (myProfileIds.includes(v.voterId)) return true;
                    if (store.currentUserId === v.voterId) return true;
                    const matchesSlot = mySlots.some(s => s.teamId === v.voterTeamId && s.role === v.voterRole);
                    return matchesSlot;
                });

                const myVote = mySlotVote?.vote;
                const isMyOwnVote = mySlotVote && (myProfileIds.includes(mySlotVote.voterId) || store.currentUserId === mySlotVote.voterId);
                const voterName = mySlotVote?.voterName;

                return (
                    <div key={dispute.id} className="relative overflow-hidden bg-sunken-bg border-amber-500/40 border-2 rounded-2xl p-0.5 shadow-xl ring-1 ring-amber-500/10">
                        <div className="bg-sunken-bg p-2 sm:p-2.5 rounded-[14px]">
                            {/* Header */}
                            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-border/20">
                                <div className="flex items-center gap-2 text-amber-500">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span className="font-black text-[10px] sm:text-xs uppercase tracking-[0.2em]">Active Dispute</span>
                                </div>
                                <div className={cn(
                                    "font-mono font-black text-xs",
                                    timeLeft <= 30 ? "text-red-500 animate-pulse" : "text-amber-500"
                                )}>
                                    {timeLeft > 0 ? timeStr : 'Resolving...'}
                                </div>
                            </div>
                            
                            {/* Body */}
                            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm sm:text-base font-black text-foreground uppercase tracking-tight line-clamp-1">{eventLabel}</span>
                                    {pointsDelta > 0 && <span className="text-[10px] sm:text-xs text-muted-foreground/60 font-mono">VALUE: {pointsDelta} PTS</span>}
                                    {mySlotVote && (
                                        <div className="flex items-center gap-1.5 mt-1.5 py-1 px-2 rounded-md bg-amber-500/5 border border-amber-500/10 w-fit">
                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                            <span className="text-[10px] sm:text-[11px] text-amber-500 font-bold uppercase tracking-tight">
                                                {isMyOwnVote ? 'You voted' : `${voterName} voted`} {myVote === 'APPROVE' ? 'Approve' : 'Reject'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Vote Buttons */}
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <DisputeActionButton 
                                        onClick={() => handleVote(dispute.id, 'REJECT')}
                                        active={myVote === 'REJECT'}
                                        type="REJECT"
                                        activeClass="bg-rose-600 border-rose-500 shadow-[0_0_25px_rgba(225,29,72,0.6)] ring-rose-500"
                                        icon={<X className="w-4 h-4 text-white" />}
                                        label={rejectLabel}
                                        sublabel={`${rejectCount}/${totalEligible}`}
                                    />
                                    <DisputeActionButton 
                                        onClick={() => handleVote(dispute.id, 'APPROVE')}
                                        active={myVote === 'APPROVE'}
                                        type="APPROVE"
                                        activeClass="bg-emerald-600 border-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.6)] ring-emerald-500"
                                        icon={<Check className="w-4 h-4 text-white" />}
                                        label={approveLabel}
                                        sublabel={`${approveCount}/${totalEligible}`}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
