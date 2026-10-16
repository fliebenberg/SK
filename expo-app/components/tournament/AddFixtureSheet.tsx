import React, { useEffect, useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  Clash, Event, GameSummary, SocketAction, TournamentDivision, TournamentEntrant, TournamentStage,
  isCollapsed, isEntrantInPlay, minuteOfDay, timeOfDay,
} from '@sk/shared';
import { EditDialog } from '../EditDialog';
import { scheduleModel } from './scheduleModel';
import { useDivisionEntrants } from '../../hooks/useDivisionEntrants';
import { useLiveRoom } from '../../hooks/useLiveRoom';
import { sendAction } from '../../services/actions';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';
import { formatPlayingDay, venueInputsToInstant, type CalendarDate } from '../../utils/dates';

/** Where an added fixture goes: a day, a facility and a start — or nowhere yet. */
export type FixtureSlot = { day: CalendarDate; start: number; facilityId: string };

const entrantName = (e?: TournamentEntrant) => {
  if (!e) return 'TBC';
  const team = e.name || e.label || 'TBC';
  return e.orgShortName && !team.startsWith(e.orgShortName) ? `${e.orgShortName} ${team}` : team;
};

/**
 * Adding a fixture on the Schedule (2026-10-16): opened by clicking an empty slot on the grid, which
 * it starts at, or by *＋ Add a fixture* at the right of the toolbar, which starts it *Not yet* placed.
 *
 * The two sides are the division's own teams in play — its entrants, as the draw makes them — so a
 * fixture added here counts for the same teams as a drawn one (`FIX-21`'s lesson: a side must keep
 * its entrant). The time and court are the move sheet's, with the same clash check before saving;
 * a clash never blocks. It is added, then placed with `MOVE_FIXTURE`, the one way a tournament
 * fixture is placed.
 */
export function AddFixtureSheet({ event, orgId, divisions, divisionName, initialDivisionId, slot, days, facilityIds, divisionFacilityIds, facilityLabel, model, timeZone, wouldClash, onClose, onAdded }: {
  event: Event;
  orgId: string;
  /** The divisions the viewer may add to. */
  divisions: TournamentDivision[];
  divisionName: (id?: string | null) => string;
  initialDivisionId?: string;
  /** Where it was clicked on the grid; none — it starts without a time. */
  slot?: FixtureSlot;
  days: CalendarDate[];
  facilityIds: string[];
  divisionFacilityIds: (divisionId: string) => Set<string>;
  facilityLabel: (id?: string | null) => string;
  model: ReturnType<typeof scheduleModel>;
  timeZone: string;
  wouldClash: (g: GameSummary, facilityId: string, day: string, start: number) => string[];
  onClose: () => void;
  /** Added — and placed, when it had a slot; `clashes` are what placing it caused. */
  onAdded: (game: { id: string; name: string }, placed: FixtureSlot | null, clashes: Clash[]) => void;
}) {
  const isDark = useActiveTheme() === 'dark';
  const [divisionId, setDivisionId] = useState(initialDivisionId && divisions.some(d => d.id === initialDivisionId) ? initialDivisionId : divisions[0]?.id || '');
  const division = divisions.find(d => d.id === divisionId);

  const { entrants, isLoading } = useDivisionEntrants(divisionId || null);
  const inPlay = entrants.filter(e => isEntrantInPlay(e.status));
  const { items: stageItems } = useLiveRoom<TournamentStage>(divisionId ? `division:${divisionId}:stages` : null, {
    reduce: message => (message.type === 'STAGES_SYNC' ? { kind: 'replace', items: message.data?.stages || [] } : { kind: 'ignore' }),
  });
  const stages = useMemo(() => [...stageItems].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)), [stageItems]);
  const [stageId, setStageId] = useState('');
  useEffect(() => { if (!stages.some(s => s.id === stageId)) setStageId(stages[0]?.id || ''); }, [stages]); // eslint-disable-line react-hooks/exhaustive-deps

  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const home = inPlay.find(e => e.id === homeId);
  const away = inPlay.find(e => e.id === awayId);

  /* -- where and when: the slot clicked, or not yet -- */
  const [placing, setPlacing] = useState(!!slot);
  const [day, setDay] = useState<CalendarDate>(slot?.day || days[0]);
  const window = (event.days || []).find(d => d.day === day);
  const [time, setTime] = useState(slot ? timeOfDay(slot.start) : window?.dayStarts || '08:00');
  const own = divisionId ? [...divisionFacilityIds(divisionId)].filter(id => facilityIds.includes(id)) : [];
  const [facilityId, setFacilityId] = useState(slot?.facilityId || own[0] || facilityIds[0] || '');
  const [showAll, setShowAll] = useState(!!slot && !own.includes(slot.facilityId));
  const choices = showAll ? [...new Set([...own, ...facilityIds])] : own.length ? own : facilityIds;
  const start = minuteOfDay(time);

  // The fixture as it would be, for its length and the clash check.
  const draft = { id: 'new-fixture', divisionId, participants: [home, away].filter(Boolean).map(e => ({ entrantId: e!.id, teamId: e!.teamId })) } as unknown as GameSummary;
  const minutes = divisionId ? model.minutesOf(draft) : null;
  const warnings = placing && start != null && facilityId && divisionId ? wouldClash(draft, facilityId, day, start) : [];

  const [saving, setSaving] = useState(false);
  const ready = !!division?.sportId && !!stageId && !!home && !!away && (!placing || (start != null && !!facilityId));
  const save = async () => {
    if (!ready) return;
    setSaving(true);
    const added = await sendAction(SocketAction.ADD_GAME, {
      eventId: event.id,
      sportId: division!.sportId!,
      stageId,
      // Only what the entrant has: a team's entrant has no person, and the server refuses a null.
      participants: [home!, away!].map(e => ({ entrantId: e.id, ...(e.teamId ? { teamId: e.teamId } : {}), ...(e.orgProfileId ? { orgProfileId: e.orgProfileId } : {}) })),
    });
    // A failed add stays open, as filled in; the refusal is already said.
    if (!added.ok) { setSaving(false); return; }
    const name = `${entrantName(home)} v ${entrantName(away)}`;
    if (!placing) { setSaving(false); onAdded({ id: added.data.id, name }, null, []); return; }
    const to: FixtureSlot = { day, start: start!, facilityId };
    const moved = await sendAction(SocketAction.MOVE_FIXTURE, { gameId: added.data.id, orgId, startAt: venueInputsToInstant(day, timeOfDay(to.start), timeZone), facilityId });
    setSaving(false);
    // Added but not placed: it waits *Without a time*, and the refusal is said.
    onAdded({ id: added.data.id, name }, moved.ok ? to : null, moved.ok ? moved.data.clashes : []);
  };

  const chip = (on: boolean, label: string, onPress: () => void, key: string, disabled = false) => (
    <TouchableOpacity key={key} testID={`add-fixture-${key}`} onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }} aria-checked={on} className={`rounded-xl border px-3 py-1.5 ${on ? 'border-line-selected bg-raised' : 'border-line bg-card'} ${disabled ? 'opacity-40' : ''}`}>
      <Text className={`font-inter-semibold text-[13px] ${on ? 'text-ink' : 'text-ink-muted'}`}>{label}</Text>
    </TouchableOpacity>
  );
  const label = (text: string) => <Text className="font-inter-bold text-[13px] text-ink-soft">{text}</Text>;
  const side = (which: 'Home' | 'Away', value: string, set: (id: string) => void, other: string) => (
    <View className="gap-1.5">
      {label(which)}
      <View className="flex-row flex-wrap gap-1.5">
        {inPlay.map(e => chip(e.id === value, entrantName(e), () => set(e.id), `${which.toLowerCase()}-${e.id}`, e.id === other))}
      </View>
    </View>
  );

  return (
    <EditDialog
      visible
      title="Add a fixture"
      onClose={onClose}
      onSave={save}
      saveLabel={placing ? 'Add it here' : 'Add it'}
      saveDisabled={!ready}
      isSaving={saving}
      isDirty={!!homeId || !!awayId}
    >
      {!isCollapsed(divisions.length) ? (
        <View className="gap-1.5">
          {label('Division')}
          <View className="flex-row flex-wrap gap-1.5">
            {divisions.map(d => chip(d.id === divisionId, divisionName(d.id), () => {
              if (d.id === divisionId) return;
              setDivisionId(d.id); setHomeId(''); setAwayId('');
            }, d.id))}
          </View>
        </View>
      ) : null}
      {!isCollapsed(stages.length) ? (
        <View className="gap-1.5">
          {label('Stage')}
          <View className="flex-row flex-wrap gap-1.5">{stages.map(s => chip(s.id === stageId, s.name, () => setStageId(s.id), s.id))}</View>
        </View>
      ) : null}

      {isLoading ? (
        <Text className="font-inter text-sm text-ink-muted">Loading the teams…</Text>
      ) : inPlay.length < 2 ? (
        <Text className="font-inter text-sm text-ink-muted">{divisionName(divisionId)} needs at least two teams in it before a fixture can be added.</Text>
      ) : (
        <>
          {side('Home', homeId, setHomeId, awayId)}
          {side('Away', awayId, setAwayId, homeId)}
        </>
      )}

      <View className="gap-1.5 border-t border-line-soft pt-3">
        {label('Day')}
        <View className="flex-row flex-wrap gap-1.5">
          {chip(!placing, 'Not yet', () => setPlacing(false), 'not-yet')}
          {days.map(d => chip(placing && d === day, formatPlayingDay(d) || d, () => { setPlacing(true); setDay(d); }, d))}
        </View>
      </View>
      {placing ? (
        <>
          <View className="gap-1.5">
            {label('Where')}
            <View className="flex-row flex-wrap gap-1.5">
              {choices.map(id => chip(id === facilityId, facilityLabel(id), () => setFacilityId(id), id))}
              {!showAll && facilityIds.some(id => !own.includes(id)) ? chip(false, 'Other…', () => setShowAll(true), 'other') : null}
            </View>
          </View>
          <View className="gap-1.5">
            {label('Starts')}
            <View className="flex-row flex-wrap items-center gap-1.5">
              <TextInput
                value={time}
                onChangeText={setTime}
                accessibilityLabel="Starts"
                inputMode="numeric"
                placeholderTextColor={themeColor(isDark, 'ink-muted')}
                className="bg-canvas border border-line rounded-xl px-3 py-2 font-inter text-sm text-ink"
                style={{ width: 84, textAlign: 'center' }}
              />
              {minutes ? <Text className="font-inter text-xs text-ink-muted">{minutes} min</Text> : null}
            </View>
            {start == null ? <Text className="font-inter text-xs text-danger-ink">A time is HH:MM.</Text> : null}
          </View>
          {warnings.length ? (
            <View className="rounded-xl bg-warning-soft px-3 py-2"><Text className="font-inter text-[13px] text-warning-ink">⚠ {warnings.join(' · ')}. You can still add it.</Text></View>
          ) : null}
        </>
      ) : (
        <Text className="font-inter text-xs text-ink-muted">It waits under Without a time, to place later.</Text>
      )}
    </EditDialog>
  );
}
