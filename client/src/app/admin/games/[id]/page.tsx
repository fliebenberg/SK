import { notFound } from "next/navigation";
import { store } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateGameStatusAction, updateScoreAction } from "@/app/actions";
import { Play, Square, Minus, Plus } from "lucide-react";

export default async function GameControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = store.getGame(id);
  
  if (!game) {
    notFound();
  }

  const homeTeam = store.getTeam(game.homeTeamId);
  const awayTeam = store.getTeam(game.awayTeamId);

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Game Control</h1>
          <p className="text-muted-foreground">Manage live score and time.</p>
        </div>
        <div className="flex gap-2">
          {game.status === 'Scheduled' && (
            <form action={updateGameStatusAction.bind(null, game.id, 'Live')}>
              <Button type="submit" className="bg-green-600 hover:bg-green-700">
                <Play className="mr-2 h-4 w-4" /> Start Game
              </Button>
            </form>
          )}
          {game.status === 'Live' && (
            <form action={updateGameStatusAction.bind(null, game.id, 'Finished')}>
              <Button type="submit" variant="destructive">
                <Square className="mr-2 h-4 w-4" /> End Game
              </Button>
            </form>
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
            <form action={updateScoreAction.bind(null, game.id, Math.max(0, game.homeScore - 1), game.awayScore)}>
              <Button variant="outline" size="icon" disabled={game.status !== 'Live'}>
                <Minus className="h-4 w-4" />
              </Button>
            </form>
            <form action={updateScoreAction.bind(null, game.id, game.homeScore + 1, game.awayScore)}>
              <Button size="icon" disabled={game.status !== 'Live'}>
                <Plus className="h-4 w-4" />
              </Button>
            </form>
            <form action={updateScoreAction.bind(null, game.id, game.homeScore + 5, game.awayScore)}>
               <Button variant="secondary" disabled={game.status !== 'Live'}>+5 (Try)</Button>
            </form>
          </CardContent>
        </Card>

        {/* Away Team Control */}
        <Card className="border-t-4 border-t-red-600">
          <CardHeader className="text-center">
            <CardTitle>{awayTeam?.name || "Away Team"}</CardTitle>
            <div className="text-6xl font-bold py-4">{game.awayScore}</div>
          </CardHeader>
          <CardContent className="flex justify-center gap-4">
            <form action={updateScoreAction.bind(null, game.id, game.homeScore, Math.max(0, game.awayScore - 1))}>
              <Button variant="outline" size="icon" disabled={game.status !== 'Live'}>
                <Minus className="h-4 w-4" />
              </Button>
            </form>
            <form action={updateScoreAction.bind(null, game.id, game.homeScore, game.awayScore + 1)}>
              <Button size="icon" disabled={game.status !== 'Live'}>
                <Plus className="h-4 w-4" />
              </Button>
            </form>
            <form action={updateScoreAction.bind(null, game.id, game.homeScore, game.awayScore + 5)}>
               <Button variant="secondary" disabled={game.status !== 'Live'}>+5 (Try)</Button>
            </form>
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
