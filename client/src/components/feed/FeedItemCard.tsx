import { FeedItem } from "@sk/types";
import { formatTime, formatDate } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { store } from "@/app/store/store";

interface FeedItemCardProps {
    item: FeedItem;
}

export const FeedItemCard = ({ item }: FeedItemCardProps) => {
    const homeTeamId = item.game.participants?.[0]?.teamId;
    const awayTeamId = item.game.participants?.[1]?.teamId;
    
    const homeTeam = homeTeamId ? store.getTeam(homeTeamId) : null;
    const awayTeam = awayTeamId ? store.getTeam(awayTeamId) : null;

    const homeScore = item.game.liveState?.score?.home ?? item.game.finalScoreData?.home ?? 0;
    const awayScore = item.game.liveState?.score?.away ?? item.game.finalScoreData?.away ?? 0;

    return (
        <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50 cursor-pointer flex gap-4 items-center">
            
            <div className="flex flex-col items-center justify-center px-4 py-2 bg-muted rounded-md min-w-[80px] text-center">
                 <span className="text-xs font-semibold text-muted-foreground uppercase">{formatDate(item.game.startTime || '', true)}</span>
                 <span className="text-sm font-bold mt-1">{formatTime(item.game.startTime || '')}</span>
            </div>

            <div className="flex-1 min-w-0">
                 {item.type === 'upcoming' && (
                     <div className="flex items-center gap-2 text-xs text-primary font-medium mb-1">
                         <Calendar className="w-3 h-3" /> Upcoming Match
                     </div>
                 )}
                 {item.type === 'recent' && (
                     <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-1">
                         Final Score
                     </div>
                 )}
                <h4 className="font-semibold text-base truncate">
                    {homeTeam?.name || 'Home'} vs {awayTeam?.name || 'Away'}
                </h4>
                <p className="text-sm text-muted-foreground truncate">{item.event?.name || 'Friendly Match'}</p>
            </div>

            <div className="text-lg font-bold tabular-nums pr-2 whitespace-nowrap">
                 {item.type === 'recent' ? `${homeScore} - ${awayScore}` : 'vs'}
            </div>
        </div>
    );
};

