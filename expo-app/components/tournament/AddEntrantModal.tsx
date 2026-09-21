import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { OrgBadge, OrgProfile, SocketAction, Sport, Team, TournamentDivision } from '@sk/shared';
import { GlassCard } from '../GlassCard';
import { Button } from '../Button';
import CustomSelect from '../CustomSelect';
import { AgeGroupPicker } from '../AgeGroupPicker';
import { FieldLabel } from '../FieldLabel';
import { PersonnelAutocomplete } from '../PersonnelAutocomplete';
import { sendAction } from '../../services/actions';
import { useActiveTheme } from '../../store/settingsStore';
import { getThemeColor } from '../../constants/Colors';

/**
 * Adding a competitor the tournament does not already offer.
 *
 * One button and one dialog for the three things that used to have none, one, or a corner of the
 * grid each:
 *
 * - **A team that is not on the system.** Discovering that Northcliff have no u16 netball team is
 *   part of entering them, and sending the organiser to the teams screen and back is the friction
 *   that gets a feature abandoned on its first real use. The grid put this in the empty column
 *   under each school — which worked, and only worked because the grid had a column per school.
 * - **A placeholder** (D7) — a competitor with a label and no team, *Winner of the regional
 *   qualifier*, schedulable and printable like any other and resolved later.
 * - **An entrant in an individual sport**, which is a person rather than a team. Those sports get
 *   no candidate list at all, so every entrant arrives through here.
 *
 * **The sport and the organisation are chosen, not fixed.** The old team dialog took both from the
 * division that prompted it and showed them read-only, which was right when it could only be
 * opened from inside a division. A button at the top of the table has no such context, so both are
 * pickers — bounded by the tournament's own sports and organisations, since a team of a sport
 * nobody plays could never be entered — and **pre-filled from whatever the table is filtered by**,
 * which is usually the answer.
 */
export interface AddEntrantModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The acting organisation, from the route — not the one the competitor belongs to. */
  orgId: string;
  /** The tournament's sports, which bound what can be created. */
  sports: Sport[];
  /** The organisations taking part. */
  orgs: OrgBadge[];
  divisions: TournamentDivision[];
  divisionLabel: (division: TournamentDivision) => string;
  /** Pre-fills, from the table's active filter. */
  defaultSportId?: string;
  defaultOrgId?: string;
  defaultDivisionId?: string;
  /** A team was created; the caller appends it to its candidate list. */
  onTeamCreated: (team: Team, divisionId: string | null) => void;
  /** A placeholder or a person, to be written into a division. */
  onEntrantCreated: (
    entrant: { label?: string; orgProfileId?: string; orgId?: string; name: string },
    divisionId: string
  ) => void;
}

type Kind = 'team' | 'person' | 'placeholder';

export function AddEntrantModal({
  isOpen,
  onClose,
  orgId,
  sports,
  orgs,
  divisions,
  divisionLabel,
  defaultSportId,
  defaultOrgId,
  defaultDivisionId,
  onTeamCreated,
  onEntrantCreated,
}: AddEntrantModalProps) {
  const isDark = useActiveTheme() === 'dark';

  const [kind, setKind] = useState<Kind>('team');
  const [sportId, setSportId] = useState('');
  const [entrantOrgId, setEntrantOrgId] = useState('');
  const [name, setName] = useState('');
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState('');
  const [person, setPerson] = useState<OrgProfile | null>(null);
  const [personText, setPersonText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** An individual sport has no teams, so the dialog is about a person instead. */
  const chosenSport = sports.find(s => s.id === sportId);
  const isIndividual = chosenSport?.participantType === 'INDIVIDUAL';

  useEffect(() => {
    if (!isOpen) return;
    const seededSport = defaultSportId || (sports.length === 1 ? sports[0].id : '');
    setKind('team');
    setSportId(seededSport);
    setEntrantOrgId(defaultOrgId || (orgs.length === 1 ? orgs[0].id : ''));
    setDivisionId(defaultDivisionId || '');
    setName('');
    setAgeGroupId(null);
    setPerson(null);
    setPersonText('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultSportId, defaultOrgId, defaultDivisionId]);

  /* The kind follows the sport: choosing an individual sport makes this an entrant dialog. A
     placeholder is the organiser's own choice and is left alone. */
  useEffect(() => {
    if (kind === 'placeholder') return;
    setKind(isIndividual ? 'person' : 'team');
  }, [isIndividual, kind]);

  /** Divisions the thing being added could go into — the sport narrows them. */
  const divisionChoices = divisions.filter(
    division => kind === 'placeholder' || !sportId || division.sportId === sportId
  );

  const canSave = (() => {
    if (kind === 'placeholder') return !!name.trim() && !!divisionId;
    if (kind === 'person') return (!!person || !!personText.trim()) && !!entrantOrgId && !!divisionId;
    return !!name.trim() && !!sportId && !!entrantOrgId;
  })();

  const handleSave = () => {
    if (!canSave) return;
    setError(null);

    if (kind === 'placeholder') {
      onEntrantCreated({ label: name.trim(), name: name.trim() }, divisionId);
      onClose();
      return;
    }

    if (kind === 'person') {
      onEntrantCreated(
        person
          ? { orgProfileId: person.id, orgId: entrantOrgId, name: person.name }
          : // Nobody on the system by that name yet: recorded as a placeholder carrying it, which
            // is exactly what a placeholder is for and avoids creating a half-made person record.
            { label: personText.trim(), name: personText.trim(), orgId: entrantOrgId },
        divisionId
      );
      onClose();
      return;
    }

    setIsSaving(true);
    sendAction(SocketAction.ADD_TEAM, {
      name: name.trim(),
      orgId: entrantOrgId,
      sportId,
      ageGroupId: ageGroupId || undefined,
      isActive: true,
    } as any).then(result => {
      setIsSaving(false);
      // A refusal is already toasted; the dialog stays open with what was typed.
      if (!result.ok) {
        setError(result.message || 'That team could not be created.');
        return;
      }
      onTeamCreated(result.data, divisionId || null);
      onClose();
    });
  };

  const title =
    kind === 'placeholder' ? 'Add a placeholder' : kind === 'person' ? 'Add an entrant' : 'Add a team';

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-center px-6">
        <GlassCard className="w-full max-w-lg self-center border border-slate-200 dark:border-white/10 p-5">
          <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider mb-4">
            {title}
          </Text>

          <ScrollView className="max-h-[420px]" keyboardShouldPersistTaps="handled">
            <View className="space-y-4">
              {/* A placeholder is a different kind of thing, not a different sport, so it is its
                  own choice rather than an option in the sport list. */}
              <View className="flex-row gap-2">
                {(['team', 'placeholder'] as const).map(option => {
                  const label =
                    option === 'team' ? (isIndividual ? 'Entrant' : 'Team') : 'Placeholder';
                  const active = option === 'placeholder' ? kind === 'placeholder' : kind !== 'placeholder';
                  return (
                    <TouchableOpacity
                      key={option}
                      onPress={() => setKind(option === 'placeholder' ? 'placeholder' : isIndividual ? 'person' : 'team')}
                      className={`px-3 py-1.5 rounded-xl border ${
                        active
                          ? 'bg-brand-orange/15 border-brand-orange'
                          : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5'
                      }`}
                    >
                      <Text
                        className={`font-inter text-xs ${
                          active ? 'text-brand-orange font-inter-bold' : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {kind !== 'placeholder' && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Sport"
                    help="Only the tournament's own sports — a team of a sport nobody is playing could never be entered."
                  />
                  <CustomSelect
                    value={sportId}
                    onChange={setSportId}
                    options={sports.map(sport => ({ value: sport.id, label: sport.name }))}
                    placeholder="Choose a sport"
                  />
                </View>
              )}

              {kind !== 'placeholder' && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Organisation"
                    help="The school or club the competitor belongs to, from the organisations taking part."
                  />
                  <CustomSelect
                    value={entrantOrgId}
                    onChange={setEntrantOrgId}
                    options={orgs.map(org => ({ value: org.id, label: `${org.name} (${org.shortName})` }))}
                    placeholder="Choose an organisation"
                    showSearch
                  />
                </View>
              )}

              {kind === 'person' ? (
                <View className="space-y-2">
                  <FieldLabel
                    label="Entrant"
                    help="Somebody on the organisation's roster. A name that is not on the system yet is entered as a placeholder, to be resolved later."
                  />
                  {!!entrantOrgId && (
                    <PersonnelAutocomplete
                      orgId={entrantOrgId}
                      value={personText}
                      onChangeText={text => {
                        setPersonText(text);
                        setPerson(null);
                      }}
                      onSelectPerson={selected => {
                        setPerson(selected);
                        setPersonText(selected?.name || '');
                      }}
                      placeholder="Search the roster or type a name..."
                    />
                  )}
                </View>
              ) : (
                <View className="space-y-2">
                  <FieldLabel
                    label={kind === 'placeholder' ? 'Description' : 'Team name'}
                    help={
                      kind === 'placeholder'
                        ? 'What this competitor will be until it is known — "Winner of the regional qualifier". It can be scheduled and printed like any other, and naming the team later fills in every fixture at once.'
                        : undefined
                    }
                  />
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder={kind === 'placeholder' ? 'Winner of the regional qualifier' : 'e.g. U16A'}
                    placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                  />
                </View>
              )}

              {kind === 'team' && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Age group"
                    optional
                    help="From the sport's own list. It is what decides which divisions the team qualifies for."
                  />
                  <AgeGroupPicker
                    sportId={sportId}
                    ageGroups={chosenSport?.ageGroups}
                    value={ageGroupId}
                    onChange={groupId => setAgeGroupId(groupId)}
                    noneLabel="Any age"
                    orgId={orgId}
                    variant="dropdown"
                  />
                </View>
              )}

              <View className="space-y-2">
                <FieldLabel
                  label="Division"
                  optional={kind === 'team'}
                  help={
                    kind === 'team'
                      ? 'Enter the team straight away, or leave this and tick it in the table afterwards.'
                      : 'Which division this competitor is entered into.'
                  }
                />
                <CustomSelect
                  value={divisionId}
                  onChange={setDivisionId}
                  options={divisionChoices.map(division => ({
                    value: division.id,
                    label: divisionLabel(division),
                  }))}
                  placeholder={kind === 'team' ? 'Not yet' : 'Choose a division'}
                  clearable={kind === 'team'}
                />
              </View>

              {!!error && <Text className="font-inter text-xs text-brand-red">{error}</Text>}
            </View>
          </ScrollView>

          <View className="flex-row gap-3 pt-5">
            <Button title="Cancel" variant="secondary" onPress={onClose} className="flex-1" />
            <Button
              title={isSaving ? 'Adding...' : 'Add'}
              onPress={handleSave}
              disabled={!canSave || isSaving}
              className="flex-1"
            />
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}
