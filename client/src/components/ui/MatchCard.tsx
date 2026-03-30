"use client";

import { store } from "@/app/store/store";
import { Game } from "@sk/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MapPin, Trophy, Users } from "lucide-react";
import { OrgLogo } from "./OrgLogo";
import { useRouter } from "next/navigation";
import { MetalButton } from "./MetalButton";
import { useGameTimer } from "@/hooks/useGameTimer";

interface MatchCardProps {
  game: Game;
  onClick?: () => void;
  className?: string;
  isStandalone?: boolean;
  highlightTeamId?: string;
}

export function MatchCard({ game, onClick, className, isStandalone = false, highlightTeamId }: MatchCardProps) {
  const router = useRouter();
  const homeTeamId = game.participants?.[0]?.teamId;
  const awayTeamId = game.participants?.[1]?.teamId;
  const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : undefined;
  const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : undefined;
  const homeOrg = (homeTeam ? (store.getOrganization(homeTeam.orgId) ?? null) : null);
  const awayOrg = (awayTeam ? (store.getOrganization(awayTeam.orgId) ?? null) : null);
  const sport = homeTeam ? store.getSport(homeTeam.sportId) : null;
  const gameSite = game.siteId ? store.getSite(game.siteId) : null;

  const { formattedTime } = useGameTimer(game.liveState?.clock);

  const isLive = game.status?.toLowerCase() === 'live';
  const isFinished = game.status?.toLowerCase() === 'finished';
  const isCancelled = game.status?.toLowerCase() === 'cancelled';
  const isScheduled = game.status?.toLowerCase() === 'scheduled';

  const getScore = (index: number) => {
    if (isFinished && game.finalScoreData) return game.finalScoreData[index === 0 ? 'home' : 'away'] ?? 0;
    if (game.liveState?.scores) {
        const participant = game.participants?.[index];
        return participant ? (game.liveState.scores[participant.id] ?? 0) : 0;
    }
    return 0;
  };
  const homeScore = getScore(0);
  const awayScore = getScore(1);

  const showScores = isLive || isFinished;
  const canScore = store.canScoreGame(game.id);
  const canSelectTeam = store.canSelectTeam(game.id);

  const isWithinOneHour = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    return (now.getTime() - date.getTime()) < 3600000;
  };

  const showScoreButton = store.globalRole === 'admin' || (canScore && (!isFinished || isWithinOneHour(game.finishTime) || isWithinOneHour(game.updatedAt)));
  const showSelectButton = (store.globalRole === 'admin' || canSelectTeam) && !isFinished;

  return (
    <div className={cn("group flex items-stretch gap-2 md:gap-3", className)}>
      {/* Date/Status Card (Left side) */}
      <div className={cn(
        "flex flex-col items-center justify-center min-w-[56px] md:min-w-[80px] border rounded-xl shadow-sm italic shrink-0 transition-colors relative py-1 bg-muted/40 border-border/80"
      )}>
        {(() => {
            const event = game.eventId ? store.getEvent(game.eventId) : null;
            let dateStr = game.scheduledStartTime || game.startTime || (event?.startDate || event?.date || null);
            
            if (event?.type === 'SingleMatch' && (event.startDate || event.date) && (game.scheduledStartTime || game.startTime)) {
                const datePart = (event.startDate || event.date || "").split('T')[0];
                const timePart = (game.scheduledStartTime || game.startTime || "").split('T')[1] || '00:00:00';
                dateStr = `${datePart}T${timePart}`;
            }

            const statusBadge = (
              <>
                {isLive && <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-primary animate-pulse mb-0.5">LIVE</span>}
                {isFinished && <span className="text-[7px] md:text-[9px] font-black uppercase tracking-wider text-emerald-500 mb-0.5">FINISHED</span>}
                {isCancelled && <span className="text-[7px] md:text-[9px] font-black uppercase tracking-wider text-destructive mb-0.5">CANCELLED</span>}
                {isScheduled && <span className="text-[7px] md:text-[9px] font-black uppercase tracking-wider text-sky-500 mb-0.5">SCHEDULED</span>}
              </>
            );

            if (isLive) {
              return (
                <div className="flex flex-col items-center justify-center leading-none gap-0.5">
                  {statusBadge}
                  <span className="text-[10px] md:text-sm font-black tabular-nums text-foreground">{formattedTime}</span>
                  <span className="text-[8px] md:text-[10px] font-bold uppercase opacity-60 line-clamp-1 max-w-[50px] md:max-w-[70px] text-center text-foreground">{game.liveState?.periodLabel}</span>
                </div>
              );
            }

            if (!dateStr) return (
              <div className="flex flex-col items-center justify-center leading-none gap-0.5">
                {statusBadge}
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest opacity-40">TBD</span>
              </div>
            );

            const date = new Date(dateStr);
            const isValid = !isNaN(date.getTime());
            
            if (!isValid) return (
              <div className="flex flex-col items-center justify-center leading-none gap-0.5">
                {statusBadge}
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest opacity-40">TBD</span>
              </div>
            );

            return (
              <div className="flex flex-col items-center justify-center leading-none gap-0.5">
                {statusBadge}
                <div className="flex items-center gap-1">
                  <span className="text-xs md:text-sm font-black text-foreground">
                    {format(date!, "dd")}
                  </span>
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-60 text-foreground">
                    {format(date!, "MMM")}
                  </span>
                </div>
                
                {(game.scheduledStartTime || game.startTime) && (
                    <span className="text-[9px] md:text-xs font-black uppercase tracking-wider opacity-90 text-foreground">
                        {format(date!, "HH:mm")}
                    </span>
                )}
              </div>
            );
        })()}
      </div>

      {/* MATCH CONTENT BLOCK (Teams) */}
      <div 
        onClick={onClick}
        className={cn(
          "flex-1 flex flex-col md:flex-row md:items-center justify-center gap-1 md:gap-0 p-1.5 md:p-0 border rounded-xl shadow-sm transition-all group/card overflow-hidden",
          onClick ? "cursor-pointer active:scale-[0.99]" : "cursor-default",
          isLive ? "bg-background border-primary/30 ring-1 ring-primary/10 shadow-md" : 
          isFinished ? "bg-muted/30 border-border/60" :
          isCancelled ? "bg-destructive/10 border-destructive/20 opacity-80" :
          "bg-background border-border/80 hover:border-primary/40 hover:shadow-md"
        )}
      >
        {/* Teams Display - Mobile Adaptive Layout */}
        <div className="md:hidden flex flex-col justify-center items-start py-0 px-0 min-w-0 flex-1">
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-0.5 items-center w-full min-w-0">
            {/* Home Team Row */}
            <OrgLogo organization={homeOrg} size="sm" rounded="md" className="shrink-0" />
            <span className="text-sm font-black line-clamp-2 leading-tight text-foreground/90">
              {homeTeam?.name || 'Unknown'}
            </span>
            {showScores ? (
              <span className="font-mono font-black text-base min-w-[1rem] text-right text-foreground">
                <span>{homeScore}</span>
              </span>
            ) : <div />}

            {/* Away Team Row */}
            <OrgLogo organization={awayOrg} size="sm" rounded="md" className="shrink-0" />
            <span className="text-sm font-black line-clamp-2 leading-tight text-foreground/90">
              {awayTeam?.name || 'Unknown'}
            </span>
            {showScores ? (
              <span className="font-mono font-black text-base min-w-[1rem] text-right text-foreground">
                <span>{awayScore}</span>
              </span>
            ) : <div />}
          </div>
        </div>

        {/* Teams Display - Desktop Horizontal Pillar Layout */}
        <div className="hidden md:flex flex-1 items-stretch h-full min-w-0">
           <div className="flex-1 flex items-center justify-end gap-2 px-3 min-w-0">
              <span className="text-lg font-black line-clamp-2 text-right leading-tight text-foreground/90">
                <span className="mr-2 opacity-40 text-xs font-bold uppercase tracking-wider">{homeOrg?.shortName || 'HOM'}</span>
                {homeTeam?.name || 'Unknown'}
              </span>
              <OrgLogo organization={homeOrg} size="md" rounded="md" className="shrink-0" />
           </div>

           <div className="flex flex-col items-center justify-center px-3 border-l border-r border-border/30 bg-muted/10 min-w-[140px]">
              {showScores ? (
                <div className="flex items-center gap-2 font-mono font-black text-3xl tracking-tighter text-foreground">
                   <span>{homeScore}</span>
                   <span className="opacity-10 text-sm">-</span>
                   <span>{awayScore}</span>
                </div>
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em]">VS</span>
              )}
              {sport && (
                <span className="text-[10px] font-black uppercase tracking-widest text-primary/30 mt-0.5 leading-none">
                  {sport.name}
                </span>
              )}
           </div>

           <div className="flex-1 flex items-center justify-start gap-2 px-3 min-w-0">
              <OrgLogo organization={awayOrg} size="md" rounded="md" className="shrink-0" />
              <span className="text-lg font-black line-clamp-2 text-left leading-tight text-foreground/90">
                {awayTeam?.name || 'Unknown'}
                <span className="ml-2 opacity-40 text-xs font-bold uppercase tracking-wider">{awayOrg?.shortName || 'AWY'}</span>
              </span>
           </div>
        </div>
      </div>

      {/* Location / Logic Card (Right side) */}
      <div className={cn(
        "flex flex-col items-center justify-center min-w-[64px] md:min-w-[100px] border rounded-xl shadow-sm italic shrink-0 transition-colors py-1 bg-muted/20 border-border/60",
        isCancelled && "bg-destructive/10 border-destructive/20"
      )}>
        <div className="flex flex-col items-center justify-center leading-none gap-1 w-full px-1 text-center">
            {gameSite ? (
                <>
                  <span className="text-[10px] md:text-[11px] font-black truncate w-full text-foreground/90 leading-tight px-1">
                      {gameSite.name}
                  </span>
                  <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-wider opacity-50 truncate w-full">
                      {game.facilityId ? store.getFacility(game.facilityId)?.name : 'Field'}
                  </span>
                </>
            ) : (
                <span className="text-[10px] md:text-sm font-bold uppercase opacity-30">TBD</span>
            )}
        </div>

        {/* Mobile Small Icon Actions - Displayed side-by-side at bottom */}
        {(showScoreButton || showSelectButton) && !isCancelled && (
            <div className="md:hidden mt-1.5 flex gap-1 w-full px-1 pt-1.5 border-t border-border/20 justify-center">
                {showSelectButton && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); router.push(`/admin/games/${game.id}/selection`); }}
                        className="p-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors shadow-[0_0_5px_rgba(var(--primary),0.2)]"
                    >
                        <Users className="w-3.5 h-3.5" />
                    </button>
                )}
                {showScoreButton && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); router.push(`/admin/games/${game.id}`); }}
                        className="p-1 rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors shadow-[0_0_5px_rgba(16,185,129,0.2)]"
                    >
                        <Trophy className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        )}
      </div>

      {/* Actions Card (Desktop Only column) */}
      <div className="hidden md:flex">
          {(showScoreButton || showSelectButton) && !isCancelled && (
            <div className={cn(
              "flex flex-col items-center justify-center md:min-w-[100px] border rounded-xl shadow-sm italic shrink-0 transition-colors gap-1.5 py-1.5 px-1 bg-muted/30 border-border/80",
            )}>
              {showSelectButton && (
                <MetalButton 
                    size="sm"
                    className="w-full h-7 rounded-lg text-[10px] font-black uppercase tracking-wider gap-1.5"
                    icon={<Users className="w-4 h-4" />}
                    onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/games/${game.id}/selection`);
                    }}
                >
                    Selection
                </MetalButton>
              )}
              {showScoreButton && (
                <MetalButton 
                    size="sm"
                    className="w-full h-7 rounded-lg text-[10px] font-black uppercase tracking-wider gap-1.5"
                    icon={<Trophy className="w-4 h-4" />}
                    onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/admin/games/${game.id}`);
                    }}
                >
                    Score
                </MetalButton>
              )}
            </div>
          )}
      </div>
    </div>
  );
}

