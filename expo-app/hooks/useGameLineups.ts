import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { wsService } from '../services/websocket';
import { useWsStore } from '../store/wsStore';

/** One player on a side's team sheet for a game. */
export interface LineupPlayer {
  orgProfileId: string;
  name?: string;
  position?: string;
  jerseyNumber?: string;
  isReserve?: boolean;
}

/**
 * Each side's team sheet for this game, by participant id — `null` while it loads, `[]` when nobody
 * has been picked.
 *
 * Read directly rather than through the scoring context, which falls back to the whole team when no
 * sheet exists — right for scoring, wrong for a page that has to say *not picked yet*. Read again
 * whenever the page comes back into view, which is how it hears about Pick team.
 */
export function useGameLineups(participantIds: string[]) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [lineups, setLineups] = useState<Record<string, LineupPlayer[] | null>>({});
  const key = participantIds.join('|');

  const load = useCallback(() => {
    if (!isConnected) return;
    for (const id of participantIds) {
      wsService.emit('get_data', { type: 'game_roster', id }, (data: any) => {
        const items: LineupPlayer[] = Array.isArray(data) ? data : [];
        const ordered = [...items].sort((a, b) => (parseInt(a.position || '') || 999) - (parseInt(b.position || '') || 999));
        setLineups(prev => ({ ...prev, [id]: ordered }));
      });
    }
  }, [isConnected, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return { lineups, reload: load };
}

/** A side's proposed team: the sheet of its team's latest earlier game in the tournament (`FIX-32`). */
export interface LineupProposal {
  fromGameId: string;
  fromParticipantId: string;
  /** That game's kick-off, an instant. */
  fromStartTime: string | null;
  /** Whom that game was against, as the server names it. */
  opponent: string | null;
  items: LineupPlayer[];
}

/**
 * The proposed team for each of these sides — only the viewer's own, since another side's proposal
 * is not theirs to see as picked — or `null` where there is none: a sheet of its own, or no earlier
 * game to take one from. Read again when the page comes back into view, as the sheets are.
 */
export function useLineupProposals(participantIds: string[]) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [proposals, setProposals] = useState<Record<string, LineupProposal | null>>({});
  const key = participantIds.join('|');

  const load = useCallback(() => {
    if (!isConnected) return;
    for (const id of participantIds) {
      wsService.emit('get_data', { type: 'game_roster_proposal', id }, (data: any) => {
        setProposals(prev => ({ ...prev, [id]: data && Array.isArray(data.items) && data.items.length ? data : null }));
      });
    }
  }, [isConnected, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return { proposals, reload: load };
}
