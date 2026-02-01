"use client";

import { useState, useEffect } from "react";
import { Game } from "@sk/types";

import Link from "next/link";
import { MetalButton } from "@/components/ui/MetalButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/app/store/store";
import { Calendar, Clock, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export default function LivePage() {
  const [games, setGames] = useState<Game[]>(() => store.getGames());
  const teams = store.getTeams();

  useEffect(() => {
    const update = () => {
        setGames([...store.getGames()]);
    };
    const unsubscribe = store.subscribe(update);
    return () => unsubscribe();
  }, []);

  const getTeamName = (id: string) => store.getTeams().find(t => t.id === id)?.name || "Unknown";

  // Sort games: Live first, then Scheduled by date
  const sortedGames = [...games].sort((a, b) => {
    if (a.status === 'Live' && b.status !== 'Live') return -1;
    if (a.status !== 'Live' && b.status === 'Live') return 1;
    
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
    return timeA - timeB;
  });

  return (
    <div className="container mx-auto py-8 px-4 min-h-screen">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-2" style={{ fontFamily: 'var(--font-orbitron)' }}>
          LIVE SCORES & SCHEDULE
        </h1>
        <p className="text-muted-foreground">Follow your favorite teams in real-time.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sortedGames.map((game) => {
          const isLive = game.status === 'Live';
          
          return (
            <div 
              key={game.id} 
              className={cn(
                "group relative p-6 rounded-xl bg-card border transition-all duration-300 hover:-translate-y-1",
                isLive ? "border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]" : "border-border hover:border-primary/50"
              )}
            >
              {/* Metallic overlay */}
              <div className="absolute inset-0 rounded-xl opacity-5 bg-[url('https://www.transparenttextures.com/patterns/brushed-alum.png')] pointer-events-none" />
              
              <div className="relative z-10">
                <div className="flex justify-between items-center mb-6">
                  <span className={cn(
                    "text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5",
                    isLive ? "bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse" : 
                    game.status === 'Finished' ? "bg-muted text-muted-foreground border border-border" : 
                    "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                  )}>
                    {isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />}
                    {isLive ? 'LIVE' : game.status}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center font-mono">
                    <Calendar className="h-3 w-3 mr-1.5" />
                    {game.startTime ? new Date(game.startTime).toLocaleDateString() : "TBD"}
                  </span>
                </div>

                <div className="text-center mb-8">
                  <div className="flex items-center justify-between text-lg font-bold mb-4" style={{ fontFamily: 'var(--font-orbitron)' }}>
                    <span className="w-[45%] text-right truncate">{getTeamName(game.homeTeamId)}</span>
                    <span className="text-muted-foreground text-sm px-2">VS</span>
                    <span className="w-[45%] text-left truncate">{getTeamName(game.awayTeamId)}</span>
                  </div>

                  <div className="flex justify-center items-center gap-4 bg-muted/30 rounded-lg p-4 border border-border/50">
                    <div className="text-4xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-orbitron)' }}>
                      {game.homeScore}
                    </div>
                    <div className="text-muted-foreground">-</div>
                    <div className="text-4xl font-bold tabular-nums" style={{ fontFamily: 'var(--font-orbitron)' }}>
                      {game.awayScore}
                    </div>
                  </div>
                </div>

                <Link href={`/games/${game.id}`} className="block">
                  <MetalButton 
                    variantType={isLive ? "filled" : "outlined"} 
                    glowColor={isLive ? "#ef4444" : "hsl(var(--foreground))"} // Red for live, default for others
                    className={cn("w-full", isLive && "text-white")}
                  >
                    View Match Center
                  </MetalButton>
                </Link>
              </div>
            </div>
          );
        })}
        
        {sortedGames.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
            <p>No games scheduled at the moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
