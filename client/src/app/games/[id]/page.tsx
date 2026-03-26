"use client";

import { notFound, useParams } from "next/navigation";
import { store } from "@/app/store/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, MapPin, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Game, Team, Sport, Site } from "@sk/types";
import { MetalButton } from "@/components/ui/MetalButton";
import { useRouter } from "next/navigation";

export default function GamePage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  
  const [game, setGame] = useState<Game | undefined>(undefined);
  const [homeTeam, setHomeTeam] = useState<Team | undefined>(undefined);
  const [awayTeam, setAwayTeam] = useState<Team | undefined>(undefined);
  const [sport, setSport] = useState<Sport | undefined>(undefined);

  useEffect(() => {
    const updateGame = () => {
        const g = store.getGame(id);
        if (g) {
            setGame(g);
            const p1 = g.participants?.[0]?.teamId;
            const p2 = g.participants?.[1]?.teamId;
            const h = p1 ? store.getTeam(p1) : undefined;
            const a = p2 ? store.getTeam(p2) : undefined;
            setHomeTeam(h);
            setAwayTeam(a);
            if (h) setSport(store.getSport(h.sportId));
        }
    };

    updateGame();
    const unsubscribe = store.subscribe(updateGame);
    return () => unsubscribe();
  }, [id]);

  const isFinished = game?.status?.toLowerCase() === 'finished';
  const isWithinOneHour = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    return (now.getTime() - date.getTime()) < 3600000;
  };

  const showScoreButton = game && (store.globalRole === 'admin' || (store.canScoreGame(game.id) && (!isFinished || isWithinOneHour(game.finishTime) || isWithinOneHour(game.updatedAt))));

  if (!game) {
    return <div>Loading...</div>; // Or handle not found
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8 text-center relative">
        {showScoreButton && (
          <div className="absolute right-0 top-0">
            <MetalButton 
              size="sm"
              icon={<Trophy className="w-4 h-4" />}
              onClick={() => router.push(`/admin/games/${game.id}`)}
              className="text-[10px] font-black uppercase tracking-wider"
            >
              Score Match
            </MetalButton>
          </div>
        )}
        <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ${
          game.status === 'Live' ? 'bg-red-100 text-red-600 animate-pulse' : 
          game.status === 'Finished' ? 'bg-gray-100 text-gray-600' : 
          'bg-blue-100 text-blue-600'
        }`}>
          {game.status === 'Live' ? '● LIVE NOW' : game.status.toUpperCase()}
        </div>
        <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            {game.startTime ? new Date(game.startTime).toLocaleString() : "TBD"}
        </div>
      </div>

      <Card className="mb-8">
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="text-center flex-1">
              <h2 className="text-2xl font-bold mb-2">{homeTeam?.name}</h2>
              <div className="text-sm text-muted-foreground">{sport?.name}</div>
            </div>
            
            <div className="flex items-center gap-8">
              {(() => {
                  const getScore = (index: number) => {
                      if (game.status === 'Finished' && game.finalScoreData) return game.finalScoreData[index === 0 ? 'home' : 'away'] ?? 0;
                      if (game.liveState?.scores) {
                          const participant = game.participants?.[index];
                          return participant ? (game.liveState.scores[participant.id] ?? 0) : 0;
                      }
                      return 0;
                  };
                  return (
                      <>
                        <div className="text-6xl font-bold tabular-nums">{getScore(0)}</div>
                        <div className="text-2xl text-muted-foreground">:</div>
                        <div className="text-6xl font-bold tabular-nums">{getScore(1)}</div>
                      </>
                  )
              })()}
            </div>

            <div className="text-center flex-1">
              <h2 className="text-2xl font-bold mb-2">{awayTeam?.name}</h2>
              <div className="text-sm text-muted-foreground">{sport?.name}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Game Events / Timeline would go here */}
      <div className="text-center text-muted-foreground">
        <p>Live commentary and game events coming soon.</p>
      </div>
    </div>
  );
}

