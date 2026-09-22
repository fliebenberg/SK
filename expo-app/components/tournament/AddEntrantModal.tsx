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
import { useAuthStore } from '../../store/authStore';
import { useActiveTheme } from '../../store/settingsStore';
import { getThemeColor } from '../../constants/Colors';

/**
 * Adding a competitor the tournament does not already offer.
 *
 * One button and one dialog for everything the table cannot produce on its own: a team that is not
 * on the system, a person in an individual sport, and a placeholder. The sport and organisation are
 * pickers bounded by the tournament's own, pre-filled from the table's filters.
 *
 * **Whose records this may write is settled by one rule (2026-09-21).** You may create a team or a
 * person in an organisation you run — or in one **nobody has claimed yet**, with only the minimum
 * (a team's name, sport and age group; a person's name), because nobody else can and an outsider
 * doing it is a reason for somebody from that school to claim it. A **claimed** school you do not
 * run is its own admins' to fill in, so for one of those the dialog offers what you *can* do — an
 * org-linked placeholder, which reserves the slot in the school's name for them to fill — rather
 * than a form the server would refuse. The server holds the same line in `orgGate` and
 * `profileGate`; this is so the refusal never has to happen.
 *
 * **A placeholder is one of two kinds, not one kind with an optional field.** A *generic* one is a
 * competitor nobody can name yet — *Winner of the regional qualifier* — and has no organisation
 * because none is known. An *org-linked* one is a slot that belongs to a school — *Northcliff's
 * second team, TBC* — and has one by definition.
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
  /** A person or a placeholder, to be written into a division. */
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
  const user = useAuthStore((state: any) => state.user);
  const memberships = useAuthStore((state: any) => state.orgMemberships) || [];

  const [kind, setKind] = useState<Kind>('team');
  /** For a placeholder: does it belong to a school, or to nobody yet? */
  const [placeholderForOrg, setPlaceholderForOrg] = useState(false);
  const [sportId, setSportId] = useState('');
  const [entrantOrgId, setEntrantOrgId] = useState('');
  const [name, setName] = useState('');
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState('');
  const [person, setPerson] = useState<OrgProfile | null>(null);
  const [personText, setPersonText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenSport = sports.find(s => s.id === sportId);
  const isIndividual = chosenSport?.participantType === 'INDIVIDUAL';
  const chosenOrg = orgs.find(o => o.id === entrantOrgId);

  /**
   * May this user create a team or a person in that organisation — the same question `orgGate`
   * answers, asked early so the dialog can offer the alternative instead of a refusal.
   *
   * `isClaimed` is trusted only when it says *false*. An older payload without the field is treated
   * as claimed, which errs towards offering a placeholder rather than a form that would be refused.
   */
  const canWriteInto = (id: string) => {
    const org = orgs.find(o => o.id === id);
    if (!org) return false;
    if (id === orgId || user?.globalRole === 'admin') return true;
    const runsIt = memberships.some(
      (m: any) =>
        m.orgId === id &&
        (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff') &&
        (!m.endDate || new Date(m.endDate) > new Date())
    );
    return runsIt || org.isClaimed === false;
  };

  const writable = !!entrantOrgId && canWriteInto(entrantOrgId);
  /** An organisation you neither run nor may fill in on its behalf — only a placeholder is open. */
  const claimedByOthers = !!entrantOrgId && !writable;

  useEffect(() => {
    if (!isOpen) return;
    setKind('team');
    setPlaceholderForOrg(false);
    setSportId(defaultSportId || (sports.length === 1 ? sports[0].id : ''));
    setEntrantOrgId(defaultOrgId || (orgs.length === 1 ? orgs[0].id : ''));
    setDivisionId(defaultDivisionId || '');
    setName('');
    setAgeGroupId(null);
    setPerson(null);
    setPersonText('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultSportId, defaultOrgId, defaultDivisionId]);

  /* The kind follows the sport: an individual sport makes this about a person. A placeholder is the
     organiser's own choice and is left alone. */
  useEffect(() => {
    if (kind === 'placeholder') return;
    setKind(isIndividual ? 'person' : 'team');
  }, [isIndividual, kind]);

  /** Switch to an org-linked placeholder for the school that could not be written into. */
  const offerPlaceholder = () => {
    setKind('placeholder');
    setPlaceholderForOrg(true);
    if (!name.trim() && personText.trim()) setName(personText.trim());
  };

  const divisionChoices = divisions.filter(
    division => kind === 'placeholder' || !sportId || division.sportId === sportId
  );

  const canSave = (() => {
    if (kind === 'placeholder') {
      return !!name.trim() && !!divisionId && (!placeholderForOrg || !!entrantOrgId);
    }
    if (claimedByOthers) return false;
    if (kind === 'person') return (!!person || !!personText.trim()) && !!entrantOrgId && !!divisionId;
    return !!name.trim() && !!sportId && !!entrantOrgId;
  })();

  const handleSave = async () => {
    if (!canSave) return;
    setError(null);

    if (kind === 'placeholder') {
      onEntrantCreated(
        {
          label: name.trim(),
          name: name.trim(),
          orgId: placeholderForOrg ? entrantOrgId : undefined,
        },
        divisionId
      );
      onClose();
      return;
    }

    if (kind === 'person') {
      if (person) {
        onEntrantCreated({ orgProfileId: person.id, orgId: entrantOrgId, name: person.name }, divisionId);
        onClose();
        return;
      }
      // Somebody not on the organisation's roster yet: create them, with a name and nothing more.
      setIsSaving(true);
      const created = await sendAction(SocketAction.ADD_ORG_PROFILE, {
        name: personText.trim(),
        orgId: entrantOrgId,
      } as any);
      setIsSaving(false);
      if (!created.ok) {
        setError(created.message || 'That person could not be added.');
        return;
      }
      onEntrantCreated(
        { orgProfileId: created.data.id, orgId: entrantOrgId, name: personText.trim() },
        divisionId
      );
      onClose();
      return;
    }

    setIsSaving(true);
    const result = await sendAction(SocketAction.ADD_TEAM, {
      name: name.trim(),
      orgId: entrantOrgId,
      sportId,
      ageGroupId: ageGroupId || undefined,
      isActive: true,
    } as any);
    setIsSaving(false);
    // A refusal is already toasted; the dialog stays open with what was typed.
    if (!result.ok) {
      setError(result.message || 'That team could not be created.');
      return;
    }
    onTeamCreated(result.data, divisionId || null);
    onClose();
  };

  const title =
    kind === 'placeholder' ? 'Add a placeholder' : kind === 'person' ? 'Add an entrant' : 'Add a team';

  const chip = (active: boolean, label: string, onPress: () => void, key: string) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
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

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-950/75 justify-center px-6">
        <GlassCard
          className="w-full max-w-lg self-center border border-slate-200 dark:border-white/10 p-5 shadow-lg"
          style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
        >
          <Text className="font-orbitron-bold text-base text-slate-800 dark:text-white uppercase tracking-wider mb-4">
            {title}
          </Text>

          <ScrollView className="max-h-[440px]" keyboardShouldPersistTaps="handled">
            <View className="space-y-4">
              <View className="flex-row gap-2">
                {chip(kind !== 'placeholder', isIndividual ? 'Entrant' : 'Team', () =>
                  setKind(isIndividual ? 'person' : 'team'), 'real')}
                {chip(kind === 'placeholder', 'Placeholder', () => setKind('placeholder'), 'placeholder')}
              </View>

              {kind === 'placeholder' && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Belongs to"
                    help="An open placeholder is a competitor nobody can name yet, like the winner of a qualifier. A placeholder for an organisation reserves a place in that school's name, for them to fill in."
                  />
                  <View className="flex-row gap-2">
                    {chip(!placeholderForOrg, 'Nobody yet', () => setPlaceholderForOrg(false), 'open')}
                    {chip(placeholderForOrg, 'An organisation', () => setPlaceholderForOrg(true), 'org')}
                  </View>
                </View>
              )}

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

              {(kind !== 'placeholder' || placeholderForOrg) && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Organisation"
                    help="The school or club this belongs to, from the organisations taking part."
                  />
                  <CustomSelect
                    value={entrantOrgId}
                    onChange={setEntrantOrgId}
                    options={orgs.map(org => ({
                      value: org.id,
                      label: `${org.name} (${org.shortName})`,
                      description: org.isClaimed === false ? 'Not yet claimed' : undefined,
                    }))}
                    placeholder="Choose an organisation"
                    showSearch
                  />
                </View>
              )}

              {/*
                A claimed school you do not run. Said, not refused — and with the one thing you can do
                offered in the same breath, because "you can't" without "but you can" is a dead end.
              */}
              {kind !== 'placeholder' && claimedByOthers && (
                <View className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3 space-y-2">
                  <Text className="font-inter text-xs text-slate-700 dark:text-slate-300">
                    {chosenOrg?.name} is run by its own admins, so their {isIndividual ? 'people' : 'teams'} are
                    theirs to add. You can reserve a place for them instead, and they fill it in.
                  </Text>
                  <TouchableOpacity onPress={offerPlaceholder} className="active:opacity-80">
                    <Text className="font-inter-bold text-[11px] text-brand-orange uppercase tracking-wider">
                      Add a placeholder for {chosenOrg?.shortName}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {kind !== 'placeholder' && !claimedByOthers && chosenOrg && chosenOrg.id !== orgId && chosenOrg.isClaimed === false && (
                <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
                  {chosenOrg.name} has not been claimed yet, so you can add the basics for them. Whoever
                  claims it can fill in the rest.
                </Text>
              )}

              {kind === 'person' && !claimedByOthers && (
                <View className="space-y-2">
                  <FieldLabel
                    label="Entrant"
                    help="Somebody on the organisation's roster, or a new name — which adds them to the organisation with that name alone."
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
              )}

              {(kind === 'placeholder' || (kind === 'team' && !claimedByOthers)) && (
                <View className="space-y-2">
                  <FieldLabel
                    label={kind === 'placeholder' ? 'Description' : 'Team name'}
                    help={
                      kind === 'placeholder'
                        ? 'What this competitor is until it is known. It can be scheduled and printed like any other, and naming it later fills in every fixture at once.'
                        : undefined
                    }
                  />
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder={
                      kind !== 'placeholder'
                        ? 'e.g. U16A'
                        : placeholderForOrg
                          ? `${chosenOrg?.shortName || 'School'} second team`
                          : 'Winner of the regional qualifier'
                    }
                    placeholderTextColor={getThemeColor(isDark, 'placeholder')}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 font-inter text-sm text-slate-800 dark:text-white"
                  />
                </View>
              )}

              {kind === 'team' && !claimedByOthers && (
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

              {!(kind !== 'placeholder' && claimedByOthers) && (
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
              )}

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
