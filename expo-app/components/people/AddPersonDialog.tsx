import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { OrgProfile, SocketAction, isValidEmail } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import { SegmentedControl } from '../SegmentedControl';
import DatePicker from '../DatePicker';
import { PersonnelAutocomplete } from '../PersonnelAutocomplete';
import { GuardianBlock } from '../guardians/GuardianBlock';
import {
  GuardianDraft,
  emptyGuardianDraft,
  guardianDraftProblem,
  isGuardianDraftStarted,
  saveGuardianDraft,
} from '../guardians/guardianDraft';
import { useOrgMinorsSettings } from '../../hooks/useOrgMinorsSettings';
import { useRequestScope } from '../../hooks/useRequestScope';
import { requestKeyFor, sendAction } from '../../services/actions';
import { wsService } from '../../services/websocket';
import { isCalendarDate } from '../../utils/dates';
import { cellphoneProblem, formatCellphone } from '../../utils/phone';
import { ORG_ID_HELP, OrgRole, ROLE_HELP, roleOptions } from './PersonDialogs';

const MEMBER_ROLE = 'role-org-member';

const emptyPerson = () => ({ name: '', email: '', cellphone: '', birthdate: '', personOrgId: '', roleId: MEMBER_ROLE });

/**
 * Add someone to the organisation, from the People list (docs/people.md). Only what is needed to
 * find and reach them; a photo and national ID are added from their page afterwards.
 *
 * The name field searches people already on record in the organisation; picking one adds *that*
 * person rather than a copy. Up to three writes — the profile, the membership, an optional guardian
 * — under one request scope kept across retries (SYNC-3), so a retry after a later step fails
 * re-sends the earlier ones (answered from the first attempt) and tries only the failed one again.
 * The dialog stays open on any failure, with what failed said inside it.
 */
export function AddPersonDialog({ orgId, roles, visible, onClose }: { orgId: string; roles: OrgRole[]; visible: boolean; onClose: () => void }) {
  const [person, setPerson] = useState(emptyPerson);
  const [selected, setSelected] = useState<OrgProfile | null>(null);
  const [guardianDraft, setGuardianDraft] = useState<GuardianDraft>(emptyGuardianDraft);
  const [guardianOpen, setGuardianOpen] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scope = useRequestScope();
  const { settings: minorsSettings } = useOrgMinorsSettings(orgId);

  useEffect(() => {
    if (!visible) return;
    setPerson(emptyPerson());
    setSelected(null);
    setGuardianDraft(emptyGuardianDraft());
    setGuardianOpen(null);
    setError(null);
    scope.renew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const set = (patch: Partial<ReturnType<typeof emptyPerson>>) => setPerson(prev => ({ ...prev, ...patch }));
  const isDirty = !!(person.name.trim() || person.email.trim() || person.cellphone.trim() || person.birthdate || person.personOrgId.trim()
    || person.roleId !== MEMBER_ROLE || isGuardianDraftStarted(guardianDraft));

  const pick = (profile: OrgProfile | null) => {
    setSelected(profile);
    if (!profile) return;
    setPerson(prev => ({
      ...prev,
      name: profile.name,
      email: profile.email || prev.email,
      cellphone: formatCellphone(profile.cellphone) || prev.cellphone,
      birthdate: profile.birthdate || prev.birthdate,
      personOrgId: profile.identifier || prev.personOrgId,
    }));
  };

  const save = async () => {
    if (person.email.trim() && !isValidEmail(person.email.trim())) return setError('That email is not a valid address.');
    const phone = cellphoneProblem(person.cellphone);
    if (phone) return setError(phone);
    if (person.birthdate && !isCalendarDate(person.birthdate)) return setError('Enter the full birthdate, YYYY-MM-DD.');
    const withGuardian = isGuardianDraftStarted(guardianDraft);
    const guardianProblem = withGuardian ? guardianDraftProblem(guardianDraft) : null;
    if (guardianProblem) return setError(guardianProblem);

    setIsSaving(true);
    setError(null);
    try {
      let profileId = selected?.id;
      const details = {
        email: person.email.trim() || undefined,
        cellphone: person.cellphone.trim() || undefined,
        birthdate: person.birthdate || undefined,
        identifier: person.personOrgId.trim() || undefined,
      };

      if (!profileId) {
        // Someone matching on email, or name and birthdate, is already on record: add them, not a copy.
        const match: any = await new Promise(resolve => {
          wsService.emit('get_data', {
            type: 'find_matching_user',
            email: details.email,
            name: person.name.trim(),
            birthdate: details.birthdate,
          }, (res: any) => resolve(res));
        });
        // The new profile's id comes from the request scope, so every retry sends the same one.
        const payload = { id: match?.id || `profile-${scope.current()}`, orgId, name: person.name.trim(), ...details };
        const created = await sendAction(SocketAction.ADD_ORG_PROFILE, payload, {
          suppressToast: true,
          requestId: requestKeyFor(scope.current(), SocketAction.ADD_ORG_PROFILE, payload),
        });
        if (!created.ok) throw new Error(`They were not added: ${created.message}`);
        profileId = created.data.id;
      } else {
        const updated = await sendAction(SocketAction.UPDATE_ORG_PROFILE, { id: profileId, data: details }, { suppressToast: true });
        if (!updated.ok) throw new Error(`Their details were not saved: ${updated.message}`);
      }

      const membership = { orgProfileId: profileId!, orgId, roleId: person.roleId };
      const joined = await sendAction(SocketAction.ADD_ORG_MEMBER, membership, {
        suppressToast: true,
        requestId: requestKeyFor(scope.current(), SocketAction.ADD_ORG_MEMBER, membership),
      });
      if (!joined.ok) throw new Error(`They were not added to the organisation: ${joined.message}`);

      // The guardian last, so a retry after it fails tries only the guardian again.
      if (withGuardian) {
        const guardian = await saveGuardianDraft(orgId, profileId!, guardianDraft, scope.current(), { quiet: true });
        if (!guardian.ok) {
          throw new Error(`${person.name.trim()} was added, but ${guardian.message.charAt(0).toLowerCase()}${guardian.message.slice(1)} Press Add person again to retry the guardian.`);
        }
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'They could not be added.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <EditDialog
      visible={visible}
      title="Add person"
      onClose={onClose}
      onSave={save}
      saveLabel="Add person"
      saveDisabled={!person.name.trim()}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <View className="gap-1.5" style={{ zIndex: 50 }}>
        <FieldLabel label="Name" required />
        <PersonnelAutocomplete
          orgId={orgId}
          value={person.name}
          placeholder="Search the organisation, or type a new name"
          onChangeText={name => { set({ name }); if (selected) setSelected(null); }}
          onSelectPerson={pick}
        />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="Role" help={ROLE_HELP} />
        <SegmentedControl options={roleOptions(roles)} value={person.roleId} onChange={roleId => set({ roleId })} isCompact={false} />
      </View>
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-1 gap-1.5" style={{ minWidth: 200 }}>
          <FieldLabel label="Email" />
          <TextInput
            value={person.email}
            onChangeText={email => set({ email })}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="name@example.com"
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Email"
            className={TEXT_INPUT}
          />
        </View>
        <View className="flex-1 gap-1.5" style={{ minWidth: 160 }}>
          <FieldLabel label="Cell number" />
          <TextInput
            value={person.cellphone}
            onChangeText={cellphone => set({ cellphone })}
            keyboardType="phone-pad"
            placeholder="e.g. 082 123 4567"
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Cell number"
            className={TEXT_INPUT}
          />
        </View>
      </View>
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-1 gap-1.5" style={{ minWidth: 160 }}>
          <FieldLabel label="Birthdate" help="Decides whether they are a minor in this organisation, by its minor age in Settings." />
          <DatePicker value={person.birthdate} onChange={birthdate => set({ birthdate })} placeholder="Birthdate" />
        </View>
        <View className="flex-1 gap-1.5" style={{ minWidth: 160 }}>
          <FieldLabel label="Org ID" help={ORG_ID_HELP} />
          <TextInput
            value={person.personOrgId}
            onChangeText={personOrgId => set({ personOrgId })}
            placeholder="e.g. student number"
            placeholderTextColor="#94A3B8"
            accessibilityLabel="Org ID"
            className={TEXT_INPUT}
          />
        </View>
      </View>
      <GuardianBlock
        orgId={orgId}
        draft={guardianDraft}
        onChange={setGuardianDraft}
        open={guardianOpen}
        onOpenChange={setGuardianOpen}
        birthdate={person.birthdate}
        settings={minorsSettings}
        playerProfileId={selected?.id}
      />
      <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">
        A photo and national ID can be added from their page once they are added.
      </Text>
      {error ? <Text className="font-inter text-sm text-red-600 dark:text-red-400">{error}</Text> : null}
    </EditDialog>
  );
}
