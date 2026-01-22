"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { store } from "@/app/store/store";
import { Game } from "@sk/types";
import { Trophy, XCircle, MinusCircle, Calendar } from "lucide-react";
import { useState, useEffect } from "react";

interface PageProps {
  params: Promise<{ id: string; teamId: string }>;
}

export default function TeamStatsPage({ params }: PageProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    played: 0,
    won: 0,
    lost: 0,
    drawn: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  });

  useEffect(() => {
    const loadData = async () => {
      const { teamId } = await params;
      // In a real app we'd filter by teamId properly. 
      // For mock, we'll just grab all games and filter manually if they involve this team
      // But the mock store.getGames() returns all games.
      // Let's assume for now we just show all games as "recent games" for demo if no specific ones found,
      // or better, let's mock some data if none exists.
      
      const allGames = store.getGames();
      // Filter games where this team is home or away
      const teamGames = allGames.filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId);
      
      setGames(teamGames);
      
      // Calculate stats
      const newStats = teamGames.reduce((acc, game) => {
        if (game.status !== 'Finished') return acc;
        
        acc.played += 1;
        const isHome = game.homeTeamId === teamId;
        const myScore = isHome ? game.homeScore : game.awayScore;
        const oppScore = isHome ? game.awayScore : game.homeScore;
        
        acc.goalsFor += myScore;
        acc.goalsAgainst += oppScore;
        
        if (myScore > oppScore) acc.won += 1;
        else if (myScore < oppScore) acc.lost += 1;
        else acc.drawn += 1;
        
        return acc;
      }, { played: 0, won: 0, lost: 0, drawn: 0, goalsFor: 0, goalsAgainst: 0 });
      
      setStats(newStats);
      setLoading(false);
    };
    loadData();
  }, [params]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Games Played</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.played}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wins</CardTitle>
            <Trophy className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.won}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Losses</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.lost}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Draws</CardTitle>
            <MinusCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.drawn}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle>Recent Games</CardTitle>
        </CardHeader>
        <CardContent>
          {games.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No games recorded for this team yet.
            </div>
          ) : (
            <div className="space-y-4">
              {games.map((game) => (
                <div key={game.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-4">
                    <div className={`text-sm font-bold ${
                        game.status === 'Finished' 
                            ? (game.homeScore > game.awayScore ? 'text-green-500' : 'text-red-500')
                            : ''
                    }`}>
                        {game.status === 'Finished' ? 'W' : '-'}
                    </div>
                    <div>
                        <div className="font-semibold">vs {game.awayTeamName || "Opponent"}</div>
                        <div className="text-xs text-muted-foreground">{game.startTime}</div>
                    </div>
                  </div>
                  <div className="text-xl font-bold font-mono">
                    {game.homeScore} - {game.awayScore}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
