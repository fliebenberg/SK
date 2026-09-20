import { TournamentEntrant } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * One division's roster, from `division:{id}:entrants`.
 *
 * The division-scoped sibling of {@link useEventEntrants}, which reads the whole tournament's
 * roster for the two-axis entry grid. Use this one where the subject is a single division.
 *
 * Extracted when the division screen needed the roster too — to decide whether the sport may still
 * change (`FIX-17`) — and the panel it already mounts was holding the same room privately. Two
 * subscribers to one room is not a second read: the join push reaches only the socket that joined,
 * and `roomLedger` replays what the room has already delivered to the later of the two, which
 * `useLiveRoom` wires up on its own.
 *
 * The room is the organiser's tier, so `enabled` exists for callers that know the viewer cannot
 * join it — joining anyway would be a refusal per mount rather than a quiet no-op.
 */
export function useDivisionEntrants(divisionId?: string | null, enabled = true) {
  const { items, isLoading, accessDenied } = useLiveRoom<TournamentEntrant>(
    divisionId ? `division:${divisionId}:entrants` : null,
    {
      enabled,
      // Always the whole roster: `SET_DIVISION_ENTRANTS` replaces it (D13), so a merge would keep
      // entrants the edit removed.
      reduce: (message) =>
        message.type === 'DIVISION_ENTRANTS_SYNC' && message.data?.divisionId === divisionId
          ? { kind: 'replace', items: message.data?.entrants || [] }
          : { kind: 'ignore' },
    }
  );

  return { entrants: items, isLoading, accessDenied };
}

/**
 * How many of a roster are teams, as opposed to placeholders (D7).
 *
 * The number that decides whether a division's sport is still open to change: a placeholder has no
 * team and so contradicts no sport. The server holds the same line in `updateDivision`; this is so
 * the control can say why rather than be refused on save.
 */
export function enteredTeamCount(entrants: TournamentEntrant[]): number {
  return entrants.filter(entrant => !!entrant.teamId).length;
}
