import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CandidateTeam,
  EventOrgBadge,
  OrgProfile,
  SocketAction,
  Sport,
  Team,
  TournamentDivision,
  TournamentEntrant,
  teamQualifies,
  toEntrantInput,
} from '@sk/shared';
import { PersonnelAutocomplete } from '../PersonnelAutocomplete';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * An organisation's teams in a tournament (`FIX-26`): every division, grouped by sport, with the
 * organisation's teams as chips — ticked is entered. Used by the organisation's page, which holds
 * the state (`useOrgTeamPicks`) so its save bar and unsaved-changes guard can see it.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One competitor in a division row. */
export interface TeamPick {
  key: string;
  label: string;
  kind: 'team' | 'placeholder' | 'person';
  teamId?: string;
  orgProfileId?: string;
  /** The existing entrant, when it is entered already. */
  entrantId?: string;
  on: boolean;
  /** Ticked when the picks were last read from the roster. */
  was: boolean;
  played: number;
  note?: string;
}

/** The divisions the organisation can be in, in the tournament's sport order. */
export function orderedDivisions(divisions: TournamentDivision[], sportIds: string[]) {
  return [...divisions]
    .filter(d => d.sportId && sportIds.includes(d.sportId))
    .sort((a, b) => sportIds.indexOf(a.sportId!) - sportIds.indexOf(b.sportId!) || (a.sortOrder || 0) - (b.sortOrder || 0));
}

/**
 * The picks, and what saving them sends.
 *
 * Read from the roster when the page opens, and again whenever the roster changes while nothing is
 * being edited — so a change made elsewhere shows, and an edit in progress is never overwritten.
 */
export function useOrgTeamPicks({ org, orgId, divisions, sportIds, entrants, candidateTeams }: {
  org: EventOrgBadge | null;
  /** The acting workspace. */
  orgId: string;
  divisions: TournamentDivision[];
  sportIds: string[];
  /** Every entrant of the tournament, withdrawn ones included. */
  entrants: TournamentEntrant[];
  candidateTeams: CandidateTeam[];
}) {
  const [picks, setPicks] = useState<Record<string, TeamPick[]>>({});
  const [saving, setSaving] = useState(false);
  const ordered = useMemo(() => orderedDivisions(divisions, sportIds), [divisions, sportIds]);
  const active = useMemo(() => entrants.filter(e => e.status !== 'withdrawn'), [entrants]);
  const enteredTeamIds = useMemo(() => new Set(active.map(e => e.teamId).filter(Boolean) as string[]), [active]);

  const read = useCallback((): Record<string, TeamPick[]> => {
    const next: Record<string, TeamPick[]> = {};
    if (!org) return next;
    for (const d of ordered) {
      const rows: TeamPick[] = active
        .filter(e => e.divisionId === d.id && e.orgId === org.id)
        .map(e => ({
          key: `entrant:${e.id}`,
          label: e.name || e.label || 'To be named',
          kind: e.teamId ? 'team' : e.orgProfileId ? 'person' : 'placeholder',
          teamId: e.teamId,
          orgProfileId: e.orgProfileId,
          entrantId: e.id,
          on: true,
          was: true,
          played: e.playedCount || 0,
        }));
      // Its teams that can play here and are not entered anywhere in the tournament yet.
      for (const team of candidateTeams) {
        if (team.orgId !== org.id || enteredTeamIds.has(team.id) || !teamQualifies(team, d)) continue;
        rows.push({ key: `team:${team.id}`, label: team.name, kind: 'team', teamId: team.id, on: false, was: false, played: 0 });
      }
      next[d.id] = rows;
    }
    return next;
  }, [org, ordered, active, candidateTeams, enteredTeamIds]);

  const changed = Object.entries(picks).filter(([, rows]) => rows.some(p => p.on !== p.was));
  const isDirty = changed.length > 0;
  useEffect(() => {
    if (!isDirty) setPicks(read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read]);

  const reset = useCallback(() => setPicks(read()), [read]);

  const toggle = (divisionId: string, key: string) =>
    setPicks(prev => {
      const target = prev[divisionId]?.find(p => p.key === key);
      if (!target) return prev;
      const turningOn = !target.on;
      const next: Record<string, TeamPick[]> = {};
      for (const [id, rows] of Object.entries(prev)) {
        next[id] = rows.map(p => {
          if (id === divisionId && p.key === key) return { ...p, on: turningOn };
          // A team plays in one division of a tournament: ticking it here unticks it elsewhere.
          if (turningOn && target.teamId && p.teamId === target.teamId && p.on) return { ...p, on: false };
          return p;
        });
      }
      return next;
    });

  const add = (divisionId: string, pick: Omit<TeamPick, 'on' | 'was' | 'played'>) =>
    setPicks(prev => ({ ...prev, [divisionId]: [...(prev[divisionId] || []), { ...pick, on: true, was: false, played: 0 }] }));

  const withdrawing = Object.values(picks).flat().filter(p => p.was && !p.on && p.played > 0);

  /** Writes the divisions that changed. `true` when every write went through. */
  const save = async (): Promise<boolean> => {
    if (!org) return false;
    setSaving(true);
    // Divisions that only lose someone first, so a team moved between two is out of the first
    // before it is written into the second.
    const order = [...changed].sort(([, a], [, b]) => Number(a.some(p => p.on && !p.was)) - Number(b.some(p => p.on && !p.was)));
    for (const [divisionId, rows] of order) {
      // A roster is written whole (D13): everyone else's entries, and every withdrawn one, go back
      // as they are.
      const others = entrants.filter(e => e.divisionId === divisionId && (e.status === 'withdrawn' || e.orgId !== org.id));
      const roster = [
        ...others.map(e => toEntrantInput(e)),
        ...rows.filter(p => p.on).map(p => toEntrantInput({
          id: p.entrantId,
          teamId: p.teamId,
          orgProfileId: p.orgProfileId,
          orgId: org.id,
          label: p.kind === 'placeholder' ? p.label : undefined,
          status: 'active',
        })),
      ];
      const result = await sendAction(SocketAction.SET_DIVISION_ENTRANTS, { divisionId, orgId, entrants: roster, takeFromOtherDivisions: true });
      if (!result.ok) { setSaving(false); return false; }
    }
    setSaving(false);
    // Saved: nothing is unsaved any more, so the roster that arrives through the room replaces these.
    setPicks(prev => Object.fromEntries(Object.entries(prev).map(([id, rows]) => [id, rows.map(p => ({ ...p, was: p.on }))])));
    return true;
  };

  return { picks, ordered, enteredTeamIds, toggle, add, reset, save, saving, isDirty, changedCount: changed.length, withdrawing };
}

/**
 * The teams card's body: each sport, then each division as a row of chips with a ＋. `onlyEntered`
 * shows only the divisions it has someone in — for a big club in a big tournament.
 */
export function OrgTeamsByDivision({ org, orgId, sports, sportIds, picks, ordered, candidateTeams, enteredTeamIds, writable, canEdit, onlyEntered, isWide, onToggle, onAdd, onTeamCreated }: {
  org: EventOrgBadge;
  orgId: string;
  sports: Sport[];
  sportIds: string[];
  picks: Record<string, TeamPick[]>;
  ordered: TournamentDivision[];
  candidateTeams: CandidateTeam[];
  enteredTeamIds: Set<string>;
  /** May this user create a team or a person in the organisation. */
  writable: boolean;
  canEdit: boolean;
  onlyEntered: boolean;
  isWide: boolean;
  onToggle: (divisionId: string, key: string) => void;
  onAdd: (divisionId: string, pick: Omit<TeamPick, 'on' | 'was' | 'played'>) => void;
  onTeamCreated: (team: Team) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [adding, setAdding] = useState<string | null>(null);
  const sportOf = (id?: string) => sports.find(s => s.id === id);

  const chip = (divisionId: string, p: TeamPick) => (
    <TouchableOpacity
      key={p.key}
      onPress={() => onToggle(divisionId, p.key)}
      disabled={!canEdit}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: p.on, disabled: !canEdit }}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${p.kind === 'placeholder' ? 'border-dashed' : ''} ${p.on ? 'bg-raised border-line-selected' : 'border-line'}`}
    >
      {p.on ? <Ionicons name="checkmark" size={13} color={themeColor(isDark, 'ink')} /> : null}
      <Text className={`text-[13px] ${p.kind === 'placeholder' ? 'italic' : ''} ${p.on ? 'font-inter-semibold text-ink' : 'font-inter text-ink-soft'}`}>{p.label}</Text>
      {p.played ? <Text className="font-inter text-[11px] text-warning-ink">played {p.played}</Text> : null}
      {p.note ? <Text className="font-inter text-[11px] text-ink-muted">{p.note}</Text> : null}
    </TouchableOpacity>
  );

  const sections = sportIds
    .map(sportId => {
      const all = ordered.filter(d => d.sportId === sportId);
      const list = onlyEntered ? all.filter(d => (picks[d.id] || []).some(p => p.on)) : all;
      const entered = all.reduce((sum, d) => sum + (picks[d.id] || []).filter(p => p.on).length, 0);
      return { sport: sportOf(sportId), all, list, entered };
    })
    .filter(s => s.sport && s.list.length);

  if (!ordered.length) {
    return <Text className="font-inter text-[13px] text-ink-muted">Teams are entered into divisions, so this starts once there are some.</Text>;
  }
  if (!sections.length) {
    return <Text className="font-inter text-[13px] text-ink-muted">Nothing entered yet. Show all divisions to add its teams.</Text>;
  }

  return (
    <View className="gap-2">
      {sections.map(({ sport, all, list, entered }) => {
        const individual = sport!.participantType === 'INDIVIDUAL';
        return (
          <View key={sport!.id}>
            <View className="flex-row items-baseline gap-2 pb-1 pt-1">
              <Text className="font-inter-bold text-sm text-ink">{sport!.name}</Text>
              <Text className="font-inter text-xs text-ink-muted">
                {plural(entered, individual ? 'player' : 'team')} entered · {plural(all.length, 'division')}
              </Text>
            </View>
            {list.map(d => {
              const rows = picks[d.id] || [];
              return (
                <View key={d.id} className={`border-t border-line-soft py-2 gap-1.5 ${isWide ? 'flex-row items-start gap-3' : ''}`}>
                  <Text className="font-inter-semibold text-[13px] text-ink-soft" style={isWide ? { width: 96, paddingTop: 6 } : undefined}>
                    {d.name}{individual ? ' · players' : ''}
                  </Text>
                  <View className="flex-1 gap-1.5">
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      {rows.map(p => chip(d.id, p))}
                      {!rows.length ? <Text className="font-inter text-xs text-ink-muted">No {d.ageGroup ? `${d.ageGroup} ` : ''}{individual ? 'players' : 'team'}</Text> : null}
                      {canEdit ? (
                        <TouchableOpacity
                          onPress={() => setAdding(adding === d.id ? null : d.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Add to ${d.name}`}
                          className="rounded-full border border-dashed border-line-strong px-3 py-1.5"
                        >
                          <Text className="font-inter-bold text-[13px] text-primary-ink">{individual ? '＋ Add player' : '＋'}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {adding === d.id ? (
                      <AddToDivision
                        division={d}
                        org={org}
                        individual={individual}
                        writable={writable}
                        others={candidateTeams.filter(t => t.orgId === org.id && t.sportId === d.sportId && !enteredTeamIds.has(t.id) && !rows.some(p => p.teamId === t.id))}
                        onPick={pick => { onAdd(d.id, pick); setAdding(null); }}
                        onTeamCreated={team => { onTeamCreated(team); onAdd(d.id, { key: `team:${team.id}`, label: team.name, kind: 'team', teamId: team.id }); setAdding(null); }}
                        onCancel={() => setAdding(null)}
                      />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/**
 * The ＋ under a division row, inline rather than a dialog: another of the organisation's teams in
 * the sport (playing up, or another age), a new team, or a place to be filled later — and for an
 * individual sport, a player.
 */
function AddToDivision({ division, org, individual, writable, others, onPick, onTeamCreated, onCancel }: {
  division: TournamentDivision;
  org: EventOrgBadge;
  individual: boolean;
  writable: boolean;
  others: CandidateTeam[];
  onPick: (pick: Omit<TeamPick, 'on' | 'was' | 'played'>) => void;
  onTeamCreated: (team: Team) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<null | 'team' | 'place' | 'player'>(individual ? 'player' : null);
  const [text, setText] = useState('');
  const [person, setPerson] = useState<OrgProfile | null>(null);
  const [busy, setBusy] = useState(false);

  const createTeam = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const result = await sendAction(SocketAction.ADD_TEAM, {
      name: text.trim(),
      orgId: org.id,
      sportId: division.sportId!,
      ageGroupId: division.ageGroupId || undefined,
      isActive: true,
    });
    setBusy(false);
    if (result.ok) onTeamCreated(result.data);
  };
  const addPlayer = async () => {
    if (person) {
      onPick({ key: `person:${person.id}`, label: person.name, kind: 'person', orgProfileId: person.id });
      return;
    }
    if (!text.trim()) return;
    setBusy(true);
    const created = await sendAction(SocketAction.ADD_ORG_PROFILE, { name: text.trim(), orgId: org.id });
    setBusy(false);
    if (created.ok) onPick({ key: `person:${created.data.id}`, label: text.trim(), kind: 'person', orgProfileId: created.data.id });
  };
  const addPlace = () => text.trim() && onPick({ key: `place:${Date.now()}`, label: text.trim(), kind: 'placeholder' });

  const option = (label: string, sub: string | null, onPress: () => void, strong?: boolean) => (
    <TouchableOpacity key={label} onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-2 py-2 border-t border-line-soft">
      <Text className={`flex-1 text-[13px] ${strong ? 'font-inter-bold text-primary-ink' : 'font-inter text-ink'}`}>{label}</Text>
      {sub ? <Text className="font-inter text-xs text-ink-muted">{sub}</Text> : null}
    </TouchableOpacity>
  );
  const form = (placeholder: string, action: string, onSubmit: () => void, input?: React.ReactNode) => (
    <View className="gap-2">
      {input || <TextInput value={text} onChangeText={setText} autoFocus placeholder={placeholder} accessibilityLabel={placeholder} className={TEXT_INPUT} onSubmitEditing={onSubmit} />}
      <View className="flex-row items-center gap-3 justify-end">
        <TouchableOpacity onPress={onCancel} accessibilityRole="button"><Text className="font-inter-bold text-[13px] text-ink-muted">Cancel</Text></TouchableOpacity>
        <TouchableOpacity onPress={onSubmit} disabled={busy} accessibilityRole="button" className="rounded-xl bg-primary px-3 py-1.5">
          <Text className="font-inter-bold text-[13px] text-on-primary">{busy ? 'Adding…' : action}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View className="rounded-xl border border-line bg-card px-3 py-2 gap-1">
      <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider">{division.name} · {org.name}</Text>
      {mode === null ? (
        <>
          {others.map(team => option(team.name, team.ageGroup && team.ageGroup !== division.ageGroup ? `${team.ageGroup} — plays ${division.ageGroup || 'here'}` : null, () =>
            onPick({ key: `team:${team.id}`, label: team.name, kind: 'team', teamId: team.id, note: team.ageGroupId && team.ageGroupId !== division.ageGroupId ? 'plays up' : undefined })
          ))}
          {writable ? option(`＋ New ${division.ageGroup ? `${division.ageGroup} ` : ''}team`, null, () => { setText(`${org.shortName} ${division.ageGroup || division.name}`.trim()); setMode('team'); }, true) : null}
          {option('A place to be filled later', `“${org.shortName} ${division.name} — to be named”`, () => { setText(`${org.shortName} ${division.name} — to be named`); setMode('place'); })}
          {!writable ? <Text className="font-inter text-xs text-ink-muted py-1">Its own admins add its teams; a place to be filled later reserves one for them.</Text> : null}
        </>
      ) : mode === 'team' ? (
        form('Team name', 'Create and tick', createTeam)
      ) : mode === 'place' ? (
        form('What to call it until it is named', 'Add', addPlace)
      ) : writable ? (
        form('Search the roster or type a name', 'Add', addPlayer, (
          <PersonnelAutocomplete
            orgId={org.id}
            value={text}
            onChangeText={t => { setText(t); setPerson(null); }}
            onSelectPerson={p => { setPerson(p); setText(p?.name || ''); }}
            placeholder="Search the roster or type a name…"
          />
        ))
      ) : (
        form('What to call it until it is named', 'Add a place', addPlace)
      )}
    </View>
  );
}
