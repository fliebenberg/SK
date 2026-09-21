import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CandidateTeam,
  EntrantRow,
  OrgBadge,
  SocketAction,
  Sport,
  Team,
  TournamentDivision,
  TournamentEntrant,
  buildEntrantRows,
  divisionsForTeam,
} from '@sk/shared';
import { AddEntrantModal } from './AddEntrantModal';
import { EntrantTable } from './EntrantTable';
import { sendAction } from '../../services/actions';
import { COLORS } from '../../constants/Colors';

/**
 * One division's roster, as the same table the entrants screen uses, narrowed to one division.
 *
 * The convenor's view and the organiser's view are the same operation, so they are the same
 * component — the reason this file has always existed. What changed on 2026-09-21 is what it
 * renders: a grid of tick-box chips grouped by organisation became a row per competitor with a
 * tick and a division. The division column has one option here, so it collapses to text (U15) and
 * the table reads as a checklist, which is exactly what entering one division is.
 *
 * **It passes no tournament-wide roster**, and that is a real limitation rather than an oversight.
 * A convenor reaches this through their division's screen and may not be able to join the
 * event-level entrants room, so this cannot know that a team is already in another division. The
 * server does, and refuses with a message naming where it is. The organiser's screen, which can
 * read the whole roster, shows it up front instead.
 */
export interface DivisionEntrantsEditorProps {
  /** The acting organisation, from the route — not the org whose teams are being entered. */
  orgId: string;
  division: TournamentDivision;
  /** This division's roster, already filtered by the caller. */
  entrants: TournamentEntrant[];
  candidateTeams: CandidateTeam[];
  orgs: OrgBadge[];
  /** The tournament's sports, for the Add dialog. */
  sports: Sport[];
  sportName?: string;
  /** A team created inline is appended here, because `event_candidate_teams` is a one-shot read. */
  onTeamCreated?: (team: Team) => void;
}

export function DivisionEntrantsEditor({
  orgId,
  division,
  entrants,
  candidateTeams,
  orgs,
  sports,
  sportName,
  onTeamCreated,
}: DivisionEntrantsEditorProps) {
  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});
  const [isAdding, setIsAdding] = useState(false);

  const qualifyingLabel = [division.ageGroup, sportName].filter(Boolean).join(' ');

  /**
   * The teams this division could hold, plus everything already in it.
   *
   * `buildEntrantRows` attaches an entrant to its candidate, so a team entered **by override** —
   * the right sport, another age group — would be dropped by a plain qualifying filter and
   * reappear as a second, teamless row. Entered teams are kept regardless, which is the same rule
   * the grid's `listed` had.
   */
  const rows = useMemo(() => {
    const enteredTeamIds = new Set(entrants.map(e => e.teamId).filter(Boolean) as string[]);
    const relevant = candidateTeams.filter(
      team =>
        enteredTeamIds.has(team.id) || divisionsForTeam(team, [division]).qualifying.length > 0
    );
    return buildEntrantRows(relevant, entrants, orgs);
  }, [candidateTeams, entrants, orgs, division]);

  const writeRoster = (next: Array<Partial<TournamentEntrant>>, busyKey?: string) => {
    if (busyKey) setBusyKeys(prev => ({ ...prev, [busyKey]: true }));
    // The roster follows the division room, so success needs nothing here; a refusal is toasted —
    // including the one that says this team is already in another division of the tournament.
    return sendAction(SocketAction.SET_DIVISION_ENTRANTS, {
      divisionId: division.id,
      orgId,
      entrants: next.map(entrant => ({
        // An empty id is a new entrant: the server mints one rather than treating it as an
        // update of a row that is not there.
        id: entrant.id || undefined,
        teamId: entrant.teamId,
        orgProfileId: entrant.orgProfileId,
        label: entrant.label,
        seed: entrant.seed,
        status: entrant.status || 'active',
      })),
    }).then(result => {
      if (busyKey) setBusyKeys(prev => ({ ...prev, [busyKey]: false }));
      return result;
    });
  };

  /** One division, so a row is in it or out of it — there is nowhere else to put it. */
  const setRowDivision = (row: EntrantRow, divisionId: string | null) => {
    if (!divisionId) {
      if (!row.entrant) return;
      const entrantId = row.entrant.id;
      writeRoster(entrants.filter(e => e.id !== entrantId), row.key);
      return;
    }
    writeRoster(
      [
        ...entrants,
        row.team
          ? { teamId: row.team.id, status: 'active' as const }
          : {
              teamId: row.entrant?.teamId,
              orgProfileId: row.entrant?.orgProfileId,
              label: row.entrant?.label,
              status: 'active' as const,
            },
      ],
      row.key
    );
  };

  return (
    <View>
      <View className="flex-row items-center justify-end mb-1">
        <TouchableOpacity
          onPress={() => setIsAdding(true)}
          accessibilityLabel="Add a team or entrant"
          className="flex-row items-center gap-1 px-2 py-1 active:opacity-80"
        >
          <Ionicons name="add-circle-outline" size={15} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
            Add
          </Text>
        </TouchableOpacity>
      </View>

      <EntrantTable
        rows={rows}
        divisions={[division]}
        orgs={orgs}
        divisionLabel={() => division.name || qualifyingLabel || 'This division'}
        isBusy={row => !!busyKeys[row.key]}
        onSetDivision={setRowDivision}
        canEdit
        emptyText={`No ${qualifyingLabel || 'qualifying'} team on the system. Add one above.`}
      />

      <AddEntrantModal
        isOpen={isAdding}
        onClose={() => setIsAdding(false)}
        orgId={orgId}
        sports={sports.filter(sport => !division.sportId || sport.id === division.sportId)}
        orgs={orgs}
        divisions={[division]}
        divisionLabel={() => division.name || qualifyingLabel || 'This division'}
        defaultSportId={division.sportId}
        defaultDivisionId={division.id}
        onTeamCreated={(team, divisionId) => {
          onTeamCreated?.(team);
          if (divisionId) writeRoster([...entrants, { teamId: team.id, status: 'active' }], team.id);
        }}
        onEntrantCreated={made =>
          writeRoster([
            ...entrants,
            { label: made.label, orgProfileId: made.orgProfileId, status: 'active' },
          ])
        }
      />
    </View>
  );
}
