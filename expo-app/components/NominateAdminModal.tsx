import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgClaimStatus, OrgProfile, isValidEmail } from '@sk/shared';
import { Button } from './Button';
import { PersonnelAutocomplete } from './PersonnelAutocomplete';
import { nominateOrgContact, takeOrgAdmin, NominationOutcome, NominationAnswered } from '../services/nominations';
import { useActiveTheme } from '../store/settingsStore';

import { formatInstantDate } from '../utils/dates';
import { themeColor } from '../constants/Colors';

/**
 * The one dialog for getting an organisation with no administrator an administrator
 * (docs/nomination-process.md §4). Every way in opens it: the workspace banner
 * (`UnclaimedOrgBanner`), the icon on an organisation chip (`UnclaimedOrgBadge`), and the settings
 * screen's nominations section.
 *
 * - **Nominate anyone** by email; it is sent the moment it is submitted.
 * - **A member picks a fellow member** from the org's people, which fills in their address.
 * - **"It's me"** — offered only when the server says the caller may take the empty role
 *   (`OrgClaimStatus.canTakeOver`) — takes it at once, with no email. Nobody nominates their own
 *   address: the server refuses it, because a claim email to yourself proves nothing, and one who
 *   may not take the role must not get round that by inviting themselves.
 *
 * Every answer the server can give is said by name: an address that declined, claimed, or passed
 * the invitation on is not an invitation sent.
 *
 * Only for an org with no administrator: once it has one, the server refuses nominations and voids
 * any still pending (`ORG-10`). Its admins add further admins as members and invite them instead.
 */
export interface NominateAdminModalProps {
  visible: boolean;
  onClose: () => void;
  org: { id: string; name: string };
  /** From `useOrgClaimStatus`; `null` while it loads, which offers nominating alone. */
  status: OrgClaimStatus | null;
  /** An invitation went, or the caller was recorded as a nominator of a pending one. */
  onNominated?: (email: string) => void;
  /** The caller took the admin role. */
  onTookOver?: () => void;
}

const ANSWERED_COPY: Record<NominationAnswered, (email: string, org: string) => string> = {
  declined: (email, org) => `${email} has already declined an invitation to manage ${org}, so nothing was sent. Please nominate a different contact.`,
  claimed: (email, org) => `${email} has already claimed ${org}, so no invitation is needed.`,
  referred: (email, org) => `${email} passed an earlier invitation for ${org} on to someone else, so nothing was sent. Please nominate a different contact.`,
};

type Done = { kind: 'nominated'; email: string; outcome: NominationOutcome } | { kind: 'took-over' };

export function NominateAdminModal({ visible, onClose, org, status, onNominated, onTookOver }: NominateAdminModalProps) {
  const isDark = useActiveTheme() === 'dark';
  const successColor = themeColor(isDark, 'success-ink');

  const [email, setEmail] = useState('');
  const [memberText, setMemberText] = useState('');
  const [memberNote, setMemberNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingTakeOver, setConfirmingTakeOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const pending = status?.myPendingEmails || [];

  const reset = () => {
    setEmail('');
    setMemberText('');
    setMemberNote(null);
    setConfirmingTakeOver(false);
    setError(null);
    setDone(null);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  /** Back to the form with the field cleared, after an address that could not be invited. */
  const tryAnother = () => {
    setEmail('');
    setMemberText('');
    setMemberNote(null);
    setDone(null);
  };

  const pickMember = (person: OrgProfile | null) => {
    if (!person) return;
    setMemberText(person.name);
    if (person.email) {
      setEmail(person.email);
      setMemberNote(null);
    } else {
      setMemberNote(`${person.name} has no email address on record. Type the address to send the invitation to.`);
    }
  };

  const send = () => {
    if (!isValidEmail(email)) return;
    setBusy(true);
    setError(null);
    // The refusal is shown in the dialog, where the address was typed.
    nominateOrgContact(org.id, email, { suppressToast: true }).then(result => {
      setBusy(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.outcome === 'sent' || result.outcome === 'already-invited') onNominated?.(result.email);
      setDone({ kind: 'nominated', email: result.email, outcome: result.outcome });
    });
  };

  const takeOver = () => {
    setBusy(true);
    setError(null);
    takeOrgAdmin(org.id, { suppressToast: true }).then(result => {
      setBusy(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone({ kind: 'took-over' });
      onTookOver?.();
    });
  };

  const renderDone = (d: Done) => {
    const good = d.kind === 'took-over' || d.outcome === 'sent' || d.outcome === 'already-invited';
    const finished = good || (d.kind === 'nominated' && d.outcome === 'claimed');
    return (
      <View className="items-center py-2 gap-3">
        <Ionicons
          name={good ? 'checkmark-circle' : 'information-circle'}
          size={36}
          color={good ? successColor : themeColor(isDark, 'primary')}
        />
        <Text className="font-inter text-sm text-ink-muted text-center leading-5">
          {d.kind === 'took-over' && (
            <>You are now the administrator of <Text className="font-inter-bold text-ink">{org.name}</Text>. You can invite other administrators from People &amp; Roles.</>
          )}
          {d.kind === 'nominated' && d.outcome === 'sent' && (
            <>
              An invitation to claim {org.name} has been sent to{' '}
              <Text className="font-inter-bold text-ink">{d.email}</Text>.
            </>
          )}
          {d.kind === 'nominated' && d.outcome === 'already-invited' && (
            <>
              <Text className="font-inter-bold text-ink">{d.email}</Text>
              {' '}was invited to claim {org.name} recently, so no second email was sent. Your nomination has been recorded.
            </>
          )}
          {d.kind === 'nominated' && d.outcome !== 'sent' && d.outcome !== 'already-invited' &&
            ANSWERED_COPY[d.outcome](d.email, org.name)}
        </Text>
        {finished ? (
          <Button title="Done" variant="primary" onPress={close} className="w-full" />
        ) : (
          <View className="w-full gap-2">
            <Button title="Nominate a different contact" variant="primary" onPress={tryAnother} className="w-full" />
            <Button title="Cancel" variant="ghost" onPress={close} className="w-full" />
          </View>
        )}
      </View>
    );
  };

  const renderConfirmTakeOver = () => (
    <View className="gap-4">
      <Text className="font-inter text-sm text-ink-muted leading-5">
        You will become the administrator of <Text className="font-inter-bold text-ink">{org.name}</Text>,
        able to manage its people, teams, events and settings, and to invite other administrators.
      </Text>
      {!!error && <Text className="font-inter text-xs text-danger-ink leading-5">{error}</Text>}
      <View className="flex-row justify-end gap-2">
        <Button title="Back" variant="ghost" onPress={() => { setConfirmingTakeOver(false); setError(null); }} disabled={busy} />
        <Button title="Take on the admin role" variant="primary" isLoading={busy} onPress={takeOver} disabled={busy} />
      </View>
    </View>
  );

  const renderForm = () => (
    <View className="gap-4">
      <Text className="font-inter text-xs text-ink-muted leading-5">
        {`${org.name} doesn't have an administrator on ScoreKeeper yet. Nominate someone who runs it and we'll invite them to claim it, manage its teams and keep its schedules up to date.`}
      </Text>

      {status?.canTakeOver && (
        <View className="bg-primary-soft border border-primary-line rounded-xl p-3.5 gap-2.5">
          <Text className="font-inter text-xs text-ink-soft leading-5">
            <Text className="font-inter-bold">Is it you?</Text> You can take on the admin role yourself, straight away.
          </Text>
          <Button title="It's me: take on the admin role" variant="primary" onPress={() => { setConfirmingTakeOver(true); setError(null); }} />
        </View>
      )}
      {!status?.canTakeOver && !!status?.takeOverFrom && (
        <Text className="font-inter text-xs text-ink-muted leading-5">
          You can take on the admin role yourself from {formatInstantDate(status.takeOverFrom)}, once you have been a
          member for long enough. Until then, nominate someone who can.
        </Text>
      )}

      {pending.length > 0 && (
        <Text className="font-inter text-xs text-success-ink leading-5">
          {`You have already invited ${pending.join(', ')}. You can invite another contact as well.`}
        </Text>
      )}

      {status?.isMember && (
        <View className="gap-1.5 z-50">
          <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
            A member of {org.name}
          </Text>
          <PersonnelAutocomplete
            orgId={org.id}
            value={memberText}
            onChangeText={text => { setMemberText(text); setMemberNote(null); }}
            onSelectPerson={pickMember}
            placeholder="Search the organisation's people..."
          />
          {!!memberNote && (
            <Text className="font-inter text-[11px] text-ink-muted">{memberNote}</Text>
          )}
        </View>
      )}

      <View className="gap-1.5">
        <Text className="font-orbitron-bold text-[10px] text-ink-muted uppercase tracking-wider">
          {status?.isMember ? 'Or any email address' : 'Contact email'}
        </Text>
        <TextInput
          placeholder="contact@school.edu"
          placeholderTextColor={themeColor(isDark, 'ink-muted')}
          value={email}
          onChangeText={text => { setEmail(text); setError(null); }}
          className="bg-canvas border border-line rounded-xl px-4 py-3 font-inter text-sm text-ink"
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!busy}
        />
        <Text className="font-inter text-[11px] text-ink-muted">
          We only use this address to send the claim invitation.
        </Text>
      </View>

      <View className="flex-row items-start gap-2.5">
        <Ionicons name="trophy-outline" size={16} color={themeColor(isDark, 'primary')} />
        <Text className="flex-1 font-inter text-[11px] text-ink-muted leading-4">
          You earn the Community Builder badge when someone you nominated claims their organisation, and Community
          Champion at five.
        </Text>
      </View>

      {!!error && <Text className="font-inter text-xs text-danger-ink leading-5">{error}</Text>}

      <View className="flex-row justify-end gap-2 pt-1">
        <Button title="Cancel" variant="ghost" onPress={close} disabled={busy} />
        <Button
          title={busy ? 'Sending...' : 'Send Invitation'}
          variant="primary"
          isLoading={busy}
          onPress={send}
          disabled={!isValidEmail(email) || busy}
        />
      </View>
    </View>
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
      <Pressable className="flex-1 bg-overlay/40 items-center justify-center p-6" onPress={close}>
        <Pressable
          className="bg-card rounded-2xl border border-line w-full max-w-md shadow-lg"
          style={{ maxHeight: '90%' }}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-3">
                <Text className="font-orbitron-bold text-[10px] text-primary-ink uppercase tracking-wider">
                  {confirmingTakeOver && !done ? 'Take on the admin role' : 'Nominate an administrator'}
                </Text>
                <Text className="font-inter-bold text-base text-ink mt-0.5">
                  {org.name}
                </Text>
              </View>
              <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={themeColor(isDark, 'ink-muted')} />
              </TouchableOpacity>
            </View>

            {done ? renderDone(done) : confirmingTakeOver ? renderConfirmTakeOver() : renderForm()}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
