import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgMember, OrgMinorsSettings, ProfileGuardian, SocketAction, Sport, Team, TeamMember } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import { SegmentedControl } from '../SegmentedControl';
import CustomSelect from '../CustomSelect';
import { AgeGroupPicker } from '../AgeGroupPicker';
import { guardianshipOf } from '../people/PersonBits';
import { useRequestScope } from '../../hooks/useRequestScope';
import { requestKeyFor, sendAction } from '../../services/actions';
import { COLORS } from '../../constants/Colors';
import { PLAYER_ROLE } from './TeamBits';

export interface TeamRole {
  id: string;
  name: string;
}

const SHORT_NAME_HELP = 'A few letters shown on the team\'s crest and where there is no room for the full name, like U13A.';

/* ------------------------------------------------------------------------------------------------
 * Add team / Edit team
 * --------------------------------------------------------------------------------------------- */

/**
 * The team's name, short name, sport and age group — Add team on the list, and the banner's Edit
 * on the team page (docs/teams.md). Everything is required except the short name, so only that is
 * marked, as Optional (design_system.md rule 17).
 *
 * The sport is a segmented control for two to four sports, a dropdown beyond that, and is left out
 * when a new team can only be one sport. An age group belongs to one sport, so changing the sport
 * clears it — and says so next to the field at that moment (rule 11).
 */
export function TeamDetailsDialog({ visible, onClose, orgId, supportedSportIds, sports, team, onAdded }: {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  supportedSportIds?: string[];
  sports: Sport[];
  /** The team being edited; absent to add one. */
  team?: Team | null;
  /** After a new team is saved — the list opens it. */
  onAdded?: (team: Team) => void;
}) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [sportId, setSportId] = useState('');
  const [ageGroupId, setAgeGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // The org's sports, and the team's own sport even if the org has since stopped playing it.
  const choices = useMemo(() => {
    const supported = supportedSportIds?.length ? sports.filter(s => supportedSportIds.includes(s.id)) : sports;
    const own = team ? sports.find(s => s.id === team.sportId) : undefined;
    return own && !supported.some(s => s.id === own.id) ? [...supported, own] : supported;
  }, [sports, supportedSportIds, team]);

  useEffect(() => {
    if (!visible) return;
    setName(team?.name || '');
    setShortName(team?.shortName || '');
    setSportId(team?.sportId || (choices.length === 1 ? choices[0].id : ''));
    setAgeGroupId(team?.ageGroupId || null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, team?.id]);

  const sport = sports.find(s => s.id === sportId);
  const chooseSport = (next: string) => {
    if (next !== sportId) setAgeGroupId(null);
    setSportId(next);
  };

  const isDirty = team
    ? name.trim() !== team.name || shortName.trim() !== (team.shortName || '') || sportId !== team.sportId || ageGroupId !== (team.ageGroupId || null)
    : !!(name.trim() || shortName.trim() || ageGroupId || (sportId && choices.length > 1));
  // Said only while the sport differs from the team's and no new age group is chosen yet.
  const clearedAgeGroup = team && team.ageGroup && sportId !== team.sportId && !ageGroupId ? team.ageGroup : null;

  const save = async () => {
    setError(null);
    setIsSaving(true);
    if (!team) {
      const result = await sendAction(SocketAction.ADD_TEAM, {
        name: name.trim(),
        shortName: shortName.trim() || undefined,
        sportId,
        ageGroupId,
        orgId,
      } as any, { suppressToast: true });
      setIsSaving(false);
      if (!result.ok) return setError(result.message || 'The team was not added.');
      onClose();
      onAdded?.(result.data);
      return;
    }
    // Only what changed; an emptied short name goes as null, which clears it.
    const data: Partial<Team> = {};
    if (name.trim() !== team.name) data.name = name.trim();
    if (shortName.trim() !== (team.shortName || '')) data.shortName = shortName.trim() || null;
    if (sportId !== team.sportId) data.sportId = sportId;
    if (ageGroupId !== (team.ageGroupId || null)) data.ageGroupId = ageGroupId;
    if (!Object.keys(data).length) {
      setIsSaving(false);
      return onClose();
    }
    const result = await sendAction(SocketAction.UPDATE_TEAM, { id: team.id, data }, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) return setError(result.message || 'The changes were not saved.');
    onClose();
  };

  const showSport = !!team || choices.length !== 1;
  return (
    <EditDialog
      visible={visible}
      title={team ? 'Edit team' : 'Add team'}
      onClose={onClose}
      onSave={save}
      saveLabel={team ? 'Save' : 'Add team'}
      saveDisabled={!name.trim() || !sportId || !ageGroupId}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      {/* One above the other at every width: side by side, "Short name", Optional and its help
          icon did not fit the narrower column and the label wrapped. */}
      <View className="gap-4">
        <View className="gap-1.5">
          <FieldLabel label="Name" />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Under 13 A, First XV"
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Name"
            className={TEXT_INPUT}
          />
        </View>
        <View className="gap-1.5">
          <FieldLabel label="Short name" optional help={SHORT_NAME_HELP} />
          <TextInput
            value={shortName}
            onChangeText={setShortName}
            placeholder="e.g. U13A"
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Short name"
            autoCapitalize="characters"
            className={TEXT_INPUT}
            style={{ maxWidth: 240 }}
          />
        </View>
      </View>

      {showSport ? (
        <View className="gap-1.5">
          <FieldLabel label="Sport" />
          {choices.length >= 2 && choices.length <= 4 ? (
            <View className="flex-row">
              <SegmentedControl
                options={choices.map(s => ({ key: s.id, label: s.name }))}
                value={sportId}
                onChange={chooseSport}
                isCompact={false}
              />
            </View>
          ) : choices.length ? (
            <CustomSelect
              value={sportId}
              onChange={chooseSport}
              options={choices.map(s => ({ value: s.id, label: s.name }))}
              placeholder="Choose a sport"
            />
          ) : (
            <Text className="font-inter text-sm text-amber-900 dark:text-amber-300">
              This organisation plays no sports yet. Choose them in Settings first.
            </Text>
          )}
          {clearedAgeGroup ? (
            <Text className="font-inter text-sm text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-400/10 rounded-lg px-3 py-2">
              Age groups belong to a sport, so {clearedAgeGroup} was cleared. Choose {sport ? `a ${sport.name}` : 'an'} age group.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="gap-1.5" style={{ zIndex: 10 }}>
        <FieldLabel label="Age group" />
        {sportId ? (
          <AgeGroupPicker
            variant="dropdown"
            sportId={sportId}
            ageGroups={sport?.ageGroups}
            value={ageGroupId}
            onChange={setAgeGroupId}
            orgId={orgId}
          />
        ) : (
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">Choose the sport first.</Text>
        )}
      </View>

      {!team ? (
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
          Add players and staff from the team's page once it is created.
        </Text>
      ) : null}
      {error ? <Text className="font-inter text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
    </EditDialog>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Add players
 * --------------------------------------------------------------------------------------------- */

const PICK_LIMIT = 60;

/**
 * Add players from the organisation's people, several at once — a squad is fifteen and more, and
 * one dialog per player was the old way (docs/teams.md). Someone already a player on this team is
 * shown greyed out; a minor or dependant says so. Someone not in the organisation yet is added
 * through the People page's Add person dialog (`onAddNew`), which then puts them on this team.
 *
 * One `ADD_TEAM_MEMBER` per person, in turn, under one request scope kept across retries. A failure
 * stops there and says who was not added; everyone before them is on the team already, so they
 * leave the selection and Add tries only the rest again.
 */
export function AddPlayersDialog({ visible, onClose, teamId, members, playerProfileIds, minorsSettings, guardiansByPlayer, onAddNew }: {
  visible: boolean;
  onClose: () => void;
  teamId: string;
  members: OrgMember[];
  /** Profiles already playing for this team. */
  playerProfileIds: Set<string>;
  minorsSettings: OrgMinorsSettings;
  guardiansByPlayer: Map<string, ProfileGuardian[]>;
  onAddNew: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OrgMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scope = useRequestScope();

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSelected([]);
    setError(null);
    scope.renew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter(m => !q || m.name.toLowerCase().includes(q) || (m.personOrgId || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, query]);

  const isSelected = (m: OrgMember) => selected.some(s => s.id === m.id);
  const toggle = (m: OrgMember) => setSelected(prev => (isSelected(m) ? prev.filter(s => s.id !== m.id) : [...prev, m]));

  const save = async () => {
    setIsSaving(true);
    setError(null);
    const added: string[] = [];
    for (const person of selected) {
      const payload = { orgProfileId: person.id, teamId, roleId: PLAYER_ROLE };
      const result = await sendAction(SocketAction.ADD_TEAM_MEMBER, payload, {
        suppressToast: true,
        requestId: requestKeyFor(scope.current(), SocketAction.ADD_TEAM_MEMBER, payload),
      });
      if (!result.ok) {
        setSelected(prev => prev.filter(s => !added.includes(s.id)));
        setError(`${person.name} was not added: ${result.message}${added.length ? ` ${added.length} added before that.` : ''}`);
        setIsSaving(false);
        return;
      }
      added.push(person.id);
    }
    setIsSaving(false);
    onClose();
  };

  const count = selected.length;
  return (
    <EditDialog
      visible={visible}
      title="Add players"
      onClose={onClose}
      onSave={save}
      saveLabel={count > 1 ? `Add ${count} players` : 'Add player'}
      saveDisabled={count === 0}
      isSaving={isSaving}
      isDirty={count > 0}
      footerLeft={count ? <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 self-center">{count} selected</Text> : undefined}
    >
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name or org ID"
        placeholderTextColor="#94A3B8"
        accessibilityLabel="Search the organisation's people"
        className={TEXT_INPUT}
      />
      {count ? (
        <View className="flex-row flex-wrap gap-1.5">
          {selected.map(m => (
            <TouchableOpacity
              key={m.id}
              onPress={() => toggle(m)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${m.name} from the selection`}
              className="flex-row items-center gap-1 rounded-full px-2.5 py-1 bg-orange-50 dark:bg-brand-orange/10"
            >
              <Text className="font-inter-semibold text-xs text-orange-900 dark:text-orange-300">{m.name}</Text>
              <Ionicons name="close" size={12} color={COLORS.brand.orange} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <View className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
        <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {matches.slice(0, PICK_LIMIT).map((m, i) => {
            const onTeam = playerProfileIds.has(m.id);
            const on = isSelected(m);
            const kind = guardianshipOf(m.birthdate, minorsSettings, !!guardiansByPlayer.get(m.id)?.length);
            const sub = [kind === 'minor' ? 'Minor' : kind === 'dependant' ? 'Dependant' : null, m.personOrgId].filter(Boolean).join(' · ');
            return (
              <TouchableOpacity
                key={m.id}
                onPress={() => toggle(m)}
                disabled={onTeam}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: onTeam }}
                className={`flex-row items-center gap-3 px-3 py-2 ${i ? 'border-t border-slate-100 dark:border-white/5' : ''}`}
              >
                <View
                  className={`w-[18px] h-[18px] rounded-[5px] border items-center justify-center ${
                    on ? 'bg-brand-orange border-brand-orange' : onTeam ? 'border-slate-200 dark:border-white/10' : 'border-slate-400 dark:border-slate-500'
                  }`}
                >
                  {on ? <Ionicons name="checkmark" size={13} color="white" /> : null}
                </View>
                <View className="flex-1 min-w-0">
                  <Text className={`font-inter text-sm ${onTeam ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-white'}`} numberOfLines={1}>
                    {m.name}
                  </Text>
                  {sub ? <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">{sub}</Text> : null}
                </View>
                {onTeam ? <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">On this team</Text> : null}
              </TouchableOpacity>
            );
          })}
          {matches.length === 0 ? (
            <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 px-3 py-4">Nobody in the organisation matches.</Text>
          ) : matches.length > PICK_LIMIT ? (
            <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 px-3 py-2.5 border-t border-slate-100 dark:border-white/5">
              {matches.length - PICK_LIMIT} more. Type a name to narrow the list.
            </Text>
          ) : null}
        </ScrollView>
      </View>
      <TouchableOpacity onPress={onAddNew} accessibilityRole="button" className="self-start">
        <Text className="font-inter-bold text-sm text-orange-700 dark:text-brand-orange">＋ Someone new to the organisation</Text>
      </TouchableOpacity>
      {error ? <Text className="font-inter text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
    </EditDialog>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Add staff, change a staff member's role
 * --------------------------------------------------------------------------------------------- */

/** Coach first; the six staff roles are a dropdown (design_system.md rule 2). */
function staffRoleOptions(roles: TeamRole[]) {
  return roles.filter(r => r.id !== PLAYER_ROLE).map(r => ({ value: r.id, label: r.name }));
}

/** One person from the organisation and their role on this team. */
export function AddStaffDialog({ visible, onClose, teamId, members, staffProfileIds, roles, onAddNew }: {
  visible: boolean;
  onClose: () => void;
  teamId: string;
  members: OrgMember[];
  /** Profiles already on this team's staff. */
  staffProfileIds: Set<string>;
  roles: TeamRole[];
  /** Someone not in the organisation yet, in the role chosen so far. */
  onAddNew: (roleId: string) => void;
}) {
  const [profileId, setProfileId] = useState('');
  const [roleId, setRoleId] = useState('role-coach');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setProfileId('');
    setRoleId('role-coach');
    setError(null);
  }, [visible]);

  const people = useMemo(
    () => members
      .filter(m => !staffProfileIds.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => ({ value: m.id, label: m.name, description: m.personOrgId || undefined })),
    [members, staffProfileIds]
  );

  const save = async () => {
    setIsSaving(true);
    setError(null);
    const result = await sendAction(SocketAction.ADD_TEAM_MEMBER, { orgProfileId: profileId, teamId, roleId }, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) return setError(result.message || 'They were not added.');
    onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title="Add staff"
      onClose={onClose}
      onSave={save}
      saveLabel="Add"
      saveDisabled={!profileId || !roleId}
      isSaving={isSaving}
      isDirty={!!profileId}
    >
      <View className="gap-1.5">
        <FieldLabel label="Person" />
        <CustomSelect
          value={profileId}
          onChange={setProfileId}
          options={people}
          placeholder="Choose from the organisation's people"
          showSearch
          searchPlaceholder="Search by name"
        />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="Role on this team" />
        <CustomSelect value={roleId} onChange={setRoleId} options={staffRoleOptions(roles)} />
      </View>
      <TouchableOpacity onPress={() => onAddNew(roleId)} accessibilityRole="button" className="self-start">
        <Text className="font-inter-bold text-sm text-orange-700 dark:text-brand-orange">＋ Someone new to the organisation</Text>
      </TouchableOpacity>
      {error ? <Text className="font-inter text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
    </EditDialog>
  );
}

export function ChangeRoleDialog({ member, roles, onClose }: { member: TeamMember | null; roles: TeamRole[]; onClose: () => void }) {
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!member) return;
    setRoleId(member.roleId);
    setError(null);
  }, [member]);

  const save = async () => {
    if (!member || roleId === member.roleId) return onClose();
    setIsSaving(true);
    setError(null);
    const result = await sendAction(SocketAction.UPDATE_TEAM_MEMBER, { id: member.membershipId, data: { roleId } }, { suppressToast: true });
    setIsSaving(false);
    if (!result.ok) return setError(result.message || 'The role was not changed.');
    onClose();
  };

  return (
    <EditDialog
      visible={!!member}
      title={member ? `${member.name}'s role` : 'Role'}
      onClose={onClose}
      onSave={save}
      isSaving={isSaving}
      isDirty={!!member && roleId !== member.roleId}
    >
      <View className="gap-1.5">
        <FieldLabel label="Role on this team" />
        <CustomSelect value={roleId} onChange={setRoleId} options={staffRoleOptions(roles)} />
      </View>
      {error ? <Text className="font-inter text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
    </EditDialog>
  );
}
