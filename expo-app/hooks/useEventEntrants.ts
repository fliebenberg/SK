import { useMemo } from 'react';
import { CandidateTeam, TournamentEntrant } from '@sk/shared';
import { useLiveRoom } from './useLiveRoom';

/**
 * A tournament's whole roster, from the one room that carries it (U21).
 *
 * The entry screens work two axes — *who is in the u14 rugby?* and *what is Northcliff entering?* —
 * over **one** dataset. Reading a division at a time would make the org axis fifteen round trips
 * and fifteen room joins on a single screen open, which is exactly the cost the live-data design
 * exists to remove, so the roster has an event-level room beside the per-division one.
 *
 * `event:{id}:entrants` is member tier, like `division:{id}`: an entrant may be a person rather
 * than a team, and an unresolved one carries a label somebody wrote about a school that has not
 * confirmed yet. A viewer who cannot join gets `accessDenied` rather than an empty roster, which is
 * a different thing and has to look different.
 *
 * The room carries two messages, and the difference between them is the reason `replaceWhere`
 * exists: the join push is the whole tournament, while an edit publishes the one division that
 * changed. Merging the second as an upsert would keep entrants the edit removed.
 */
export function useEventEntrants(eventId?: string | null, enabled = true) {
  const { items, isLoading, accessDenied } = useLiveRoom<TournamentEntrant>(
    eventId ? `event:${eventId}:entrants` : null,
    {
      enabled,
      reduce: (message) => {
        switch (message.type) {
          case 'EVENT_ENTRANTS_SYNC':
            return { kind: 'replace', items: message.data?.entrants || [] };
          case 'DIVISION_ENTRANTS_SYNC': {
            const divisionId = message.data?.divisionId;
            if (!divisionId) return { kind: 'ignore' };
            return {
              kind: 'replaceWhere',
              items: message.data?.entrants || [],
              where: (entrant) => entrant.divisionId === divisionId,
            };
          }
          default:
            return { kind: 'ignore' };
        }
      },
    }
  );

  /** Grouped once here rather than filtered per division in every row of the grid. */
  const byDivision = useMemo(() => {
    const map = new Map<string, TournamentEntrant[]>();
    for (const entrant of items) {
      const list = map.get(entrant.divisionId);
      if (list) list.push(entrant);
      else map.set(entrant.divisionId, [entrant]);
    }
    return map;
  }, [items]);

  return { entrants: items, byDivision, isLoading, accessDenied };
}

/*
 * The eligibility rules — `teamQualifies`, `normaliseAgeGroup` and the age-group override
 * `divisionTeamOptions` — live in the shared package, where they are tested. Re-exported so the
 * screens' existing imports keep working.
 */
export { teamQualifies, normaliseAgeGroup, divisionTeamOptions } from '@sk/shared';
export type { DivisionTeamOption } from '@sk/shared';
