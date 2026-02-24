"use client";

import { notFound, useParams } from "next/navigation";
import { store } from "@/app/store/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Square, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Game } from "@sk/types";

export default function GameControlPage() {
  const params = useParams();
  const id = params.id as string;
  const [game, setGame] = useState<Game | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const update = () => {
        const g = store.getGame(id);
        if (g) {
            setGame(g);
            setLoading(false);
        }
    };
    update();
    store.subscribeToGame(id);
    const unsubscribe = store.subscribe(update);
    return () => {
        unsubscribe();
        store.unsubscribeFromGame(id);
    };
  }, [id]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (!game) return notFound();

  const homeTeam = store.getTeam(game.homeTeamId);
  const awayTeam = store.getTeam(game.awayTeamId);

  const handleUpdateStatus = (status: "Scheduled" | "Live" | "Finished") => {
      store.updateGameStatus(game.id, status);
  };

  const handleUpdateScore = (homeScore: number, awayScore: number) => {
      store.updateScore(game.id, homeScore, awayScore);
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Game Control</h1>
          <p className="text-muted-foreground">Manage live score and time.</p>
        </div>
        <div className="flex gap-2">
          {game.status === 'Scheduled' && (
              <Button onClick={() => handleUpdateStatus('Live')} className="bg-green-600 hover:bg-green-700">
                <Play className="mr-2 h-4 w-4" /> Start Game
              </Button>
          )}
          {game.status === 'Live' && (
              <Button onClick={() => handleUpdateStatus('Finished')} variant="destructive">
                <Square className="mr-2 h-4 w-4" /> End Game
              </Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Home Team Control */}
        <Card className="border-t-4 border-t-blue-600">
          <CardHeader className="text-center">
            <CardTitle>{homeTeam?.name || "Home Team"}</CardTitle>
            <div className="text-6xl font-bold py-4">{game.homeScore}</div>
          </CardHeader>
          <CardContent className="flex justify-center gap-4">
              <Button 
                onClick={() => handleUpdateScore(Math.max(0, game.homeScore - 1), game.awayScore)} 
                variant="outline" 
                size="icon" 
                disabled={game.status !== 'Live'}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button 
                onClick={() => handleUpdateScore(game.homeScore + 1, game.awayScore)} 
                size="icon" 
                disabled={game.status !== 'Live'}
              >
                <Plus className="h-4 w-4" />
              </Button>
               <Button 
                onClick={() => handleUpdateScore(game.homeScore + 5, game.awayScore)} 
                variant="secondary" 
                disabled={game.status !== 'Live'}
               >
                 +5 (Try)
               </Button>
          </CardContent>
        </Card>

        {/* Away Team Control */}
        <Card className="border-t-4 border-t-red-600">
          <CardHeader className="text-center">
            <CardTitle>{awayTeam?.name || "Away Team"}</CardTitle>
            <div className="text-6xl font-bold py-4">{game.awayScore}</div>
          </CardHeader>
          <CardContent className="flex justify-center gap-4">
              <Button 
                onClick={() => handleUpdateScore(game.homeScore, Math.max(0, game.awayScore - 1))} 
                variant="outline" 
                size="icon" 
                disabled={game.status !== 'Live'}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button 
                onClick={() => handleUpdateScore(game.homeScore, game.awayScore + 1)} 
                size="icon" 
                disabled={game.status !== 'Live'}
              >
                <Plus className="h-4 w-4" />
              </Button>
               <Button 
                onClick={() => handleUpdateScore(game.homeScore, game.awayScore + 5)} 
                variant="secondary" 
                disabled={game.status !== 'Live'}
               >
                 +5 (Try)
               </Button>
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-8 text-center">
         <p className="text-sm text-muted-foreground">
            Status: <span className="font-semibold">{game.status}</span>
         </p>
      </div>
    </div>
  );
}
