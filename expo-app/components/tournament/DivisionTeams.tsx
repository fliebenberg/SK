import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CandidateTeam,
  Event,
  EventOrgBadge,
  GameSummary,
  OrgBadge,
  SocketAction,
  TournamentDivision,
  TournamentEntrant,
  entryLockGaps,
  isDualEvent,
  entrantStatusShown,
  isPlayedFixture,
  teamQualifies,
  toEntrantInput,
  entrantTakesAPlace,
  isEntrantInPlay,
  isEntrantEntered,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { ConfirmationModal } from '../ConfirmationModal';
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu';
import { ReadCardEmpty } from '../ReadCard';
import { TEXT_INPUT } from '../formStyles';
import { FixtureCrest } from '../events/EventBits';
import { InvitationBadge, TournamentCard } from './TournamentBits';
import { DivisionLockBar, EntrantBadge, OrgAddingLine, RequestRow, askedLine } from './DivisionEntries';
import { formatInstantDate } from '../../utils/dates';
import { sendAction } from '../../services/actions';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * The division page's Teams card (`FIX-27`, docs/events.md §8): who is in the division, *＋ Add
 * team*, and each team's ⋯ — *Replace*, *Withdraw*, *Remove*.
 *
 * **Statuses** (`FIX-31`): each team's own answer, as the organisers see it (`entrantStatusShown`):
 * *Not invited yet* while its organisation has not been invited, *Invited* until the team — and,
 * for an accept, its organisation — has answered, then the answer. Once locked, accepted teams drop
 * their badge. Requests wait at the top, tinted, with their reason: a team added or asked for late
 * (✓ Accept / Turn down) and a withdrawal (Confirm withdrawal / Keep them in). Declined, turned down
 * and withdrawn teams sit under *Not taking part*. The foot of the card holds *Organisations can add
 * their own teams* (`FIX-33`) while entries are open, and the lock. Inviting an organisation is never
 * offered here — that is the tournament's organisers', on the tournament page.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What a team has in the draw: its fixtures, and how many it has played. */
export function teamFixtures(entrant: TournamentEntrant, games: GameSummary[]) {
  const own = games.filter(g => (g.participants || []).some(p => p.entrantId === entrant.id));
  const played = own.filter(isPlayedFixture).length;
  return { total: own.length, played, unplayed: own.length - played };
}

/** A competitor's crest: its organisation's, from the candidates read, or a dashed one. */
function TeamCrest({ org, size = 28, placeholder }: { org?: OrgBadge; size?: number; placeholder?: boolean }) {
  return (
    <FixtureCrest
      participant={org ? { id: org.id, orgId: org.id, orgLogo: org.logo, orgLogoConfig: org.logoConfig, orgPrimaryColor: org.primaryColor } : undefined}
      size={size}
      placeholder={placeholder || !org}
    />
  );
}

/* ---------------------------------------------------------------------------------------------
 * The card
 * ------------------------------------------------------------------------------------------- */

export function DivisionTeamsCard({ division, event, orgId, entrants, games, orgs, teams, eventEntrants, canEdit, drawn, started, adding: addingProp, onAdding, replacing: replacingProp, onReplacing }: {
  division: TournamentDivision;
  event: Event;
  /** The acting workspace. */
  orgId: string;
  /** The division's roster, withdrawn teams included. */
  entrants: TournamentEntrant[];
  /** The division's fixtures. */
  games: GameSummary[];
  /** The organisations that may enter, from `event_candidate_teams`. */
  orgs: OrgBadge[];
  /** Their teams that could be entered. */
  teams: CandidateTeam[];
  /** The whole tournament's roster when this viewer holds it, so a team entered elsewhere is not offered. */
  eventEntrants: TournamentEntrant[] | null;
  canEdit: boolean;
  drawn: boolean;
  started: boolean;
  /** Add teams and Replace may be opened from the page's what's-next strip too. */
  adding?: boolean;
  onAdding?: (open: boolean) => void;
  replacing?: TournamentEntrant | null;
  onReplacing?: (entrant: TournamentEntrant | null) => void;
}) {
  const [ownAdding, setOwnAdding] = useState(false);
  const [ownReplacing, setOwnReplacing] = useState<TournamentEntrant | null>(null);
  const adding = addingProp ?? ownAdding;
  const setAdding = onAdding ?? setOwnAdding;
  const replacing = replacingProp !== undefined ? replacingProp : ownReplacing;
  const setReplacing = onReplacing ?? setOwnReplacing;
  const [confirming, setConfirming] = useState<{ kind: 'withdraw' | 'remove' | 'reinstate' | 'decline' | 'confirmWithdrawal' | 'turnDown'; entrant: TournamentEntrant } | null>(null);
  const [busy, setBusy] = useState(false);

  const orgOf = (id?: string) => orgs.find(o => o.id === id) || event.participatingOrgs?.find(o => o.id === id);
  const invitationOf = (id?: string): EventOrgBadge['invitation'] | null =>
    !id || id === event.orgId ? null : event.participatingOrgs?.find(o => o.id === id)?.invitation || null;
  const locked = !!division.entriesLockedAt;
  const gaps = entryLockGaps(entrants, event);
  const dual = isDualEvent(event);

  // Requests wait at the top; teams taking part next; teams out of it under *Not taking part*.
  const requests = entrants.filter(e => e.status === 'requested' || e.status === 'withdrawal_pending');
  const active = entrants.filter(e => e.status === 'invited' || e.status === 'accepted');
  const out = entrants.filter(e => e.status === 'declined' || e.status === 'rejected' || e.status === 'withdrawn');

  const send = async (run: () => Promise<{ ok: boolean }>) => {
    setBusy(true);
    const result = await run();
    setBusy(false);
    if (result.ok) setConfirming(null);
    return result.ok;
  };
  /** The roster written whole (D13), with one entrant changed — or left out, to remove it. */
  const writeRoster = (change: { entrantId: string; status?: 'active' | 'withdrawn'; remove?: boolean }) => send(() => {
    const roster = entrants
      .filter(e => !(change.remove && e.id === change.entrantId))
      .map(e => toEntrantInput(e.id === change.entrantId && change.status ? { ...e, status: change.status } : e));
    return sendAction(SocketAction.SET_DIVISION_ENTRANTS, { divisionId: division.id, orgId, entrants: roster });
  });
  const answer = (e: TournamentEntrant, value: 'accepted' | 'declined') =>
    send(() => sendAction(SocketAction.SET_ENTRANT_ANSWER, { divisionId: division.id, entrantId: e.id, orgId, answer: value }));
  const respond = (e: TournamentEntrant, accept: boolean) =>
    send(() => sendAction(SocketAction.RESPOND_ENTRANT_REQUEST, { divisionId: division.id, entrantId: e.id, orgId, accept }));
  const setLock = (lock: boolean) =>
    send(() => sendAction(SocketAction.SET_DIVISION_LOCK, { divisionId: division.id, orgId, locked: lock }));
  const setAddingAllowed = (allow: boolean | null) =>
    send(() => sendAction(SocketAction.SET_DIVISION_ORG_ADDING, { divisionId: division.id, orgId, allow }));

  /** What a team's row says under its name — its organisation, or why it waits. */
  const subOf = (e: TournamentEntrant, shown: ReturnType<typeof entrantStatusShown>) => {
    const org = orgOf(e.orgId);
    const fixtures = teamFixtures(e, games);
    const isPlaceholder = !e.teamId && !e.orgProfileId;
    if (isPlaceholder) return 'A place to be filled later';
    const by = (who?: { name: string } | null, at?: string | null) =>
      [who?.name ? `by ${who.name}` : '', formatInstantDate(at)].filter(Boolean).join(' · ');
    switch (e.status) {
      case 'withdrawn':
        return fixtures.played
          ? `Withdrew · its ${plural(fixtures.played, 'result')} stand${fixtures.unplayed ? ` · ${fixtures.unplayed} still to play` : ''}`
          : `Withdrew${fixtures.unplayed ? ` · ${plural(fixtures.unplayed, 'fixture')} still in the draw` : ''}`;
      case 'declined':
        return [`Declined ${by(e.answeredBy, e.answeredAt)}`.trim(), org?.name].filter(Boolean).join(' · ');
      case 'rejected':
        return [`Turned down ${formatInstantDate(e.answeredAt)}`.trim(), org?.name].filter(Boolean).join(' · ');
    }
    if (shown === 'not_invited') return `Invited along with ${org?.name || 'its organisation'}, which is not invited yet`;
    const invitation = invitationOf(e.orgId);
    if (shown === 'invited' && (invitation === 'invited' || invitation === 'not_invited')) {
      return `${org?.name || 'Its organisation'} has not answered its invitation yet`;
    }
    if (shown === 'invited') return `${org?.name || 'Its organisation'} · no answer yet`;
    return org?.name || '';
  };

  const menuOf = (e: TournamentEntrant): OverflowMenuItem[] => {
    if (!canEdit) return [];
    const isPlaceholder = !e.teamId && !e.orgProfileId;
    const fixtures = teamFixtures(e, games);
    const org = orgOf(e.orgId);
    const invitation = invitationOf(e.orgId);
    const orgIn = !invitation || invitation === 'accepted' || invitation === 'withdrawal_pending';
    const items: OverflowMenuItem[] = [];
    if (e.status === 'withdrawn') {
      if (fixtures.unplayed) {
        items.push({ label: 'Replace', description: `Another team takes over its ${plural(fixtures.unplayed, 'fixture')} still to play`, icon: 'swap-horizontal-outline', onPress: () => setReplacing(e) });
      }
      items.push({ label: 'Put back in', description: 'It plays on, in its place in the draw', icon: 'arrow-undo-outline', onPress: () => setConfirming({ kind: 'reinstate', entrant: e }) });
      return items;
    }
    if (e.status === 'rejected') {
      items.push({ label: 'Remove', description: 'Taken off the list', icon: 'trash-outline', onPress: () => setConfirming({ kind: 'remove', entrant: e }), destructive: true });
      return items;
    }
    // Before the lock the organisers may answer for a team (`FIX-31` rule 6): accept once its
    // organisation has accepted; decline at any time.
    if (!locked && !isPlaceholder) {
      if (e.status !== 'accepted') {
        items.push(orgIn
          ? { label: 'Mark as accepted', description: 'Speaking for the team: it is coming', icon: 'checkmark-circle-outline', onPress: () => answer(e, 'accepted') }
          : { label: 'Mark as accepted', description: `Once ${org?.name || 'its organisation'} has accepted the invitation`, icon: 'checkmark-circle-outline', onPress: () => {}, disabled: true });
      }
      if (e.status !== 'declined') {
        items.push({ label: 'Mark as declined', description: 'Speaking for the team: it is not coming', icon: 'close-circle-outline', onPress: () => setConfirming({ kind: 'decline', entrant: e }) });
      }
    }
    if (e.status === 'declined') return items;
    items.push({
      label: isPlaceholder ? 'Name it' : 'Replace',
      description: isPlaceholder ? 'Put a team in this place' : drawn ? 'Another team takes its place in the draw' : 'Another team takes its place',
      icon: 'swap-horizontal-outline',
      onPress: () => setReplacing(e),
    });
    if ((drawn || locked) && !isPlaceholder && e.status === 'accepted') {
      items.push({ label: 'Withdraw', description: 'It stays in the draw, marked withdrawn; any results stand', icon: 'exit-outline', onPress: () => setConfirming({ kind: 'withdraw', entrant: e }) });
    }
    items.push(fixtures.played
      ? { label: 'Remove', description: 'It has played — withdraw it instead', icon: 'trash-outline', onPress: () => {}, destructive: true, disabled: true }
      : { label: 'Remove', description: 'Taken out as if never entered', icon: 'trash-outline', onPress: () => setConfirming({ kind: 'remove', entrant: e }), destructive: true });
    return items;
  };

  const row = (e: TournamentEntrant) => {
    const isPlaceholder = !e.teamId && !e.orgProfileId;
    const org = orgOf(e.orgId);
    const shown = entrantStatusShown(e.status, invitationOf(e.orgId), false);
    const struck = e.status === 'withdrawn' || e.status === 'declined' || e.status === 'rejected';
    const sub = subOf(e, shown);
    const items = menuOf(e);
    // Once locked every team in has accepted, so only the exceptions keep a badge.
    const badge = isPlaceholder ? (
      <View className="rounded-full border border-dashed border-ink-faint px-2 py-0.5"><Text className="font-inter-semibold text-[11px] text-ink-muted">To be named</Text></View>
    ) : locked && shown === 'accepted' ? null : <EntrantBadge status={shown} />;
    return (
      <View key={e.id} testID={`entrant-${e.id}`} className="flex-row items-center gap-2.5 py-2 border-t border-line-soft">
        <TeamCrest org={org} placeholder={isPlaceholder} />
        <View className="flex-1 min-w-0">
          <Text numberOfLines={1} className={`text-sm ${isPlaceholder ? 'font-inter italic text-ink-soft' : struck ? 'font-inter-semibold text-ink-muted line-through' : 'font-inter-semibold text-ink'}`}>
            {e.name || e.label || 'To be named'}
          </Text>
          {sub ? <Text numberOfLines={2} className="font-inter text-xs text-ink-muted">{sub}</Text> : null}
        </View>
        {badge}
        {items.length ? <OverflowMenu items={items} title={e.name || e.label || 'Team'} accessibilityLabel={`${e.name || e.label || 'Team'} actions`} /> : null}
      </View>
    );
  };

  const requestRow = (e: TournamentEntrant) => {
    const fixtures = teamFixtures(e, games);
    const withdrawal = e.status === 'withdrawal_pending';
    const extra = withdrawal
      ? fixtures.total ? `${plural(fixtures.total, 'fixture')} in the draw, ${fixtures.played ? `${fixtures.played} played` : 'none played'}` : undefined
      : locked ? 'after the lock' : undefined;
    return (
      <RequestRow
        key={e.id}
        entrant={e}
        crest={<TeamCrest org={orgOf(e.orgId)} />}
        sub={[orgOf(e.orgId)?.name, askedLine(e, extra)].filter(Boolean).join(' · ')}
        busy={busy}
        acceptLabel={withdrawal ? 'Confirm withdrawal' : '✓ Accept'}
        declineLabel={withdrawal ? 'Keep them in' : 'Turn down'}
        onAccept={canEdit ? () => (withdrawal ? setConfirming({ kind: 'confirmWithdrawal', entrant: e }) : respond(e, true)) : undefined}
        onDecline={canEdit ? () => (withdrawal ? respond(e, false) : setConfirming({ kind: 'turnDown', entrant: e })) : undefined}
      />
    );
  };

  const confirmText = (() => {
    if (!confirming) return { title: '', body: '', action: '' };
    const e = confirming.entrant;
    // A division often has several "U16 A"s: a confirmation names whose.
    const orgName = orgOf(e.orgId)?.name;
    const name = e.name ? (orgName ? `${orgName}'s ${e.name}` : e.name) : e.label || 'this team';
    const f = teamFixtures(e, games);
    if (confirming.kind === 'withdraw' || confirming.kind === 'confirmWithdrawal') {
      return {
        title: `Withdraw ${name}?`,
        body: (f.played
          ? `It has played ${plural(f.played, 'game')}. Those results stand: it stays in the table, listed last with no rank.`
          : 'It has played no game yet.') +
          (f.unplayed
            ? ` Its ${plural(f.unplayed, 'fixture')} still to play stay in the draw, marked withdrawn, until ${started ? 'you change them by hand' : 'you redo the draw'} or replace the team.`
            : ''),
        action: confirming.kind === 'confirmWithdrawal' ? 'Confirm withdrawal' : 'Withdraw',
      };
    }
    if (confirming.kind === 'decline') {
      return { title: `Decline ${name}?`, body: 'It moves to Not taking part.', action: '✕ Decline' };
    }
    if (confirming.kind === 'turnDown') {
      return { title: `Turn down ${name}?`, body: 'It stays listed as turned down.', action: 'Turn down' };
    }
    if (confirming.kind === 'remove') {
      return {
        title: `Remove ${name}?`,
        body: `It is taken out of ${division.name} as if it was never entered.${f.total ? ` Its ${plural(f.total, 'fixture')} in the draw are left without a team.` : ''}`,
        action: 'Remove',
      };
    }
    return { title: `Put ${name} back in?`, body: 'It plays on in its place in the draw.', action: 'Put back in' };
  })();

  const confirm = () => {
    if (!confirming) return;
    const e = confirming.entrant;
    switch (confirming.kind) {
      case 'remove': return writeRoster({ entrantId: e.id, remove: true });
      case 'withdraw': return writeRoster({ entrantId: e.id, status: 'withdrawn' });
      case 'reinstate': return writeRoster({ entrantId: e.id, status: 'active' });
      case 'decline': return answer(e, 'declined');
      case 'confirmWithdrawal': return respond(e, true);
      case 'turnDown': return respond(e, false);
    }
  };

  return (
    <TournamentCard
      title="Teams"
      count={active.length + entrants.filter(e => e.status === 'withdrawal_pending').length}
      right={canEdit ? (
        <TouchableOpacity onPress={() => setAdding(true)} accessibilityRole="button" className="flex-row items-center gap-1">
          <Text className="font-inter-bold text-sm text-primary-ink">＋ Add team</Text>
        </TouchableOpacity>
      ) : undefined}
    >
      {!entrants.length ? (
        <ReadCardEmpty
          text="No teams yet. Add them from any organisation taking part, or a place to be filled later, such as Winner of the regional qualifier."
          action={canEdit ? 'Add teams' : undefined}
          onPress={canEdit ? () => setAdding(true) : undefined}
        />
      ) : (
        <View className="-mt-2">
          {requests.length ? <View className="pt-2">{requests.map(requestRow)}</View> : null}
          {active.map(row)}
          {out.length ? (
            <>
              <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider pt-3 pb-1">Not taking part</Text>
              {out.map(row)}
            </>
          ) : null}
        </View>
      )}

      {/* A Head to Head has no lock and no adding of teams by the other side (`H2H-1`): the pairing is the entry. */}
      {canEdit && !locked && !dual ? (
        <OrgAddingLine
          division={division}
          event={event}
          busy={busy}
          onChange={allow => setAddingAllowed(allow)}
          onFollow={() => setAddingAllowed(null)}
        />
      ) : null}
      {entrants.length && !dual ? (
        <DivisionLockBar
          division={division}
          gaps={gaps}
          canEdit={canEdit}
          busy={busy}
          onLock={() => setLock(true)}
          onUnlock={() => setLock(false)}
        />
      ) : null}

      <AddTeamsDialog
        visible={adding}
        onClose={() => setAdding(false)}
        division={division}
        event={event}
        orgId={orgId}
        orgs={orgs}
        teams={teams}
        entrants={entrants}
        eventEntrants={eventEntrants}
      />
      <ReplaceTeamDialog
        visible={!!replacing}
        onClose={() => setReplacing(null)}
        entrant={replacing}
        division={division}
        event={event}
        orgId={orgId}
        orgs={orgs}
        teams={teams}
        entrants={entrants}
        eventEntrants={eventEntrants}
        games={games}
      />
      <ConfirmationModal
        isOpen={!!confirming}
        title={confirmText.title}
        description={confirmText.body}
        confirmText={confirmText.action}
        cancelText="Cancel"
        variant={confirming?.kind === 'reinstate' ? 'primary' : 'danger'}
        isProcessing={busy}
        onConfirm={confirm}
        onClose={() => setConfirming(null)}
      />
    </TournamentCard>
  );
}

/* ---------------------------------------------------------------------------------------------
 * The team picker: Add teams, and Replace
 * ------------------------------------------------------------------------------------------- */

/** A choice in the picker: a team, a late entry already in the division, or a place to be filled. */
type Pick = { kind: 'team'; team: CandidateTeam } | { kind: 'late'; entrant: TournamentEntrant } | { kind: 'place' };
const pickKey = (p: Pick) => (p.kind === 'team' ? `team:${p.team.id}` : p.kind === 'late' ? `late:${p.entrant.id}` : 'place');

/**
 * Organisations taking part, each with **its teams of this division's age group** that are free;
 * **＋ A team from another age group** opens its others, the exception rather than the rule. A place
 * to be filled later is at the foot. `single` chooses one (Replace); otherwise several (Add teams).
 */
function TeamPicker({ division, event, orgs, teams, takenTeamIds, lateEntrants = [], single, chosen, onToggle, placeLabel, onPlaceLabel }: {
  division: TournamentDivision;
  event: Event;
  orgs: OrgBadge[];
  teams: CandidateTeam[];
  takenTeamIds: Set<string>;
  lateEntrants?: TournamentEntrant[];
  single?: boolean;
  chosen: Set<string>;
  onToggle: (pick: Pick) => void;
  placeLabel: string;
  onPlaceLabel: (label: string) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [query, setQuery] = useState('');
  const [otherAges, setOtherAges] = useState<Set<string>>(new Set());
  const q = query.trim().toLowerCase();
  const matches = (...texts: Array<string | undefined>) => !q || texts.some(t => (t || '').toLowerCase().includes(q));

  // Only organisations taking part: the host, and every one not declined or withdrawn.
  const invitationOf = (id: string) => (id === event.orgId ? 'accepted' : event.participatingOrgs?.find(o => o.id === id)?.invitation);
  const takingPart = orgs.filter(o => {
    const inv = invitationOf(o.id);
    return !!inv && inv !== 'declined' && inv !== 'withdrawn';
  });
  const free = teams.filter(t => t.sportId === division.sportId && !takenTeamIds.has(t.id));
  const age = division.ageGroup || '';

  const option = (pick: Pick, label: string, sub?: string) => {
    const on = chosen.has(pickKey(pick));
    return (
      <TouchableOpacity
        key={pickKey(pick)}
        onPress={() => onToggle(pick)}
        accessibilityRole={single ? 'radio' : 'checkbox'}
        accessibilityState={{ checked: on }}
        className="flex-row items-center gap-2.5 py-2 border-t border-line-soft"
      >
        <Ionicons
          name={single ? (on ? 'radio-button-on' : 'radio-button-off') : on ? 'checkbox' : 'square-outline'}
          size={19}
          color={themeColor(isDark, on ? 'ink' : 'ink-faint')}
        />
        <View className="flex-1 min-w-0">
          <Text className="font-inter text-sm text-ink" numberOfLines={1}>{label}</Text>
          {sub ? <Text className="font-inter text-xs text-ink-muted">{sub}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const groups = takingPart
    .map(org => {
      const own = free.filter(t => t.orgId === org.id && matches(t.name, org.name, org.shortName));
      return { org, same: own.filter(t => teamQualifies(t, division)), other: own.filter(t => !teamQualifies(t, division)) };
    })
    .filter(g => !q || g.same.length || g.other.length);

  return (
    <View className="gap-2">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search organisations and teams"
        placeholderTextColor={themeColor(isDark, 'ink-muted')}
        accessibilityLabel="Search organisations and teams"
        className={TEXT_INPUT}
      />

      {lateEntrants.length ? (
        <View>
          <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider pt-1">Entered, not in the draw</Text>
          {lateEntrants.map(e => option({ kind: 'late', entrant: e }, e.name || e.label || 'A late entry', 'Takes over the fixtures'))}
        </View>
      ) : null}

      {groups.map(({ org, same, other }) => {
        const inv = invitationOf(org.id);
        const showOther = otherAges.has(org.id) || (!!q && !same.length);
        return (
          <View key={org.id} className="pt-1">
            <View className="flex-row items-center gap-2 pb-1">
              <TeamCrest org={org} size={20} />
              <Text className="font-inter-bold text-[13px] text-ink-soft flex-shrink" numberOfLines={1}>{org.name}</Text>
              {inv && inv !== 'accepted' ? <InvitationBadge invitation={inv} /> : null}
            </View>
            {same.map(t => option({ kind: 'team', team: t }, t.name))}
            {!same.length ? (
              <Text className="font-inter text-xs text-ink-muted py-1.5 border-t border-line-soft">
                {age ? `No ${age} team free.` : 'No team free.'}
              </Text>
            ) : null}
            {other.length ? (
              showOther ? (
                <>
                  {other.map(t => option({ kind: 'team', team: t }, t.name, `${t.ageGroup || 'Any age'} · another age group`))}
                </>
              ) : (
                <TouchableOpacity
                  onPress={() => setOtherAges(prev => new Set(prev).add(org.id))}
                  accessibilityRole="button"
                  className="py-2 border-t border-line-soft"
                >
                  <Text className="font-inter-bold text-[13px] text-primary-ink">＋ A team from another age group</Text>
                </TouchableOpacity>
              )
            ) : null}
          </View>
        );
      })}
      {!groups.length ? <Text className="font-inter text-sm text-ink-muted">{q ? 'Nothing matches.' : 'No organisation has a team free.'}</Text> : null}

      <View className="border-t border-line mt-1">
        {option({ kind: 'place' }, 'A place to be filled later', 'Such as Winner of the regional qualifier')}
        {chosen.has('place') ? (
          <TextInput
            value={placeLabel}
            onChangeText={onPlaceLabel}
            autoFocus
            placeholder="What to call it until it is named"
            placeholderTextColor={themeColor(isDark, 'ink-muted')}
            accessibilityLabel="What to call it until it is named"
            className={TEXT_INPUT}
          />
        ) : null}
      </View>
      <Text className="font-inter text-xs text-ink-muted">
        Only organisations taking part are listed. Another is added on the tournament page, under Organisations &amp; teams.
      </Text>
    </View>
  );
}

/** The teams already playing — in this division, and anywhere else in the tournament when known. */
function useTakenTeamIds(entrants: TournamentEntrant[], eventEntrants: TournamentEntrant[] | null) {
  return useMemo(
    () => new Set([...(eventEntrants || []), ...entrants].filter(e => entrantTakesAPlace(e.status) && e.teamId).map(e => e.teamId as string)),
    [entrants, eventEntrants]
  );
}

function AddTeamsDialog({ visible, onClose, division, event, orgId, orgs, teams, entrants, eventEntrants }: {
  visible: boolean;
  onClose: () => void;
  division: TournamentDivision;
  event: Event;
  orgId: string;
  orgs: OrgBadge[];
  teams: CandidateTeam[];
  entrants: TournamentEntrant[];
  eventEntrants: TournamentEntrant[] | null;
}) {
  const [chosen, setChosen] = useState<Map<string, Pick>>(new Map());
  const [placeLabel, setPlaceLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const taken = useTakenTeamIds(entrants, eventEntrants);
  useEffect(() => { if (visible) { setChosen(new Map()); setPlaceLabel(''); } }, [visible]);

  const toggle = (pick: Pick) =>
    setChosen(prev => {
      const next = new Map(prev);
      const key = pickKey(pick);
      if (next.has(key)) next.delete(key); else next.set(key, pick);
      return next;
    });

  const picks = [...chosen.values()];
  const count = picks.filter(p => p.kind !== 'place' || placeLabel.trim()).length;

  const save = async () => {
    setSaving(true);
    const added = picks.flatMap(p =>
      p.kind === 'team'
        ? [toEntrantInput({ teamId: p.team.id, orgId: p.team.orgId, status: 'active' })]
        : p.kind === 'place' && placeLabel.trim()
          ? [toEntrantInput({ label: placeLabel.trim(), status: 'active' })]
          : []
    );
    const result = await sendAction(SocketAction.SET_DIVISION_ENTRANTS, {
      divisionId: division.id,
      orgId,
      entrants: [...entrants.map(e => toEntrantInput(e)), ...added],
    });
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title={`Add teams to ${division.name}`}
      onClose={onClose}
      onSave={save}
      saveLabel={count > 1 ? `Add ${count} teams` : 'Add team'}
      saveDisabled={!count}
      isSaving={saving}
      isDirty={chosen.size > 0}
    >
      <TeamPicker
        division={division}
        event={event}
        orgs={orgs}
        teams={teams}
        takenTeamIds={taken}
        chosen={new Set(chosen.keys())}
        onToggle={toggle}
        placeLabel={placeLabel}
        onPlaceLabel={setPlaceLabel}
      />
    </EditDialog>
  );
}

/**
 * *Replace*, and *Name it* for a place to be filled: the same picker choosing one, with a late
 * entry not yet in the draw offered first, since swapping it in is usually why the organiser is
 * here. **Says before confirming which of the two replacements happens** (`REPLACE_ENTRANT`): with
 * nothing played the replacement takes everything; with results, the old team keeps them and the
 * replacement takes only the fixtures still to play.
 */
function ReplaceTeamDialog({ visible, onClose, entrant, division, event, orgId, orgs, teams, entrants, eventEntrants, games }: {
  visible: boolean;
  onClose: () => void;
  entrant: TournamentEntrant | null;
  division: TournamentDivision;
  event: Event;
  orgId: string;
  orgs: OrgBadge[];
  teams: CandidateTeam[];
  entrants: TournamentEntrant[];
  eventEntrants: TournamentEntrant[] | null;
  games: GameSummary[];
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [placeLabel, setPlaceLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const taken = useTakenTeamIds(entrants, eventEntrants);
  useEffect(() => { if (visible) { setPick(null); setPlaceLabel(''); } }, [visible]);
  if (!entrant) return null;

  const name = entrant.name || entrant.label || 'this place';
  const isPlaceholder = !entrant.teamId && !entrant.orgProfileId;
  const f = teamFixtures(entrant, games);
  // Entered, active, and in no fixture: the late entries a swap would put into the draw.
  const lateEntrants = f.total
    ? entrants.filter(e => e.id !== entrant.id && isEntrantInPlay(e.status) && !teamFixtures(e, games).total)
    : [];
  const ready = !!pick && (pick.kind !== 'place' || !!placeLabel.trim());

  const save = async () => {
    if (!pick) return;
    setSaving(true);
    const result = await sendAction(SocketAction.REPLACE_ENTRANT, {
      divisionId: division.id,
      orgId,
      entrantId: entrant.id,
      ...(pick.kind === 'team'
        ? { teamId: pick.team.id }
        : pick.kind === 'late'
          ? { replacementEntrantId: pick.entrant.id }
          : { label: placeLabel.trim() }),
    });
    setSaving(false);
    if (result.ok) onClose();
  };

  const what = !f.total
    ? 'The replacement takes its place in the division.'
    : f.played
      ? `It keeps its ${plural(f.played, 'result')} and stays in the table, listed last with no rank. The replacement takes its place in the draw and the ${plural(f.unplayed, 'fixture')} still to play.`
      : `Nothing played yet, so the replacement takes over all ${plural(f.total, 'fixture')} and its place in the draw.`;

  return (
    <EditDialog
      visible={visible}
      title={isPlaceholder ? `Name ${name}` : `Replace ${name}`}
      onClose={onClose}
      onSave={save}
      saveLabel={isPlaceholder ? 'Name it' : 'Replace'}
      saveDisabled={!ready}
      isSaving={saving}
      isDirty={!!pick}
    >
      <TeamPicker
        single
        division={division}
        event={event}
        orgs={orgs}
        teams={teams}
        takenTeamIds={taken}
        lateEntrants={lateEntrants}
        chosen={new Set(pick ? [pickKey(pick)] : [])}
        onToggle={p => setPick(p)}
        placeLabel={placeLabel}
        onPlaceLabel={setPlaceLabel}
      />
      {!isPlaceholder ? (
        <View className="rounded-xl bg-warning-soft border border-warning-line px-3 py-2">
          <Text className="font-inter text-[13px] text-warning-ink">{what}</Text>
        </View>
      ) : null}
    </EditDialog>
  );
}
