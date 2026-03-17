"use client";

import { notFound, useParams } from "next/navigation";
import { store } from "@/app/store/store";
import { Button } from "@/components/ui/button";
import { Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { Game } from "@sk/types";
import { GameDashboard } from "@/components/sports/GameDashboard";

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

  if (loading) return <div className="p-8 flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>;
  if (!game) return notFound();

  const handleUpdateStatus = (status: "Scheduled" | "Live" | "Finished") => {
      store.updateGameStatus(game.id, status);
  };

  const p1 = game.participants?.[0]?.teamId;
  const homeTeam = p1 ? store.getTeam(p1) : undefined;
  const sport = homeTeam ? store.getSport(homeTeam.sportId) : null;
  
  // Determine sport category for the dashboard
  const sportCategory = sport?.name || 'Rugby'; 
  
  // Determine user role for the dashboard
  let userRole: 'SCORER' | 'TIMEKEEPER' | 'JUDGE' | 'REFEREE' | 'FAN' = 'FAN';
  if (store.canScoreGame(game.id)) {
      userRole = 'SCORER';
  }

  return (
    <div className="min-h-screen bg-background">
      <GameDashboard 
        game={game} 
        sportCategory={sportCategory} 
        userRole={userRole} 
      />
    </div>
  );
}
