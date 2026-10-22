import { useEffect, useState } from 'react';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

/** One player's season (`team_season_stats`): games played, and what they scored, by kind. */
export interface PlayerSeason {
  orgProfileId: string;
  name: string;
  /** From their latest team sheet: a squad keeps neither. */
  jerseyNumber: number | null;
  position: string | null;
  played: number;
  /** By the sport's own words — "Try", "Conversion", "Goal" — only what they did score. */
  scores: Record<string, number>;
  cards: number;
}

export interface TeamSeasonStats {
  players: PlayerSeason[];
  /** The scoring kind that names the top scorer — the sport's main one ("Try", "Goal"). */
  mainScore: string | null;
  /** Finished games, and how many of them have match events: what the scorers come from. */
  gamesCounted: number;
  gamesWithEvents: number;
}

const EMPTY: TeamSeasonStats = { players: [], mainScore: null, gamesCounted: 0, gamesWithEvents: 0 };

/**
 * A team's players over one season (a calendar year, 2026-10-22): games played from team sheets,
 * scores and cards from match events — worked out by the server, which holds both. Read once per
 * team and season; it changes only as games are played.
 */
export function useTeamSeasonStats(teamId?: string | null, season?: number | null) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [stats, setStats] = useState<TeamSeasonStats>(EMPTY);
  useEffect(() => {
    if (!isConnected || !teamId || !season) return;
    let live = true;
    wsService.emit('get_data', { type: 'team_season_stats', teamId, season }, (res: any) => {
      if (live) setStats(res && Array.isArray(res.players) ? res : EMPTY);
    });
    return () => { live = false; };
  }, [isConnected, teamId, season]);
  return stats;
}
