import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CandidateTeam, OrgBadge, SocketAction, Team, TournamentDivision, TournamentEntrant } from '@sk/shared';
import { NewTeamModal } from './NewTeamModal';
import { divisionTeamOptions } from '../../hooks/useEventEntrants';
import { DivisionTeamChoices } from './DivisionTeamChoices';
import { EntrantGrid } from './EntrantGrid';
import { OrgLogo } from '../OrgLogo';
import { sendAction } from '../../services/actions';
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

export interface DivisionEntrantsEditorProps {
  /** The acting organisation, from the route — not the org whose teams are being entered. */
  orgId: string;
  division: TournamentDivision;
  /** This division's roster, already filtered by the caller. */
  entrants: TournamentEntrant[];
  candidateTeams: CandidateTeam[];
  orgs: OrgBadge[];
  sportName?: string;
  /** A team created inline is appended here, because `event_candidate_teams` is a one-shot read. */
  onTeamCreated?: (team: Team) => void;
  /**
   * Every entered team in the tournament and the division holding it (`divisionByTeamId`).
   *
   * Optional, and its absence is a real case rather than laziness: the division panel a convenor
   * reaches has only *their* division's roster — the event-level one is a room they may not be
   * able to join — so there it is left out and a team already entered elsewhere is refused by the
   * server with a message naming where it is. The event-level entrants screen passes it and gets
   * the better experience: the chip says so up front, and offers to move it.
   */
  divisionByTeam?: Map<string, string>;
  /** Names a division for the chip that says where a team went. */
  divisionName?: (divisionId: string) => string;
  /** Tapping a team another division holds. Without it, such a chip is inert. */
  onMoveTeam?: (team: CandidateTeam, fromDivisionId: string) => void;
}

export function DivisionEntrantsEditor({
  orgId,
  division,
  entrants,
  candidateTeams,
  orgs,
  sportName,
  onTeamCreated,
  divisionByTeam,
  divisionName,
  onMoveTeam,
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
    // The roster follows the division room, so success needs nothing here; a refusal is toasted.
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
    writeRoster([...entrants, { divisionId: division.id, label, status: 'active' }]).then(result => {
      // The field is cleared straight away; a refused placeholder puts it back to be tried again.
      if (result.ok) return;
      setPlaceholderLabel(label);
      setIsAddingPlaceholder(true);
    });
    setPlaceholderLabel('');
    setIsAddingPlaceholder(false);
  };

  const handleCreated = (team: Team) => {
    onTeamCreated?.(team);
    writeRoster([...entrants, { divisionId: division.id, teamId: team.id, status: 'active' }]);
  };

  const enteredTeamIds = new Set(entrants.map(entrant => entrant.teamId).filter(Boolean) as string[]);
  /* Every team an organisation group below shows — qualifying ones and age-group overrides — so the
     list of extras holds only what no group can: placeholders, people, and teams from outside the
     invited organisations or the division's sport. */
  const teamsOf = (orgId: string) => candidateTeams.filter(team => team.orgId === orgId);
  const optionsOf = (orgId: string) =>
    divisionTeamOptions(teamsOf(orgId), division, enteredTeamIds, divisionByTeam);
  const shownTeamIds = new Set(
    orgs.flatMap(org => optionsOf(org.id).listed.map(option => option.team.id))
  );
  /** Entered competitors no organisation group shows: placeholders, people, guest sides. */
  const extras = entrants.filter(
    entrant => !entrant.teamId || !shownTeamIds.has(entrant.teamId)
  );

  /** An organisation's heading: its crest, its code, and the way to give it a team it lacks. */
  const orgHeader = (org: OrgBadge) => (
    <View className="flex-row items-center justify-between gap-2">
      <View className="flex-row items-center gap-1.5 flex-1 min-w-0">
        <OrgLogo
          logo={org.logo}
          settings={org.logoConfig ? { logoConfig: org.logoConfig } : undefined}
          primaryColor={org.primaryColor}
          size={18}
          className="rounded-full"
        />
        <Text
          numberOfLines={1}
          className="font-orbitron-bold text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-widest flex-1"
        >
          {org.shortName}
        </Text>
      </View>
      {!!division.sportId && (
        <TouchableOpacity
          onPress={() => setNewTeamForOrgId(org.id)}
          accessibilityLabel={`New team for ${org.name}`}
          className="flex-row items-center gap-0.5 active:opacity-80"
        >
          <Ionicons name="add" size={13} color={COLORS.brand.orange} />
          <Text className="font-inter-bold text-[9px] text-brand-orange uppercase tracking-wider">
            New
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View>
      <EntrantGrid
        groups={orgs.map(org => {
          const { listed, others } = optionsOf(org.id);
          return {
            key: org.id,
            header: orgHeader(org),
            isEmpty: listed.length === 0 && others.length === 0,
            body: (
              <DivisionTeamChoices
                teams={teamsOf(org.id)}
                division={division}
                enteredTeamIds={enteredTeamIds}
                divisionByTeam={divisionByTeam}
                divisionName={divisionName}
                isBusy={team => !!busyKeys[team.id]}
                onToggle={toggleTeam}
                onMove={onMoveTeam}
                emptyText={`No ${qualifyingLabel || 'qualifying'} team on the system.`}
              />
            ),
          };
        })}
        emptyText="No organisations are taking part yet."
        /*
          The schools with no team of this sport and age, collected rather than given a column
          each. Still every one of them, because this line is the only route to creating the team
          they are missing — which is exactly the moment an organiser discovers it.
        */
        renderEmpty={empties => (
          <View className="border-t border-slate-100 dark:border-white/5 pt-3 mt-1">
            <Text className="font-orbitron-bold text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
              No {qualifyingLabel || 'qualifying'} team
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {empties.map(group => {
                const org = orgs.find(o => o.id === group.key)!;
                return (
                  <TouchableOpacity
                    key={group.key}
                    onPress={() => setNewTeamForOrgId(org.id)}
                    disabled={!division.sportId}
                    accessibilityLabel={`Create a ${qualifyingLabel} team for ${org.name}`}
                    className="flex-row items-center gap-1.5 rounded-full border border-dashed border-slate-300 dark:border-white/10 px-2.5 py-1.5 active:opacity-80"
                  >
                    <Text className="font-inter-bold text-[10px] text-slate-500 dark:text-slate-400">
                      {org.shortName}
                    </Text>
                    {!!division.sportId && (
                      <Ionicons name="add-circle-outline" size={13} color={COLORS.brand.orange} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      />

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
        ageGroupId={division.ageGroupId}
        ageGroup={division.ageGroup}
        sportName={sportName}
        onCreated={handleCreated}
      />
    </View>
  );
}
