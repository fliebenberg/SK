import React, { useEffect, useState } from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_SCORING_SYSTEM,
  Event,
  Facility,
  ScoringSystem,
  Site,
  SocketAction,
  Sport,
  TournamentOrganizer,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { FieldLabel } from '../FieldLabel';
import CustomSelect from '../CustomSelect';
import DatePicker from '../DatePicker';
import { OrganizerPicker } from '../OrganizerPicker';
import { FacilityPicker } from './FacilityPicker';
import { pickableSites } from '../sites/SiteBits';
import { TEXT_INPUT } from '../formStyles';
import { sendAction } from '../../services/actions';
import { useToastStore } from '../../store/toastStore';
import { isCalendarDate } from '../../utils/dates';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * The tournament page's dialogs (docs/events.md, stage 2). Each saves only its own card's fields
 * (read-first rule 1), through `sendAction`; a refusal is already said, and the dialog stays open.
 * They replace the Basic Info and Rules & scoring step screens.
 */

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

/** The banner's Edit: the name, and when — the first day, and the last when it runs over more than one. */
export function EditTournamentDialog({ visible, event, orgId, onClose }: {
  visible: boolean;
  event: Event;
  orgId: string;
  onClose: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [multiDay, setMultiDay] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(event.name || '');
    setStart(event.startDate || '');
    setEnd(event.endDate || '');
    setMultiDay(!!event.endDate && event.endDate > event.startDate);
  }, [visible, event]);

  const dateError = !isCalendarDate(start)
    ? 'Choose the first day.'
    : multiDay && (!isCalendarDate(end) || end <= start)
    ? 'The last day must come after the first.'
    : null;
  const dirty = name.trim() !== (event.name || '') || start !== event.startDate || (multiDay ? end : '') !== (event.endDate && event.endDate > event.startDate ? event.endDate : '');

  const save = async () => {
    if (!name.trim() || dateError) return;
    setSaving(true);
    const result = await sendAction(SocketAction.UPDATE_EVENT, {
      id: event.id,
      orgId,
      data: { name: name.trim(), startDate: start, endDate: multiDay ? end : null },
    });
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <EditDialog visible={visible} title="Edit tournament" onClose={onClose} onSave={save} isSaving={saving} isDirty={dirty} saveDisabled={!name.trim() || !!dateError}>
      <View className="gap-1.5">
        <FieldLabel label="Name" />
        <TextInput value={name} onChangeText={setName} placeholderTextColor={themeColor(isDark, 'ink-muted')} accessibilityLabel="Name" className={TEXT_INPUT} />
      </View>
      <View className="flex-row flex-wrap gap-3">
        <View className="gap-1.5" style={{ width: 200 }}>
          <FieldLabel label="First day" />
          <DatePicker value={start} onChange={setStart} />
        </View>
        {multiDay ? (
          <View className="gap-1.5" style={{ width: 200 }}>
            <FieldLabel label="Last day" />
            <DatePicker value={end} onChange={setEnd} />
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center gap-3">
        <Switch value={multiDay} onValueChange={on => { setMultiDay(on); if (on && !end) setEnd(start); }} trackColor={{ true: themeColor(isDark, 'primary') }} />
        <Text className="font-inter text-sm text-ink-soft">Runs over more than one day</Text>
      </View>
      {dateError && (start || multiDay) ? <Text className="font-inter text-xs text-danger-ink">{dateError}</Text> : null}
    </EditDialog>
  );
}

/**
 * Where: the base site and the facilities it uses (U47 — two questions: where it is, and what it
 * uses, which may include the courts next door). Two writes, as the Basic Info screen made them:
 * `UPDATE_EVENT` for the site and `SET_EVENT_FACILITIES` for the set.
 */
export function WhereDialog({ visible, event, orgId, sites, facilities, facilityIds, onClose }: {
  visible: boolean;
  event: Event;
  orgId: string;
  sites: Site[];
  facilities: Facility[];
  facilityIds: string[];
  onClose: () => void;
}) {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSiteId(event.siteId || null);
    setChosen(facilityIds);
  }, [visible, event.siteId, facilityIds]);

  const siteDirty = (siteId || null) !== (event.siteId || null);
  const facilitiesDirty = !sameIds(chosen, facilityIds);

  const save = async () => {
    setSaving(true);
    if (siteDirty) {
      const result = await sendAction(SocketAction.UPDATE_EVENT, { id: event.id, orgId, data: { siteId: siteId || null } });
      if (!result.ok) { setSaving(false); return; }
    }
    if (facilitiesDirty) {
      const result = await sendAction(SocketAction.SET_EVENT_FACILITIES, { eventId: event.id, orgId, facilityIds: chosen }, { suppressToast: true });
      if (!result.ok) {
        useToastStore.getState().showError(siteDirty ? `The site was saved, but the facilities were not: ${result.message}` : result.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onClose();
  };

  return (
    <EditDialog visible={visible} title="Where" onClose={onClose} onSave={save} isSaving={saving} isDirty={siteDirty || facilitiesDirty} saveDisabled={!siteDirty && !facilitiesDirty}>
      <View className="gap-1.5">
        <FieldLabel
          label="Based at"
          help="Where the tournament is based — what the listing shows and where the facility picker opens. It does not restrict anything: a tournament based at the school can still use the courts next door."
        />
        <CustomSelect
          options={pickableSites(sites, [event.siteId]).map(s => ({ label: s.name, value: s.id }))}
          value={siteId || ''}
          onChange={(v: string) => setSiteId(v || null)}
          placeholder="Select a site..."
          clearable
        />
      </View>
      <View className="gap-1.5">
        <FieldLabel
          label="Facilities it uses"
          help="Every facility this tournament uses — the courts and fields it plays on, and the tuck shop, parking and toilets people will look for. These become the pins on the tournament map."
        />
        <FacilityPicker sites={sites} facilities={facilities} value={chosen} onChange={setChosen} baseSiteId={siteId || undefined} />
      </View>
    </EditDialog>
  );
}

/**
 * Rules & scoring: points for a win, a draw and a loss. `settings` is written whole, because
 * `UPDATE_EVENT` replaces that column — writing the bare key would drop the dismissed steps.
 * Points by finishing position are shown on the card but not edited here, as on the step screen
 * this replaces.
 */
export function ScoringDialog({ visible, event, orgId, onClose }: {
  visible: boolean;
  event: Event;
  orgId: string;
  onClose: () => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const saved = event.settings?.scoring?.mode === 'byResult' ? event.settings.scoring : null;
  const fallback = DEFAULT_SCORING_SYSTEM.mode === 'byResult' ? DEFAULT_SCORING_SYSTEM : { pointsPerWin: 3, pointsPerDraw: 1, pointsPerLoss: 0 };
  const [win, setWin] = useState('');
  const [draw, setDraw] = useState('');
  const [loss, setLoss] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const from = saved || fallback;
    setWin(String(from.pointsPerWin));
    setDraw(String(from.pointsPerDraw));
    setLoss(String(from.pointsPerLoss));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = async () => {
    const scoring: ScoringSystem = {
      mode: 'byResult',
      pointsPerWin: parseInt(win, 10) || 0,
      pointsPerDraw: parseInt(draw, 10) || 0,
      pointsPerLoss: parseInt(loss, 10) || 0,
    };
    setSaving(true);
    const result = await sendAction(SocketAction.UPDATE_EVENT, { id: event.id, orgId, data: { settings: { ...(event.settings || {}), scoring } } });
    setSaving(false);
    if (result.ok) onClose();
  };

  const field = (label: string, value: string, set: (v: string) => void) => (
    <View className="gap-1.5 flex-1">
      <FieldLabel label={label} />
      <TextInput value={value} onChangeText={v => set(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholderTextColor={themeColor(isDark, 'ink-muted')} accessibilityLabel={`Points for a ${label.toLowerCase()}`} className={TEXT_INPUT} />
    </View>
  );

  return (
    <EditDialog
      visible={visible}
      title="Rules & scoring"
      onClose={onClose}
      onSave={save}
      isSaving={saving}
      saveLabel={saved ? 'Save' : 'Save and confirm'}
      footerLeft={
        <TouchableOpacity onPress={() => { setWin(String(fallback.pointsPerWin)); setDraw(String(fallback.pointsPerDraw)); setLoss(String(fallback.pointsPerLoss)); }} className="py-2">
          <Text className="font-inter-bold text-sm text-ink-muted">Reset to {fallback.pointsPerWin} / {fallback.pointsPerDraw} / {fallback.pointsPerLoss}</Text>
        </TouchableOpacity>
      }
    >
      <Text className="font-inter text-sm text-ink-soft">How many points each result is worth. These apply to every division unless a division sets its own.</Text>
      <View className="flex-row gap-3">
        {field('Win', win, setWin)}
        {field('Draw', draw, setDraw)}
        {field('Loss', loss, setLoss)}
      </View>
      <View className="rounded-xl bg-warning-soft px-3 py-2">
        <Text className="font-inter text-[13px] text-warning-ink">Changing points rebuilds every table in this tournament straight away.</Text>
      </View>
    </EditDialog>
  );
}

/**
 * The tournament's sports. Ticking a sport writes at once and the server gives it its first
 * division (U52) — so there is nothing to save, only Done. A sport with divisions cannot be
 * unticked here: its divisions go first, from their own screens.
 */
export function SportsDialog({ visible, event, orgId, sports, divisionCount, onClose }: {
  visible: boolean;
  event: Event;
  orgId: string;
  sports: Sport[];
  divisionCount: (sportId: string) => number;
  /** With the sports ticked while it was open, so each new sport's first division can be named (`FIX-27`). */
  onClose: (addedSportIds: string[]) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const chosen = event.sportIds || [];
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => { if (visible) setAdded([]); }, [visible]);

  const toggle = async (sportId: string) => {
    if (busy) return;
    setBlocked(null);
    if (chosen.includes(sportId) && divisionCount(sportId) > 0) {
      setBlocked(sportId);
      return;
    }
    setBusy(true);
    const adding = !chosen.includes(sportId);
    const result = await sendAction(SocketAction.UPDATE_EVENT, {
      id: event.id,
      orgId,
      data: { sportIds: adding ? [...chosen, sportId] : chosen.filter(id => id !== sportId) },
    });
    setBusy(false);
    if (result.ok) setAdded(prev => (adding ? [...prev, sportId] : prev.filter(id => id !== sportId)));
  };

  const blockedName = sports.find(s => s.id === blocked)?.name;
  return (
    <EditDialog visible={visible} title="Sports" onClose={() => onClose(added)} doneLabel="Done">
      <Text className="font-inter text-sm text-ink-soft">Tick what is played. A sport gets its first division as soon as it is ticked.</Text>
      <View className="flex-row flex-wrap gap-2">
        {[...sports].sort((a, b) => a.name.localeCompare(b.name)).map(sport => {
          const on = chosen.includes(sport.id);
          return (
            <TouchableOpacity
              key={sport.id}
              onPress={() => toggle(sport.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: busy }}
              className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${on ? 'bg-raised border-line-selected' : 'border-line'}`}
            >
              {on ? <Ionicons name="checkmark" size={14} color={themeColor(isDark, 'ink')} /> : null}
              <Text className={`text-sm ${on ? 'font-inter-semibold text-ink' : 'font-inter text-ink-soft'}`}>{sport.name}</Text>
              {on && divisionCount(sport.id) ? <Text className="font-inter text-xs text-ink-muted">{divisionCount(sport.id)}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {blocked ? (
        <View className="rounded-xl bg-warning-soft px-3 py-2">
          <Text className="font-inter text-[13px] text-warning-ink">
            {blockedName} still has {divisionCount(blocked)} division{divisionCount(blocked) === 1 ? '' : 's'}. Remove {divisionCount(blocked) === 1 ? 'it' : 'them'} first, from the division's own page — the last one going removes the sport.
          </Text>
        </View>
      ) : null}
    </EditDialog>
  );
}

/** The tournament's organisers (D33), appointed and removed in place by `OrganizerPicker`. */
export function OrganizersDialog({ visible, event, orgId, organizers, onChange, onClose }: {
  visible: boolean;
  event: Event;
  orgId: string;
  organizers: TournamentOrganizer[];
  onChange: (next: TournamentOrganizer[]) => void;
  onClose: () => void;
}) {
  return (
    <EditDialog visible={visible} title="Organisers" onClose={onClose} doneLabel="Done">
      <OrganizerPicker
        eventId={event.id}
        hostOrgId={event.orgId}
        actingOrgId={orgId}
        organizers={organizers}
        onChange={onChange}
        canManage
        label="Tournament organisers"
        help="Other people who will help run this tournament. An organiser can edit it, enter results and manage its divisions — they do not need to be an admin of your organisation, and they can come from any organisation taking part."
        hasParticipatingOrgs={(event.participatingOrgs || []).length > 0}
      />
    </EditDialog>
  );
}
