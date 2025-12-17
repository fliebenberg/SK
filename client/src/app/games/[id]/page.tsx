"use client";

import { notFound, useParams } from "next/navigation";
import { store } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Game, Team, Sport, Venue } from "@sk/types";

export default function GamePage() {
  const params = useParams();
  const id = params.id as string;
  
  const [game, setGame] = useState<Game | undefined>(undefined);
  const [homeTeam, setHomeTeam] = useState<Team | undefined>(undefined);
  const [awayTeam, setAwayTeam] = useState<Team | undefined>(undefined);
  const [sport, setSport] = useState<Sport | undefined>(undefined);

  useEffect(() => {
    const updateGame = () => {
        const g = store.getGame(id);
        if (g) {
            setGame(g);
            const h = store.getTeam(g.homeTeamId);
            const a = store.getTeam(g.awayTeamId);
            setHomeTeam(h);
            setAwayTeam(a);
            if (h) setSport(store.getSport(h.sportId));
        }
    };

    updateGame();
    const unsubscribe = store.subscribe(updateGame);
    return () => unsubscribe();
  }, [id]);

  if (!game) {
    return <div>Loading...</div>; // Or handle not found
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8 text-center">
        <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-4 ${
          game.status === 'Live' ? 'bg-red-100 text-red-600 animate-pulse' : 
          game.status === 'Finished' ? 'bg-gray-100 text-gray-600' : 
          'bg-blue-100 text-blue-600'
        }`}>
          {game.status === 'Live' ? '● LIVE NOW' : game.status.toUpperCase()}
        </div>
        <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
           <Clock className="h-4 w-4" />
           {new Date(game.startTime).toLocaleString()}
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
              <div className="text-6xl font-bold tabular-nums">{game.homeScore}</div>
              <div className="text-2xl text-muted-foreground">:</div>
              <div className="text-6xl font-bold tabular-nums">{game.awayScore}</div>
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

