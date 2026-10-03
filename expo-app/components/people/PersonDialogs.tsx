import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { OrgMember, SocketAction, isValidEmail } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { TEXT_INPUT } from '../formStyles';
import { SegmentedControl } from '../SegmentedControl';
import DatePicker from '../DatePicker';
import { sendAction } from '../../services/actions';
import { isCalendarDate } from '../../utils/dates';
import { cellphoneProblem, formatCellphone, sameCellphone } from '../../utils/phone';

import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
/**
 * The person page's Edit dialogs (docs/people.md). Each saves only its own card's fields, and only
 * the ones that changed; an emptied field is sent as `null`, which clears it. A failed save leaves
 * the dialog open — `sendAction` has already said what went wrong — and the page updates from
 * `org:{id}:members`, not from the reply.
 */

export const ROLE_HELP = 'Admin and Staff can manage this organisation’s people, teams and events. Member is everyone else: players, parents and helpers.';
export const ORG_ID_HELP = 'The number your organisation knows them by, such as a student or staff number. No two people in the organisation can share one.';

export interface OrgRole { id: string; name: string }

/** Admin, Staff, Member — the order they are offered in, most powerful first. */
export function roleOptions(roles: OrgRole[]) {
  const rank = (id: string) => (id === 'role-org-admin' ? 0 : id === 'role-org-staff' ? 1 : 2);
  return [...roles].sort((a, b) => rank(a.id) - rank(b.id)).map(r => ({ key: r.id, label: r.name }));
}

const Problem = ({ text }: { text: string | null }) =>
  text ? <Text className="font-inter text-sm text-danger-ink">{text}</Text> : null;

/** Name, role and org ID — the banner. */
export function IdentityDialog({ member, roles, visible, onClose }: { member: OrgMember; roles: OrgRole[]; visible: boolean; onClose: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [orgIdNumber, setOrgIdNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(member.name || '');
    setRoleId(member.roleId);
    setOrgIdNumber(member.personOrgId || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const profileChanged = name.trim() !== (member.name || '') || orgIdNumber.trim() !== (member.personOrgId || '');
  const roleChanged = roleId !== member.roleId;
  const isDirty = profileChanged || roleChanged;

  const save = async () => {
    setIsSaving(true);
    if (profileChanged) {
      const result = await sendAction(SocketAction.UPDATE_ORG_PROFILE, {
        id: member.id,
        data: { name: name.trim(), identifier: orgIdNumber.trim() || null } as any,
      });
      if (!result.ok) return setIsSaving(false);
    }
    if (roleChanged) {
      const result = await sendAction(SocketAction.UPDATE_ORG_MEMBER, { id: member.membershipId, roleId });
      if (!result.ok) return setIsSaving(false);
    }
    setIsSaving(false);
    onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title="Edit identity"
      onClose={onClose}
      onSave={save}
      saveDisabled={!isDirty || !name.trim()}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <View className="gap-1.5">
        <FieldLabel label="Name" />
        <TextInput value={name} onChangeText={setName} accessibilityLabel="Name" className={TEXT_INPUT} />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="Role" help={ROLE_HELP} />
        <SegmentedControl options={roleOptions(roles)} value={roleId} onChange={setRoleId} isCompact={false} />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="Org ID" help={ORG_ID_HELP} optional />
        <TextInput
          value={orgIdNumber}
          onChangeText={setOrgIdNumber}
          placeholder="e.g. student number"
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel="Org ID"
          className={TEXT_INPUT}
          style={{ maxWidth: 240 }}
        />
      </View>
    </EditDialog>
  );
}

/** Email and cell number. */
export function ContactDialog({ member, visible, onClose }: { member: OrgMember; visible: boolean; onClose: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  const [email, setEmail] = useState('');
  const [cellphone, setCellphone] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEmail(member.email || '');
    // Shown as it is written here; the server stores it in international form.
    setCellphone(formatCellphone(member.cellphone));
    setProblem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const emailChanged = email.trim() !== (member.email || '');
  const cellChanged = !sameCellphone(cellphone, member.cellphone);
  const isDirty = emailChanged || cellChanged;

  const save = async () => {
    if (email.trim() && !isValidEmail(email.trim())) return setProblem('That email is not a valid address.');
    const cellProblem = cellChanged ? cellphoneProblem(cellphone) : null;
    if (cellProblem) return setProblem(cellProblem);
    setProblem(null);
    setIsSaving(true);
    const data: Record<string, string | null> = {};
    if (emailChanged) data.email = email.trim() || null;
    if (cellChanged) data.cellphone = cellphone.trim() || null;
    const result = await sendAction(SocketAction.UPDATE_ORG_PROFILE, { id: member.id, data: data as any });
    setIsSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog visible={visible} title="Edit contact" onClose={onClose} onSave={save} saveDisabled={!isDirty} isSaving={isSaving} isDirty={isDirty}>
      <View className="gap-1.5">
        <FieldLabel label="Email" help="Their own address. A ScoreKeeper invite goes here, and an account with this email is linked to this person." />
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="name@example.com"
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel="Email"
          className={TEXT_INPUT}
        />
      </View>
      <View className="gap-1.5">
        <FieldLabel label="Cell number" />
        <TextInput
          value={cellphone}
          onChangeText={setCellphone}
          keyboardType="phone-pad"
          placeholder="e.g. 082 123 4567"
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel="Cell number"
          className={TEXT_INPUT}
          style={{ maxWidth: 240 }}
        />
      </View>
      <Problem text={problem} />
    </EditDialog>
  );
}

/** Birthdate and national ID. */
export function PersonalDialog({ member, visible, onClose }: { member: OrgMember; visible: boolean; onClose: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  const [birthdate, setBirthdate] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setBirthdate(member.birthdate || '');
    setNationalId(member.nationalId || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const birthdateChanged = birthdate !== (member.birthdate || '');
  const nationalIdChanged = nationalId.trim() !== (member.nationalId || '');
  const isDirty = birthdateChanged || nationalIdChanged;
  // A birthdate half-typed on native's free-text picker is not one yet.
  const birthdateIncomplete = !!birthdate && !isCalendarDate(birthdate);

  const save = async () => {
    setIsSaving(true);
    const data: Record<string, string | null> = {};
    if (birthdateChanged) data.birthdate = birthdate || null;
    if (nationalIdChanged) data.nationalId = nationalId.trim() || null;
    const result = await sendAction(SocketAction.UPDATE_ORG_PROFILE, { id: member.id, data: data as any });
    setIsSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title="Edit personal details"
      onClose={onClose}
      onSave={save}
      saveDisabled={!isDirty || birthdateIncomplete}
      isSaving={isSaving}
      isDirty={isDirty}
    >
      <View className="gap-1.5" style={{ maxWidth: 240 }}>
        <FieldLabel label="Birthdate" help="Decides whether they are a minor in this organisation, by its minor age in Settings." />
        <DatePicker value={birthdate} onChange={setBirthdate} placeholder="Birthdate" />
        {birthdateIncomplete ? <Text className="font-inter text-sm text-danger-ink">Enter the full date, YYYY-MM-DD.</Text> : null}
      </View>
      <View className="gap-1.5">
        <FieldLabel label="National ID" />
        <TextInput
          value={nationalId}
          onChangeText={setNationalId}
          placeholder="ID or passport number"
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          accessibilityLabel="National ID"
          className={TEXT_INPUT}
          style={{ maxWidth: 280 }}
        />
      </View>
    </EditDialog>
  );
}
