import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CandidateTeam,
  Event,
  EventOrgBadge,
  Organization,
  OrgProfile,
  SocketAction,
  Sport,
  Team,
  TournamentDivision,
  TournamentEntrant,
  teamQualifies,
  toEntrantInput,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import CustomSelect from '../CustomSelect';
import { PersonnelAutocomplete } from '../PersonnelAutocomplete';
import { FixtureCrest } from '../events/EventBits';
import { InvitationBadge } from './TournamentBits';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { wsService } from '../../services/websocket';
import { useAuthStore } from '../../store/authStore';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { formatInstantDate } from '../../utils/dates';

/**
 * The organisations taking part in a tournament, and their teams (`FIX-26`, agreed on
 * `mockups/organisations-teams.html`). Opened from step 3, *Organisations & teams*, and the
 * Overview's Organisations card.
 *
 * Organisations are **added** first — the organiser can enter their teams — and **invited** when
 * the organiser is ready; until then they cannot see the tournament (`FIX-29`). Each dialog writes
 * through `sendAction`; a refusal is already said and the dialog stays open.
 *
 * One dialog at a time: React Native Web stacks modals unreliably (`EditDialog`), so a step that
 * needs another dialog — registering an organisation, nominating a contact, confirming a removal —
 * closes this one and the page opens the next.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A row of a dialog list: crest, name, a line under it, and whatever goes at the end. */
function OrgLine({ org, sub, right, onPress }: {
  org: { id: string; name: string; logo?: string; logoConfig?: any; primaryColor?: string };
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <>
      <FixtureCrest participant={{ id: org.id, orgId: org.id, orgLogo: org.logo, orgLogoConfig: org.logoConfig, orgPrimaryColor: org.primaryColor }} size={26} />
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{org.name}</Text>
        {sub ? <Text className="font-inter text-xs text-ink-muted" numberOfLines={1}>{sub}</Text> : null}
      </View>
      {right}
    </>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} accessibilityRole="checkbox" className="flex-row items-center gap-2.5 py-2">{body}</TouchableOpacity>
  ) : (
    <View className="flex-row items-center gap-2.5 py-2">{body}</View>
  );
}

function Tick({ on }: { on: boolean }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <View className={`w-5 h-5 rounded-md border items-center justify-center ${on ? 'bg-primary border-primary' : 'border-line-strong'}`}>
      {on ? <Ionicons name="checkmark" size={13} color={themeColor(isDark, 'on-primary')} /> : null}
    </View>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Add organisations
 * ------------------------------------------------------------------------------------------- */

/**
 * *Add organisations*: search every school and club on ScoreKeeper, tick as many as you like, then
 * **Add** or **Add and invite**. Which is the main button follows the tournament: until the first
 * invitation has gone out an organiser is still building it, so Add; after, Add and invite.
 * One not found is registered — `onRegister` closes this and opens the register dialog.
 */
export function AddOrganisationsDialog({ visible, event, orgId, onClose, onRegister }: {
  visible: boolean;
  event: Event;
  orgId: string;
  onClose: () => void;
  onRegister: (typedName: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Organization[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<Organization[]>([]);
  const [saving, setSaving] = useState(false);
  const takingPart = new Set((event.participatingOrgs || []).map(o => o.id));
  const anyInvited = (event.participatingOrgs || []).some(o => o.id !== event.orgId && o.invitation !== 'not_invited');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setFound([]);
    setChosen([]);
  }, [visible]);

  // A search, not a list of every organisation: "organisations not yet in this event" is a set no
  // room owns (`FIX-2`), so it is a one-shot read.
  useEffect(() => {
    const text = query.trim();
    if (!text) { setFound([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      wsService.emit('get_data', { type: 'search_similar_orgs', name: text }, (res: any) => {
        setSearching(false);
        if (Array.isArray(res)) setFound(res.slice(0, 12));
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const isChosen = (id: string) => chosen.some(o => o.id === id);
  const toggle = (org: Organization) => setChosen(prev => (isChosen(org.id) ? prev.filter(o => o.id !== org.id) : [...prev, org]));

  const add = async (invite: boolean) => {
    if (!chosen.length) return;
    setSaving(true);
    const result = await sendAction(SocketAction.ADD_EVENT_ORGS, { eventId: event.id, orgId, participantOrgIds: chosen.map(o => o.id), invite });
    setSaving(false);
    if (result.ok) onClose();
  };

  const n = chosen.length;
  const primaryInvites = anyInvited;
  const secondary = (
    <TouchableOpacity onPress={() => add(!primaryInvites)} disabled={!n || saving} accessibilityRole="button" className="py-2">
      <Text className={`font-inter-bold text-sm ${n ? 'text-primary-ink' : 'text-ink-muted'}`}>{primaryInvites ? 'Add only' : 'Add and invite'}</Text>
    </TouchableOpacity>
  );

  return (
    <EditDialog
      visible={visible}
      title="Add organisations"
      onClose={onClose}
      onSave={() => add(primaryInvites)}
      saveLabel={`${primaryInvites ? 'Add and invite' : 'Add'}${n ? ` ${n}` : ''}`}
      saveDisabled={!n}
      isSaving={saving}
      isDirty={n > 0}
      footerLeft={secondary}
    >
      {n ? (
        <View className="flex-row flex-wrap gap-1.5">
          {chosen.map(o => (
            <TouchableOpacity key={o.id} onPress={() => toggle(o)} accessibilityLabel={`Remove ${o.name} from the list`} className="flex-row items-center gap-1.5 rounded-full border border-line-selected bg-raised pl-2.5 pr-2 py-1">
              <Text className="font-inter-semibold text-xs text-ink">{o.name}</Text>
              <Ionicons name="close" size={12} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <TextInput
        value={query}
        onChangeText={setQuery}
        autoFocus
        placeholder="Search schools and clubs…"
        accessibilityLabel="Search organisations"
        className={TEXT_INPUT}
      />
      {searching ? <ActivityIndicator /> : null}
      {found.length ? (
        <View>
          {found.map(org => {
            const already = takingPart.has(org.id);
            return (
              <OrgLine
                key={org.id}
                org={{ ...org, logoConfig: (org.settings as any)?.logoConfig }}
                sub={org.shortName}
                onPress={already ? undefined : () => toggle(org)}
                right={already ? <Text className="font-inter text-xs text-ink-muted">Taking part</Text> : <Tick on={isChosen(org.id)} />}
              />
            );
          })}
        </View>
      ) : null}
      {query.trim() && !searching ? (
        <TouchableOpacity onPress={() => onRegister(query.trim())} accessibilityRole="button" className="flex-row items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5">
          <Text className="font-inter-bold text-[13px] text-primary-ink">＋ Register “{query.trim()}”</Text>
          <Text className="font-inter text-[13px] text-ink-muted">— not on ScoreKeeper yet</Text>
        </TouchableOpacity>
      ) : null}
      <Text className="font-inter text-xs text-ink-muted leading-relaxed">
        {primaryInvites
          ? 'Add and invite: they can see the tournament straight away. Add only: you can enter their teams, and invite them later from their row.'
          : "Added organisations can't see the tournament until you invite them — all at once, or one at a time from their row. You can enter their teams in the meantime."}
        {' '}Taking part never lets anyone from an organisation change the tournament.
      </Text>
    </EditDialog>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Invite all
 * ------------------------------------------------------------------------------------------- */

/** *Invite all*: names who is invited and what they will see; flags one nobody manages. */
export function InviteOrganisationsDialog({ visible, event, orgId, onClose, onNominate }: {
  visible: boolean;
  event: Event;
  orgId: string;
  onClose: () => void;
  onNominate: (org: EventOrgBadge) => void;
}) {
  const [saving, setSaving] = useState(false);
  const pending = (event.participatingOrgs || []).filter(o => o.id !== event.orgId && o.invitation === 'not_invited');
  const unmanaged = pending.filter(o => o.isClaimed === false);
  const names = pending.map(o => o.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';

  const invite = async () => {
    setSaving(true);
    const result = await sendAction(SocketAction.INVITE_EVENT_ORGS, { eventId: event.id, orgId, participantOrgIds: pending.map(o => o.id) });
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title={pending.length === 1 ? 'Invite 1 organisation?' : `Invite ${pending.length} organisations?`}
      onClose={onClose}
      onSave={invite}
      saveLabel={pending.length === 1 ? 'Invite' : `Invite ${pending.length}`}
      saveDisabled={!pending.length}
      isSaving={saving}
    >
      <Text className="font-inter text-sm text-ink leading-relaxed">
        {list} {pending.length === 1 ? 'is' : 'are'} invited to <Text className="font-inter-bold">{event.name}</Text>.
      </Text>
      <Text className="font-inter text-sm text-ink-soft leading-relaxed">
        {pending.length === 1 ? 'It' : 'Each'} can then see the tournament, its divisions and fixtures, and {pending.length === 1 ? 'its' : 'its own'} teams' entries.
      </Text>
      {unmanaged.map(org => (
        <View key={org.id} className="flex-row items-center gap-2.5 rounded-xl bg-sunken px-3 py-2">
          <FixtureCrest participant={{ id: org.id, orgId: org.id, orgLogo: org.logo, orgLogoConfig: org.logoConfig, orgPrimaryColor: org.primaryColor }} size={22} />
          <Text className="flex-1 font-inter text-[13px] text-ink-soft">Nobody manages {org.name} on ScoreKeeper yet, so nobody there can see it.</Text>
          <TouchableOpacity onPress={() => onNominate(org)} accessibilityRole="button">
            <Text className="font-inter-bold text-[13px] text-primary-ink">Nominate a contact</Text>
          </TouchableOpacity>
        </View>
      ))}
    </EditDialog>
  );
}

/* ---------------------------------------------------------------------------------------------
 * One organisation: its invitation and its teams
 * ------------------------------------------------------------------------------------------- */

/** May this user create a team or a person in that organisation — the question `orgGate` answers. */
export function useCanWriteInto() {
  const user = useAuthStore((state: any) => state.user);
  const memberships = useAuthStore((state: any) => state.orgMemberships) || [];
  return (org: { id: string; isClaimed?: boolean } | null | undefined, actingOrgId: string) => {
    if (!org) return false;
    if (org.id === actingOrgId || user?.globalRole === 'admin') return true;
    const runsIt = memberships.some(
      (m: any) => m.orgId === org.id && (m.roleId === 'role-org-admin' || m.roleId === 'role-org-staff') && (!m.endDate || new Date(m.endDate) > new Date())
    );
    // Trusted only when it says false: an older payload without the field reads as claimed.
    return runsIt || org.isClaimed === false;
  };
}

/** One competitor in a division row of the dialog. */
interface Pick_ {
  key: string;
  label: string;
  kind: 'team' | 'placeholder' | 'person';
  teamId?: string;
  orgProfileId?: string;
  /** The existing entrant, when it is entered already. */
  entrantId?: string;
  on: boolean;
  /** Ticked when the dialog opened. */
  was: boolean;
  played: number;
  note?: string;
}

/**
 * An organisation's dialog: its invitation at the top, then every division of the tournament,
 * grouped by sport, with its teams as chips — ticked is entered. Tick and untick, then **Save**,
 * which writes only the divisions that changed. Each division row ends in **＋**: another of its
 * teams (playing up), a new team (only where this user may create one), or a place to be filled
 * later. An individual sport lists players instead.
 *
 * The answer — No answer yet, Accepted, Declined — writes as it is chosen, like inviting: it is a
 * fact being recorded, not part of the teams being edited.
 */
export function OrganisationDialog({
  visible, event, orgId, org, isHost, canAnswer, sports, divisions, entrants, candidateTeams,
  onClose, onRemove, onNominate, onTeamCreated,
}: {
  visible: boolean;
  event: Event;
  orgId: string;
  org: EventOrgBadge | null;
  isHost: boolean;
  /** The tournament's organisers, or this organisation's own admins. */
  canAnswer: boolean;
  sports: Sport[];
  divisions: TournamentDivision[];
  /** Every entrant of the tournament, withdrawn ones included. */
  entrants: TournamentEntrant[];
  candidateTeams: CandidateTeam[];
  onClose: () => void;
  onRemove: (org: EventOrgBadge) => void;
  onNominate: (org: EventOrgBadge) => void;
  onTeamCreated: (team: Team) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const canWriteInto = useCanWriteInto();
  const [picks, setPicks] = useState<Record<string, Pick_[]>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [answering, setAnswering] = useState(false);

  const sportOf = (id?: string) => sports.find(s => s.id === id);
  const sportOrder = event.sportIds || [];
  const ordered = useMemo(
    () => [...divisions]
      .filter(d => d.sportId && sportOrder.includes(d.sportId))
      .sort((a, b) => sportOrder.indexOf(a.sportId!) - sportOrder.indexOf(b.sportId!) || (a.sortOrder || 0) - (b.sortOrder || 0)),
    [divisions, sportOrder]
  );
  const active = entrants.filter(e => e.status !== 'withdrawn');
  const enteredTeamIds = new Set(active.map(e => e.teamId).filter(Boolean) as string[]);

  // What each division row offers, worked out when the dialog opens and then edited in place.
  useEffect(() => {
    if (!visible || !org) return;
    const next: Record<string, Pick_[]> = {};
    for (const d of ordered) {
      const mine = active.filter(e => e.divisionId === d.id && e.orgId === org.id);
      const rows: Pick_[] = mine.map(e => ({
        key: `entrant:${e.id}`,
        label: e.name || e.label || 'To be named',
        kind: e.teamId ? 'team' : e.orgProfileId ? 'person' : 'placeholder',
        teamId: e.teamId,
        orgProfileId: e.orgProfileId,
        entrantId: e.id,
        on: true,
        was: true,
        played: e.playedCount || 0,
      }));
      // Its teams that can play here and are not entered anywhere in the tournament yet.
      for (const team of candidateTeams) {
        if (team.orgId !== org.id || enteredTeamIds.has(team.id) || !teamQualifies(team, d)) continue;
        rows.push({ key: `team:${team.id}`, label: team.name, kind: 'team', teamId: team.id, on: false, was: false, played: 0 });
      }
      next[d.id] = rows;
    }
    setPicks(next);
    setAdding(null);
    // Opening the dialog is the moment to read; later changes to the roster arrive as the page's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, org?.id]);

  if (!org) return null;

  const toggle = (divisionId: string, key: string) =>
    setPicks(prev => {
      const target = prev[divisionId]?.find(p => p.key === key);
      if (!target) return prev;
      const turningOn = !target.on;
      const next: Record<string, Pick_[]> = {};
      for (const [id, rows] of Object.entries(prev)) {
        next[id] = rows.map(p => {
          if (id === divisionId && p.key === key) return { ...p, on: turningOn };
          // A team plays in one division of a tournament: ticking it here unticks it elsewhere.
          if (turningOn && target.teamId && p.teamId === target.teamId && p.on) return { ...p, on: false };
          return p;
        });
      }
      return next;
    });

  const addPick = (divisionId: string, pick: Omit<Pick_, 'on' | 'was' | 'played'>) => {
    setPicks(prev => ({ ...prev, [divisionId]: [...(prev[divisionId] || []), { ...pick, on: true, was: false, played: 0 }] }));
    setAdding(null);
  };

  const changed = Object.entries(picks).filter(([, rows]) => rows.some(p => p.on !== p.was));
  const withdrawing = Object.values(picks).flat().filter(p => p.was && !p.on && p.played > 0);

  const save = async () => {
    setSaving(true);
    // Divisions that only lose someone first, so a team moved between two is out of the first
    // before it is written into the second.
    const order = [...changed].sort(([, a], [, b]) => Number(a.some(p => p.on && !p.was)) - Number(b.some(p => p.on && !p.was)));
    for (const [divisionId, rows] of order) {
      // A roster is written whole (D13): everyone else's entries, and every withdrawn one — this
      // organisation's included — go back as they are; withdrawn rows are history, not choices here.
      const others = entrants.filter(e => e.divisionId === divisionId && (e.status === 'withdrawn' || e.orgId !== org.id));
      const kept = rows.filter(p => p.on);
      const roster = [
        ...others.map(e => toEntrantInput(e)),
        ...kept.map(p => toEntrantInput({
          id: p.entrantId,
          teamId: p.teamId,
          orgProfileId: p.orgProfileId,
          orgId: org.id,
          label: p.kind === 'placeholder' ? p.label : undefined,
          status: 'active',
        })),
      ];
      const result = await sendAction(SocketAction.SET_DIVISION_ENTRANTS, { divisionId, orgId, entrants: roster, takeFromOtherDivisions: true });
      if (!result.ok) { setSaving(false); return; }
    }
    setSaving(false);
    onClose();
  };

  const setAnswer = async (answer: string) => {
    if (!answer || answer === org.invitation) return;
    setAnswering(true);
    await sendAction(SocketAction.SET_EVENT_ORG_ANSWER, { eventId: event.id, orgId, participantOrgId: org.id, answer: answer as 'invited' | 'accepted' | 'declined' });
    setAnswering(false);
  };
  const inviteNow = async () => {
    setAnswering(true);
    await sendAction(SocketAction.INVITE_EVENT_ORGS, { eventId: event.id, orgId, participantOrgIds: [org.id] });
    setAnswering(false);
  };

  /* -- the invitation ---------------------------------------------------------------------- */
  const invitation = isHost ? (
    <Text className="font-inter text-[13px] text-ink-muted">The host takes part by hosting, so it has no invitation.</Text>
  ) : (
    <View className="flex-row items-center gap-3 rounded-xl border border-line px-3 py-2.5">
      <View className="flex-1 min-w-0 items-start gap-1">
        <InvitationBadge invitation={org.invitation} />
        {/* No date for one taking part before invitations were recorded: nothing, rather than the badge again. */}
        {org.invitation === 'not_invited' || formatInstantDate(org.invitedAt) ? (
          <Text className="font-inter text-xs text-ink-muted">
            {org.invitation === 'not_invited' ? "It can't see the tournament yet" : formatInstantDate(org.invitedAt)}
          </Text>
        ) : null}
      </View>
      {org.invitation === 'not_invited' ? (
        canAnswer ? (
          <TouchableOpacity onPress={inviteNow} disabled={answering} accessibilityRole="button" className="rounded-xl bg-primary px-3 py-1.5">
            <Text className="font-inter-bold text-[13px] text-on-primary">Invite</Text>
          </TouchableOpacity>
        ) : null
      ) : (
        <View className="items-end gap-1" style={{ minWidth: 150 }}>
          <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider">Answer</Text>
          {canAnswer ? (
            <View style={{ width: 160 }}>
              <CustomSelect
                value={org.invitation}
                onChange={setAnswer}
                options={[
                  { value: 'invited', label: 'No answer yet' },
                  { value: 'accepted', label: 'Accepted' },
                  { value: 'declined', label: 'Declined' },
                ]}
              />
            </View>
          ) : (
            <Text className="font-inter-semibold text-sm text-ink">{org.invitation === 'invited' ? 'No answer yet' : org.invitation === 'accepted' ? 'Accepted' : 'Declined'}</Text>
          )}
        </View>
      )}
    </View>
  );

  const writable = canWriteInto(org, orgId);
  const contact = org.isClaimed === false ? (
    <View className="flex-row items-center gap-2 rounded-xl bg-sunken px-3 py-2 flex-wrap">
      <Text className="flex-1 font-inter text-[13px] text-ink-soft">Nobody manages {org.name} on ScoreKeeper yet.</Text>
      <TouchableOpacity onPress={() => onNominate(org)} accessibilityRole="button">
        <Text className="font-inter-bold text-[13px] text-primary-ink">Nominate a contact</Text>
      </TouchableOpacity>
    </View>
  ) : !writable ? (
    <Text className="font-inter text-xs text-ink-muted">Its own admins add its teams. You can reserve a place for them with ＋, and they fill it in.</Text>
  ) : null;

  /* -- the divisions ----------------------------------------------------------------------- */
  const chip = (divisionId: string, p: Pick_) => (
    <TouchableOpacity
      key={p.key}
      onPress={() => toggle(divisionId, p.key)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: p.on }}
      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${p.kind === 'placeholder' ? 'border-dashed' : ''} ${p.on ? 'bg-raised border-line-selected' : 'border-line'}`}
    >
      {p.on ? <Ionicons name="checkmark" size={13} color={themeColor(isDark, 'ink')} /> : null}
      <Text className={`text-[13px] ${p.kind === 'placeholder' ? 'italic' : ''} ${p.on ? 'font-inter-semibold text-ink' : 'font-inter text-ink-soft'}`}>{p.label}</Text>
      {p.played ? <Text className="font-inter text-[11px] text-warning-ink">played {p.played}</Text> : null}
      {p.note ? <Text className="font-inter text-[11px] text-ink-muted">{p.note}</Text> : null}
    </TouchableOpacity>
  );

  const sections = sportOrder
    .map(sportId => ({ sport: sportOf(sportId), list: ordered.filter(d => d.sportId === sportId) }))
    .filter(s => s.sport && s.list.length);

  return (
    <EditDialog
      visible={visible}
      title={org.name}
      onClose={onClose}
      onSave={save}
      saveLabel={withdrawing.length ? `Save and withdraw ${withdrawing.length}` : 'Save'}
      saveDisabled={!changed.length}
      isSaving={saving}
      isDirty={changed.length > 0}
      footerLeft={
        <TouchableOpacity onPress={() => onRemove(org)} accessibilityRole="button" className="py-2">
          <Text className="font-inter-bold text-sm text-danger-ink">Remove from the tournament</Text>
        </TouchableOpacity>
      }
    >
      {invitation}
      {contact}
      {sections.length ? sections.map(({ sport, list }) => {
        const individual = sport!.participantType === 'INDIVIDUAL';
        return (
          <View key={sport!.id}>
            <View className="flex-row items-baseline gap-2 pb-1">
              <Text className="font-inter-bold text-sm text-ink">{sport!.name}</Text>
              <Text className="font-inter text-xs text-ink-muted">{plural(list.length, 'division')}</Text>
            </View>
            {list.map(d => {
              const rows = picks[d.id] || [];
              return (
                <View key={d.id} className="border-t border-line-soft py-2 gap-1.5">
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    <Text className="font-inter-semibold text-[13px] text-ink-soft" style={{ width: 92 }}>
                      {d.name}{individual ? '\nPlayers' : ''}
                    </Text>
                    {rows.map(p => chip(d.id, p))}
                    {!rows.length && !individual ? <Text className="font-inter text-xs text-ink-muted">No {d.ageGroup ? `${d.ageGroup} ` : ''}team</Text> : null}
                    <TouchableOpacity
                      onPress={() => setAdding(adding === d.id ? null : d.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add to ${d.name}`}
                      className="rounded-full border border-dashed border-line-strong px-3 py-1.5"
                    >
                      <Text className="font-inter-bold text-[13px] text-primary-ink">{individual ? '＋ Add player' : '＋'}</Text>
                    </TouchableOpacity>
                  </View>
                  {adding === d.id ? (
                    <AddToDivision
                      division={d}
                      org={org}
                      orgId={orgId}
                      individual={individual}
                      writable={writable}
                      others={candidateTeams.filter(t => t.orgId === org.id && t.sportId === d.sportId && !enteredTeamIds.has(t.id) && !rows.some(p => p.teamId === t.id))}
                      onPick={pick => addPick(d.id, pick)}
                      onTeamCreated={team => { onTeamCreated(team); addPick(d.id, { key: `team:${team.id}`, label: team.name, kind: 'team', teamId: team.id }); }}
                      onCancel={() => setAdding(null)}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      }) : (
        <Text className="font-inter text-[13px] text-ink-muted">Teams are entered into divisions, so this starts once there are some.</Text>
      )}
      {withdrawing.length ? (
        <View className="rounded-xl bg-warning-soft px-3 py-2">
          <Text className="font-inter text-[13px] text-warning-ink">
            {withdrawing.map(p => p.label).join(', ')} {withdrawing.length === 1 ? 'has' : 'have'} played, so {withdrawing.length === 1 ? 'it is' : 'they are'} withdrawn rather than removed: results stay in the table, and remaining fixtures stay in the draw until replaced or redrawn.
          </Text>
        </View>
      ) : null}
    </EditDialog>
  );
}

/**
 * The ＋ under a division row, inline rather than a second dialog: another of the organisation's
 * teams in the sport (playing up, or another age), a new team, or a place to be filled later — and
 * for an individual sport, a player.
 */
function AddToDivision({ division, org, orgId, individual, writable, others, onPick, onTeamCreated, onCancel }: {
  division: TournamentDivision;
  org: EventOrgBadge;
  orgId: string;
  individual: boolean;
  writable: boolean;
  others: CandidateTeam[];
  onPick: (pick: Omit<Pick_, 'on' | 'was' | 'played'>) => void;
  onTeamCreated: (team: Team) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<null | 'team' | 'place' | 'player'>(individual ? 'player' : null);
  const [text, setText] = useState('');
  const [person, setPerson] = useState<OrgProfile | null>(null);
  const [busy, setBusy] = useState(false);

  const createTeam = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const result = await sendAction(SocketAction.ADD_TEAM, {
      name: text.trim(),
      orgId: org.id,
      sportId: division.sportId!,
      ageGroupId: division.ageGroupId || undefined,
      isActive: true,
    });
    setBusy(false);
    if (result.ok) onTeamCreated(result.data);
  };
  const addPlayer = async () => {
    if (person) {
      onPick({ key: `person:${person.id}`, label: person.name, kind: 'person', orgProfileId: person.id });
      return;
    }
    if (!text.trim()) return;
    setBusy(true);
    const created = await sendAction(SocketAction.ADD_ORG_PROFILE, { name: text.trim(), orgId: org.id });
    setBusy(false);
    if (created.ok) onPick({ key: `person:${created.data.id}`, label: text.trim(), kind: 'person', orgProfileId: created.data.id });
  };

  const option = (label: string, sub: string | null, onPress: () => void, strong?: boolean) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" className="flex-row items-center gap-2 py-2 border-t border-line-soft">
      <Text className={`flex-1 text-[13px] ${strong ? 'font-inter-bold text-primary-ink' : 'font-inter text-ink'}`}>{label}</Text>
      {sub ? <Text className="font-inter text-xs text-ink-muted">{sub}</Text> : null}
    </TouchableOpacity>
  );
  const form = (placeholder: string, action: string, onSubmit: () => void, input?: React.ReactNode) => (
    <View className="gap-2">
      {input || <TextInput value={text} onChangeText={setText} autoFocus placeholder={placeholder} accessibilityLabel={placeholder} className={TEXT_INPUT} onSubmitEditing={onSubmit} />}
      <View className="flex-row items-center gap-3 justify-end">
        <TouchableOpacity onPress={onCancel} accessibilityRole="button"><Text className="font-inter-bold text-[13px] text-ink-muted">Cancel</Text></TouchableOpacity>
        <TouchableOpacity onPress={onSubmit} disabled={busy} accessibilityRole="button" className="rounded-xl bg-primary px-3 py-1.5">
          <Text className="font-inter-bold text-[13px] text-on-primary">{busy ? 'Adding…' : action}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View className="rounded-xl border border-line bg-card px-3 py-2 gap-1" style={{ marginLeft: 0 }}>
      <Text className="font-inter-bold text-[11px] text-ink-muted uppercase tracking-wider">{division.name} · {org.name}</Text>
      {mode === null ? (
        <>
          {others.map(team => option(team.name, team.ageGroup && team.ageGroup !== division.ageGroup ? `${team.ageGroup} — plays ${division.ageGroup || 'here'}` : null, () =>
            onPick({ key: `team:${team.id}`, label: team.name, kind: 'team', teamId: team.id, note: team.ageGroupId && team.ageGroupId !== division.ageGroupId ? 'plays up' : undefined })
          ))}
          {writable ? option(`＋ New ${division.ageGroup ? `${division.ageGroup} ` : ''}team`, null, () => { setText(`${org.shortName} ${division.ageGroup || division.name}`.trim()); setMode('team'); }, true) : null}
          {option('A place to be filled later', `“${org.shortName} ${division.name} — to be named”`, () => { setText(`${org.shortName} ${division.name} — to be named`); setMode('place'); })}
        </>
      ) : mode === 'team' ? (
        form('Team name', 'Create and tick', createTeam)
      ) : mode === 'place' ? (
        form('What to call it until it is named', 'Add', () => text.trim() && onPick({ key: `place:${Date.now()}`, label: text.trim(), kind: 'placeholder' }))
      ) : writable ? (
        form('Search the roster or type a name', 'Add', addPlayer, (
          <PersonnelAutocomplete
            orgId={org.id}
            value={text}
            onChangeText={t => { setText(t); setPerson(null); }}
            onSelectPerson={p => { setPerson(p); setText(p?.name || ''); }}
            placeholder="Search the roster or type a name…"
          />
        ))
      ) : (
        form('What to call it until it is named', 'Add a place', () => text.trim() && onPick({ key: `place:${Date.now()}`, label: text.trim(), kind: 'placeholder' }))
      )}
    </View>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Remove
 * ------------------------------------------------------------------------------------------- */

/** Says what happens to its teams. The server refuses once any of them has played, and says why. */
export function RemoveOrganisationDialog({ visible, event, orgId, org, entrants, onClose }: {
  visible: boolean;
  event: Event;
  orgId: string;
  org: EventOrgBadge | null;
  entrants: TournamentEntrant[];
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  if (!org) return null;
  const mine = entrants.filter(e => e.orgId === org.id && e.status !== 'withdrawn');
  const played = mine.reduce((sum, e) => sum + (e.playedCount || 0), 0);

  const remove = async () => {
    setSaving(true);
    const result = await sendAction(SocketAction.REMOVE_EVENT_ORG, { eventId: event.id, orgId, participantOrgId: org.id });
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog
      visible={visible}
      title={`Remove ${org.name}?`}
      onClose={onClose}
      onSave={played ? undefined : remove}
      saveLabel="Remove"
      isSaving={saving}
    >
      {played ? (
        <Text className="font-inter text-sm text-ink leading-relaxed">
          {org.name}'s teams have played, so it cannot be removed. Withdraw its teams instead, from each division's page — their results stay.
        </Text>
      ) : (
        <Text className="font-inter text-sm text-ink leading-relaxed">
          {org.name} stops taking part{org.invitation !== 'not_invited' ? ' and can no longer see the tournament' : ''}.
          {mine.length ? ` Its ${mine.length === 1 ? 'entry' : `${mine.length} entries`} ${mine.length === 1 ? 'is' : 'are'} taken out of ${mine.length === 1 ? 'its division' : 'their divisions'}.` : ' It has nothing entered.'}
        </Text>
      )}
    </EditDialog>
  );
}
