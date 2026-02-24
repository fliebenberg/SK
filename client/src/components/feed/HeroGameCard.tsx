import { Game } from "@sk/types";
import { formatTime } from "@/lib/utils";
import { Trophy } from "lucide-react";

interface HeroGameCardProps {
    game: Game;
}

export const HeroGameCard = ({ game }: HeroGameCardProps) => {
    const isLive = game.status === 'Live';

    return (
        <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-md transition-all hover:shadow-lg w-full max-w-sm flex-shrink-0 snap-center">
            {/* Background Glow for Live Games */}
            {isLive && (
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-red-500/20 to-orange-500/20 blur-xl opacity-50 z-0"></div>
            )}
            
            <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>{game.startTime ? formatTime(game.startTime) : 'TBD'}</span>
                    {isLive ? (
                        <span className="flex items-center gap-1.5 text-red-500">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                            </span>
                            LIVE
                        </span>
                    ) : (
                        <span>{game.status}</span>
                    )}
                </div>

                <div className="flex w-full items-center justify-between mt-2">
                    <div className="flex flex-col items-center gap-2 flex-1 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                           {/* Placeholder for Home Team Logo */}
                           <Trophy className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <span className="text-sm font-bold line-clamp-2">Home Team</span>
                    </div>

                    <div className="flex flex-col items-center justify-center px-4">
                        <div className="text-3xl font-black tabular-nums tracking-tighter" style={{ fontFamily: 'var(--font-orbitron)' }}>
                            {game.homeScore} - {game.awayScore}
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-2 flex-1 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                           {/* Placeholder for Away Team Logo */}
                           <Trophy className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <span className="text-sm font-bold line-clamp-2">{game.awayTeamName || 'Away Team'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
