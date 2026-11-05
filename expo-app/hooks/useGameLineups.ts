import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { readData } from '../services/reads';
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
 *
 * **A failed read says nothing about the sheet (`SYNC-9`).** A side stays as it was, so one never read
 * stays `undefined`, and `error` says what went wrong: only `[]` means nobody has been picked. The
 * screen draws `error`. The server always answers this read with a list, and with `null` only when
 * reading it threw, so anything but a list is a failure here.
 */
export function useGameLineups(participantIds: string[]) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [lineups, setLineups] = useState<Record<string, LineupPlayer[] | null>>({});
  const [error, setError] = useState<string | null>(null);
  const key = participantIds.join('|');
  /** Bumped by every new read, so that only the latest may answer. */
  const currentRead = useRef(0);

  const load = useCallback(() => {
    if (!isConnected) return;
    const read = ++currentRead.current;
    const isCurrent = () => currentRead.current === read;
    setError(null);
    for (const id of participantIds) {
      void readData<LineupPlayer[]>('game_roster', { id }, { suppressToast: true, stillWanted: isCurrent }).then(result => {
        if (!isCurrent()) return;
        if (!result.ok) { setError(result.message); return; }
        if (!Array.isArray(result.data)) { setError('The server could not read the team sheet.'); return; }
        const ordered = [...result.data].sort((a, b) => (parseInt(a.position || '') || 999) - (parseInt(b.position || '') || 999));
        setLineups(prev => ({ ...prev, [id]: ordered }));
      });
    }
  }, [isConnected, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => () => { currentRead.current++; }, []);

  return { lineups, error, reload: load };
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
 *
 * A failed read keeps what was held and stays quiet: without a proposal a side reads *Not picked*,
 * which is still true, and Pick team has its own read and says if that fails (`SYNC-9`).
 */
export function useLineupProposals(participantIds: string[]) {
  const isConnected = useWsStore((state: any) => state.isConnected);
  const [proposals, setProposals] = useState<Record<string, LineupProposal | null>>({});
  const key = participantIds.join('|');

  const load = useCallback(() => {
    if (!isConnected) return;
    for (const id of participantIds) {
      void readData<LineupProposal | null>('game_roster_proposal', { id }, { suppressToast: true }).then(result => {
        if (!result.ok) return;
        const data = result.data;
        setProposals(prev => ({ ...prev, [id]: data && Array.isArray(data.items) && data.items.length ? data : null }));
      });
    }
  }, [isConnected, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return { proposals, reload: load };
}
