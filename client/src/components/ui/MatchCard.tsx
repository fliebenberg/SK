"use client";

import { store } from "@/app/store/store";
import { Game } from "@sk/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MapPin } from "lucide-react";
import { OrgLogo } from "./OrgLogo";

interface MatchCardProps {
  game: Game;
  onClick?: () => void;
  className?: string;
  isStandalone?: boolean;
  highlightTeamId?: string;
}

export function MatchCard({ game, onClick, className, isStandalone = false, highlightTeamId }: MatchCardProps) {
  const homeTeam = store.getTeam(game.homeTeamId);
  const awayTeam = store.getTeam(game.awayTeamId);
  const homeOrg = (homeTeam ? (store.getOrganization(homeTeam.organizationId) ?? null) : null);
  const awayOrg = (awayTeam ? (store.getOrganization(awayTeam.organizationId) ?? null) : null);
  const sport = homeTeam ? store.getSport(homeTeam.sportId) : null;
  const gameVenue = game.venueId ? store.getVenue(game.venueId) : null;

  const isLive = game.status?.toLowerCase() === 'live';
  const isFinished = game.status?.toLowerCase() === 'finished';
  const isCancelled = game.status?.toLowerCase() === 'cancelled';

  return (
    <div className={cn("group flex items-center gap-3", className)}>
      {/* Date/Status Card */}
      <div className={cn(
        "flex flex-col items-center justify-center min-w-[60px] h-14 border rounded-xl shadow-sm italic shrink-0 transition-colors relative pt-1",
        isLive ? "bg-primary border-primary text-primary-foreground shadow-md animate-pulse" :
        isFinished ? "bg-secondary border-secondary text-secondary-foreground" :
        isCancelled ? "bg-destructive border-destructive text-destructive-foreground" :
        isStandalone ? "bg-muted/90 border-border shadow-inner" : "bg-muted/40 border-border/80"
      )}>
        {isLive ? (
          <span className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-2">LIVE</span>
        ) : isFinished ? (
          <span className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-2 opacity-60">FINAL</span>
        ) : (
          (() => {
            const date = game.startTime ? new Date(game.startTime) : null;
            const isValid = date && !isNaN(date.getTime());
            if (!isValid) return <span className="text-xs font-black uppercase tracking-widest opacity-40">TBD</span>;
            
            return (
              <>
                <span className={cn(
                  "text-xl font-black leading-none",
                  isStandalone ? "text-foreground" : "text-foreground/90"
                )}>
                  {format(date!, "dd")}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                  {format(date!, "MMM")}
                </span>
              </>
            );
          })()
        )}
      </div>

      {/* Match Details Card */}
      <div 
        onClick={onClick}
        className={cn(
          "flex-1 flex items-stretch h-14 border rounded-xl shadow-sm transition-all group/card overflow-hidden",
          onClick ? "cursor-pointer active:scale-[0.99]" : "cursor-default",
          isLive ? "bg-background border-primary/30 ring-1 ring-primary/10 shadow-md" : 
          isFinished ? "bg-muted/30 border-border/60" :
          isCancelled ? "bg-destructive/5 border-destructive/20 opacity-80" :
          "bg-background border-border/80 hover:border-primary/40 hover:shadow-md"
        )}
      >
        {/* Home Logo */}
        <OrgLogo 
          organization={homeOrg} 
          size="md" 
          rounded="xl" 
          className="rounded-r-none border-r border-border/10"
        />

        {/* Teams pillar */}
        <div className="flex-1 flex items-center min-w-0 px-4">
          {/* Home Team */}
          <div className="flex-1 flex items-center justify-end min-w-0">
            <span className={cn(
              "text-lg font-black line-clamp-2 w-full text-right leading-[1.1] max-w-[40%]",
              (game.homeScore > game.awayScore && isFinished) || game.homeTeamId === highlightTeamId ? "text-primary" : "text-foreground/90"
            )}>
              <span className="mr-1.5 opacity-60 text-sm font-bold ml-1">{homeOrg?.shortName || homeOrg?.name?.slice(0,3).toUpperCase() || 'HOM'}</span>
              {homeTeam?.name || 'Unknown'}
            </span>
          </div>

          {/* Center: Score/Venue/Sport */}
          <div className="flex flex-col items-center justify-center min-w-[120px] px-2 text-center py-1">
            {isCancelled ? (
              <span className="text-[10px] font-black uppercase tracking-widest text-destructive mb-1">CANCELLED</span>
            ) : (isLive || isFinished) ? (
              <div className="flex items-center gap-1.5 font-mono font-black text-xl tracking-tighter leading-none mb-1">
                <span className={cn(isFinished && game.homeScore < game.awayScore && "opacity-30")}>{game.homeScore}</span>
                <span className="opacity-20 text-sm">-</span>
                <span className={cn(isFinished && game.awayScore < game.homeScore && "opacity-30")}>{game.awayScore}</span>
              </div>
            ) : (
                <span className="text-sm font-bold text-muted-foreground tracking-tight mb-1">
                    {game.startTime ? format(new Date(game.startTime), "HH:mm") : "TBD"}
                </span>
            )}
            
            <div className="flex flex-col items-center gap-0.5">
              {gameVenue && (
                <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground/60 uppercase tracking-tight truncate max-w-[110px]">
                  <MapPin className="h-2 w-2" />
                  {gameVenue.name}
                </div>
              )}
              {sport && (
                <span className="text-[8px] font-black uppercase tracking-widest text-primary/30 leading-none">
                  {sport.name}
                </span>
              )}
            </div>
          </div>

          {/* Away Team */}
          <div className="flex-1 flex items-center justify-start min-w-0">
            <span className={cn(
              "text-lg font-black line-clamp-2 w-full text-left leading-[1.1] max-w-[40%]",
              (game.awayScore > game.homeScore && isFinished) || game.awayTeamId === highlightTeamId ? "text-primary" : "text-foreground/90"
            )}>
              {awayTeam?.name || game.awayTeamName || 'Unknown'}
              <span className="ml-1.5 opacity-60 text-sm font-bold mr-1">{awayOrg?.shortName || awayOrg?.name?.slice(0,3).toUpperCase() || 'AWY'}</span>
            </span>
          </div>
        </div>

        {/* Away Logo */}
        <OrgLogo 
          organization={awayOrg} 
          size="md" 
          rounded="xl" 
          className="rounded-l-none border-l border-border/10"
        />
      </div>
    </div>
  );
}
