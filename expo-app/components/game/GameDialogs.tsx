import React, { useEffect, useMemo, useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CandidateTeam, Game, GameSummary, GameSummaryParticipant, Organization, SocketAction, Team } from '@sk/shared';
import { EditDialog } from '../EditDialog';
import CustomSelect from '../CustomSelect';
import DatePicker from '../DatePicker';
import { FixtureCrest } from '../events/EventBits';
import { sideLabel } from './GameBits';
import { sendAction } from '../../services/actions';
import { wsService } from '../../services/websocket';
import { useAuthStore } from '../../store/authStore';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { useOrgSites } from '../../hooks/useOrgSites';
import { useOrgSummary } from '../../hooks/useOrgSummary';
import { instantToVenueInputs, venueInputsToInstant, venueTimeZone } from '../../utils/dates';

/** The caller's own profile, which a change to a fixture's side is credited to, as a result entry is. */
function initiatorProfileId(): string | undefined {
  const { user, orgMemberships = [] } = useAuthStore.getState() as any;
  return user?.globalRole === 'admin'
    ? orgMemberships.find((m: any) => m.orgId === 'org-system-admins')?.orgProfileId
    : orgMemberships[0]?.orgProfileId;
}

/** A clash warning: the amber line, only when there is something to say (no news is no message). */
export function ClashWarning({ warnings, verb = 'save' }: { warnings: string[]; verb?: string }) {
  if (!warnings.length) return null;
  return (
    <View className="rounded-xl bg-warning-soft px-3 py-2">
      <Text className="font-inter text-[13px] text-warning-ink">⚠ {warnings.join(' · ')}. You can still {verb} it.</Text>
    </View>
  );
}

/**
 * What a proposed single match would clash with (`FIX-23`): `GET_GAME_CLASHES`, asked again a moment
 * after the time, place or teams stop changing. Nothing is shown while it is being asked.
 */
export function useGameClashes(input: {
  orgId: string; gameId?: string | null; startAt: string | null; facilityId?: string | null; siteId?: string | null;
  teamIds: string[]; sportId?: string | null; enabled: boolean;
}) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const key = JSON.stringify(input);
  useEffect(() => {
    if (!input.enabled || !input.startAt) { setWarnings([]); return; }
    let live = true;
    const timer = setTimeout(async () => {
      const res = await sendAction(SocketAction.GET_GAME_CLASHES, {
        orgId: input.orgId, gameId: input.gameId || null, startAt: input.startAt!, facilityId: input.facilityId || null,
        siteId: input.siteId || null, teamIds: input.teamIds.filter(Boolean), sportId: input.sportId || null,
      }, { suppressToast: true });
      if (live) setWarnings(res.ok ? res.data.warnings : []);
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return warnings;
}

/* ------------------------------------------------------------------------------------------------ */
/* Who played                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

/**
 * Who actually played for one side of a tournament fixture (`FIX-20`), now a dialog on the game page.
 * The last-minute case: U14 B turned out instead of U14 A. Only this game changes, and its result
 * still counts for the place in the draw; another team taking the place for good is *Replace*, on
 * the division (agreed 2026-10-14).
 */
export function WhoPlayedDialog({ visible, side, summary, orgId, eventId, divisionName, onOpenDivision, onClose }: {
  visible: boolean;
  side?: GameSummaryParticipant;
  summary: GameSummary;
  orgId: string;
  eventId: string;
  divisionName: string;
  onOpenDivision: () => void;
  onClose: () => void;
}) {
  const [teams, setTeams] = useState<CandidateTeam[]>([]);
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !side) return;
    setTeamId(side.teamId || '');
    setError(null);
    let active = true;
    wsService.emit('get_data', { type: 'event_candidate_teams', eventId, divisionId: summary.divisionId }, (res: any) => {
      if (active && res && Array.isArray(res.teams)) setTeams(res.teams);
    });
    return () => { active = false; };
  }, [visible, side?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The side's own organisation's teams in this sport: who could have turned out for it.
  const choices = useMemo(() => {
    const other = (summary.participants || []).find(p => p.id !== side?.id)?.teamId;
    return teams.filter(t => t.orgId === side?.orgId && t.sportId === summary.sportId && t.id !== other);
  }, [teams, side, summary]);

  if (!side) return null;
  const save = async () => {
    if (!teamId || teamId === side.teamId) { onClose(); return; }
    setSaving(true);
    setError(null);
    const res = await sendAction(
      SocketAction.CHANGE_FIXTURE_SIDE,
      { gameParticipantId: side.id, orgId, teamId, initiatorOrgProfileId: initiatorProfileId() },
      { suppressToast: true },
    );
    setSaving(false);
    if (!res.ok) { setError(res.message); return; }
    onClose();
  };
  const drawn = side.entrantLabel || sideLabel(side);

  return (
    <EditDialog visible={visible} title={`Who played for ${drawn}?`} onClose={onClose} onSave={save} isSaving={saving} saveDisabled={!teamId}>
      <View className="gap-1.5">
        {choices.map(t => {
          const on = t.id === teamId;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => setTeamId(t.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 ${on ? 'border-line-selected bg-raised' : 'border-line bg-card'}`}
            >
              <View className={`w-4 h-4 rounded-full ${on ? 'border-4 border-primary' : 'border-2 border-line-strong'}`} />
              <FixtureCrest participant={side} size={18} />
              <Text className="flex-1 font-inter text-sm text-ink" numberOfLines={1}>{t.orgShortName ? `${t.orgShortName} ${t.name}` : t.name}</Text>
              {t.id === side.teamId ? <Text className="font-inter text-xs text-ink-muted">playing now</Text> : t.ageGroup ? <Text className="font-inter text-xs text-ink-muted">{t.ageGroup}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text className="font-inter text-[13px] text-ink-soft leading-5">
        Only this game changes, and its result still counts for {drawn} in the table. If another team takes its place for the rest of the tournament, replace it on{' '}
        <Text className="font-inter-bold text-primary-ink" onPress={() => { onClose(); onOpenDivision(); }}>{divisionName}</Text>.
      </Text>
      {error ? <Text className="font-inter text-[13px] text-danger-ink">{error}</Text> : null}
    </EditDialog>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Edit match                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

/**
 * A single match's details, all in one dialog: its teams, day, kick-off (or *Time to be confirmed*),
 * venue and field. The teams are **Teams**, never Home and Away (agreed 2026-10-15): *Home* is worked
 * out from the venue. The sport is shown, not changed. Clashes are warned, never blocked (`FIX-23`).
 *
 * Saves the game and then the match's event (its name, day, venue, sport and both organisations), as
 * the old edit screen did: a match *is* its event.
 */
export function EditMatchDialog({ visible, orgId, eventId, game, summary, sportName, onClose }: {
  visible: boolean;
  orgId: string;
  eventId: string;
  game: Game;
  summary: GameSummary;
  sportName?: string;
  onClose: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const { sites, facilities } = useOrgSites(orgId);
  const { org: hostOrg } = useOrgSummary(orgId);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [teamsByOrg, setTeamsByOrg] = useState<Record<string, Team[]>>({});
  const [form, setForm] = useState<{ orgIds: [string, string]; teamIds: [string, string]; date: string; time: string; tbd: boolean; siteId: string; facilityId: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const site = sites.find(s => s.id === form?.siteId);
  const timeZone = venueTimeZone(site as any, hostOrg as any);

  // The starting point, read each time the dialog opens.
  useEffect(() => {
    if (!visible) return;
    const [a, b] = summary.participants || [];
    const when = instantToVenueInputs(summary.scheduledStartTime || summary.startTime, venueTimeZone(sites.find(s => s.id === summary.siteId) as any, hostOrg as any));
    setForm({
      orgIds: [a?.orgId || orgId, b?.orgId || ''],
      teamIds: [a?.teamId || '', b?.teamId || ''],
      date: when?.date || '',
      time: summary.timeTbd ? '' : when?.time || '',
      tbd: !!summary.timeTbd || !when,
      siteId: summary.siteId || '',
      facilityId: summary.facilityId || '',
    });
    setError(null);
    wsService.emit('get_data', { type: 'organizations' }, (res: any) => setOrgs(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each chosen organisation's teams in this sport.
  useEffect(() => {
    if (!form) return;
    form.orgIds.filter(Boolean).forEach(id => {
      if (teamsByOrg[id]) return;
      wsService.emit('get_data', { type: 'teams', orgId: id }, (res: any) => {
        if (Array.isArray(res)) setTeamsByOrg(prev => ({ ...prev, [id]: res }));
      });
    });
  }, [form?.orgIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const startAt = form && form.date ? venueInputsToInstant(form.date as any, form.tbd ? null : form.time, timeZone) : null;
  const warnings = useGameClashes({
    orgId, gameId: game.id, startAt: form?.tbd ? null : startAt, facilityId: form?.facilityId, siteId: form?.siteId,
    teamIds: form?.teamIds || [], sportId: game.sportId, enabled: visible && !!form,
  });

  if (!form) return null;
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const orgOptions = orgs.map(o => ({ value: o.id, label: o.name }));
  const teamOptions = (i: 0 | 1) => (teamsByOrg[form.orgIds[i]] || [])
    .filter(t => !game.sportId || t.sportId === game.sportId)
    .map(t => ({ value: t.id, label: t.name }));
  const facilityOptions = facilities.filter(f => f.siteId === form.siteId).map(f => ({ value: f.id, label: f.name }));
  const timeOk = form.tbd || /^\d{1,2}:\d{2}$/.test(form.time);
  const ready = !!form.teamIds[0] && !!form.teamIds[1] && form.teamIds[0] !== form.teamIds[1] && !!form.date && timeOk;

  const save = async () => {
    if (!ready || !startAt) { setError('Choose both teams, the day and the kick-off time.'); return; }
    setSaving(true);
    setError(null);
    const res = await sendAction(SocketAction.UPDATE_GAME, {
      id: game.id,
      orgId,
      data: {
        participants: [{ teamId: form.teamIds[0] }, { teamId: form.teamIds[1] }],
        scheduledStartTime: startAt,
        startTime: startAt,
        siteId: form.siteId || null,
        facilityId: form.facilityId || null,
        customSettings: { ...(game.customSettings || {}), timeTbd: form.tbd },
      },
    }, { suppressToast: true });
    if (!res.ok) { setSaving(false); setError(res.message); return; }
    const short = (id: string) => { const o = orgs.find(x => x.id === id); return o ? o.shortName || o.name : ''; };
    const eventRes = await sendAction(SocketAction.UPDATE_EVENT, {
      id: eventId,
      orgId,
      data: {
        name: `${short(form.orgIds[0])} vs ${short(form.orgIds[1])}`,
        startDate: form.date,
        siteId: form.siteId || null,
        sportIds: game.sportId ? [game.sportId] : [],
        participatingOrgIds: form.orgIds.filter(Boolean),
      },
    }, { suppressToast: true });
    setSaving(false);
    // The game is saved; the match's own record is retried by saving again.
    if (!eventRes.ok) { setError(eventRes.message); return; }
    onClose();
  };

  const teamRow = (i: 0 | 1) => (
    <View className="flex-row gap-2.5">
      <View className="flex-1 min-w-0">
        <CustomSelect
          value={form.orgIds[i]}
          onChange={v => { const orgIds = [...form.orgIds] as [string, string]; orgIds[i] = v; const teamIds = [...form.teamIds] as [string, string]; teamIds[i] = ''; set({ orgIds, teamIds }); }}
          options={orgOptions}
          showSearch
          placeholder="Organisation"
          accessibilityLabel={`Team ${i + 1} organisation`}
        />
      </View>
      <View className="flex-1 min-w-0">
        <CustomSelect
          value={form.teamIds[i]}
          onChange={v => { const teamIds = [...form.teamIds] as [string, string]; teamIds[i] = v; set({ teamIds }); }}
          options={teamOptions(i)}
          placeholder="Team"
          accessibilityLabel={`Team ${i + 1}`}
        />
      </View>
    </View>
  );
  const label = (t: string) => <Text className="font-inter-bold text-[13px] text-ink-soft">{t}</Text>;

  return (
    <EditDialog visible={visible} title="Edit match" onClose={onClose} onSave={save} isSaving={saving} saveDisabled={!ready}>
      <View className="gap-1.5">
        {label('Teams')}
        {teamRow(0)}
        <Text className="font-inter-bold text-xs text-ink-muted text-center">V</Text>
        {teamRow(1)}
      </View>
      <View className="flex-row gap-2.5">
        <View className="flex-1 min-w-0 gap-1.5">
          {label('Date')}
          <DatePicker value={form.date} onChange={date => set({ date })} />
        </View>
        <View className="flex-1 min-w-0 gap-1.5">
          {label('Kick-off')}
          <TextInput
            value={form.tbd ? '' : form.time}
            onChangeText={time => set({ time })}
            editable={!form.tbd}
            placeholder={form.tbd ? 'Not set' : 'HH:MM'}
            inputMode="numeric"
            accessibilityLabel="Kick-off"
            placeholderTextColor={themeColor(isDark, 'ink-muted')}
            className="bg-canvas border border-line rounded-xl px-3 py-2.5 font-inter text-sm text-ink"
          />
        </View>
      </View>
      <View className="flex-row items-center gap-2.5">
        <Switch value={form.tbd} onValueChange={tbd => set({ tbd })} accessibilityLabel="Time to be confirmed" />
        <Text className="font-inter text-sm text-ink-soft">Time to be confirmed</Text>
      </View>
      {!timeOk ? <Text className="font-inter text-xs text-danger-ink">A time is HH:MM.</Text> : null}
      <View className="flex-row gap-2.5">
        <View className="flex-1 min-w-0 gap-1.5">
          {label('Where')}
          <CustomSelect value={form.siteId} onChange={siteId => set({ siteId, facilityId: '' })} options={sites.map(s => ({ value: s.id, label: s.name }))} placeholder="Venue" accessibilityLabel="Where" />
        </View>
        <View className="flex-1 min-w-0 gap-1.5">
          {label('Field')}
          <CustomSelect value={form.facilityId} onChange={facilityId => set({ facilityId })} options={facilityOptions} placeholder="Not decided" clearable accessibilityLabel="Field" />
        </View>
      </View>
      <ClashWarning warnings={warnings} />
      {sportName ? (
        <View className="gap-1">
          {label('Sport')}
          <Text className="font-inter text-sm text-ink">{sportName}</Text>
        </View>
      ) : null}
      {error ? <Text className="font-inter text-[13px] text-danger-ink">{error}</Text> : null}
    </EditDialog>
  );
}
