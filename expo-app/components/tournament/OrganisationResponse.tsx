import React, { useEffect, useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Event, EventOrgBadge, EventOrgHistory, SocketAction, TournamentDivision, TournamentEntrant, isEntrantEntered } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { formatInstantDate } from '../../utils/dates';
import { FixtureCrest } from '../events/EventBits';
import { InvitationBadge } from './TournamentBits';

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

/** The top of an organisation's page in a tournament: its crest, name and status, and what it has entered. */
export function OrganisationBanner({ org, isHost, eventName, entries, divisions, isWide }: {
  org: EventOrgBadge;
  isHost: boolean;
  eventName: string;
  /** Its entries, and the divisions they are in. */
  entries: number;
  divisions: number;
  isWide: boolean;
}) {
  return (
    <View className="flex-1 rounded-2xl border border-line bg-card p-4 flex-row items-center gap-3.5">
      <FixtureCrest participant={{ id: org.id, orgId: org.id, orgLogo: org.logo, orgLogoConfig: org.logoConfig, orgPrimaryColor: org.primaryColor }} size={isWide ? 60 : 50} />
      <View className="flex-1 min-w-0 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-inter-bold text-ink" style={{ fontSize: isWide ? 22 : 19 }}>{org.name}</Text>
          {isHost ? null : <InvitationBadge invitation={org.invitation} large />}
        </View>
        <Text className="font-inter text-sm text-ink-muted">
          <Text className="font-inter-semibold text-ink">{eventName}</Text>
          {'   '}{entries ? `${entries} ${entries === 1 ? 'entry' : 'entries'} in ${divisions} ${divisions === 1 ? 'division' : 'divisions'}` : 'Nothing entered yet'}
        </Text>
      </View>
    </View>
  );
}

/** The reason is long: the card moves under the banner, full width, as it is on a phone. */
export const isLongReason = (history: EventOrgHistory | null) => (history?.withdrawal?.reason?.length || 0) > 120;

export function OrganisationResponse({ event, orgId, org, isHost, viewer, canAnswer, hostName, history, myUserId, wide, onRemove, teams = [], divisions = [], sportName = () => '' }: {
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
  /** The organisation's teams in the tournament — Accept may accept them too; Decline declines them. */
  teams?: TournamentEntrant[];
  divisions?: TournamentDivision[];
  sportName?: (sportId?: string) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [dialog, setDialog] = useState<null | 'accept' | 'decline' | 'withdraw'>(null);
  const organiser = viewer === 'organiser';
  const status = org.invitation;
  useEffect(() => setChanging(false), [status]);

  const send = async (action: () => Promise<{ ok: boolean }>) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    return result.ok;
  };
  const answer = (value: 'invited' | 'accepted' | 'declined' | 'withdrawn', acceptTeams?: boolean) =>
    send(() => sendAction(SocketAction.SET_EVENT_ORG_ANSWER, { eventId: event.id, orgId, participantOrgId: org.id, answer: value, ...(acceptTeams ? { acceptTeams } : {}) }));
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
  const contact = line('To change this, contact the organisers.');

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
      title = canAnswer ? `${hostName} has invited you` : 'Not answered yet';
      body = canAnswer ? (
        <>
          {row(button('✓ Accept', () => setDialog('accept'), 'primary'), button('✕ Decline', () => setDialog('decline')))}
          {line(invitedLine)}
        </>
      ) : (
        line(`${org.name}'s admins answer for the organisation; you answer for your team. Until it accepts, only your organisation will see if you accept.`)
      );
    }
  } else if (status === 'accepted') {
    if (!organiser) title = 'Taking part';
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
          {line('Confirming withdraws all its teams.')}
        </>
      );
    } else {
      title = 'Withdrawal requested';
      body = (
        <>
          {line(`${who(asked?.requestedBy).replace(/^ by /, 'By ') || 'Asked'}${asked?.requestedAt ? ` · ${date(asked.requestedAt)}` : ''}. The organisers have been told and need to confirm it. Until then nothing changes: your teams stay in the tournament.`)}
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
      {!organiser && canAnswer && status === 'invited' ? (
        <FieldLabel heading label={title} help="Until you accept, the organisers do not see your teams' acceptances — only declines." />
      ) : (
        <Text className="font-inter-bold text-[18px] text-ink">{title}</Text>
      )}
      {body}

      <AcceptDialog
        visible={dialog === 'accept'}
        event={event}
        teams={teams}
        divisions={divisions}
        sportName={sportName}
        onClose={() => setDialog(null)}
        onConfirm={async acceptTeams => { if (await answer('accepted', acceptTeams)) setDialog(null); }}
      />

      <DeclineDialog
        visible={dialog === 'decline'}
        event={event}
        org={org}
        viewer={viewer}
        teams={teams}
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

/**
 * Declining answers for every team, and is final for the organisation (`FIX-30`, `FIX-31`), so it is
 * said first: every team is declined — naming any a coach had accepted — and only the organisers can
 * change it afterwards.
 */
function DeclineDialog({ visible, event, org, viewer, teams, onClose, onConfirm }: {
  visible: boolean;
  event: Event;
  org: EventOrgBadge;
  viewer: Viewer;
  teams: TournamentEntrant[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const going = teams.filter(t => isEntrantEntered(t.status) || t.status === 'requested');
  const coachAccepted = going.filter(t => t.status === 'accepted');
  const including = coachAccepted.length
    ? `, including ${coachAccepted.map(t => t.name).join(', ')}, which ${coachAccepted.length === 1 ? 'had been' : 'had each been'} accepted`
    : '';
  const teamsLine = !going.length ? ''
    : viewer === 'organiser'
      ? `${going.length === 1 ? 'Its team is' : `All ${going.length} of its teams are`} declined too${including}. ${org.name} stays listed, as declined.`
      : `${going.length === 1 ? 'Your team is' : `All ${going.length} of your teams are`} declined too${including}.`;
  return (
    <EditDialog
      visible={visible}
      title={viewer === 'organiser' ? `Record that ${org.name} declined?` : `Decline ${event.name}?`}
      onClose={onClose}
      onSave={async () => { setSaving(true); await onConfirm(); setSaving(false); }}
      saveLabel="✕ Decline"
      isSaving={saving}
    >
      {teamsLine ? (
        <Text className="font-inter text-sm text-ink leading-relaxed">{teamsLine}</Text>
      ) : null}
      {viewer === 'organiser' ? null : (
        <View className="rounded-xl bg-warning-soft border border-warning-line px-3 py-2">
          <Text className="font-inter-semibold text-[13px] text-warning-ink">You cannot change your answer afterwards — only the organisers can.</Text>
        </View>
      )}
    </EditDialog>
  );
}

/**
 * Accepting the invitation (`FIX-31`): *Accept for all invited teams*, on by default, with its ⓘ — teams
 * already declined keep their answer, all the others become accepted — over the organisation's teams by
 * sport and division, as chips: the name, with ✓ or ✕ where a coach has already answered.
 */
function AcceptDialog({ visible, event, teams, divisions, sportName, onClose, onConfirm }: {
  visible: boolean;
  event: Event;
  teams: TournamentEntrant[];
  divisions: TournamentDivision[];
  sportName: (sportId?: string) => string;
  onClose: () => void;
  onConfirm: (acceptTeams: boolean) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [all, setAll] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (visible) setAll(true); }, [visible]);
  const listed = teams.filter(t => t.status === 'invited' || t.status === 'accepted' || t.status === 'declined');
  const bySport = (event.sportIds || [])
    .map(sportId => ({ sportId, divisions: divisions.filter(d => d.sportId === sportId && listed.some(t => t.divisionId === d.id)) }))
    .filter(g => g.divisions.length);
  return (
    <EditDialog
      visible={visible}
      title={`Accept ${event.name}?`}
      onClose={onClose}
      onSave={async () => { setSaving(true); await onConfirm(all && listed.some(t => t.status === 'invited')); setSaving(false); }}
      saveLabel="✓ Accept"
      isSaving={saving}
    >
      <Text className="font-inter text-sm text-ink leading-relaxed">The organisers will see that you have accepted.</Text>
      {listed.length ? (
        <>
          <View className="flex-row items-start gap-3">
            <View className="flex-1 min-w-0">
              <FieldLabel label="Accept for all invited teams" help="Teams already declined keep their answer; all the others become Accepted." />
            </View>
            <Switch value={all} onValueChange={setAll} trackColor={{ true: themeColor(isDark, 'primary') }} accessibilityLabel="Accept for all invited teams" />
          </View>
          <View className="rounded-xl border border-line px-3 pb-2">
            {bySport.map(group => (
              <View key={group.sportId}>
                <Text className="font-inter-bold text-sm text-ink pt-2">{sportName(group.sportId)}</Text>
                {group.divisions.map(d => (
                  <View key={d.id} className="flex-row flex-wrap items-center gap-2 py-1.5 border-t border-line-soft">
                    <Text className="font-inter-semibold text-[13px] text-ink-soft" style={{ width: 80 }}>{d.name}</Text>
                    {listed.filter(t => t.divisionId === d.id).map(t => (
                      <View key={t.id} className="flex-row items-center gap-1 rounded-full border border-line-strong px-3 py-1">
                        {t.status === 'accepted' ? <Text className="font-inter-bold text-[13px] text-success-ink">✓</Text> : null}
                        {t.status === 'declined' ? <Text className="font-inter-bold text-[13px] text-danger-ink">✕</Text> : null}
                        <Text className={`font-inter-semibold text-[13px] ${t.status === 'declined' ? 'text-ink-muted' : 'text-ink'}`}>{t.name || 'A team'}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </>
      ) : null}
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
        Since your organisation has already accepted, the organisers will be told and need to confirm your withdrawal. Until they do, nothing changes — your teams stay in the tournament, and you can cancel the request.
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
