import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Event, EventOrgBadge, EventOrgHistory, SocketAction } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { formatInstantDate } from '../../utils/dates';

/**
 * An organisation's response to its invitation, on its page (`FIX-26`, `FIX-30`; agreed on
 * `mockups/organisations-teams.html`, option B). Two readers:
 *
 * - **The organisers** set any answer: *✓ Accepted* / *✕ Declined* while there is none, *Change
 *   response* after, *Invite* before it is invited; *Confirm withdrawal* or *Keep them in* when it
 *   asks to leave; *Remove from the tournament* while it is not out — one that declined or withdrew
 *   stays as the record.
 * - **The organisation itself** answers once: *Accept* / *Decline*. After accepting it can ask to
 *   withdraw, with a reason, and cancel that until the organisers confirm. Otherwise "To change
 *   this, contact …".
 *
 * Declining asks first, because it takes the teams out. Who answered and when come from
 * `event_org_history` — names, never on the public event.
 */

type Viewer = 'organiser' | 'organisation';

/** The reason is long: the card moves under the banner, full width, as it is on a phone. */
export const isLongReason = (history: EventOrgHistory | null) => (history?.withdrawal?.reason?.length || 0) > 120;

export function OrganisationResponse({ event, orgId, org, isHost, viewer, canAnswer, hostName, history, myUserId, wide, onRemove }: {
  event: Event;
  /** The acting workspace. */
  orgId: string;
  org: EventOrgBadge;
  isHost: boolean;
  viewer: Viewer;
  /** The organisation's own viewer may act for it (an admin or staff member), not only read. */
  canAnswer: boolean;
  /** Who to contact, for an organisation whose answer is final. */
  hostName: string;
  history: EventOrgHistory | null;
  myUserId?: string;
  /** Beside the banner (a fixed width), rather than under it. */
  wide: boolean;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [dialog, setDialog] = useState<null | 'decline' | 'withdraw'>(null);
  const organiser = viewer === 'organiser';
  const status = org.invitation;
  useEffect(() => setChanging(false), [status]);

  const send = async (action: () => Promise<{ ok: boolean }>) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    return result.ok;
  };
  const answer = (value: 'invited' | 'accepted' | 'declined' | 'withdrawn') =>
    send(() => sendAction(SocketAction.SET_EVENT_ORG_ANSWER, { eventId: event.id, orgId, participantOrgId: org.id, answer: value }));
  const invite = () => send(() => sendAction(SocketAction.INVITE_EVENT_ORGS, { eventId: event.id, orgId, participantOrgIds: [org.id] }));
  const cancelWithdrawal = () => send(() => sendAction(SocketAction.CANCEL_EVENT_WITHDRAWAL, { eventId: event.id, orgId, participantOrgId: org.id }));

  /* -- wording ----------------------------------------------------------------------------- */
  const who = (person: EventOrgHistory['answeredBy'] | undefined) =>
    !person ? '' : person.userId === myUserId ? ' by you' : ` by ${person.name}${person.orgName ? ` (${person.orgName})` : ''}`;
  const date = (iso?: string | null) => formatInstantDate(iso);
  const invitedLine = `Invited${date(org.invitedAt) ? ` ${date(org.invitedAt)}` : ''}${who(history?.invitedBy)}`;
  const answeredLine = () => {
    const label = status === 'accepted' ? 'Accepted' : status === 'declined' ? 'Declined' : 'Withdrawn';
    // An organiser recording an answer heard another way: "Set to Accepted by …".
    const setByOrganiser = !!history?.answeredBy && history.answeredBy.orgName !== org.name;
    if (status === 'withdrawn') {
      const asked = history?.withdrawal;
      return `Withdrawn · asked${who(asked?.requestedBy)}${asked?.requestedAt ? ` ${date(asked.requestedAt)}` : ''}, confirmed${who(history?.answeredBy)}${date(org.answeredAt) ? ` ${date(org.answeredAt)}` : ''}`;
    }
    return `${setByOrganiser ? `Set to ${label}` : label}${who(history?.answeredBy)}${date(org.answeredAt) ? ` · ${date(org.answeredAt)}` : ''}`;
  };
  const reason = history?.withdrawal?.reason ? (
    <View className="border-l-2 border-line pl-2.5 py-0.5">
      <Text className="font-inter italic text-[13px] text-ink-soft">“{history.withdrawal.reason}”</Text>
    </View>
  ) : null;

  /* -- pieces ------------------------------------------------------------------------------ */
  const link = (label: string, onPress: () => void, danger?: boolean) => (
    <TouchableOpacity key={label} onPress={onPress} disabled={busy} accessibilityRole="button">
      <Text className={`font-inter-bold text-[13px] ${danger ? 'text-danger-ink' : 'text-primary-ink'}`}>{label}</Text>
    </TouchableOpacity>
  );
  const button = (label: string, onPress: () => void, tone: 'primary' | 'plain' | 'danger' = 'plain') => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      className={`rounded-xl px-3 py-1.5 border ${tone === 'primary' ? 'bg-primary border-primary' : tone === 'danger' ? 'bg-danger border-danger' : 'border-line'}`}
    >
      <Text className={`font-inter-bold text-[13px] ${tone === 'primary' ? 'text-on-primary' : tone === 'danger' ? 'text-on-danger' : 'text-ink'}`}>{label}</Text>
    </TouchableOpacity>
  );
  const line = (text: string) => <Text className="font-inter text-xs text-ink-muted">{text}</Text>;
  const row = (...items: React.ReactNode[]) => <View className="flex-row flex-wrap items-center gap-x-3.5 gap-y-2 mt-0.5">{items}</View>;
  const remove = organiser ? link('Remove from the tournament', onRemove, true) : null;
  const contact = line(`To change this, contact ${hostName}.`);

  let title = 'Response';
  let body: React.ReactNode;
  if (isHost) {
    body = <>{line('The host takes part by hosting, so it has no invitation.')}{organiser ? row(remove) : null}</>;
  } else if (status === 'not_invited') {
    body = <>{line("Not invited yet: it can't see the tournament.")}{row(button('Invite', invite, 'primary'), remove)}</>;
  } else if (status === 'invited' || (changing && organiser)) {
    if (organiser) {
      body = (
        <>
          {row(button('✓ Accepted', () => answer('accepted')), button('✕ Declined', () => setDialog('decline')))}
          {changing
            ? <Text className="font-inter text-xs text-ink-muted">Change their response, or <Text onPress={() => setChanging(false)} className="font-inter-bold text-primary-ink">keep it as it is</Text>.</Text>
            : line(`${invitedLine} · they can respond, or you can set their response.`)}
          {!changing ? row(remove) : null}
        </>
      );
    } else {
      title = `${hostName} has invited you`;
      body = (
        <>
          {canAnswer ? row(button('Accept', () => answer('accepted'), 'primary'), button('Decline', () => setDialog('decline'))) : null}
          {line(canAnswer ? invitedLine : `${invitedLine}. Your organisation's admins can answer.`)}
        </>
      );
    }
  } else if (status === 'accepted') {
    body = (
      <>
        {line(answeredLine())}
        {organiser
          ? row(link('Change response', () => setChanging(true)), remove)
          : canAnswer ? row(link('Withdraw from the tournament', () => setDialog('withdraw'), true)) : null}
      </>
    );
  } else if (status === 'withdrawal_pending') {
    const asked = history?.withdrawal;
    if (organiser) {
      title = 'Asks to withdraw';
      body = (
        <>
          {line(`${asked?.requestedBy ? `${asked.requestedBy.name}${asked.requestedBy.orgName ? ` (${asked.requestedBy.orgName})` : ''}` : org.name}${asked?.requestedAt ? ` · ${date(asked.requestedAt)}` : ''}`)}
          {reason}
          {row(button('Confirm withdrawal', () => answer('withdrawn'), 'danger'), button('Keep them in', () => answer('accepted')))}
          {line('Confirming removes all the teams from the tournament.')}
        </>
      );
    } else {
      title = 'Withdrawal requested';
      body = (
        <>
          {line(`${who(asked?.requestedBy).replace(/^ by /, 'By ') || 'Asked'}${asked?.requestedAt ? ` · ${date(asked.requestedAt)}` : ''}. ${hostName} has been told and needs to confirm it. Until then nothing changes: your teams stay in the tournament.`)}
          {reason}
          {canAnswer ? row(link('Cancel the withdrawal', cancelWithdrawal)) : null}
        </>
      );
    }
  } else {
    // Declined or withdrawn: its teams are already out, so the organisers' only action is to change it.
    body = (
      <>
        {line(answeredLine())}
        {status === 'withdrawn' ? reason : null}
        {organiser ? row(link('Change response', () => setChanging(true))) : contact}
      </>
    );
  }

  return (
    <View className="rounded-2xl border border-line bg-card p-4 gap-2" style={wide ? { width: 300 } : undefined}>
      <Text className="font-inter-bold text-[13px] text-ink-soft">{title}</Text>
      {body}

      <DeclineDialog
        visible={dialog === 'decline'}
        event={event}
        org={org}
        viewer={viewer}
        hostName={hostName}
        onClose={() => setDialog(null)}
        onConfirm={async () => { if (await answer('declined')) setDialog(null); }}
      />
      <WithdrawDialog
        visible={dialog === 'withdraw'}
        event={event}
        orgId={orgId}
        org={org}
        hostName={hostName}
        onClose={() => setDialog(null)}
      />
    </View>
  );
}

/** Declining takes the organisation's teams out, so it is said first. */
function DeclineDialog({ visible, event, org, viewer, hostName, onClose, onConfirm }: {
  visible: boolean;
  event: Event;
  org: EventOrgBadge;
  viewer: Viewer;
  hostName: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <EditDialog
      visible={visible}
      title={viewer === 'organiser' ? `Record that ${org.name} declined?` : `Decline ${event.name}?`}
      onClose={onClose}
      onSave={async () => { setSaving(true); await onConfirm(); setSaving(false); }}
      saveLabel="Decline"
      isSaving={saving}
    >
      <Text className="font-inter text-sm text-ink leading-relaxed">
        {viewer === 'organiser'
          ? `${org.name}'s teams are taken out of their divisions. It stays listed, as declined.`
          : `${hostName} is told, and any teams entered for you are taken out. To change your answer later, you will need to contact ${hostName}.`}
      </Text>
    </EditDialog>
  );
}

/** An organisation that accepted asks to withdraw, with a reason; the organisers confirm it. */
function WithdrawDialog({ visible, event, orgId, org, hostName, onClose }: {
  visible: boolean;
  event: Event;
  orgId: string;
  org: EventOrgBadge;
  hostName: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (visible) setReason(''); }, [visible]);

  const ask = async () => {
    setSaving(true);
    const result = await sendAction(SocketAction.REQUEST_EVENT_WITHDRAWAL, { eventId: event.id, orgId, participantOrgId: org.id, reason: reason.trim() });
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title={`Withdraw from ${event.name}?`}
      onClose={onClose}
      onSave={ask}
      saveLabel="Ask to withdraw"
      saveDisabled={!reason.trim()}
      isSaving={saving}
      isDirty={!!reason.trim()}
    >
      <Text className="font-inter text-sm text-ink leading-relaxed">
        Since your organisation has already accepted, {hostName} will be informed and needs to confirm your withdrawal. Until they do, nothing changes — your teams stay in the tournament, and you can cancel the request.
      </Text>
      <View className="gap-1.5">
        <Text className="font-inter-semibold text-[13px] text-ink-soft">Why are you withdrawing?</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          multiline
          autoFocus
          accessibilityLabel="Why are you withdrawing?"
          className={TEXT_INPUT}
          style={{ minHeight: 88, textAlignVertical: 'top' }}
        />
        <Text className="font-inter text-xs text-ink-muted">Sent to the organisers with your request.</Text>
      </View>
    </EditDialog>
  );
}
