import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CandidateTeam, SocketAction, Team, TournamentDivision, TournamentEntrant } from '@sk/shared';
import { NewTeamModal } from './NewTeamModal';
import { teamQualifies } from '../../hooks/useEventEntrants';
import { wsService } from '../../services/websocket';
import { useActiveTheme } from '../../store/settingsStore';
import { COLORS, getThemeColor } from '../../constants/Colors';

/**
 * One division's roster, edited in place — the *by division* axis (U21).
 *
 * Shared by the two screens that need it, for the same reason `DivisionPanel` is shared: the entry
 * screen's division axis and the division screen's own roster are the same operation, and two
 * renderings of it would drift. It also settles who can do what without a second rulebook — the
 * event-level entry screen is the tournament organiser's, and a convenor reaches this same editor
 * through their division's screen.
 *
 * Every toggle writes the **whole** roster (D13). Entrants keep their ids across the write, so an
 * entrant that was already there keeps the fixtures generated against it; only what the organiser
 * actually changed moves.
 */

export interface EntrantOrg {
  id: string;
  name: string;
  shortName?: string;
}

export interface DivisionEntrantsEditorProps {
  /** The acting organisation, from the route — not the org whose teams are being entered. */
  orgId: string;
  division: TournamentDivision;
  /** This division's roster, already filtered by the caller. */
  entrants: TournamentEntrant[];
  candidateTeams: CandidateTeam[];
  orgs: EntrantOrg[];
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
  sportName,
  onTeamCreated,
}: DivisionEntrantsEditorProps) {
  const isDark = useActiveTheme() === 'dark';
  const secondary = getThemeColor(isDark, 'textSecondary');

  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});
  const [isAddingPlaceholder, setIsAddingPlaceholder] = useState(false);
  const [placeholderLabel, setPlaceholderLabel] = useState('');
  const [newTeamForOrgId, setNewTeamForOrgId] = useState<string | null>(null);

  const qualifyingLabel = [division.ageGroup, sportName].filter(Boolean).join(' ');

  const writeRoster = (next: Array<Partial<TournamentEntrant>>, busyKey?: string) => {
    if (busyKey) setBusyKeys(prev => ({ ...prev, [busyKey]: true }));
    wsService.emit(
      'action',
      {
        type: SocketAction.SET_DIVISION_ENTRANTS,
        payload: {
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
        },
      },
      () => {
        if (busyKey) setBusyKeys(prev => ({ ...prev, [busyKey]: false }));
      }
    );
  };

  const toggleTeam = (team: CandidateTeam) => {
    const existing = entrants.find(entrant => entrant.teamId === team.id);
    writeRoster(
      existing
        ? entrants.filter(entrant => entrant.id !== existing.id)
        : [...entrants, { divisionId: division.id, teamId: team.id, status: 'active' }],
      team.id
    );
  };

  const removeEntrant = (entrant: TournamentEntrant) => {
    writeRoster(entrants.filter(row => row.id !== entrant.id), entrant.id);
  };

  const addPlaceholder = () => {
    const label = placeholderLabel.trim();
    if (!label) return;
    writeRoster([...entrants, { divisionId: division.id, label, status: 'active' }]);
    setPlaceholderLabel('');
    setIsAddingPlaceholder(false);
  };

  const handleCreated = (team: Team) => {
    onTeamCreated?.(team);
    writeRoster([...entrants, { divisionId: division.id, teamId: team.id, status: 'active' }]);
  };

  /** Entered competitors that are not a qualifying team: placeholders, people, guest sides. */
  const qualifyingTeamIds = new Set(
    candidateTeams.filter(team => teamQualifies(team, division)).map(team => team.id)
  );
  const extras = entrants.filter(
    entrant => !entrant.teamId || !qualifyingTeamIds.has(entrant.teamId)
  );

  return (
    <View>
      {orgs.map(org => {
        const qualifying = candidateTeams.filter(
          team => team.orgId === org.id && teamQualifies(team, division)
        );
        return (
          <View key={org.id} className="mb-4">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {org.shortName || org.name}
              </Text>
              {!!division.sportId && (
                <TouchableOpacity
                  onPress={() => setNewTeamForOrgId(org.id)}
                  className="flex-row items-center gap-1 active:opacity-80"
                >
                  <Ionicons name="add" size={13} color={COLORS.brand.orange} />
                  <Text className="font-inter-bold text-[9px] text-brand-orange uppercase tracking-wider">
                    New team
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {qualifying.length ? (
              qualifying.map(team => {
                const entered = entrants.some(entrant => entrant.teamId === team.id);
                const isBusy = !!busyKeys[team.id];
                return (
                  <TouchableOpacity
                    key={team.id}
                    onPress={() => toggleTeam(team)}
                    disabled={isBusy}
                    className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 mb-1.5 border active:opacity-85 ${
                      entered
                        ? 'bg-brand-orange/10 border-brand-orange/30'
                        : 'bg-slate-50 dark:bg-white/5 border-transparent'
                    }`}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={COLORS.brand.orange} />
                    ) : (
                      <Ionicons
                        name={entered ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={entered ? COLORS.brand.orange : secondary}
                      />
                    )}
                    <Text
                      className="font-inter-bold text-xs text-slate-800 dark:text-white flex-1"
                      numberOfLines={1}
                    >
                      {team.name}
                    </Text>
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text className="font-inter text-[11px] text-slate-400 dark:text-slate-500 italic px-1">
                No {qualifyingLabel || 'qualifying'} team on the system.
              </Text>
            )}
          </View>
        );
      })}

      {extras.length > 0 && (
        <View className="mt-1">
          {extras.map(entrant => (
            <View
              key={entrant.id}
              className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 mb-1.5 bg-slate-50 dark:bg-white/5"
            >
              <Ionicons
                name={entrant.teamId ? 'people-outline' : 'help-circle-outline'}
                size={18}
                color={entrant.teamId ? secondary : COLORS.brand.orange}
              />
              <View className="flex-1">
                <Text className="font-inter-bold text-xs text-slate-800 dark:text-white" numberOfLines={1}>
                  {entrant.name || entrant.label || 'TBC'}
                </Text>
                <Text className="font-inter text-[10px] text-slate-500 dark:text-slate-400">
                  {entrant.teamId
                    ? entrant.orgShortName || 'Entered'
                    : 'Placeholder — name the team once it is confirmed'}
                </Text>
              </View>
              {busyKeys[entrant.id] ? (
                <ActivityIndicator size="small" color={COLORS.brand.orange} />
              ) : (
                <TouchableOpacity
                  onPress={() => removeEntrant(entrant)}
                  className="w-8 h-8 items-center justify-center active:opacity-80"
                >
                  <Ionicons name="close" size={16} color={secondary} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {/*
        D7 — a placeholder is a competitor with no team yet, and is schedulable and printable like
        any other. Naming the team later updates every fixture at once, because they all point at
        this one row.
      */}
      {isAddingPlaceholder ? (
        <View className="mt-2 space-y-2">
          <TextInput
            value={placeholderLabel}
            onChangeText={setPlaceholderLabel}
            autoFocus
            placeholder="Winner of the regional qualifier"
            placeholderTextColor={getThemeColor(isDark, 'placeholder')}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
          />
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setIsAddingPlaceholder(false)}
              className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-white/10 items-center active:opacity-80"
            >
              <Text className="font-inter-bold text-[10px] text-slate-600 dark:text-slate-400 uppercase">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={addPlaceholder}
              className="flex-1 py-2 rounded-lg bg-brand-orange items-center active:opacity-85"
            >
              <Text className="font-inter-bold text-[10px] text-white uppercase">Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => {
            setPlaceholderLabel('');
            setIsAddingPlaceholder(true);
          }}
          className="flex-row items-center gap-2 mt-1 active:opacity-80"
        >
          <Ionicons name="add-circle-outline" size={16} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-[10px] text-brand-orange uppercase tracking-wider">
            Add a placeholder
          </Text>
        </TouchableOpacity>
      )}

      <NewTeamModal
        isOpen={!!newTeamForOrgId}
        onClose={() => setNewTeamForOrgId(null)}
        orgId={newTeamForOrgId || ''}
        orgName={orgs.find(o => o.id === newTeamForOrgId)?.name || ''}
        sportId={division.sportId}
        ageGroup={division.ageGroup}
        sportName={sportName}
        onCreated={handleCreated}
      />
    </View>
  );
}
