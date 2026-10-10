import React, { useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Event,
  EventOrgBadge,
  SocketAction,
  Sport,
  Team,
  TournamentDivision,
  TournamentEntrant,
  divisionAllowsOrgAdding,
  divisionFullName,
  entrantStatusShown,
  entrantTakesAPlace,
  hasLeft,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import { SegmentedControl } from '../SegmentedControl';
import { TEXT_INPUT } from '../formStyles';
import { EntrantBadge, WrittenReason } from './DivisionEntries';
import { orderedDivisions } from './OrganisationTeams';
import { sendAction } from '../../services/actions';
import { formatInstantDate } from '../../utils/dates';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * An organisation's teams in a tournament, **as the organisation sees them** (`FIX-31`, `FIX-33`;
 * agreed 2026-10-10 on `mockups/team-invitations.html`): each sport, then each division with its name
 * on the left and its teams on the right — the built page's shape, with **each team a card**: its name
 * (the link to the team), its answer, who gave it and when, and its buttons.
 *
 * - **Buttons say what they do.** Invited: *✓ Accept* / *✕ Decline*. Answered, entries open: the other
 *   answer only, confirmed first. Locked: *Withdraw* (asked for, with a reason). A request waiting:
 *   *Cancel request*.
 * - **Who may.** The organisation's admins for any of its teams, a coach for the teams they coach;
 *   everyone else reads. Once the organisation has declined or withdrawn, nothing is answered here.
 * - **Adding.** *＋ Add a team* under a division's name where it allows organisations to add teams
 *   and is open (`FIX-33`); *＋ Ask to enter late* under a locked one with no team of ours.
 * - **Say it once** (design rule 28): what holds for every team is the ⓘ on the Teams heading, not a
 *   line on each card. The filter is the standard segmented control: All · Outstanding · Declined.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
type Filter = 'all' | 'out' | 'dec';
type Dialog =
  | { kind: 'decline' | 'reaccept' | 'withdraw'; entrant: TournamentEntrant; division: TournamentDivision }
  | { kind: 'add' | 'late'; division: TournamentDivision };

export function OrganisationTeamCards({ event, org, actingOrgId, divisions, sports, entrants, ownTeams, isAdmin, coachTeamIds, onlyTeamIds, isWide }: {
  event: Event;
  org: EventOrgBadge;
  /** The workspace the viewer acts from — a team opens there only when it is the organisation's own. */
  actingOrgId: string;
  divisions: TournamentDivision[];
  sports: Sport[];
  /** The tournament's roster; this organisation's rows are taken from it. */
  entrants: TournamentEntrant[];
  /** The organisation's teams, for adding one. */
  ownTeams: Team[];
  isAdmin: boolean;
  /** Teams the viewer coaches: theirs to answer for. */
  coachTeamIds: Set<string>;
  /** Mine, for a coach: only these teams. */
  onlyTeamIds?: Set<string> | null;
  isWide: boolean;
}) {
  const router = useRouter();
  const isDark = useActiveTheme() === 'dark';
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);

  const orgOut = hasLeft(org.invitation);
  const mine = entrants.filter(e => e.orgId === org.id && (!onlyTeamIds || (!!e.teamId && onlyTeamIds.has(e.teamId))));
  const outstanding = mine.filter(e => e.status === 'invited');
  const declined = mine.filter(e => e.status === 'declined');
  const f: Filter = (filter === 'out' && outstanding.length) || (filter === 'dec' && declined.length) ? filter : 'all';
  const shown = f === 'out' ? outstanding : f === 'dec' ? declined : mine;
  const canActOn = (e: TournamentEntrant) => !orgOut && (isAdmin || (!!e.teamId && coachTeamIds.has(e.teamId)));
  const canAddAny = !orgOut && (isAdmin || coachTeamIds.size > 0);
  const takenTeamIds = useMemo(() => new Set(entrants.filter(e => entrantTakesAPlace(e.status) && e.teamId).map(e => e.teamId as string)), [entrants]);

  const ordered = orderedDivisions(divisions, event.sportIds || []);
  const sportName = (id?: string) => sports.find(s => s.id === id)?.name || '';
  const fullName = (d: TournamentDivision) => divisionFullName(d.name, sportName(d.sportId));

  const send = async (run: () => Promise<{ ok: boolean }>) => {
    setBusy(true);
    const result = await run();
    setBusy(false);
    if (result.ok) setDialog(null);
    return result.ok;
  };
  const answer = (e: TournamentEntrant, value: 'accepted' | 'declined', reason?: string) =>
    send(() => sendAction(SocketAction.SET_ENTRANT_ANSWER, { divisionId: e.divisionId, entrantId: e.id, orgId: actingOrgId, answer: value, ...(reason ? { reason } : {}) }));
  const cancelRequest = (e: TournamentEntrant) =>
    send(() => sendAction(SocketAction.CANCEL_ENTRANT_REQUEST, { divisionId: e.divisionId, entrantId: e.id, orgId: actingOrgId }));

  const byWhom = (who?: { name: string; orgName?: string | null } | null, at?: string | null) => {
    const name = who?.name ? `${who.name}${who.orgName && who.orgName !== org.name ? ` (${who.orgName})` : ''}` : '';
    return [name ? `by ${name}` : '', formatInstantDate(at)].filter(Boolean).join(' · ');
  };

  /* -- one team ------------------------------------------------------------------------------ */
  const button = (label: string, onPress: () => void, tone: 'primary' | 'plain' | 'danger' = 'plain') => (
    <TouchableOpacity
      key={label}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      className={`rounded-xl px-3 py-1.5 ${tone === 'primary' ? 'bg-primary' : 'border border-line-strong bg-card'}`}
    >
      <Text className={`font-inter-bold text-[13px] ${tone === 'primary' ? 'text-on-primary' : tone === 'danger' ? 'text-danger-ink' : 'text-ink'}`}>{label}</Text>
    </TouchableOpacity>
  );

  const card = (e: TournamentEntrant, division: TournamentDivision) => {
    const status = entrantStatusShown(e.status, org.invitation, true);
    const locked = !!division.entriesLockedAt;
    const may = canActOn(e);
    const request = e.status === 'requested' || e.status === 'withdrawal_pending';
    const sub = request
      ? `${e.requestedBy?.name ? `Asked by ${e.requestedBy.name}` : 'Asked'}${e.requestedAt ? ` · ${formatInstantDate(e.requestedAt)}` : ''}`
      : e.status === 'invited' ? 'No answer yet' : byWhom(e.answeredBy, e.answeredAt);
    const buttons: React.ReactNode[] = [];
    if (may) {
      if (request) buttons.push(button('Cancel request', () => cancelRequest(e)));
      else if (!locked && e.status === 'invited') {
        buttons.push(button('✓ Accept', () => answer(e, 'accepted'), 'primary'), button('✕ Decline', () => setDialog({ kind: 'decline', entrant: e, division })));
      } else if (!locked && e.status === 'accepted') buttons.push(button('✕ Decline', () => setDialog({ kind: 'decline', entrant: e, division })));
      else if (!locked && e.status === 'declined') buttons.push(button('✓ Accept', () => setDialog({ kind: 'reaccept', entrant: e, division })));
      else if (locked && e.status === 'accepted') buttons.push(button('Withdraw', () => setDialog({ kind: 'withdraw', entrant: e, division }), 'danger'));
    }
    const ownTeam = !!e.teamId && actingOrgId === org.id;
    const out = e.status === 'declined' || e.status === 'withdrawn' || e.status === 'rejected';
    return (
      <View
        key={e.id}
        className={`rounded-2xl p-3 gap-1 border ${request ? 'bg-warning-soft border-warning-line' : 'bg-card border-line'}`}
        style={{ width: isWide ? 250 : '100%' }}
      >
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            disabled={!ownTeam}
            onPress={() => router.push(`/admin/${actingOrgId}/teams/${e.teamId}` as any)}
            accessibilityRole={ownTeam ? 'link' : 'text'}
            className="flex-1 min-w-0 flex-row items-center gap-1"
          >
            <Text numberOfLines={1} className={`font-inter-bold text-sm flex-shrink ${out ? 'text-ink-muted' : 'text-ink'}`}>{e.name || e.label || 'A team'}</Text>
            {ownTeam ? <Ionicons name="chevron-forward" size={13} color={themeColor(isDark, 'ink-muted')} /> : null}
          </TouchableOpacity>
          <EntrantBadge status={status} />
        </View>
        {sub ? <Text className="font-inter text-xs text-ink-muted" numberOfLines={2}>{sub}</Text> : null}
        {request && e.reason ? <WrittenReason text={e.reason} /> : null}
        {buttons.length ? <View className="flex-row flex-wrap gap-2 mt-1">{buttons}</View> : null}
      </View>
    );
  };

  /* -- each division ------------------------------------------------------------------------- */
  const divisionRow = (division: TournamentDivision) => {
    const here = shown.filter(e => e.divisionId === division.id);
    if (f !== 'all' && !here.length) return null;
    if (onlyTeamIds && !here.length) return null;
    const locked = !!division.entriesLockedAt;
    const ours = mine.some(e => e.divisionId === division.id && entrantTakesAPlace(e.status));
    const link = f !== 'all' || !canAddAny ? null
      : !locked && divisionAllowsOrgAdding(division, event) ? { label: '＋ Add a team', kind: 'add' as const }
        : locked && !ours ? { label: '＋ Ask to enter late', kind: 'late' as const } : null;
    const linkNode = link ? (
      <TouchableOpacity onPress={() => setDialog({ kind: link.kind, division })} accessibilityRole="button">
        <Text className="font-inter-bold text-[13px] text-primary-ink">{link.label}</Text>
      </TouchableOpacity>
    ) : null;
    return (
      <View key={division.id} className={`py-3 border-t border-line-soft ${isWide ? 'flex-row gap-3' : 'gap-2'}`}>
        <View className={isWide ? 'gap-1' : 'flex-row flex-wrap items-baseline gap-x-2.5 gap-y-1'} style={isWide ? { width: 130 } : undefined}>
          <Text className="font-inter-bold text-[15px] text-ink">{division.name}</Text>
          {locked ? <Text className="font-inter text-xs text-ink-muted">🔒 Locked</Text> : null}
          {isWide ? linkNode : <View className="ml-auto">{linkNode}</View>}
        </View>
        <View className="flex-1 min-w-0 flex-row flex-wrap gap-2">
          {here.length ? here.map(e => card(e, division)) : <Text className="font-inter text-sm text-ink-muted py-1">No team</Text>}
        </View>
      </View>
    );
  };

  const bySport = (event.sportIds || []).map(sportId => ({ sportId, rows: ordered.filter(d => d.sportId === sportId).map(divisionRow).filter(Boolean) }))
    .filter(group => group.rows.length);

  const help = isAdmin
    ? 'You answer for the teams the organisers entered. Where a division allows it you can add a team too, until its entries are locked; the organisers approve each one.'
    : 'You answer for the teams you coach. Where a division allows it you can add one of them too, until its entries are locked; the organisers approve each one.';

  return (
    <>
      {outstanding.length && !orgOut ? (
        <TouchableOpacity
          onPress={() => setFilter('out')}
          accessibilityRole="button"
          className="rounded-xl border border-warning-line bg-warning-soft px-3.5 py-2.5 flex-row items-center gap-3"
        >
          <Text className="flex-1 font-inter-bold text-sm text-warning-ink">Outstanding responses {outstanding.length}</Text>
          <Text className="font-inter-bold text-[13px] text-warning-ink">Show ›</Text>
        </TouchableOpacity>
      ) : null}
      <View className="rounded-2xl border border-line bg-card p-4 gap-2">
        <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-2">
          <View className="flex-shrink">
            <FieldLabel heading label={onlyTeamIds ? 'Your teams' : 'Teams'} count={mine.length} help={orgOut ? undefined : help} />
          </View>
          <View className="flex-1" />
          {outstanding.length || declined.length ? (
            <SegmentedControl
              fit
              isCompact
              value={f}
              onChange={key => setFilter(key as Filter)}
              options={[
                { key: 'all', label: 'All', count: mine.length },
                ...(outstanding.length ? [{ key: 'out', label: 'Outstanding', count: outstanding.length }] : []),
                ...(declined.length ? [{ key: 'dec', label: 'Declined', count: declined.length }] : []),
              ]}
            />
          ) : null}
        </View>
        {orgOut ? (
          <Text className="font-inter text-[13px] text-ink-muted">
            {org.invitation === 'declined' ? 'Declined' : 'Withdrawn'}: your teams are out of their divisions. They stay listed as the record.
          </Text>
        ) : null}
        {bySport.length ? bySport.map(group => (
          <View key={group.sportId}>
            <Text className="font-inter-bold text-base text-ink pt-2">{sportName(group.sportId)}</Text>
            {group.rows}
          </View>
        )) : orgOut ? null : <Text className="font-inter text-sm text-ink-muted">No teams entered yet.</Text>}
      </View>

      <AnswerDialog dialog={dialog} event={event} busy={busy} onClose={() => setDialog(null)}
        onDecline={(e, reason) => answer(e, 'declined', reason)}
        onReaccept={e => answer(e, 'accepted')}
        onWithdraw={(e, reason) => send(() => sendAction(SocketAction.REQUEST_ENTRANT_WITHDRAWAL, { divisionId: e.divisionId, entrantId: e.id, orgId: actingOrgId, reason }))}
        byWhom={byWhom}
        fullName={fullName}
      />
      <EntryRequestDialog
        dialog={dialog && (dialog.kind === 'add' || dialog.kind === 'late') ? dialog : null}
        ownTeams={ownTeams.filter(t => t.isActive !== false && !takenTeamIds.has(t.id) && (isAdmin || coachTeamIds.has(t.id)))}
        fullName={fullName}
        busy={busy}
        onClose={() => setDialog(null)}
        onRequest={(division, teamId, reason) => send(() => sendAction(SocketAction.REQUEST_ENTRY, { divisionId: division.id, teamId, orgId: actingOrgId, ...(reason ? { reason } : {}) }))}
      />
    </>
  );
}

/** Declining a team, accepting one that was declined, and asking to withdraw one after the lock. */
function AnswerDialog({ dialog, event, busy, onClose, onDecline, onReaccept, onWithdraw, byWhom, fullName }: {
  dialog: Dialog | null;
  event: Event;
  busy: boolean;
  onClose: () => void;
  onDecline: (e: TournamentEntrant, reason?: string) => void;
  onReaccept: (e: TournamentEntrant) => void;
  onWithdraw: (e: TournamentEntrant, reason: string) => void;
  byWhom: (who?: { name: string; orgName?: string | null } | null, at?: string | null) => string;
  fullName: (d: TournamentDivision) => string;
}) {
  const [reason, setReason] = useState('');
  const open = !!dialog && (dialog.kind === 'decline' || dialog.kind === 'reaccept' || dialog.kind === 'withdraw');
  const e = open ? (dialog as any).entrant as TournamentEntrant : null;
  const division = open ? (dialog as any).division as TournamentDivision : null;
  const name = e?.name || 'this team';
  const kind = open ? dialog!.kind : null;
  const answered = e?.answeredBy ? byWhom(e.answeredBy, e.answeredAt).replace(/^by /, '') : '';
  return (
    <EditDialog
      visible={open}
      title={kind === 'withdraw' ? `Withdraw ${name} from ${division ? fullName(division) : 'its division'}?` : `${kind === 'reaccept' ? 'Accept' : 'Decline'} ${event.name} for ${name}?`}
      onClose={() => { setReason(''); onClose(); }}
      onSave={() => {
        if (!e) return;
        if (kind === 'withdraw') onWithdraw(e, reason.trim());
        else if (kind === 'reaccept') onReaccept(e);
        else onDecline(e, reason.trim() || undefined);
        setReason('');
      }}
      saveLabel={kind === 'withdraw' ? 'Ask to withdraw' : kind === 'reaccept' ? '✓ Accept' : '✕ Decline'}
      saveDisabled={kind === 'withdraw' && !reason.trim()}
      isSaving={busy}
    >
      {kind === 'withdraw' ? (
        <Text className="font-inter text-sm text-ink leading-relaxed">
          Entries for {division ? fullName(division) : 'this division'} are locked, so the organisers need to confirm. Until they do, nothing changes — {name} stays in, and you can cancel the request.
        </Text>
      ) : e?.status === 'accepted' || e?.status === 'declined' ? (
        <Text className="font-inter text-sm text-ink leading-relaxed">
          {name} was {e.status === 'accepted' ? 'accepted' : 'declined'}{answered ? ` by ${answered}` : ''}.
        </Text>
      ) : null}
      {kind !== 'reaccept' ? (
        <View className="gap-1.5">
          <Text className="font-inter-semibold text-[13px] text-ink-soft">
            {kind === 'withdraw' ? 'Why are you withdrawing it?' : 'Why?'}
            {kind === 'withdraw' ? '' : <Text className="font-inter text-xs text-ink-muted">  optional</Text>}
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            accessibilityLabel={kind === 'withdraw' ? 'Why are you withdrawing it?' : 'Why?'}
            placeholder={kind === 'withdraw' ? undefined : 'Tell the organisers why, if it helps.'}
            className={TEXT_INPUT}
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
          {kind === 'withdraw' ? <Text className="font-inter text-xs text-ink-muted">Sent to the organisers with your request.</Text> : null}
        </View>
      ) : null}
    </EditDialog>
  );
}

/**
 * Asking to add a team where the division allows it (`FIX-33`), or to enter one late after the lock
 * (`FIX-31`): one of the organisation's teams of this division's sport — its age group first — and an
 * optional note. The organisers accept it or turn it down.
 */
function EntryRequestDialog({ dialog, ownTeams, fullName, busy, onClose, onRequest }: {
  dialog: { kind: 'add' | 'late'; division: TournamentDivision } | null;
  ownTeams: Team[];
  fullName: (d: TournamentDivision) => string;
  busy: boolean;
  onClose: () => void;
  onRequest: (division: TournamentDivision, teamId: string, reason?: string) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [teamId, setTeamId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const division = dialog?.division;
  const late = dialog?.kind === 'late';
  const ofSport = ownTeams.filter(t => t.sportId === division?.sportId);
  const sameAge = ofSport.filter(t => !division?.ageGroupId || t.ageGroupId === division.ageGroupId);
  const others = ofSport.filter(t => !sameAge.includes(t));
  const close = () => { setTeamId(null); setReason(''); onClose(); };
  const option = (t: Team) => (
    <TouchableOpacity key={t.id} onPress={() => setTeamId(t.id)} accessibilityRole="radio" accessibilityState={{ checked: teamId === t.id }} className="flex-row items-center gap-2.5 py-2 border-t border-line-soft">
      <Ionicons name={teamId === t.id ? 'radio-button-on' : 'radio-button-off'} size={19} color={themeColor(isDark, teamId === t.id ? 'ink' : 'ink-faint')} />
      <Text className="flex-1 font-inter-semibold text-sm text-ink">{t.name}</Text>
      {t.ageGroup ? <Text className="font-inter text-xs text-ink-muted">{t.ageGroup}</Text> : null}
    </TouchableOpacity>
  );
  return (
    <EditDialog
      visible={!!dialog}
      title={division ? (late ? `Ask to enter ${fullName(division)} late` : `Add a team to ${fullName(division)}`) : ''}
      onClose={close}
      onSave={() => { if (division && teamId) { onRequest(division, teamId, reason.trim() || undefined); setTeamId(null); setReason(''); } }}
      saveLabel={late ? 'Ask to enter' : 'Add team'}
      saveDisabled={!teamId}
      isSaving={busy}
    >
      {late ? <Text className="font-inter text-sm text-ink leading-relaxed">Entries for {division ? fullName(division) : 'this division'} are locked. The organisers will accept your team or turn it down.</Text> : null}
      <View>
        <Text className="font-inter-semibold text-[13px] text-ink-soft pb-1">Team</Text>
        {sameAge.length ? sameAge.map(option) : <Text className="font-inter text-sm text-ink-muted py-1.5">No {division?.ageGroup || ''} team free to enter.</Text>}
        {others.length ? (
          <>
            <Text className="font-inter text-xs text-ink-muted pt-2">From another age group</Text>
            {others.map(option)}
          </>
        ) : null}
      </View>
      <View className="gap-1.5">
        <Text className="font-inter-semibold text-[13px] text-ink-soft">
          {late ? 'Why late?' : 'Note to the organisers'}<Text className="font-inter text-xs text-ink-muted">  optional</Text>
        </Text>
        <TextInput value={reason} onChangeText={setReason} multiline accessibilityLabel={late ? 'Why late?' : 'Note to the organisers'} placeholder="Anything they should know." className={TEXT_INPUT} style={{ minHeight: 60, textAlignVertical: 'top' }} />
      </View>
      {!late ? <Text className="font-inter text-xs text-ink-muted">The organisers approve it. Until then it shows as Asks to enter, and you can cancel it.</Text> : null}
    </EditDialog>
  );
}
