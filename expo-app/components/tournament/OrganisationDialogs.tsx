import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Event,
  EventOrgBadge,
  Organization,
  SocketAction,
  TournamentEntrant,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { NominateAdminModal } from '../NominateAdminModal';
import { useOrgClaimStatus } from '../../hooks/useOrgClaimStatus';
import { FixtureCrest } from '../events/EventBits';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { wsService } from '../../services/websocket';
import { useAuthStore } from '../../store/authStore';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * The dialogs around the organisations taking part in a tournament (`FIX-26`, agreed on
 * `mockups/organisations-teams.html`): adding them, inviting them all, removing one, nominating a
 * contact. Each organisation's invitation and teams are on its own page,
 * `events/[eventId]/organisations/[participantOrgId]` (`OrganisationTeams.tsx`).
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
 * Who may write into an organisation
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

/** Nominating a contact for an organisation nobody manages, with its claim status read for the dialog. */
export function NominateFor({ org, onClose }: { org: { id: string; name: string }; onClose: () => void }) {
  const { status } = useOrgClaimStatus(org.id, true);
  return <NominateAdminModal visible org={org} status={status} onClose={onClose} onNominated={onClose} />;
}

/* ---------------------------------------------------------------------------------------------
 * Remove
 * ------------------------------------------------------------------------------------------- */

/** Says what happens to its teams. The server refuses once any of them has played, and says why. */
export function RemoveOrganisationDialog({ visible, event, orgId, org, entrants, onClose, onRemoved }: {
  visible: boolean;
  event: Event;
  orgId: string;
  org: EventOrgBadge | null;
  entrants: TournamentEntrant[];
  onClose: () => void;
  /** Removed: the organisation's page has nothing left to show, so it goes back to the tournament. */
  onRemoved?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  if (!org) return null;
  const mine = entrants.filter(e => e.orgId === org.id && e.status !== 'withdrawn');
  const played = mine.reduce((sum, e) => sum + (e.playedCount || 0), 0);

  const remove = async () => {
    setSaving(true);
    const result = await sendAction(SocketAction.REMOVE_EVENT_ORG, { eventId: event.id, orgId, participantOrgId: org.id });
    setSaving(false);
    if (result.ok) (onRemoved || onClose)();
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
