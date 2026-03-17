"use client";

import { store } from "@/app/store/store";
import { Game } from "@sk/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MapPin, Trophy } from "lucide-react";
import { OrgLogo } from "./OrgLogo";
import { useRouter } from "next/navigation";
import { MetalButton } from "./MetalButton";

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

  const isLive = game.status?.toLowerCase() === 'live';
  const isFinished = game.status?.toLowerCase() === 'finished';
  const isCancelled = game.status?.toLowerCase() === 'cancelled';

  const getScore = (index: number) => {
    if (isFinished && game.finalScoreData) return game.finalScoreData[index === 0 ? 'home' : 'away'] ?? 0;
    if (game.liveState) return game.liveState[index === 0 ? 'home' : 'away'] ?? 0;
    return 0;
  };
  const homeScore = getScore(0);
  const awayScore = getScore(1);

  const showScores = isLive || isFinished;
  const canScore = store.canScoreGame(game.id);

  const isWithinOneHour = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    return (now.getTime() - date.getTime()) < 3600000;
  };

  const showScoreButton = store.globalRole === 'admin' || (canScore && (!isFinished || isWithinOneHour(game.finishTime) || isWithinOneHour(game.updatedAt)));

  return (
    <div className={cn("group flex items-stretch gap-2 md:gap-3", className)}>
      {/* Date/Status Card (Left side) */}
      <div className={cn(
        "flex flex-col items-center justify-center min-w-[56px] md:min-w-[80px] border rounded-xl shadow-sm italic shrink-0 transition-colors relative py-1.5",
        isLive ? "bg-primary border-primary text-primary-foreground shadow-md animate-pulse" :
        isFinished ? "bg-secondary border-secondary text-secondary-foreground" :
        isCancelled ? "bg-destructive border-destructive text-destructive-foreground" :
        isStandalone ? "bg-muted/90 border-border shadow-inner" : "bg-muted/40 border-border/80"
      )}>
        {(() => {
            const dateStr = game.startTime || (game.eventId ? store.getEvent(game.eventId)?.startDate : null);
            if (!dateStr) return <span className="text-xs font-black uppercase tracking-widest opacity-40">TBD</span>;

            const date = new Date(dateStr);
            const isValid = !isNaN(date.getTime());
            
            if (!isValid) return <span className="text-xs font-black uppercase tracking-widest opacity-40">TBD</span>;

            return (
              <div className="flex flex-col items-center justify-center leading-none gap-1">
                <div className="flex items-center gap-1">
                  <span className={cn(
                    "text-xs md:text-sm font-black",
                    isStandalone || game.startTime ? "text-foreground" : "text-foreground/90"
                  )}>
                    {format(date!, "dd")}
                  </span>
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-60">
                    {format(date!, "MMM")}
                  </span>
                </div>
                
                {game.startTime && (
                    <span className="text-[9px] md:text-xs font-black uppercase tracking-wider opacity-90">
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
          "flex-1 flex flex-col md:flex-row md:items-center justify-center gap-1 md:gap-0 p-2 md:p-0 border rounded-xl shadow-sm transition-all group/card overflow-hidden",
          onClick ? "cursor-pointer active:scale-[0.99]" : "cursor-default",
          isLive ? "bg-background border-primary/30 ring-1 ring-primary/10 shadow-md" : 
          isFinished ? "bg-muted/30 border-border/60" :
          isCancelled ? "bg-destructive/5 border-destructive/20 opacity-80" :
          "bg-background border-border/80 hover:border-primary/40 hover:shadow-md"
        )}
      >
        {/* Teams Display - Mobile Adaptive Layout */}
        <div className="md:hidden flex flex-col justify-center gap-1.5 px-2">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 max-w-full">
              <OrgLogo organization={homeOrg} size="xs" rounded="md" className="shrink-0" />
              <span className={cn(
                "text-xs font-black truncate leading-tight",
                (homeScore > awayScore && isFinished) || homeTeamId === highlightTeamId ? "text-primary" : "text-foreground/90"
              )}>
                {homeTeam?.name || 'Unknown'}
              </span>
              {showScores && (
                <span className="font-mono font-black text-xs inline-block ml-0.5">
                  <span className={cn(isFinished && homeScore < awayScore && "opacity-30")}>{homeScore}</span>
                </span>
              )}
            </div>

            {!showScores && (
              <span className="text-[8px] font-bold opacity-20 uppercase tracking-tighter">vs</span>
            )}
            
            {showScores && <span className="text-[8px] font-bold opacity-10 mx-[-2px] uppercase">-</span>}

            <div className="flex items-center gap-1.5 min-w-0 max-w-full">
              <OrgLogo organization={awayOrg} size="xs" rounded="md" className="shrink-0" />
              <span className={cn(
                "text-xs font-black truncate leading-tight",
                (awayScore > homeScore && isFinished) || awayTeamId === highlightTeamId ? "text-primary" : "text-foreground/90"
              )}>
                {awayTeam?.name || 'Unknown'}
              </span>
              {showScores && (
                <span className="font-mono font-black text-xs inline-block ml-0.5">
                   <span className={cn(isFinished && awayScore < homeScore && "opacity-30")}>{awayScore}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Teams Display - Desktop Horizontal Pillar Layout */}
        <div className="hidden md:flex flex-1 items-stretch h-full min-w-0">
           <div className="flex-1 flex items-center justify-end gap-3 px-4 min-w-0">
              <span className={cn(
                "text-base font-black truncate text-right",
                (homeScore > awayScore && isFinished) || homeTeamId === highlightTeamId ? "text-primary" : "text-foreground/90"
              )}>
                <span className="mr-1.5 opacity-40 text-[10px] font-bold uppercase tracking-wider">{homeOrg?.shortName || 'HOM'}</span>
                {homeTeam?.name || 'Unknown'}
              </span>
              <OrgLogo organization={homeOrg} size="sm" rounded="md" className="shrink-0" />
           </div>

           <div className="flex flex-col items-center justify-center px-4 border-l border-r border-border/30 bg-muted/10 min-w-[100px]">
              {showScores ? (
                <div className="flex items-center gap-2 font-mono font-black text-xl tracking-tighter">
                   <span className={cn(isFinished && homeScore < awayScore && "opacity-20")}>{homeScore}</span>
                   <span className="opacity-10 text-sm">-</span>
                   <span className={cn(isFinished && awayScore < homeScore && "opacity-20")}>{awayScore}</span>
                </div>
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.2em]">VS</span>
              )}
              {sport && (
                <span className="text-[8px] font-black uppercase tracking-widest text-primary/30 mt-0.5 leading-none">
                  {sport.name}
                </span>
              )}
           </div>

           <div className="flex-1 flex items-center justify-start gap-3 px-4 min-w-0">
              <OrgLogo organization={awayOrg} size="sm" rounded="md" className="shrink-0" />
              <span className={cn(
                "text-base font-black truncate text-left",
                (awayScore > homeScore && isFinished) || awayTeamId === highlightTeamId ? "text-primary" : "text-foreground/90"
              )}>
                {awayTeam?.name || 'Unknown'}
                <span className="ml-1.5 opacity-40 text-[10px] font-bold uppercase tracking-wider">{awayOrg?.shortName || 'AWY'}</span>
              </span>
           </div>
        </div>
      </div>

      {/* Location Card (Right side) */}
      <div className={cn(
        "flex flex-col items-center justify-center min-w-[56px] md:min-w-[100px] border rounded-xl shadow-sm italic shrink-0 transition-colors py-1.5 bg-muted/20 border-border/60",
        isCancelled && "bg-destructive/10 border-destructive/20"
      )}>
        <div className="flex flex-col items-center justify-center leading-none gap-1 w-full px-1 text-center">
            {gameSite ? (
                <>
                  <span className="text-xs md:text-sm font-black truncate w-full text-foreground/90 leading-tight">
                      {gameSite.name}
                  </span>
                  <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider opacity-50 truncate w-full">
                      {game.facilityId ? store.getFacility(game.facilityId)?.name : 'Field'}
                  </span>
                </>
            ) : (
                <span className="text-xs md:text-sm font-bold uppercase opacity-30">TBD</span>
            )}
        </div>

        {showScoreButton && !isCancelled && (
            <div className="mt-2 w-full px-1.5 pt-1.5 border-t border-border/40">
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
            </div>
        )}
      </div>
    </div>
  );
}

